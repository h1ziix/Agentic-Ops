-- Extend the existing runtime. No external executor or email transport is installed.
alter table public.leads add column review_metadata jsonb;
alter table public.leads add column research_run_id uuid references public.agent_runs(id);
alter table public.proposed_actions add column dedupe_key text;
alter table public.proposed_actions add column revision integer not null default 0 check(revision >= 0);
create unique index proposed_actions_dedupe on public.proposed_actions(workspace_id,dedupe_key) where dedupe_key is not null;
create unique index agent_runs_one_active_preparation on public.agent_runs(workflow_id)
  where agent_type in ('reviewer','outreach') and status in ('queued','running');

create or replace function public.finish_research_workflow(p_workspace_id uuid,p_workflow_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_workflow public.workflows%rowtype; v_outreach public.workflow_tasks%rowtype; v_task public.workflow_tasks%rowtype;
  v_review_key text; v_position integer; v_count integer;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
    then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into v_workflow from public.workflows where workspace_id=p_workspace_id and id=p_workflow_id for update;
  if not found then raise exception 'Workflow not found' using errcode='P0002'; end if;
  if exists(select 1 from public.workflow_tasks where workflow_id=p_workflow_id and type in ('define_target_profile','discover_companies','research_companies','identify_opportunities','score_leads') and status <> 'completed')
    then raise exception 'Research is incomplete' using errcode='22023'; end if;
  -- User-requested pauses are never resumed implicitly. The old release boundary is recoverable explicitly.
  if v_workflow.status <> 'running' then return; end if;
  select * into v_outreach from public.workflow_tasks where workflow_id=p_workflow_id and type='generate_outreach' order by position limit 1;
  if found and v_outreach.status='pending' then
    select input ->> 'planTaskId' into v_review_key from public.workflow_tasks where workflow_id=p_workflow_id and type='review_qualified_leads' order by position limit 1;
    if v_review_key is null then
      -- Shift in descending order to respect the existing unique task position constraint.
      for v_task in select * from public.workflow_tasks where workflow_id=p_workflow_id and position >= v_outreach.position order by position desc loop
        update public.workflow_tasks set position=position+1 where id=v_task.id;
      end loop;
      v_review_key := 'stage5_review';
      insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
        values(p_workspace_id,p_workflow_id,'review_qualified_leads','Review qualified leads','Validate evidence and personalization before drafting.',v_outreach.position,
          jsonb_build_object('planTaskId',v_review_key,'objective','Review evidence quality independently of lead score.','dependencies',v_outreach.input -> 'dependencies',
          'expectedOutput','Structured outreach verdicts and accepted evidence.','runtimeAdded',true));
    end if;
    if not (v_outreach.input -> 'dependencies' ? v_review_key) then
      update public.workflow_tasks set input=jsonb_set(input,'{dependencies}',(input -> 'dependencies') || to_jsonb(v_review_key)) where id=v_outreach.id;
    end if;
    if not exists(select 1 from public.workflow_tasks where workflow_id=p_workflow_id and type='execute_approved_actions') then
      select coalesce(max(position),0)+1 into v_position from public.workflow_tasks where workflow_id=p_workflow_id;
      insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
        select p_workspace_id,p_workflow_id,'execute_approved_actions','Execute authorized actions','Future release. Authorization does not execute an external action.',v_position,
          jsonb_build_object('planTaskId','stage6_execution','objective','Wait for a future Executor.','dependencies',jsonb_build_array(input ->> 'planTaskId'),
            'expectedOutput','Future authorized execution.','runtimeAdded',true) from public.workflow_tasks where workflow_id=p_workflow_id and type='request_approval' limit 1;
    end if;
  end if;
  select count(*) into v_count from public.workflow_tasks where workflow_id=p_workflow_id and status <> 'completed';
  update public.workflows set status=case when v_count=0 then 'completed'::public.workflow_status else 'running'::public.workflow_status end,
    progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1) from public.workflow_tasks where workflow_id=p_workflow_id),
    current_step=case when v_count=0 then 'Research and qualification complete' else 'Research complete; continuing supported preparation tasks' end,
    completed_at=case when v_count=0 then clock_timestamp() else null end where id=p_workflow_id;
end;
$$;

create function public.start_preparation_run(p_run_id uuid,p_user_id uuid,p_workspace_id uuid,p_workflow_id uuid,p_task_id uuid,
  p_agent_type public.agent_type,p_model text,p_input jsonb) returns public.agent_runs
