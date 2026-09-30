-- Extend the existing service-role runtime and approval tables, without outbound execution.
create table public.research_cache (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cache_key text not null check (cache_key ~ '^[a-f0-9]{64}$'),
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and pg_column_size(sources) <= 65536),
  expires_at timestamptz not null,
  primary key (workspace_id, cache_key)
);
alter table public.research_cache enable row level security;
revoke all on public.research_cache from anon, authenticated;
grant all on public.research_cache to service_role;
create index research_cache_expiry_idx on public.research_cache(expires_at);
create unique index agent_runs_one_active_research_per_workflow on public.agent_runs(workflow_id)
  where agent_type = 'researcher' and status in ('queued', 'running');

create function public.start_research_run(
  p_run_id uuid, p_user_id uuid, p_workspace_id uuid, p_workflow_id uuid, p_model text, p_input jsonb
) returns public.agent_runs
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow public.workflows%rowtype;
  v_run public.agent_runs%rowtype;
  v_company public.companies%rowtype;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id
  ) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_run_id is null or char_length(trim(coalesce(p_model, ''))) not between 1 and 200
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input) > 16384
    or coalesce(p_input ->> 'requestKey', '') !~ '^[a-f0-9]{64}$'
    or char_length(trim(coalesce(p_input ->> 'name', ''))) not between 1 and 240
    or coalesce(p_input ->> 'website', '') !~ '^https?://[^[:space:]]+$'
    or char_length(p_input ->> 'website') > 2048
    or jsonb_typeof(p_input -> 'icp') is distinct from 'object' then
    raise exception 'Invalid research input' using errcode = '22023';
  end if;
  select * into v_workflow from public.workflows where id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_run from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'researcher'
    and status = 'completed' and input ->> 'requestKey' = p_input ->> 'requestKey' order by created_at desc limit 1;
  if found then return v_run; end if;
  if v_workflow.status not in ('running', 'waiting_for_approval') then
    raise exception 'Workflow is not ready for research' using errcode = '22023';
  end if;
  select * into v_run from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'researcher'
    and status in ('queued', 'running') order by created_at desc limit 1;
  if found then
    if v_run.started_at > now() - interval '3 minutes' then return v_run; end if;
    update public.agent_runs set status = 'failed', completed_at = clock_timestamp(),
      error = '{"code":"ai_timeout","message":"Research was interrupted. Please retry."}' where id = v_run.id;
    update public.companies set research_status = 'failed' where id = (v_run.input ->> 'companyId')::uuid;
    insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary)
      values (p_workspace_id, p_workflow_id, v_run.id, 'agent_failed', 'Interrupted research claim expired.');
  end if;
  if p_input ->> 'companyId' is not null then
    select * into v_company from public.companies where id = (p_input ->> 'companyId')::uuid and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Company not found' using errcode = 'P0002'; end if;
    if (v_company.workflow_id is not null and v_company.workflow_id <> p_workflow_id)
      or v_company.name <> p_input ->> 'name' or v_company.website is distinct from p_input ->> 'website' then
      raise exception 'Company identity mismatch' using errcode = '22023';
    end if;
  else
    select * into v_company from public.companies where workspace_id = p_workspace_id and workflow_id = p_workflow_id
      and website = p_input ->> 'website' for update;
    if not found then
      insert into public.companies (workspace_id, workflow_id, name, website)
        values (p_workspace_id, p_workflow_id, p_input ->> 'name', p_input ->> 'website') returning * into v_company;
      insert into public.agent_events (workspace_id, workflow_id, event_type, summary, metadata)
        values (p_workspace_id, p_workflow_id, 'company_discovered', 'Company supplied for evidence-based research', jsonb_build_object('company_id', v_company.id));
    end if;
  end if;
  -- Existing reviewed/sent leads cannot be silently replaced by another analysis.
  if exists (select 1 from public.leads where company_id = v_company.id and workflow_id = p_workflow_id
    and outreach_status in ('waiting_approval', 'approved', 'sent')) then
    raise exception 'Company already has outreach awaiting review or execution' using errcode = '22023';
  end if;
  update public.companies set workflow_id = p_workflow_id, research_status = 'researching' where id = v_company.id;
  insert into public.agent_runs (id, workspace_id, workflow_id, agent_type, status, model, input, started_at)
    values (p_run_id, p_workspace_id, p_workflow_id, 'researcher', 'running', p_model,
      p_input || jsonb_build_object('companyId', v_company.id), clock_timestamp()) returning * into v_run;
  update public.workflows set current_step = 'Researching company evidence with Tavily and Gemini' where id = p_workflow_id;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata)
    values (p_workspace_id, p_workflow_id, v_run.id, 'agent_started', 'Research Agent started',
      jsonb_build_object('company_id', v_company.id, 'model', p_model, 'max_search_requests', 3, 'max_model_requests', 2));
  return v_run;
