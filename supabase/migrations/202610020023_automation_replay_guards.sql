-- Preserve an already-published draft when a worker lost its completion response.
-- Claim replay reuses that internal result instead of making another model request.
alter function public.claim_automation_job(uuid,uuid,uuid,uuid) rename to claim_automation_job_before_followup_replay;
create function public.claim_automation_job(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;p public.follow_up_plans%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002';end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501';end if;
  if j.job_type='followup_due' and j.status in ('scheduled','queued','retry_scheduled') then
    select * into p from public.follow_up_plans where id=j.follow_up_plan_id and workspace_id=p_workspace and workflow_id=j.workflow_id;
    if p.draft_action_id is not null then
      update public.automation_jobs set status='completed',result=jsonb_build_object('actionId',p.draft_action_id,'reused',true),completed_at=clock_timestamp(),
        retryable=false,next_retry_at=null,error_category=null,error_code=null,error_summary=null,lease_until=null where id=j.id returning * into j;
      insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'automation_completed',
        'Saved follow-up draft reused after interrupted completion; no regeneration or send',jsonb_build_object('job_id',j.id,'action_id',p.draft_action_id,'actor',p_actor));
      return j;
    end if;
  end if;
  return public.claim_automation_job_before_followup_replay(p_workspace,p_actor,p_job,p_claim);