language plpgsql security definer set search_path='' as $$
declare v_workflow public.workflows%rowtype; v_task public.workflow_tasks%rowtype; v_run public.agent_runs%rowtype; v_lead public.leads%rowtype; v_dep text;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
    then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into v_workflow from public.workflows where id=p_workflow_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Workflow not found' using errcode='P0002'; end if;
  select * into v_task from public.workflow_tasks where id=p_task_id and workflow_id=p_workflow_id for update;
  if not found or not ((v_task.type='review_qualified_leads' and p_agent_type='reviewer') or (v_task.type='generate_outreach' and p_agent_type='outreach'))
    or char_length(coalesce(p_model,'')) not between 1 and 200 or jsonb_typeof(p_input) is distinct from 'object'
    or pg_column_size(p_input)>16384 then raise exception 'Invalid preparation input' using errcode='22023'; end if;
  select * into v_run from public.agent_runs where workflow_task_id=p_task_id and input ->> 'leadId'=p_input ->> 'leadId' and status='completed' order by created_at desc limit 1;
  if found then return v_run; end if;
  if v_workflow.status <> 'running' or v_task.status not in ('pending','running') then raise exception 'Preparation is not runnable' using errcode='22023'; end if;
  for v_dep in select jsonb_array_elements_text(v_task.input -> 'dependencies') loop
    if not exists(select 1 from public.workflow_tasks where workflow_id=p_workflow_id and input ->> 'planTaskId'=v_dep and status='completed' and position<v_task.position)
      then raise exception 'Incomplete dependency' using errcode='22023'; end if;
  end loop;
  select * into v_run from public.agent_runs where workflow_id=p_workflow_id and agent_type in ('reviewer','outreach') and status in ('queued','running') limit 1 for update;
  if found then
    if v_run.started_at > now()-interval '3 minutes' then return v_run; end if;
    update public.agent_runs set status='failed',completed_at=clock_timestamp(),error='{"code":"ai_timeout","message":"Preparation was interrupted. The lead requires attention."}' where id=v_run.id;
    update public.leads set outreach_status='failed' where id=(v_run.input ->> 'leadId')::uuid;
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary)
      values(p_workspace_id,p_workflow_id,v_run.id,v_run.workflow_task_id,'agent_failed','Interrupted preparation claim expired.');
  end if;
  if (select count(*) from public.agent_runs where workflow_task_id=p_task_id and input ->> 'leadId'=p_input ->> 'leadId') >= 3
    or (select count(*) from public.agent_runs where workflow_id=p_workflow_id and agent_type in ('reviewer','outreach')) >= 120
    then raise exception 'Preparation budget exhausted' using errcode='22023'; end if;
  select * into v_lead from public.leads where id=(p_input ->> 'leadId')::uuid and workflow_id=p_workflow_id and workspace_id=p_workspace_id for update;
  if not found or v_lead.company_id::text is distinct from p_input ->> 'companyId' or v_lead.score<60
    or (p_agent_type='reviewer' and v_lead.outreach_status not in ('not_started','reviewing'))
    or (p_agent_type='outreach' and (v_lead.review_metadata ->> 'decision' is distinct from 'approve_for_outreach' or v_lead.outreach_status not in ('not_started','drafting')))
    then raise exception 'Lead is not eligible' using errcode='22023'; end if;
  if v_task.status='pending' then
    insert into public.agent_events(workspace_id,workflow_id,workflow_task_id,event_type,summary) values(p_workspace_id,p_workflow_id,p_task_id,'task_started',v_task.title);
  end if;
  update public.workflow_tasks set status='running',started_at=coalesce(started_at,clock_timestamp()) where id=p_task_id;
  update public.workflows set current_step=v_task.title where id=p_workflow_id;
  update public.leads set outreach_status=case when p_agent_type='reviewer' then 'reviewing'::public.outreach_status else 'drafting'::public.outreach_status end where id=v_lead.id;
  insert into public.agent_runs(id,workspace_id,workflow_id,workflow_task_id,agent_type,status,model,input,started_at)
    values(p_run_id,p_workspace_id,p_workflow_id,p_task_id,p_agent_type,'running',p_model,p_input,clock_timestamp()) returning * into v_run;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
    values(p_workspace_id,p_workflow_id,p_run_id,p_task_id,'agent_started',case when p_agent_type='reviewer' then 'Reviewer Agent started' else 'Outreach Agent started' end,
      jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id,'model',p_model));
  if p_agent_type='reviewer' then
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
      values(p_workspace_id,p_workflow_id,p_run_id,p_task_id,'review_started','Reviewing stored company evidence',jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id));
  end if;
  return v_run;
