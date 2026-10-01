-- Reviewer failures use agent_failed; only failed draft generation emits outreach_draft_failed.
create or replace function public.complete_preparation_run(p_run_id uuid,p_status public.agent_run_status,p_output jsonb,p_error jsonb,p_metrics jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare v_run public.agent_runs%rowtype; v_workflow public.workflows%rowtype; v_lead public.leads%rowtype; v_decision text; v_event public.agent_event_type;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode='42501'; end if;
  select * into v_run from public.agent_runs where id=p_run_id;
  if not found then raise exception 'Run not found' using errcode='P0002'; end if;
  select * into v_workflow from public.workflows where id=v_run.workflow_id for update;
  select * into v_run from public.agent_runs where id=p_run_id for update;
  if v_run.status <> 'running' then return v_run; end if;
  if v_run.agent_type not in ('reviewer','outreach') or p_status is null or p_status not in ('completed','failed','cancelled') or jsonb_typeof(p_metrics) is distinct from 'object'
    then raise exception 'Invalid completion' using errcode='22023'; end if;
  select * into v_lead from public.leads where id=(v_run.input ->> 'leadId')::uuid and workflow_id=v_run.workflow_id for update;
  if v_workflow.status <> 'running' then p_status:='cancelled'; end if;
  if p_status='completed' then
    if p_output ->> 'leadId' is distinct from v_lead.id::text or pg_column_size(p_output)>65536
      or not exists(select 1 from public.agent_runs where id=(p_output #>> '{reviewInput,researchRunId}')::uuid and workflow_id=v_run.workflow_id
        and agent_type='researcher' and status='completed' and output ->> 'companyId'=v_lead.company_id::text)
      then raise exception 'Invalid preparation output' using errcode='22023'; end if;
    v_decision:=p_output #>> '{review,decision}';
    if v_decision is null or v_decision not in ('approve_for_outreach','reject_for_outreach','needs_more_research') then raise exception 'Invalid review decision' using errcode='22023'; end if;
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
    if v_run.agent_type='outreach' then
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
      values(v_run.workspace_id,v_run.workflow_id,v_run.id,v_run.workflow_task_id,'outreach_draft_failed',p_error ->> 'message',jsonb_build_object('lead_id',v_lead.id,'company_id',v_lead.company_id));
    end if;
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