end; $$;
revoke all on function public.claim_automation_job_before_followup_replay(uuid,uuid,uuid,uuid),public.claim_automation_job(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_automation_job(uuid,uuid,uuid,uuid) to service_role;

-- A scheduled external retry must retain the exact current approved action/snapshot,
-- in addition to the definitive prior-attempt checks and the final Executor gate.
alter function public.assert_automation_target(public.automation_jobs) rename to assert_automation_target_before_snapshot_guard;
create function public.assert_automation_target(p_job public.automation_jobs) returns void
language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype;s public.action_approval_snapshots%rowtype;
begin
  perform public.assert_automation_target_before_snapshot_guard(p_job);
  if p_job.job_type='external_action_retry' then
    select * into a from public.proposed_actions where id=p_job.proposed_action_id and workspace_id=p_job.workspace_id and workflow_id=p_job.workflow_id;
    select * into s from public.action_approval_snapshots where id=(p_job.input->>'expectedSnapshotId')::uuid and action_id=a.id and workspace_id=a.workspace_id;
    if a.id is null or a.status<>'approved' or a.superseded_by_id is not null or s.id is null or s.revision<>a.revision
      or s.envelope is distinct from a.executable_envelope or s.digest is distinct from public.action_envelope_digest(a.executable_envelope)
      then raise exception 'External retry approval changed' using errcode='22023';end if;
    perform public.assert_executable_envelope(a);
  end if;
end; $$;
revoke all on function public.assert_automation_target_before_snapshot_guard(public.automation_jobs),public.assert_automation_target(public.automation_jobs) from public,anon,authenticated,service_role;

-- Repeated workflow cancellation is a no-op after the normal membership check.
alter function public.transition_workflow(uuid,public.workflow_status,text) rename to transition_workflow_before_cancel_replay;
create function public.transition_workflow(p_workflow_id uuid,p_next_status public.workflow_status,p_summary text default null) returns public.workflows
language plpgsql security definer set search_path='' as $$
declare w public.workflows%rowtype;
begin
  select * into w from public.workflows where id=p_workflow_id for update;
  if not found then raise exception 'Workflow missing' using errcode='P0002';end if;
  if auth.uid() is null or not public.is_workspace_member(w.workspace_id) then raise exception 'Access denied' using errcode='42501';end if;
  if w.status='cancelled' and p_next_status='cancelled' then return w;end if;
  return public.transition_workflow_before_cancel_replay(p_workflow_id,p_next_status,p_summary);
end; $$;
revoke all on function public.transition_workflow_before_cancel_replay(uuid,public.workflow_status,text),public.transition_workflow(uuid,public.workflow_status,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_workflow(uuid,public.workflow_status,text) to authenticated;

create function public.record_automation_reply_check(p_workspace uuid,p_actor uuid,p_plan uuid,p_connection uuid,p_generation integer) returns public.follow_up_plans
language plpgsql security definer set search_path='' as $$
declare plan_record public.follow_up_plans%rowtype;connection_record public.integration_connections%rowtype;identity text;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.follow_up_plans where id=p_plan and workspace_id=p_workspace) for update;
  select * into plan_record from public.follow_up_plans where id=p_plan and workspace_id=p_workspace for update;
  if not found then raise exception 'Plan missing' using errcode='P0002';end if;
  select * into connection_record from public.integration_connections where workspace_id=p_workspace and id=p_connection and provider='gmail' and generation=p_generation and status='connected';
  select a.executable_envelope#>>'{connection,identity}' into identity from public.execution_attempts t join public.proposed_actions a on a.id=t.action_id where t.id=plan_record.parent_attempt_id and t.connection_id=p_connection and t.status='succeeded';
  if connection_record.id is null or identity is null or identity is distinct from connection_record.provider_identity
    or not(connection_record.scopes&&array['https://www.googleapis.com/auth/gmail.metadata','https://www.googleapis.com/auth/gmail.readonly']) then raise exception 'Read permission unavailable' using errcode='22023';end if;
  update public.follow_up_plans set last_checked_at=clock_timestamp() where id=p_plan returning * into plan_record;
  return plan_record;
end; $$;
revoke all on function public.record_automation_reply_check(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.record_automation_reply_check(uuid,uuid,uuid,uuid,integer) to service_role;

-- Called only by the separately gated development route. Reuse an unstarted job,
-- retaining the approved due_at while bringing draft preparation forward by 15 seconds.
create function public.schedule_automation_followup_test(p_workspace uuid,p_actor uuid,p_plan uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare plan_record public.follow_up_plans%rowtype;j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.follow_up_plans where id=p_plan and workspace_id=p_workspace) and status<>'cancelled' for update;
  if not found then raise exception 'Workflow unavailable' using errcode='22023';end if;
  select * into plan_record from public.follow_up_plans where id=p_plan and workspace_id=p_workspace for update;
  if plan_record.id is null or plan_record.status<>'planned' or plan_record.automation_status not in ('inactive','scheduled','due','failed') or plan_record.draft_action_id is not null then raise exception 'Plan unavailable' using errcode='22023';end if;
  select * into j from public.automation_jobs where follow_up_plan_id=p_plan and job_type='followup_due' and status in ('scheduled','queued','running','retry_scheduled') for update;
  if found then
    if j.status='running' or j.attempt_count<>0 then raise exception 'Development test cannot interrupt an attempted job' using errcode='22023';end if;
    update public.automation_jobs set scheduled_for=clock_timestamp()+interval '15 seconds',input=input||'{"developmentTest":true}',provider_job_id=null,next_retry_at=null,
      actor_id=p_actor,status='scheduled' where id=j.id returning * into j;
  else
    j:=public.schedule_automation_job(p_workspace,p_actor,plan_record.workflow_id,'followup_due',clock_timestamp()+interval '15 seconds','followup:'||p_plan::text||':dev-test',
      jsonb_build_object('planId',p_plan,'developmentTest',true),null,plan_record.lead_id,null,p_plan);
  end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,plan_record.workflow_id,'automation_scheduled',
    'Development test scheduled early internal draft preparation; approved due time retained',jsonb_build_object('job_id',j.id,'plan_id',p_plan,'development_test',true,'actor',p_actor));
  return j;
end; $$;
revoke all on function public.schedule_automation_followup_test(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.schedule_automation_followup_test(uuid,uuid,uuid) to service_role;

-- Avoid PL/pgSQL record names shadowing relation aliases in preserved approval/plan paths.
create or replace function public.decide_action_revisions(p_approval_id uuid,p_decision public.approval_status,p_revisions jsonb) returns public.approvals
language plpgsql security definer set search_path='' as $$
declare plan_record public.follow_up_plans%rowtype;status_before public.lead_status;outreach_before public.outreach_status;result public.approvals%rowtype;
begin
  select fp.* into plan_record from public.follow_up_plans fp join public.proposed_actions a on a.id=fp.draft_action_id where a.approval_id=p_approval_id;
  if plan_record.id is not null then
    perform 1 from public.workflows where id=plan_record.workflow_id for update;
    select status,outreach_status into status_before,outreach_before from public.leads where id=plan_record.lead_id;
  end if;
  result:=public.decide_action_revisions_before_automation(p_approval_id,p_decision,p_revisions);
  if plan_record.id is not null then update public.leads set status=status_before,outreach_status=outreach_before where id=plan_record.lead_id;end if;
  return result;
end; $$;
create or replace function public.followup_internal_saved() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_action public.proposed_actions%rowtype;
begin
  select source_action.* into parent_action from public.execution_attempts attempt join public.proposed_actions source_action on source_action.id=attempt.action_id where attempt.id=new.parent_attempt_id;
  new.lead_id:=(parent_action.executable_envelope->>'leadId')::uuid;new.company_id:=(parent_action.executable_envelope->>'companyId')::uuid;
  return new;
end; $$;
create or replace function public.publish_followup_draft(p_workspace uuid,p_actor uuid,p_plan uuid,p_claim uuid,p_envelope jsonb,p_metrics jsonb) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;j public.automation_jobs%rowtype;parent public.proposed_actions%rowtype;t public.execution_attempts%rowtype;
  result public.proposed_actions%rowtype;approval uuid;run_id uuid;metadata jsonb;body jsonb;proof jsonb;fact jsonb;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.follow_up_plans where id=p_plan and workspace_id=p_workspace) and status<>'cancelled' for update;
  if not found then raise exception 'Workflow unavailable' using errcode='22023'; end if;
  select * into p from public.follow_up_plans where id=p_plan and workspace_id=p_workspace for update;
  if not found then raise exception 'Plan missing' using errcode='P0002'; end if;
  if p.draft_action_id is not null then select * into result from public.proposed_actions where id=p.draft_action_id;return result; end if;
  select * into j from public.automation_jobs where follow_up_plan_id=p_plan and job_type='followup_due' and actor_id=p_actor and status='running' and claim_token=p_claim and lease_until>now() for update;
  if not found or p.status<>'planned' or (p.due_at>now() and j.input->>'developmentTest' is distinct from 'true') or p.automation_status not in ('scheduled','due','drafting','failed')
    or exists(select 1 from public.leads where id=p.lead_id and status in ('rejected','responded','converted'))
    or exists(select 1 from public.reply_observations where lead_id=p.lead_id)
    then raise exception 'Follow-up publication fenced' using errcode='40001'; end if;
  select * into t from public.execution_attempts where id=p.parent_attempt_id and status='succeeded';
  select * into parent from public.proposed_actions where id=t.action_id and action_type='send_email';
  if parent.id is null or exists(select 1 from public.proposed_actions where workflow_id=p.workflow_id and target->>'leadId'=p.lead_id::text
    and action_type='send_email' and status in ('pending_approval','waiting_for_approval','approved') and superseded_by_id is null)
    then raise exception 'Another pending communication exists' using errcode='22023'; end if;
  proof:=p_envelope->'provenance';metadata:=proof->'generationMetadata';run_id:=(metadata->>'outreachRunId')::uuid;
  if p_envelope->>'workspaceId' is distinct from p_workspace::text or p_envelope->>'workflowId' is distinct from p.workflow_id::text
    or p_envelope->>'companyId' is distinct from p.company_id::text or p_envelope->>'leadId' is distinct from p.lead_id::text
    or p_envelope->>'revision' is distinct from '1' or p_envelope->>'actionType' is distinct from 'send_email' or p_envelope->>'schemaVersion' is distinct from '2'
    or p_envelope->>'lineageId' is distinct from p_envelope->>'actionId'
    or p_envelope->'recipient' is distinct from parent.executable_envelope->'recipient'
    or p_envelope->'connection' is distinct from parent.executable_envelope->'connection'
    or (metadata-'outreachRunId'-'model'-'generationSummary') is distinct from ((parent.payload->'generationMetadata')-'outreachRunId'-'model'-'generationSummary')
    or proof#>>'{personalization,angle}' is distinct from parent.payload#>>'{personalization,angle}' or proof#>>'{personalization,isHypothesis}' is distinct from 'true' or proof#>'{personalization,claimsUsed}' is distinct from proof->'evidenceReferences'
    or jsonb_typeof(proof->'evidenceReferences') is distinct from 'array' or jsonb_array_length(proof->'evidenceReferences') not between 1 and 3
    or run_id is null or p_metrics->>'model' is distinct from metadata->>'model' or pg_column_size(p_envelope)>65536
    then raise exception 'Follow-up provenance invalid' using errcode='22023'; end if;
  for fact in select value from jsonb_array_elements(proof->'evidenceReferences') loop
    if not (coalesce(parent.payload#>'{generationMetadata,review,usableEvidence}',parent.payload->'evidenceReferences') @> jsonb_build_array(fact)) then raise exception 'Unsupported evidence' using errcode='22023'; end if;
  end loop;
  body:=jsonb_build_object('subject',p_envelope->>'subject','body',p_envelope->>'body','generationMetadata',metadata,'personalization',proof->'personalization',
    'evidenceReferences',proof->'evidenceReferences','warnings',coalesce(parent.payload->'warnings','[]'::jsonb),'executionReadiness','ready');
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,model,input,output,started_at,completed_at,duration_ms,retry_count,task_count,input_tokens,output_tokens,total_tokens)
    values(run_id,p_workspace,p.workflow_id,'outreach','completed',p_metrics->>'model',jsonb_build_object('followupPlanId',p.id,'parentActionId',parent.id,'replyStatus','none_detected'),
      jsonb_build_object('draft',jsonb_build_object('subject',p_envelope->>'subject','body',p_envelope->>'body'),'summary',metadata->>'generationSummary'),
      clock_timestamp()-make_interval(secs=>coalesce((p_metrics->>'durationMs')::numeric,0)::double precision/1000),clock_timestamp(),(p_metrics->>'durationMs')::integer,
      (p_metrics->>'retryCount')::integer,1,(p_metrics->>'inputTokens')::integer,(p_metrics->>'outputTokens')::integer,(p_metrics->>'totalTokens')::integer);
  perform public.apply_agent_run_telemetry_07(run_id,p_metrics);
  insert into public.approvals(workspace_id,workflow_id,requested_by_agent_run_id,type,title,description,risk_level)
    values(p_workspace,p.workflow_id,run_id,'auxiliary_followup_email','Review follow-up email','New message requires fresh exact approval and explicit Execute. No reply has been detected.','medium') returning id into approval;
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision)
    values((p_envelope->>'actionId')::uuid,p_workspace,p.workflow_id,approval,'send_email',parent.target,body,'pending_approval','medium','followup-draft:'||p.id::text,2,p_envelope,
      (p_envelope->>'lineageId')::uuid,true,1) returning * into result;
  perform public.assert_executable_envelope(result);
  update public.follow_up_plans set automation_status='waiting_for_approval',draft_action_id=result.id where id=p.id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'followup_draft_created','Follow-up draft ready; independent human approval required',jsonb_build_object('plan_id',p.id,'action_id',result.id,'job_id',j.id,'parent_action_id',parent.id));
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'approval_requested','New follow-up message awaits exact review',jsonb_build_object('approval_id',approval,'action_id',result.id));
  return result;