end;
$$;

create function public.complete_preparation_run(p_run_id uuid,p_status public.agent_run_status,p_output jsonb,p_error jsonb,p_metrics jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare v_run public.agent_runs%rowtype; v_workflow public.workflows%rowtype; v_lead public.leads%rowtype; v_decision text; v_event public.agent_event_type;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode='42501'; end if;
  select * into v_run from public.agent_runs where id=p_run_id;
  if not found then raise exception 'Run not found' using errcode='P0002'; end if;
  select * into v_workflow from public.workflows where id=v_run.workflow_id for update;
  select * into v_run from public.agent_runs where id=p_run_id for update;
  if v_run.status <> 'running' then return v_run; end if;
  if v_run.agent_type not in ('reviewer','outreach') or p_status not in ('completed','failed','cancelled') or jsonb_typeof(p_metrics) is distinct from 'object'
    then raise exception 'Invalid completion' using errcode='22023'; end if;
  select * into v_lead from public.leads where id=(v_run.input ->> 'leadId')::uuid and workflow_id=v_run.workflow_id for update;
  if v_workflow.status <> 'running' then p_status:='cancelled'; end if;
  if p_status='completed' then
    if p_output ->> 'leadId' is distinct from v_lead.id::text or pg_column_size(p_output)>65536
      or not exists(select 1 from public.agent_runs where id=(p_output #>> '{reviewInput,researchRunId}')::uuid and workflow_id=v_run.workflow_id
        and agent_type='researcher' and status='completed' and output ->> 'companyId'=v_lead.company_id::text)
      then raise exception 'Invalid preparation output' using errcode='22023'; end if;
    v_decision:=p_output #>> '{review,decision}';
    if v_decision not in ('approve_for_outreach','reject_for_outreach','needs_more_research') then raise exception 'Invalid review decision' using errcode='22023'; end if;
    if v_run.agent_type='reviewer' then
      update public.leads set review_metadata=p_output -> 'review',research_run_id=(p_output #>> '{reviewInput,researchRunId}')::uuid,
        outreach_status=case v_decision when 'approve_for_outreach' then 'not_started'::public.outreach_status when 'reject_for_outreach' then 'rejected'::public.outreach_status else 'needs_more_research'::public.outreach_status end where id=v_lead.id;
      insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
        values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_run.workflow_task_id,'review_completed',left(p_output #>> '{review,summary}',2000),
          jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id,'confidence',p_output #>> '{review,confidence}'));
      v_event:=case v_decision when 'approve_for_outreach' then 'lead_approved_for_outreach'::public.agent_event_type when 'reject_for_outreach' then 'lead_rejected_for_outreach'::public.agent_event_type else 'lead_requires_more_research'::public.agent_event_type end;
    else
      if v_lead.review_metadata ->> 'decision' is distinct from 'approve_for_outreach' or v_decision <> 'approve_for_outreach'
        or p_output #>> '{draft,status}' is distinct from 'ready_for_review' or p_output #>> '{draft,channel}' is distinct from 'email'
        or p_output #>> '{draft,recipient,email}' is not null or p_output #>> '{draft,executionReadiness}' <> 'blocked_missing_recipient'
        then raise exception 'Invalid draft or fabricated recipient' using errcode='22023'; end if;
      update public.leads set outreach_status='draft_ready' where id=v_lead.id;
      v_event:='outreach_draft_created';
    end if;
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
      values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_run.workflow_task_id,v_event,
        case when v_run.agent_type='reviewer' then left(p_output #>> '{review,summary}',2000) else 'Valid personalized draft ready for human review; recipient missing' end,
        jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id));
  elsif p_status='failed' then
    if char_length(coalesce(p_error ->> 'message','')) not between 1 and 500 then raise exception 'Invalid safe error' using errcode='22023'; end if;
    update public.leads set outreach_status='failed' where id=v_lead.id;
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
      values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_run.workflow_task_id,'outreach_draft_failed',p_error ->> 'message',jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id));
  else
    update public.leads set outreach_status='not_started' where id=v_lead.id;
    update public.workflow_tasks set status=case when v_workflow.status='cancelled' then 'cancelled'::public.workflow_task_status else 'pending'::public.workflow_task_status end where id=v_run.workflow_task_id;
  end if;
  update public.agent_runs set status=p_status,output=case when p_status='completed' then p_output else null end,
    error=case when p_status='failed' then p_error else null end,completed_at=clock_timestamp(),duration_ms=(p_metrics ->> 'durationMs')::integer,
    retry_count=(p_metrics ->> 'retryCount')::integer,task_count=1,input_tokens=(p_metrics ->> 'inputTokens')::integer,
    output_tokens=(p_metrics ->> 'outputTokens')::integer,total_tokens=(p_metrics ->> 'totalTokens')::integer where id=p_run_id returning * into v_run;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
    values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_run.workflow_task_id,case when p_status='failed' then 'agent_failed'::public.agent_event_type else 'agent_completed'::public.agent_event_type end,
      case when p_status='failed' then p_error ->> 'message' else 'Preparation run ' || p_status::text end,
      jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id,'duration_ms',v_run.duration_ms,'total_tokens',v_run.total_tokens));
  return v_run;
