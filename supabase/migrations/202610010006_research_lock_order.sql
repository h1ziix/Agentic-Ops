-- Consistent workspace-before-company locking avoids cross-workflow upsert deadlocks.
-- Explicit task retry requeues failed items once; successful company results remain committed.
create or replace function public.start_research_task_run(
  p_run_id uuid, p_user_id uuid, p_workspace_id uuid, p_workflow_id uuid, p_task_id uuid, p_model text, p_input jsonb
) returns public.agent_runs language plpgsql security definer set search_path = '' as $$
declare
  v_workflow public.workflows%rowtype;
  v_task public.workflow_tasks%rowtype;
  v_run public.agent_runs%rowtype;
  v_company uuid;
  v_dependency text;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id
  ) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select * into v_workflow from public.workflows where id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_task from public.workflow_tasks where id = p_task_id and workflow_id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if v_task.type not in ('define_target_profile','discover_companies','research_companies','identify_opportunities','score_leads')
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input) > 16384
    or char_length(coalesce(p_input ->> 'workKey','')) not between 1 and 240
    or jsonb_typeof(p_input -> 'requestedCompanyCount') is distinct from 'number'
    or (p_input ->> 'requestedCompanyCount')::integer not between 1 and 20
    or char_length(trim(coalesce(p_model,''))) not between 1 and 200 then
    raise exception 'Invalid research task input' using errcode = '22023';
  end if;
  select * into v_run from public.agent_runs where workflow_task_id = p_task_id and agent_type = 'researcher'
    and status = 'completed' and input ->> 'workKey' = p_input ->> 'workKey' order by created_at desc limit 1;
  if found then return v_run; end if;
  if v_workflow.status <> 'running' or v_task.status not in ('pending','running','failed')
    or (v_task.status = 'failed' and coalesce(p_input ->> 'retry','false') <> 'true') then
    raise exception 'Workflow or task is not ready for research' using errcode = '22023';
  end if;
  if jsonb_typeof(v_task.input -> 'dependencies') is distinct from 'array' then raise exception 'Missing dependencies' using errcode = '22023'; end if;
  for v_dependency in select jsonb_array_elements_text(v_task.input -> 'dependencies') loop
    if not exists (select 1 from public.workflow_tasks where workflow_id = p_workflow_id
      and input ->> 'planTaskId' = v_dependency and position < v_task.position and status = 'completed') then
      raise exception 'Incomplete task dependency' using errcode = '22023';
    end if;
  end loop;
  select * into v_run from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'researcher'
    and status in ('queued','running') order by created_at desc limit 1;
  if found then
    if v_run.started_at > now() - interval '3 minutes' then return v_run; end if;
    update public.agent_runs set status = 'failed', completed_at = clock_timestamp(),
      error = '{"code":"ai_timeout","message":"Research was interrupted. Resume to recover the task."}' where id = v_run.id;
    update public.workflow_companies set research_status = 'queued' where workflow_id = p_workflow_id
      and company_id = (v_run.input ->> 'companyId')::uuid and research_status = 'researching';
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary)
      values(p_workspace_id,p_workflow_id,v_run.id,v_run.workflow_task_id,'agent_failed','Interrupted research claim expired.');
  end if;
  if (select count(*) from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'researcher') >= 70
    or (select count(*) from public.agent_runs where workflow_task_id = p_task_id and input ->> 'workKey' = p_input ->> 'workKey' and status = 'failed') >= 3 then
    raise exception 'Research retry budget exhausted' using errcode = '22023';
  end if;
  if v_task.type = 'research_companies' and v_task.status = 'failed' and p_input ->> 'retry' = 'true' then
    update public.workflow_companies set research_status = 'queued', error = null where workflow_id = p_workflow_id and research_status = 'failed';
  end if;
  v_company := (p_input ->> 'companyId')::uuid;
  if v_company is not null then
    if v_task.type <> 'research_companies' or not exists (select 1 from public.workflow_companies where workspace_id = p_workspace_id
      and workflow_id = p_workflow_id and company_id = v_company and (research_status in ('queued','researching')
        or (research_status = 'failed' and p_input ->> 'retry' = 'true'))) then
      raise exception 'Invalid research company' using errcode = '22023'; end if;
    update public.workflow_companies set research_status = 'researching', error = null where workflow_id = p_workflow_id and company_id = v_company;
    update public.companies set research_status = 'researching' where id = v_company and last_researched_at is null;
  end if;
  if v_task.status <> 'running' then
    insert into public.agent_events(workspace_id,workflow_id,workflow_task_id,event_type,summary)
      values(p_workspace_id,p_workflow_id,p_task_id,'task_started',left(v_task.title,500));
  end if;
  update public.workflow_tasks set status = 'running', started_at = coalesce(started_at,clock_timestamp()), error = null where id = p_task_id;
  insert into public.agent_runs(id,workspace_id,workflow_id,workflow_task_id,agent_type,status,model,input,started_at)
    values(p_run_id,p_workspace_id,p_workflow_id,p_task_id,'researcher','running',p_model,p_input,clock_timestamp()) returning * into v_run;
  update public.workflows set current_step = v_task.title where id = p_workflow_id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
    values(p_workspace_id,p_workflow_id,v_run.id,p_task_id,'agent_started','Research Agent started',jsonb_build_object('model',p_model,'company_id',v_company));
  return v_run;