end; $$;
create or replace function public.record_automation_reply(p_workspace uuid,p_actor uuid,p_parent uuid,p_connection uuid,p_generation integer,p_thread text,p_message text,p_received timestamptz,p_sender text) returns public.reply_observations
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype;a public.proposed_actions%rowtype;c public.integration_connections%rowtype;r public.reply_observations%rowtype;j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into t from public.execution_attempts where id=p_parent and workspace_id=p_workspace;
  if not found then raise exception 'Parent missing' using errcode='P0002'; end if;
  perform 1 from public.workflows where id=t.workflow_id for update;
  select * into a from public.proposed_actions where id=t.action_id;
  select * into c from public.integration_connections where id=p_connection and workspace_id=p_workspace and provider='gmail' and status='connected' and generation=p_generation;
  if not found or not(c.scopes && array['https://www.googleapis.com/auth/gmail.metadata','https://www.googleapis.com/auth/gmail.readonly']) or a.action_type<>'send_email' or t.status<>'succeeded'
    or c.provider_identity is distinct from a.executable_envelope#>>'{connection,identity}'
    or t.connection_id is distinct from c.id or t.result->>'threadId' is distinct from p_thread or p_received is null or p_received<=t.dispatched_at or p_received>now()+interval '5 minutes'
    or lower(p_sender) is distinct from lower(a.executable_envelope#>>'{recipient,email}') or lower(p_sender)=lower(c.provider_identity)
    then raise exception 'Reply evidence invalid or read permission missing' using errcode='22023'; end if;
  insert into public.reply_observations(workspace_id,workflow_id,lead_id,parent_attempt_id,connection_id,authorization_generation,external_thread_id,external_message_id,received_at)
    values(p_workspace,t.workflow_id,(a.executable_envelope->>'leadId')::uuid,t.id,c.id,c.generation,p_thread,p_message,p_received)
    on conflict(workspace_id,connection_id,authorization_generation,external_message_id) do nothing returning * into r;
  if r.id is null then select * into r from public.reply_observations where workspace_id=p_workspace and connection_id=c.id and authorization_generation=c.generation and external_message_id=p_message;return r; end if;
  update public.leads set status='responded' where id=r.lead_id and status<>'rejected';
  update public.follow_up_plans set automation_status='skipped_reply_detected',status='cancelled',last_reply_at=p_received,cancelled_at=clock_timestamp(),last_checked_at=clock_timestamp()
    where workspace_id=p_workspace and lead_id=r.lead_id and status='planned' and automation_status<>'completed';
  for j in select * from public.automation_jobs where workspace_id=p_workspace and lead_id=r.lead_id and job_type='followup_due' and status in ('scheduled','queued','running','retry_scheduled') order by id for update loop
    update public.automation_jobs set status='cancelled',cancelled_at=clock_timestamp(),lease_until=null,retryable=false,next_retry_at=null where id=j.id;
  end loop;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,t.workflow_id,'reply_detected','Reply detected; unnecessary future follow-up preparation cancelled',jsonb_build_object('lead_id',r.lead_id,'reply_id',r.id,'parent_attempt_id',t.id,'actor',p_actor));
  return r;