end;
$$;

create function public.finish_preparation_task(p_workspace_id uuid,p_workflow_id uuid,p_user_id uuid,p_task_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_task public.workflow_tasks%rowtype;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
    then raise exception 'Workspace access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=p_workflow_id and workspace_id=p_workspace_id and status='running' for update;
  if not found then raise exception 'Workflow is not running' using errcode='22023'; end if;
  select * into v_task from public.workflow_tasks where id=p_task_id and workflow_id=p_workflow_id for update;
  if not found or v_task.type not in ('review_qualified_leads','generate_outreach') then raise exception 'Invalid task' using errcode='22023'; end if;
  if v_task.status='completed' then return; end if;
  if exists(select 1 from public.agent_runs where workflow_task_id=p_task_id and status in ('queued','running'))
    or exists(select 1 from public.leads l where l.workflow_id=p_workflow_id and l.score>=60 and
      ((v_task.type='review_qualified_leads' and l.outreach_status in ('not_started','reviewing') and l.review_metadata is null)
        or (v_task.type='generate_outreach' and l.review_metadata ->> 'decision'='approve_for_outreach' and l.outreach_status in ('not_started','drafting'))))
    then raise exception 'Unfinished preparation items' using errcode='22023'; end if;
  update public.workflow_tasks set status='completed',completed_at=clock_timestamp(),output=jsonb_build_object(
    'completedRuns',(select count(*) from public.agent_runs where workflow_task_id=p_task_id and status='completed'),
    'failedRuns',(select count(*) from public.agent_runs where workflow_task_id=p_task_id and status='failed')) where id=p_task_id;
  update public.workflows set progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1) from public.workflow_tasks where workflow_id=p_workflow_id) where id=p_workflow_id;
  insert into public.agent_events(workspace_id,workflow_id,workflow_task_id,event_type,summary)
    values(p_workspace_id,p_workflow_id,p_task_id,'task_completed',v_task.title || ' completed; successful results retained');
end;
$$;

