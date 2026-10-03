-- Internal follow-up plans retain their immutable approving actor. An unrelated
-- workspace request cannot become the actor of timer/backfill/test preparation.
create function public.assert_followup_automation_actor(p_job public.automation_jobs) returns void
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;s public.action_approval_snapshots%rowtype;t public.execution_attempts%rowtype;c public.integration_connections%rowtype;
begin
  if p_job.job_type<>'followup_due' or p_job.actor_id is null then return;end if;
  select * into p from public.follow_up_plans where id=p_job.follow_up_plan_id and workspace_id=p_job.workspace_id and workflow_id=p_job.workflow_id;
  select * into s from public.action_approval_snapshots where id=p.snapshot_id and workspace_id=p.workspace_id and workflow_id=p.workflow_id and action_id=p.action_id and action_type='schedule_follow_up';
  select * into t from public.execution_attempts where id=p.parent_attempt_id and workspace_id=p.workspace_id and workflow_id=p.workflow_id and status='succeeded';
  select * into c from public.integration_connections where id=t.connection_id and workspace_id=p.workspace_id and provider='gmail';
  if p.id is null or s.id is null or t.id is null or s.envelope->>'parentAttemptId' is distinct from p.parent_attempt_id::text
    or s.envelope->>'workspaceId' is distinct from p.workspace_id::text or s.envelope->>'workflowId' is distinct from p.workflow_id::text
    or s.envelope->>'actionId' is distinct from p.action_id::text or s.approved_by is distinct from p_job.actor_id
    or not exists(select 1 from public.workspace_members where workspace_id=p.workspace_id and user_id=p_job.actor_id)
    then raise exception 'Original follow-up approver unavailable' using errcode='42501';end if;
  if c.scopes && array['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.metadata']
    and not exists(select 1 from public.workspace_members where workspace_id=p.workspace_id and user_id=p_job.actor_id and role='owner')
    then raise exception 'Follow-up reply monitoring requires original approver ownership' using errcode='42501';end if;
end; $$;
revoke all on function public.assert_followup_automation_actor(public.automation_jobs) from public,anon,authenticated,service_role;

alter function public.assert_automation_target(public.automation_jobs) rename to assert_automation_target_before_followup_actor;
create function public.assert_automation_target(p_job public.automation_jobs) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_automation_target_before_followup_actor(p_job);
  perform public.assert_followup_automation_actor(p_job);
end; $$;
revoke all on function public.assert_automation_target_before_followup_actor(public.automation_jobs),public.assert_automation_target(public.automation_jobs) from public,anon,authenticated,service_role;

-- The original insert path builds a partial target before storing actor_id. This
-- full-row guard executes in the same transaction and rolls back mismatched actors.
create or replace function public.schedule_automation_job(p_workspace uuid,p_actor uuid,p_workflow uuid,p_job_type text,p_scheduled timestamptz,p_key text,p_input jsonb default '{}',p_task uuid default null,p_lead uuid default null,p_action uuid default null,p_plan uuid default null,p_max_attempts integer default 3) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  j:=public.schedule_automation_job_before_reply_guard(p_workspace,p_actor,p_workflow,p_job_type,p_scheduled,p_key,p_input,p_task,p_lead,p_action,p_plan,p_max_attempts);
  if j.job_type in ('reply_check','followup_due') then perform public.assert_automation_target(j);end if;
  return j;
end; $$;

create or replace function public.claim_automation_job(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;p public.follow_up_plans%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002';end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501';end if;
  if j.job_type='followup_due' and j.status in ('scheduled','queued','running','retry_scheduled') then perform public.assert_followup_automation_actor(j);end if;
  if j.job_type='reply_check' and j.status in ('scheduled','queued','running','retry_scheduled') then
    select * into p from public.follow_up_plans where id=j.follow_up_plan_id and workspace_id=p_workspace and workflow_id=j.workflow_id;
    if p.status is distinct from 'planned' or p.automation_status not in ('scheduled','due','drafting','waiting_for_approval','approved') or p.last_reply_at is not null then
      update public.automation_jobs set status='cancelled',cancelled_at=clock_timestamp(),retryable=false,next_retry_at=null,claim_token=null,lease_until=null where id=j.id returning * into j;
      insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'automation_cancelled',
        'Reply check cancelled because its plan is no longer active',jsonb_build_object('job_id',j.id,'plan_id',j.follow_up_plan_id,'actor',p_actor));
      return j;
    end if;
  end if;
  return public.claim_automation_job_before_reply_guard(p_workspace,p_actor,p_job,p_claim);
end; $$;

alter function public.schedule_automation_followup_test(uuid,uuid,uuid) rename to schedule_automation_followup_test_before_actor_guard;
create function public.schedule_automation_followup_test(p_workspace uuid,p_actor uuid,p_plan uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  j:=public.schedule_automation_followup_test_before_actor_guard(p_workspace,p_actor,p_plan);
  perform public.assert_followup_automation_actor(j);
  return j;
end; $$;
revoke all on function public.schedule_automation_followup_test_before_actor_guard(uuid,uuid,uuid),public.schedule_automation_followup_test(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.schedule_automation_followup_test(uuid,uuid,uuid) to service_role;