end;
$$;



-- Resolve a name-only candidate to an existing canonical domain without creating a second researched company.
-- Directory discoveries may retain a null website until first-party evidence resolves it.
create or replace function public.complete_research_task_run(
  p_run_id uuid, p_status public.agent_run_status, p_output jsonb, p_error jsonb, p_metrics jsonb
) returns public.agent_runs language plpgsql security definer set search_path = '' as $$
declare
  v_run public.agent_runs%rowtype;
  v_workflow public.workflows%rowtype;
  v_task public.workflow_tasks%rowtype;
  v_candidate jsonb;
  v_company public.companies%rowtype;
  v_canonical public.companies%rowtype;
  v_result jsonb;
  v_analysis jsonb;
  v_sources jsonb;
  v_source jsonb;
  v_score integer;
  v_components jsonb;
  v_research_run public.agent_runs%rowtype;
  v_lead_id uuid;
  v_finish boolean := true;
  v_failed boolean := false;
  v_isolated boolean := false;
  v_total integer;
  v_done integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode = '42501'; end if;
  select * into v_run from public.agent_runs where id = p_run_id;
  if not found then raise exception 'Run not found' using errcode = 'P0002'; end if;
  select * into v_workflow from public.workflows where id = v_run.workflow_id for update;
  select * into v_run from public.agent_runs where id = p_run_id for update;
  if v_run.status <> 'running' then return v_run; end if;
  select * into v_task from public.workflow_tasks where id = v_run.workflow_task_id for update;
  if v_run.agent_type <> 'researcher' or v_task.id is null or p_status not in ('completed','failed','cancelled')
    or jsonb_typeof(p_metrics) is distinct from 'object' then raise exception 'Invalid completion' using errcode = '22023'; end if;
  if v_workflow.status <> 'running' then p_status := 'cancelled'; end if;
  if p_status = 'completed' and (p_output ->> 'kind' is distinct from v_task.type or pg_column_size(p_output) > 131072
    or p_output ? 'outreach' or p_output ? 'approvalRequired') then raise exception 'Invalid Stage 4 output' using errcode = '22023'; end if;
  if p_status = 'failed' then
    if char_length(coalesce(p_error ->> 'message','')) not between 1 and 500 then raise exception 'Invalid safe error' using errcode = '22023'; end if;
    v_isolated := coalesce((p_error ->> 'isolated')::boolean,false) and v_run.input ->> 'companyId' is not null;
    if v_run.input ->> 'companyId' is not null then
      update public.workflow_companies set research_status = 'failed', error = p_error where workflow_id = v_run.workflow_id and company_id = (v_run.input ->> 'companyId')::uuid;
      update public.companies set research_status = 'failed' where id = (v_run.input ->> 'companyId')::uuid and last_researched_at is null;
      insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
        values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,'company_research_failed',p_error ->> 'message',jsonb_build_object('company_id',v_run.input ->> 'companyId'));
    end if;
    v_failed := not v_isolated;
    v_finish := not v_isolated;
  elsif p_status = 'completed' then
    case v_task.type
    when 'define_target_profile' then
      if jsonb_typeof(p_output -> 'profile') is distinct from 'object' then raise exception 'Invalid profile' using errcode = '22023'; end if;
    when 'discover_companies' then
      if jsonb_typeof(p_output -> 'candidates') is distinct from 'array' or jsonb_array_length(p_output -> 'candidates') not between 1 and least(20,(v_run.input ->> 'requestedCompanyCount')::integer)
        then raise exception 'Invalid candidates' using errcode = '22023'; end if;
      -- Workspace lock serializes canonical company upserts across concurrent workflows.
      perform 1 from public.workspaces where id = v_run.workspace_id for update;
      for v_candidate in select value from jsonb_array_elements(p_output -> 'candidates') loop
        if (v_candidate ->> 'website' is not null and not public.public_research_url(v_candidate ->> 'website')) or not public.public_research_url(v_candidate #>> '{source,url}')
          or (v_candidate ->> 'website' is not null and v_candidate ->> 'normalizedDomain' is distinct from public.research_domain(v_candidate ->> 'website'))
          or char_length(trim(coalesce(v_candidate ->> 'name',''))) not between 1 and 240 then raise exception 'Invalid candidate identity' using errcode = '22023'; end if;
        select * into v_company from public.companies where workspace_id = v_run.workspace_id
          and (normalized_domain = v_candidate ->> 'normalizedDomain' or ((website is null or v_candidate ->> 'website' is null) and normalized_name = v_candidate ->> 'normalizedName' and (select count(*) from public.companies nc where nc.workspace_id = v_run.workspace_id and nc.normalized_name = v_candidate ->> 'normalizedName') = 1))
          order by created_at limit 1 for update;
        if not found then
          insert into public.companies(workspace_id,workflow_id,name,website,normalized_domain,normalized_name,sources,source_urls)
            values(v_run.workspace_id,v_run.workflow_id,v_candidate ->> 'name',v_candidate ->> 'website',v_candidate ->> 'normalizedDomain',v_candidate ->> 'normalizedName',
              jsonb_build_array(v_candidate -> 'source'),jsonb_build_array(v_candidate #>> '{source,url}')) returning * into v_company;
        elsif v_company.website is null and v_candidate ->> 'website' is not null then
          update public.companies set website = v_candidate ->> 'website', normalized_domain = v_candidate ->> 'normalizedDomain' where id = v_company.id;
        end if;
        insert into public.workflow_companies(workspace_id,workflow_id,company_id) values(v_run.workspace_id,v_run.workflow_id,v_company.id) on conflict do nothing;
        insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
          values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,'company_discovered',left('Discovered ' || v_company.name,500),jsonb_build_object('company_id',v_company.id));
      end loop;
    when 'research_companies' then
      if p_output -> 'result' is not null then
        if p_output ->> 'companyId' is distinct from v_run.input ->> 'companyId' then raise exception 'Company mismatch' using errcode = '22023'; end if;
        v_result := p_output -> 'result'; v_analysis := v_result -> 'analysis';
        if v_result ->> 'researchOnly' is distinct from 'true' or v_analysis ? 'outreach' or jsonb_array_length(v_result -> 'sources') not between 1 and 8
          or jsonb_typeof(v_analysis -> 'lead') is distinct from 'object' then raise exception 'Invalid company research' using errcode = '22023'; end if;
        perform 1 from public.workspaces where id = v_run.workspace_id for update;
        select * into v_company from public.companies where id = (v_run.input ->> 'companyId')::uuid and workspace_id = v_run.workspace_id for update;
        if not found or not public.public_research_url(v_result #>> '{company,website}') or (v_company.website is not null and public.research_domain(v_company.website) is distinct from public.research_domain(v_result #>> '{company,website}')) then raise exception 'Company identity mismatch' using errcode = '22023'; end if;

        select * into v_canonical from public.companies where workspace_id = v_run.workspace_id and id <> v_company.id
          and normalized_domain = public.research_domain(v_result #>> '{company,website}') limit 1 for update;
        if found and v_company.website is null then
          insert into public.workflow_companies(workspace_id,workflow_id,company_id,research_status)
            values(v_run.workspace_id,v_run.workflow_id,v_canonical.id,'researching')
            on conflict(workspace_id,workflow_id,company_id) do update set research_status = 'researching';
          delete from public.workflow_companies where workflow_id = v_run.workflow_id and company_id = v_company.id;
          update public.agent_runs set input = input || jsonb_build_object('originalCompanyId',v_company.id,'companyId',v_canonical.id) where id = v_run.id;
          p_output := jsonb_set(p_output,'{companyId}',to_jsonb(v_canonical.id));
          if v_company.last_researched_at is null and not exists(select 1 from public.workflow_companies where company_id = v_company.id)
            and not exists(select 1 from public.leads where company_id = v_company.id) then
            delete from public.companies where id = v_company.id;
          end if;
          v_company := v_canonical;
        end if;
        v_sources := '[]';
        for v_source in select value from jsonb_array_elements(v_result -> 'sources') loop
          if not public.public_research_url(v_source ->> 'url') then raise exception 'Unsafe source URL' using errcode = '22023'; end if;
          v_sources := v_sources || jsonb_build_array(jsonb_build_object('url',v_source ->> 'url','title',v_source ->> 'title',
            'type',case when public.research_domain(v_source ->> 'url') = public.research_domain(v_result #>> '{company,website}') then 'company_website' else 'search_result' end,'accessedAt',v_source ->> 'retrievedAt'));
        end loop;
        v_components := v_analysis #> '{lead,components}';
        v_score := (v_components ->> 'icpFit')::integer + (v_components ->> 'automationPotential')::integer + (v_components ->> 'operationalSignals')::integer
          + (v_components ->> 'evidenceQuality')::integer + (v_components ->> 'reachability')::integer;
        if v_score not between 0 and 100 or v_score is distinct from (v_analysis #>> '{lead,score}')::integer
          or (v_components ->> 'icpFit')::integer not between 0 and 25 or (v_components ->> 'automationPotential')::integer not between 0 and 30
          or (v_components ->> 'operationalSignals')::integer not between 0 and 20 or (v_components ->> 'evidenceQuality')::integer not between 0 and 15
          or (v_components ->> 'reachability')::integer not between 0 and 10 or char_length(coalesce(v_analysis #>> '{lead,scoreReason}','')) < 1
          or v_analysis #>> '{lead,confidence}' not in ('low','medium','high') then raise exception 'Invalid qualification rubric' using errcode = '22023'; end if;
        update public.companies set website = v_result #>> '{company,website}', normalized_domain = public.research_domain(v_result #>> '{company,website}'), description = v_analysis #>> '{company,description}',industry = v_analysis #>> '{company,industry}',location = v_analysis #>> '{company,location}',
          employee_estimate = v_analysis #>> '{company,employeeEstimate}',research_summary = v_analysis #>> '{company,researchSummary}',research_status = 'researched',
          sources = v_sources, source_urls = (select jsonb_agg(value ->> 'url') from jsonb_array_elements(v_sources)),
          automation_opportunities = (select jsonb_agg(op.value || jsonb_build_object('evidence',
            (select jsonb_agg(src.value ->> 'url') from jsonb_array_elements(v_result -> 'sources') src where op.value -> 'sourceIds' ? (src.value ->> 'id'))))
            from jsonb_array_elements(v_analysis -> 'automationOpportunities') op),
          qualification = v_analysis -> 'lead',last_researched_at = clock_timestamp() where id = v_company.id;
        update public.workflow_companies set research_status = 'researched',error = null where workflow_id = v_run.workflow_id and company_id = v_company.id;
        insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
          values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,'company_researched',left('Researched ' || v_company.name,500),jsonb_build_object('company_id',v_company.id,'source_count',jsonb_array_length(v_sources),'score',v_score));
      end if;
    when 'identify_opportunities' then
      if jsonb_array_length(p_output -> 'companyIds') < 1 then raise exception 'No research evidence' using errcode = '22023'; end if;
    when 'score_leads' then
      -- Scores come from completed validated research in this workflow, never from client payloads.
      for v_research_run in select distinct on (input ->> 'companyId') * from public.agent_runs where workflow_id = v_run.workflow_id
        and agent_type = 'researcher' and status = 'completed' and output ->> 'kind' = 'research_companies' and output -> 'result' is not null
        order by input ->> 'companyId',created_at desc loop
        v_analysis := v_research_run.output #> '{result,analysis}'; v_components := v_analysis #> '{lead,components}';
        v_score := (v_components ->> 'icpFit')::integer + (v_components ->> 'automationPotential')::integer + (v_components ->> 'operationalSignals')::integer
          + (v_components ->> 'evidenceQuality')::integer + (v_components ->> 'reachability')::integer;
        if v_score >= 60 and (v_components ->> 'icpFit')::integer >= 15 and (v_components ->> 'evidenceQuality')::integer >= 7 then
          insert into public.leads(workspace_id,workflow_id,company_id,status,score,score_reason,opportunity,confidence,outreach_status,score_components)
            values(v_run.workspace_id,v_run.workflow_id,(v_research_run.input ->> 'companyId')::uuid,'qualified',v_score,v_analysis #>> '{lead,scoreReason}',
              v_analysis #>> '{lead,opportunity}',(v_analysis #>> '{lead,confidence}')::public.lead_confidence,'not_started',v_components)
            on conflict(workspace_id,workflow_id,company_id) do update set score = excluded.score,score_reason = excluded.score_reason,
              opportunity = excluded.opportunity,confidence = excluded.confidence,score_components = excluded.score_components
              where public.leads.outreach_status = 'not_started' returning id into v_lead_id;
          insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
            values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,'lead_qualified','Company qualified with score ' || v_score,
              jsonb_build_object('company_id',v_research_run.input ->> 'companyId','lead_id',v_lead_id,'score',v_score));
        else
          insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
            values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,'lead_rejected','Company did not meet the evidence and ICP qualification threshold',
              jsonb_build_object('company_id',v_research_run.input ->> 'companyId','score',v_score));
        end if;
      end loop;
    else raise exception 'Unsupported Stage 4 task' using errcode = '22023';
    end case;
  end if;
  if v_task.type = 'research_companies' and (p_status = 'completed' or v_isolated) then
    v_finish := not exists(select 1 from public.workflow_companies where workflow_id = v_run.workflow_id and research_status in ('queued','researching'));
    if v_finish and not exists(select 1 from public.workflow_companies where workflow_id = v_run.workflow_id and research_status = 'researched') then v_failed := true; end if;
  end if;
  if p_status = 'cancelled' then
    update public.workflow_companies set research_status = 'queued' where workflow_id = v_run.workflow_id and research_status = 'researching';
    update public.workflow_tasks set status = case when v_workflow.status = 'cancelled' then 'cancelled'::public.workflow_task_status else 'pending'::public.workflow_task_status end where id = v_task.id;
  elsif v_finish or v_failed then
    update public.workflow_tasks set status = case when v_failed then 'failed'::public.workflow_task_status else 'completed'::public.workflow_task_status end,
      output = case when v_failed then output else p_output end,error = case when v_failed then coalesce(p_error,'{"message":"No company produced useful research evidence."}'::jsonb) else null end,
      completed_at = case when v_failed then null else clock_timestamp() end where id = v_task.id;
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary)
      values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,case when v_failed then 'task_failed'::public.agent_event_type else 'task_completed'::public.agent_event_type end,
        case when v_failed then 'Research task needs attention; successful results are retained' else left(v_task.title || ' completed',500) end);
  end if;
  update public.agent_runs set status = p_status, output = case when p_status = 'completed' then p_output else null end,
    error = case when p_status = 'failed' then p_error else null end,completed_at = clock_timestamp(),duration_ms = (p_metrics ->> 'durationMs')::integer,
    retry_count = (p_metrics ->> 'retryCount')::integer, task_count = 1,input_tokens = (p_metrics ->> 'inputTokens')::integer,
    output_tokens = (p_metrics ->> 'outputTokens')::integer,total_tokens = (p_metrics ->> 'totalTokens')::integer where id = p_run_id returning * into v_run;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
    values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_task.id,case when p_status = 'failed' then 'agent_failed'::public.agent_event_type else 'agent_completed'::public.agent_event_type end,
      case when p_status = 'failed' then p_error ->> 'message' when p_status = 'cancelled' then 'Research Agent interrupted' else 'Research Agent completed' end,
      jsonb_build_object('duration_ms',v_run.duration_ms,'total_tokens',v_run.total_tokens,'retry_count',v_run.retry_count));
  select count(*),count(*) filter(where status = 'completed') into v_total,v_done from public.workflow_tasks where workflow_id = v_run.workflow_id;
  update public.workflows set progress = least(99,100 * v_done / greatest(v_total,1)),
    current_step = case when v_failed then 'Research needs attention; retry is available' else current_step end where id = v_run.workflow_id and status = 'running';
  return v_run;
end;
$$;