create function public.publish_outreach_approval(p_workspace_id uuid,p_workflow_id uuid,p_user_id uuid,p_task_id uuid,p_actions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_workflow public.workflows%rowtype; v_task public.workflow_tasks%rowtype; v_action jsonb; v_approval uuid; v_run public.agent_runs%rowtype; v_lead public.leads%rowtype; v_key text;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
    then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into v_workflow from public.workflows where id=p_workflow_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Workflow not found' using errcode='P0002'; end if;
  select id into v_approval from public.approvals where workflow_id=p_workflow_id and type='stage5_outreach' limit 1;
  if found then return v_approval; end if;
  select * into v_task from public.workflow_tasks where id=p_task_id and workflow_id=p_workflow_id for update;
  if not found or v_task.type<>'request_approval' or v_workflow.status<>'running' or jsonb_typeof(p_actions) is distinct from 'array'
    or jsonb_array_length(p_actions)>20 or pg_column_size(p_actions)>524288 then raise exception 'Invalid approval publication' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_task.input -> 'dependencies') dep where not exists(
    select 1 from public.workflow_tasks where workflow_id=p_workflow_id and input ->> 'planTaskId'=dep and status='completed' and position<v_task.position))
    then raise exception 'Incomplete approval dependencies' using errcode='22023'; end if;
  if jsonb_array_length(p_actions)=0 then
    update public.workflow_tasks set status='completed',completed_at=clock_timestamp(),output='{"outcome":"no_valid_drafts"}' where id=p_task_id;
    update public.workflow_tasks set status='cancelled',output='{"outcome":"no_authorized_actions"}' where workflow_id=p_workflow_id and type='execute_approved_actions' and status='pending';
    update public.workflows set status='completed',current_step='Preparation complete; no eligible outreach drafts',completed_at=clock_timestamp(),
      progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1) from public.workflow_tasks where workflow_id=p_workflow_id) where id=p_workflow_id;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary) values(p_workspace_id,p_workflow_id,'workflow_completed','Preparation resolved without valid drafts. No external action performed.');
    return null;
  end if;
  for v_action in select value from jsonb_array_elements(p_actions) loop
    select * into v_run from public.agent_runs where id=(v_action #>> '{payload,generationMetadata,outreachRunId}')::uuid and workflow_id=p_workflow_id and agent_type='outreach' and status='completed';
    if not found then raise exception 'Draft run missing' using errcode='22023'; end if;
    select * into v_lead from public.leads where id=(v_action #>> '{target,leadId}')::uuid and workflow_id=p_workflow_id and workspace_id=p_workspace_id;
    if not found or v_lead.company_id::text is distinct from v_action #>> '{target,companyId}' or v_lead.review_metadata ->> 'decision' is distinct from 'approve_for_outreach'
      or v_action ->> 'action_type' is distinct from 'send_email' or v_action #>> '{target,recipientEmail}' is not null
      or v_action #>> '{payload,executionReadiness}' is distinct from 'blocked_missing_recipient'
      or v_action #>> '{payload,subject}' is distinct from v_run.output #>> '{draft,subject}'
      or v_action #>> '{payload,body}' is distinct from v_run.output #>> '{draft,body}'
      or v_action #> '{payload,personalization}' is distinct from v_run.output #> '{draft,personalization}'
      or v_action #> '{payload,evidenceReferences}' is distinct from v_run.output #> '{draft,personalization,claimsUsed}'
      then raise exception 'Invalid or unsupported email action' using errcode='22023'; end if;
    v_key:=p_workflow_id::text || ':' || v_lead.id::text || ':email:' || v_run.workflow_task_id::text || ':v1';
    if v_action ->> 'dedupe_key' is distinct from v_key then raise exception 'Invalid dedupe key' using errcode='22023'; end if;
  end loop;
  if (select count(distinct a ->> 'dedupe_key') from jsonb_array_elements(p_actions) a)<>jsonb_array_length(p_actions)
    then raise exception 'Duplicate drafts in batch' using errcode='22023'; end if;
  insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level,requested_by_agent_run_id)
    values(p_workspace_id,p_workflow_id,'stage5_outreach','Review ' || jsonb_array_length(p_actions) || ' outreach drafts',
      'Evidence-approved personalized drafts. Missing recipients remain blocked. Authorization never sends an email.','medium',
      (p_actions #>> '{0,payload,generationMetadata,outreachRunId}')::uuid) returning id into v_approval;
  for v_action in select value from jsonb_array_elements(p_actions) loop
    insert into public.proposed_actions(workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key)
      values(p_workspace_id,p_workflow_id,v_approval,'send_email',v_action -> 'target',v_action -> 'payload','pending_approval','medium',v_action ->> 'dedupe_key');
    update public.leads set status='waiting_approval',outreach_status='waiting_approval' where id=(v_action #>> '{target,leadId}')::uuid;
  end loop;
  update public.workflow_tasks set status='blocked',started_at=coalesce(started_at,clock_timestamp()),output=jsonb_build_object('approvalId',v_approval) where id=p_task_id;
  update public.workflows set status='waiting_for_approval',current_step='Personalized drafts await human approval' where id=p_workflow_id;
  insert into public.agent_events(workspace_id,workflow_id,workflow_task_id,event_type,summary,metadata)
    values(p_workspace_id,p_workflow_id,p_task_id,'approval_requested',jsonb_array_length(p_actions) || ' valid drafts require review; no emails sent',jsonb_build_object('approval_id',v_approval,'action_count',jsonb_array_length(p_actions)));
  return v_approval;
end;
$$;

create function public.edit_proposed_email(p_action_id uuid,p_subject text,p_body text,p_revision integer) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare v_action public.proposed_actions%rowtype; v_workflow uuid;
begin
  select workflow_id into v_workflow from public.proposed_actions where id=p_action_id;
  if not found then raise exception 'Action not found' using errcode='P0002'; end if;
  perform 1 from public.workflows where id=v_workflow for update;
  select * into v_action from public.proposed_actions where id=p_action_id for update;
  if auth.uid() is null or not public.is_workspace_member(v_action.workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if v_action.action_type<>'send_email' or v_action.status not in ('pending_approval','waiting_for_approval')
    or not exists(select 1 from public.approvals where id=v_action.approval_id and status='pending')
    or v_action.revision is distinct from p_revision
    or char_length(trim(coalesce(p_subject,''))) not between 1 and 200 or p_subject ~ E'[\r\n]'
    or char_length(trim(coalesce(p_body,''))) not between 10 and 10000 then raise exception 'Draft is no longer editable or content is invalid' using errcode='22023'; end if;
  update public.proposed_actions set payload=jsonb_set(jsonb_set(payload,'{subject}',to_jsonb(trim(p_subject))),'{body}',to_jsonb(trim(p_body))),revision=revision+1 where id=p_action_id returning * into v_action;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata)
    values(v_action.workspace_id,v_action.workflow_id,'proposed_action_edited','User edited outreach draft; approval is still pending',jsonb_build_object(
      'action_id',p_action_id,'lead_id',v_action.target ->> 'leadId','company_id',v_action.target ->> 'companyId','revision',v_action.revision,'edited_by',auth.uid()));
  return v_action;
end;
$$;

create function public.resolve_outreach_actions(p_approval_id uuid,p_decision public.approval_status,p_action_ids uuid[] default null)
returns public.approvals language plpgsql security definer set search_path='' as $$
declare v_approval public.approvals%rowtype; v_action public.proposed_actions%rowtype; v_pending integer; v_approved integer; v_ids uuid[];
begin
  select * into v_approval from public.approvals where id=p_approval_id;
  if not found then raise exception 'Approval not found' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(v_approval.workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=v_approval.workflow_id for update;
  select * into v_approval from public.approvals where id=p_approval_id for update;
  if v_approval.status<>'pending' or p_decision not in ('approved','rejected') then raise exception 'Approval is not pending' using errcode='22023'; end if;
  select array_agg(id) into v_ids from public.proposed_actions where approval_id=p_approval_id and status in ('pending_approval','waiting_for_approval')
    and (p_action_ids is null or id=any(p_action_ids));
  if coalesce(cardinality(v_ids),0)=0 or (p_action_ids is not null and (cardinality(p_action_ids)<>cardinality(v_ids)
    or cardinality(p_action_ids)<>(select count(distinct value) from unnest(p_action_ids) value))) then raise exception 'Invalid selected actions' using errcode='22023'; end if;
  for v_action in select * from public.proposed_actions where id=any(v_ids) order by id for update loop
    update public.proposed_actions set status=case when p_decision='approved' then 'approved'::public.proposed_action_status else 'rejected'::public.proposed_action_status end where id=v_action.id;
    update public.leads set status=case when p_decision='approved' then 'outreach_ready'::public.lead_status else 'qualified'::public.lead_status end,
      outreach_status=case when p_decision='rejected' then 'rejected'::public.outreach_status when v_action.target ->> 'recipientEmail' is null then 'blocked_missing_recipient'::public.outreach_status else 'approved'::public.outreach_status end
      where id=coalesce(v_action.target ->> 'leadId',v_action.target ->> 'lead_id')::uuid and workflow_id=v_approval.workflow_id;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata)
      values(v_approval.workspace_id,v_approval.workflow_id,case when p_decision='approved' then 'proposed_action_approved'::public.agent_event_type else 'proposed_action_rejected'::public.agent_event_type end,
        'Proposed email ' || p_decision::text || '; no email sent',jsonb_build_object('action_id',v_action.id,'lead_id',v_action.target ->> 'leadId','company_id',v_action.target ->> 'companyId','resolved_by',auth.uid()));
  end loop;
  select count(*) filter(where status in ('pending_approval','waiting_for_approval')),count(*) filter(where status='approved') into v_pending,v_approved from public.proposed_actions where approval_id=p_approval_id;
  if v_pending=0 then
    update public.approvals set status=case when v_approved>0 then 'approved'::public.approval_status else 'rejected'::public.approval_status end,resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=p_approval_id returning * into v_approval;
    update public.workflow_tasks set status='completed',completed_at=clock_timestamp(),output=jsonb_build_object('approvalId',p_approval_id,'outcome',v_approval.status) where workflow_id=v_approval.workflow_id and type='request_approval' and status in ('pending','running','blocked');
    if not exists(select 1 from public.approvals where workflow_id=v_approval.workflow_id and status='pending') then
      if v_approved=0 and not exists(select 1 from public.proposed_actions where workflow_id=v_approval.workflow_id and status='approved') then
        update public.workflow_tasks set status='cancelled',output='{"outcome":"outreach_rejected"}' where workflow_id=v_approval.workflow_id and type='execute_approved_actions' and status='pending';
        update public.workflows set status='completed',current_step='Outreach rejected; no external execution',completed_at=clock_timestamp() where id=v_approval.workflow_id and status='waiting_for_approval';
      else
        update public.workflows set status='ready_for_execution',current_step='Authorized drafts wait for future execution; recipients may still be missing' where id=v_approval.workflow_id and status='waiting_for_approval';
      end if;
    end if;
    update public.workflows set progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1) from public.workflow_tasks where workflow_id=v_approval.workflow_id) where id=v_approval.workflow_id;
  end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata)
    values(v_approval.workspace_id,v_approval.workflow_id,case when p_decision='approved' then 'approval_approved'::public.agent_event_type else 'approval_rejected'::public.agent_event_type end,
      cardinality(v_ids) || ' proposed emails ' || p_decision::text || '; authorization only, no email sent',jsonb_build_object('approval_id',p_approval_id,'action_count',cardinality(v_ids),'remaining_count',v_pending,'resolved_by',auth.uid()));
  return v_approval;
end;
$$;

revoke all on function public.start_preparation_run(uuid,uuid,uuid,uuid,uuid,public.agent_type,text,jsonb) from public,anon,authenticated;
revoke all on function public.complete_preparation_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.finish_preparation_task(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.publish_outreach_approval(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_preparation_run(uuid,uuid,uuid,uuid,uuid,public.agent_type,text,jsonb),
  public.complete_preparation_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb),public.finish_preparation_task(uuid,uuid,uuid,uuid),
  public.publish_outreach_approval(uuid,uuid,uuid,uuid,jsonb) to service_role;
revoke all on function public.edit_proposed_email(uuid,text,text,integer),public.resolve_outreach_actions(uuid,public.approval_status,uuid[]) from public,anon;
grant execute on function public.edit_proposed_email(uuid,text,text,integer),public.resolve_outreach_actions(uuid,public.approval_status,uuid[]) to authenticated;
-- Close old mutation paths: they accept arbitrary email JSON and can bypass the Stage 5 lifecycle.
revoke execute on function public.request_approval(uuid,uuid,text,text,text,public.risk_level,jsonb) from authenticated;
revoke execute on function public.resolve_approval(uuid,public.approval_status,jsonb) from authenticated;
create or replace function public.complete_planner_run(
  p_run_id uuid, p_status public.agent_run_status, p_plan jsonb, p_tasks jsonb, p_error jsonb, p_metrics jsonb
) returns public.agent_runs
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.agent_runs%rowtype;
  v_workflow public.workflows%rowtype;
  v_workflow_id uuid;
  v_task jsonb;
  v_task_id uuid;
  v_position integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Privileged run writer required' using errcode = '42501';
  end if;
  select workflow_id into v_workflow_id from public.agent_runs where id = p_run_id and agent_type = 'planner';
  if not found then raise exception 'Planner run not found' using errcode = 'P0002'; end if;
  -- Match the start RPC's lock order.
  select * into v_workflow from public.workflows where id = v_workflow_id for update;
  select * into v_run from public.agent_runs where id = p_run_id for update;
  if v_run.status in ('completed', 'failed', 'cancelled') then return v_run; end if;
  if p_status is null or p_status not in ('completed', 'failed', 'cancelled')
    or jsonb_typeof(p_metrics) is distinct from 'object' then
    raise exception 'Invalid completion input' using errcode = '22023';
  end if;
  -- A late provider result cannot resurrect a cancelled/changed workflow.
  if v_workflow.status <> 'planning' then
    update public.agent_runs set status = 'cancelled', completed_at = clock_timestamp()
      where id = p_run_id returning * into v_run;
    return v_run;
  end if;
  if p_status = 'completed' then
    if jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_plan -> 'tasks') is distinct from 'array'
      or jsonb_typeof(p_tasks) is distinct from 'array' then
      raise exception 'Invalid plan' using errcode = '22023';
    end if;
    if jsonb_array_length(p_tasks) not between 5 and 10
      or jsonb_array_length(p_plan -> 'tasks') <> jsonb_array_length(p_tasks)
      or pg_column_size(p_plan) > 131072 or pg_column_size(p_tasks) > 131072
      or exists (select 1 from public.workflow_tasks where workflow_id = v_workflow.id) then
      raise exception 'Invalid or duplicate plan' using errcode = '22023';
    end if;
    insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
      values (v_run.workspace_id, v_run.workflow_id, v_run.id, 'plan_generated',
        'Planner generated ' || jsonb_array_length(p_tasks) || ' workflow tasks',
        jsonb_build_object('task_count', jsonb_array_length(p_tasks), 'validation', 'passed'), clock_timestamp());
    for v_task in select value from jsonb_array_elements(p_tasks) loop
      v_position := v_position + 1;
      if (v_task ->> 'type') not in ('define_target_profile', 'discover_companies', 'research_companies',
        'identify_opportunities', 'score_leads', 'review_qualified_leads', 'generate_outreach', 'request_approval')
        or (v_task ->> 'position')::integer <> v_position
        or jsonb_typeof(v_task -> 'input') is distinct from 'object' then
        raise exception 'Invalid plan task' using errcode = '22023';
      end if;
      insert into public.workflow_tasks (workspace_id, workflow_id, type, title, description, position, input)
        values (v_run.workspace_id, v_run.workflow_id, v_task ->> 'type', v_task ->> 'title',
          v_task ->> 'description', v_position, v_task -> 'input') returning id into v_task_id;
      insert into public.agent_events (workspace_id, workflow_id, agent_run_id, workflow_task_id, event_type, summary, metadata, created_at)
        values (v_run.workspace_id, v_run.workflow_id, v_run.id, v_task_id, 'task_created',
          v_task ->> 'title', jsonb_build_object('position', v_position, 'type', v_task ->> 'type'), clock_timestamp());
    end loop;
  elsif p_status = 'failed' and (jsonb_typeof(p_error) is distinct from 'object'
    or char_length(coalesce(p_error ->> 'message', '')) not between 1 and 500) then
    raise exception 'Invalid safe error' using errcode = '22023';
  end if;
  update public.agent_runs set status = p_status,
    output = case when p_status = 'completed' then p_plan else null end,
    error = case when p_status = 'failed' then p_error else null end,
    completed_at = clock_timestamp(), duration_ms = (p_metrics ->> 'durationMs')::integer,
    retry_count = (p_metrics ->> 'retryCount')::integer, task_count = v_position,
    input_tokens = (p_metrics ->> 'inputTokens')::integer,
    output_tokens = (p_metrics ->> 'outputTokens')::integer,
    total_tokens = (p_metrics ->> 'totalTokens')::integer
    where id = p_run_id returning * into v_run;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (v_run.workspace_id, v_run.workflow_id, v_run.id,
      case when p_status = 'failed' then 'agent_failed'::public.agent_event_type else 'agent_completed'::public.agent_event_type end,
      case when p_status = 'failed' then p_error ->> 'message' when p_status = 'cancelled' then 'Planner Agent cancelled' else 'Planner Agent completed' end,
      jsonb_build_object('duration_ms', v_run.duration_ms, 'retry_count', v_run.retry_count,
        'task_count', v_run.task_count, 'total_tokens', v_run.total_tokens, 'error_code', p_error ->> 'code'), clock_timestamp());
  update public.workflows set
    status = case when p_status = 'completed' then 'running'::public.workflow_status when p_status = 'failed' then 'failed'::public.workflow_status else 'cancelled'::public.workflow_status end,
    current_step = case when p_status = 'completed' then 'Plan ready; research begins next' when p_status = 'failed' then 'Planning failed' else 'Cancelled' end,
    started_at = case when p_status = 'completed' then coalesce(started_at, clock_timestamp()) else started_at end,
    failed_at = case when p_status = 'failed' then clock_timestamp() else null end
    where id = v_workflow.id;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (v_run.workspace_id, v_run.workflow_id, v_run.id,
      case when p_status = 'completed' then 'workflow_started'::public.agent_event_type when p_status = 'failed' then 'workflow_failed'::public.agent_event_type else 'workflow_cancelled'::public.agent_event_type end,
      case when p_status = 'completed' then 'Workflow ready for execution. Research has not started.' when p_status = 'failed' then 'Workflow planning failed. No tasks were saved.' else 'Workflow planning cancelled.' end,
      jsonb_build_object('from_status', 'planning', 'to_status', case when p_status = 'completed' then 'running' else p_status::text end), clock_timestamp());
  return v_run;
end;
$$;