end;
$$;

create function public.complete_research_run(
  p_run_id uuid, p_status public.agent_run_status, p_output jsonb, p_error jsonb, p_metrics jsonb
) returns public.agent_runs
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.agent_runs%rowtype;
  v_workflow public.workflows%rowtype;
  v_workflow_id uuid;
  v_company_id uuid;
  v_company public.companies%rowtype;
  v_lead_id uuid;
  v_approval_id uuid;
  v_profile jsonb;
  v_analysis jsonb;
  v_source_urls jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged run writer required' using errcode = '42501'; end if;
  select workflow_id into v_workflow_id from public.agent_runs where id = p_run_id and agent_type = 'researcher';
  if not found then raise exception 'Research run not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflows where id = v_workflow_id for update;
  select * into v_run from public.agent_runs where id = p_run_id for update;
  if v_run.status in ('completed', 'failed', 'cancelled') then return v_run; end if;
  if p_status is null or p_status not in ('completed', 'failed', 'cancelled') or jsonb_typeof(p_metrics) is distinct from 'object' then
    raise exception 'Invalid completion input' using errcode = '22023';
  end if;
  v_company_id := (v_run.input ->> 'companyId')::uuid;
  if v_workflow.status not in ('running', 'waiting_for_approval') then
    update public.agent_runs set status = 'cancelled', completed_at = clock_timestamp() where id = p_run_id returning * into v_run;
    update public.companies set research_status = 'failed' where id = v_company_id;
    return v_run;
  end if;
  if p_status = 'completed' then
    if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output) > 131072
      or jsonb_typeof(p_output -> 'sources') is distinct from 'array'
      or p_output -> 'approvalRequired' is distinct from 'true'::jsonb
      or jsonb_typeof(p_output -> 'analysis') is distinct from 'object' then
      raise exception 'Invalid research output' using errcode = '22023';
    end if;
    if jsonb_array_length(p_output -> 'sources') not between 1 and 8
      or (p_output #>> '{budget,searchRequests}')::integer not between 0 and 3
      or (p_output #>> '{budget,modelRequests}')::integer not between 1 and 2 then
      raise exception 'Research budget exceeded' using errcode = '22023';
    end if;
    select * into v_company from public.companies where id = v_company_id and workspace_id = v_run.workspace_id for update;
    if not found or p_output #>> '{company,name}' is distinct from v_run.input ->> 'name'
      or p_output #>> '{company,website}' is distinct from v_company.website then
      raise exception 'Research identity mismatch' using errcode = '22023';
    end if;
    v_analysis := p_output -> 'analysis';
    v_profile := v_analysis -> 'company';
    if coalesce(v_analysis #>> '{outreach,subject}', '') = '' or char_length(coalesce(v_analysis #>> '{outreach,body}', '')) < 10
      or coalesce((v_analysis #>> '{icp,score}')::integer, -1) not between 0 and 100
      or coalesce((v_analysis #>> '{lead,score}')::integer, -1) not between 0 and 100 then
      raise exception 'Invalid scoring or outreach proposal' using errcode = '22023';
    end if;
    select jsonb_agg(source ->> 'url') into v_source_urls from jsonb_array_elements(p_output -> 'sources') source;
    update public.companies set name = v_run.input ->> 'name', description = v_profile ->> 'description', industry = v_profile ->> 'industry',
      location = v_profile ->> 'location', employee_estimate = v_profile ->> 'employeeEstimate', research_summary = v_profile ->> 'researchSummary',
      source_urls = v_source_urls, research_status = 'researched', last_researched_at = clock_timestamp() where id = v_company_id;
    insert into public.leads (workspace_id, workflow_id, company_id, status, score, score_reason, opportunity, confidence, outreach_status)
      values (v_run.workspace_id, v_run.workflow_id, v_company_id, 'waiting_approval', (v_analysis #>> '{lead,score}')::integer,
        v_analysis #>> '{lead,scoreReason}', v_analysis #>> '{lead,opportunity}', (v_analysis #>> '{lead,confidence}')::public.lead_confidence, 'waiting_approval')
      on conflict (workspace_id, workflow_id, company_id) do update set status = 'waiting_approval', score = excluded.score,
        score_reason = excluded.score_reason, opportunity = excluded.opportunity, confidence = excluded.confidence, outreach_status = 'waiting_approval'
      returning id into v_lead_id;
    insert into public.approvals (workspace_id, workflow_id, requested_by_agent_run_id, type, title, description, risk_level)
      values (v_run.workspace_id, v_run.workflow_id, v_run.id, 'send_email', left('Review outreach to ' || (v_run.input ->> 'name'), 240),
        'Evidence-based outreach draft. Verify the recipient and message before approving. No message has been sent.', 'medium') returning id into v_approval_id;
    insert into public.proposed_actions (workspace_id, workflow_id, approval_id, action_type, target, payload, risk_level)
      values (v_run.workspace_id, v_run.workflow_id, v_approval_id, 'send_email',
        jsonb_build_object('company_id', v_company_id, 'lead_id', v_lead_id, 'recipient_name', (v_run.input ->> 'name') || ' team', 'recipient_email', null),
        jsonb_build_object('subject', v_analysis #>> '{outreach,subject}', 'body', v_analysis #>> '{outreach,body}',
          'source_urls', v_source_urls, 'icp_score', (v_analysis #>> '{icp,score}')::integer, 'approval_required', true), 'medium');
    update public.workflows set status = 'waiting_for_approval', current_step = 'Waiting for human approval of outreach draft',
      progress = least(90, (select count(*) * 90 / greatest(v_workflow.target_companies, 1) from public.companies where workflow_id = v_run.workflow_id and research_status = 'researched'))
      where id = v_run.workflow_id;
    insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata) values
      (v_run.workspace_id, v_run.workflow_id, v_run.id, 'company_researched', 'Company profile saved with Tavily source URLs', jsonb_build_object('company_id', v_company_id, 'source_count', jsonb_array_length(v_source_urls))),
      (v_run.workspace_id, v_run.workflow_id, v_run.id, 'lead_scored', 'Evidence-based ICP and lead scores saved', jsonb_build_object('lead_id', v_lead_id, 'icp_score', v_analysis #> '{icp,score}', 'lead_score', v_analysis #> '{lead,score}')),
      (v_run.workspace_id, v_run.workflow_id, v_run.id, 'approval_requested', 'Personalized outreach draft awaits human approval', jsonb_build_object('approval_id', v_approval_id, 'action_count', 1));
  else
    if p_status = 'failed' and (jsonb_typeof(p_error) is distinct from 'object' or char_length(coalesce(p_error ->> 'message', '')) not between 1 and 500) then
      raise exception 'Invalid safe error' using errcode = '22023';
    end if;
    update public.companies set research_status = 'failed' where id = v_company_id;
    update public.workflows set current_step = 'Research failed; retry is available' where id = v_run.workflow_id;
  end if;
  update public.agent_runs set status = p_status, output = case when p_status = 'completed' then p_output else null end,
    error = case when p_status = 'failed' then p_error else null end, completed_at = clock_timestamp(),
    duration_ms = (p_metrics ->> 'durationMs')::integer, retry_count = (p_metrics ->> 'retryCount')::integer,
    task_count = (p_metrics ->> 'taskCount')::integer, input_tokens = (p_metrics ->> 'inputTokens')::integer,
    output_tokens = (p_metrics ->> 'outputTokens')::integer, total_tokens = (p_metrics ->> 'totalTokens')::integer
    where id = p_run_id returning * into v_run;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata)
    values (v_run.workspace_id, v_run.workflow_id, v_run.id,
      case when p_status = 'failed' then 'agent_failed'::public.agent_event_type else 'agent_completed'::public.agent_event_type end,
      case when p_status = 'failed' then p_error ->> 'message' else 'Research Agent completed; no outbound action executed' end,
      jsonb_build_object('duration_ms', v_run.duration_ms, 'total_tokens', v_run.total_tokens, 'retry_count', v_run.retry_count));
  return v_run;
end;
$$;

revoke all on function public.start_research_run(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_research_run(uuid, public.agent_run_status, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_research_run(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.complete_research_run(uuid, public.agent_run_status, jsonb, jsonb, jsonb) to service_role;