end; $$;
create or replace function public.finish_automation_job(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid,p_status text,p_result jsonb default null,p_category text default null,p_code text default null,p_summary text default null,p_retryable boolean default false,p_retry_at timestamptz default null) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype; will_retry boolean; val jsonb; k text;external_safe boolean:=false;t public.execution_attempts%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501'; end if;
  if j.status='cancelled' then return j; end if;
  if j.claim_token is distinct from p_claim then raise exception 'Job completion fenced' using errcode='40001'; end if;
  if j.status='completed' then return j; end if;
  if j.status<>'running' or j.lease_until<=now() then raise exception 'Job completion stale' using errcode='40001'; end if;
  if p_status is null or p_status not in ('completed','failed') or (p_status='failed' and (p_category is null or p_code is null or p_summary is null))
    or p_result is not null and (jsonb_typeof(p_result)<>'object' or pg_column_size(p_result)>4096) then raise exception 'Invalid completion' using errcode='22023'; end if;
  if p_result is not null then for k,val in select * from jsonb_each(p_result) loop
    if char_length(k)>80 or jsonb_typeof(val) not in ('string','number','boolean','null') or (jsonb_typeof(val)='string' and char_length(val#>>'{}')>1000) then raise exception 'Unsafe result metadata' using errcode='22023'; end if;
  end loop; end if;
  if j.job_type='external_action_retry' and p_status='failed' and p_retryable then
    select * into t from public.execution_attempts where action_id=j.proposed_action_id order by attempt_number desc limit 1;
    external_safe:=coalesce(t.status in ('failed_retryable','cancelled_before_dispatch') and t.retry_eligible and t.attempt_number<3
      and t.snapshot_id::text=j.input->>'expectedSnapshotId' and not exists(select 1 from public.execution_attempts where workflow_id=j.workflow_id and status='outcome_unknown' and verification_method<>'closed_for_replacement'),false);
    if external_safe then
      j.input:=jsonb_set(j.input,'{attemptId}',to_jsonb(t.id::text));
      p_retry_at:=greatest(p_retry_at,t.next_retry_at,now()+interval '1 second');
    end if;
  end if;
  will_retry:=p_status='failed' and p_retryable and p_category in ('rate_limit','network','timeout','provider_error','internal') and j.attempt_count<j.max_attempts
    and p_retry_at is not null and p_retry_at>now() and p_retry_at<=now()+interval '24 hours' and (j.job_type<>'external_action_retry' or external_safe);
  -- A second external retry must be justified by the newest definitive persisted attempt.
  update public.automation_jobs set status=case when will_retry then 'retry_scheduled' else p_status end,result=p_result,error_category=p_category,error_code=p_code,error_summary=p_summary,
    retryable=(p_status='failed' and p_retryable and p_category in ('rate_limit','network','timeout','provider_error','internal') and attempt_count<max_attempts and (job_type<>'external_action_retry' or external_safe)),input=j.input,
    next_retry_at=case when will_retry then p_retry_at else null end,scheduled_for=case when will_retry then p_retry_at else scheduled_for end,
    completed_at=clock_timestamp(),lease_until=null,provider_job_id=case when will_retry then null else provider_job_id end where id=j.id returning * into j;
  if j.job_type='followup_due' and p_status='failed' then update public.follow_up_plans set automation_status=case when will_retry then 'scheduled' else 'failed' end
    where id=j.follow_up_plan_id and automation_status not in ('waiting_for_approval','approved','completed','skipped_reply_detected','cancelled'); end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,
    case when will_retry then 'retry_scheduled'::public.agent_event_type when p_status='completed' then 'automation_completed'::public.agent_event_type
      when p_retryable and j.attempt_count>=j.max_attempts then 'retry_exhausted'::public.agent_event_type else 'automation_failed'::public.agent_event_type end,
    case when will_retry then 'Safe operation retry scheduled' when p_status='completed' then 'Background operation completed' else 'Background operation needs attention' end,
    jsonb_build_object('job_id',j.id,'attempt',j.attempt_count,'error_category',p_category,'error_code',p_code,'next_retry_at',j.next_retry_at,'actor',p_actor));
  if p_status='completed' and j.job_type in ('workflow_continue','research_retry') and p_result->>'continue'='true'
    and coalesce((j.input->>'iteration')::integer,0)<500
    and exists(select 1 from public.workflows where id=j.workflow_id and status in ('planning','running')) then
    perform public.schedule_automation_job(p_workspace,p_actor,j.workflow_id,'workflow_continue',
      now()+case when p_result->>'inProgress'='true' then interval '3 seconds' else interval '0 seconds' end,j.id::text||':next',
      jsonb_build_object('iteration',coalesce((j.input->>'iteration')::integer,0)+1,'scope',coalesce(p_result->>'scope',j.input->>'scope','research')));
  end if;
  return j;
end; $$;
create or replace function public.mark_automation_followup(p_workspace uuid,p_actor uuid,p_plan uuid,p_claim uuid,p_status text) returns public.follow_up_plans
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.follow_up_plans where id=p_plan and workspace_id=p_workspace) and status<>'cancelled' for update;
  if not found then raise exception 'Workflow unavailable' using errcode='22023'; end if;
  select * into p from public.follow_up_plans where id=p_plan and workspace_id=p_workspace for update;
  if not found then raise exception 'Plan missing' using errcode='P0002'; end if;
  if p.status<>'planned' or p.automation_status in ('waiting_for_approval','approved','completed','cancelled','skipped_reply_detected')
    or p_status is null or p_status not in ('due','drafting','failed','skipped_reply_detected')
    or not exists(select 1 from public.automation_jobs where follow_up_plan_id=p_plan and job_type='followup_due' and actor_id=p_actor and status='running' and claim_token=p_claim and lease_until>now())
    then raise exception 'Follow-up claim fenced' using errcode='40001'; end if;
  update public.follow_up_plans set automation_status=p_status where id=p_plan returning * into p;
  if p_status='due' then insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,'followup_due','Follow-up due; draft preparation grants no sending permission',jsonb_build_object('plan_id',p.id,'actor',p_actor)); end if;
  return p;
end; $$;
