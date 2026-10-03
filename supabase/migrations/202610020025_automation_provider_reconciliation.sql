-- Bound dispatch recovery is separate from domain execution attempts. Only the
-- service worker may attest an exact terminal provider run after checking it.
alter table public.automation_jobs add column dispatch_failure_count integer not null default 0 check(dispatch_failure_count between 0 and 5);

create function public.reconcile_automation_provider(p_workspace uuid,p_actor uuid,p_job uuid,p_provider_id text,p_provider_status text) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;failures integer;can_retry boolean;retry_at timestamptz;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002';end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501';end if;
  if p_provider_id is null or p_provider_status is null or p_provider_status not in ('COMPLETED','CANCELED','FAILED','CRASHED','INTERRUPTED','SYSTEM_FAILURE','EXPIRED','TIMED_OUT')
    then raise exception 'Terminal provider proof required' using errcode='22023';end if;
  if j.provider_job_id is distinct from p_provider_id or j.status not in ('scheduled','queued','retry_scheduled')
    or j.scheduled_for>clock_timestamp() or j.next_retry_at>clock_timestamp() or j.lease_until is not null then return j;end if;
  failures:=least(j.dispatch_failure_count+1,5);
  can_retry:=failures<j.max_attempts and j.attempt_count<j.max_attempts
    and not exists(select 1 from public.workflows where id=j.workflow_id and status='cancelled');
  retry_at:=clock_timestamp()+make_interval(secs=>30*power(2,failures-1)::integer);
  update public.automation_jobs set dispatch_failure_count=failures,status=case when can_retry then 'retry_scheduled' else 'failed' end,
    provider_job_id=null,claim_token=null,lease_until=null,error_category='provider_error',error_code='scheduler_callback_failed',
    error_summary=case when can_retry then 'Provider stopped before the job was claimed. A bounded dispatch retry is scheduled.' else 'Provider dispatch recovery budget exhausted. No additional domain attempt started.' end,
    retryable=can_retry,next_retry_at=case when can_retry then retry_at else null end,
    scheduled_for=case when can_retry then retry_at else scheduled_for end,completed_at=clock_timestamp() where id=j.id returning * into j;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,
    case when can_retry then 'retry_scheduled'::public.agent_event_type else 'automation_failed'::public.agent_event_type end,
    case when can_retry then 'Stopped provider dispatch scheduled for bounded recovery' else 'Provider dispatch recovery exhausted' end,
    jsonb_build_object('job_id',j.id,'provider_run_id',p_provider_id,'provider_status',p_provider_status,'dispatch_failure_count',failures,'domain_attempt',j.attempt_count,'next_retry_at',j.next_retry_at,'actor',p_actor));
  return j;
end; $$;
revoke all on function public.reconcile_automation_provider(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_automation_provider(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.mark_automation_dispatch_failure(p_workspace uuid,p_actor uuid,p_job uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;failures integer;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002';end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501';end if;
  if j.status not in ('scheduled','queued','retry_scheduled') or j.provider_job_id is not null then return j;end if;
  failures:=least(j.dispatch_failure_count+1,5);
  update public.automation_jobs set status='failed',dispatch_failure_count=failures,error_category='provider_error',error_code='scheduler_unavailable',
    error_summary='Background provider could not accept this job. No domain attempt started; retry scheduling explicitly within the dispatch budget.',
    retryable=(failures<max_attempts and attempt_count<max_attempts),next_retry_at=null,completed_at=clock_timestamp() where id=j.id returning * into j;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'automation_failed',
    'Background scheduling failed before any domain attempt',jsonb_build_object('job_id',j.id,'error_code','scheduler_unavailable','dispatch_failure_count',failures,'actor',p_actor));
  return j;
end; $$;

create or replace function public.retry_automation_job(p_workspace uuid,p_actor uuid,p_job uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002';end if;
  if j.status in ('scheduled','queued','retry_scheduled') then return j;end if;
  if j.status<>'failed' or not j.retryable or j.attempt_count>=j.max_attempts or j.dispatch_failure_count>=j.max_attempts
    or j.error_category not in ('rate_limit','network','timeout','provider_error','internal') then raise exception 'Retry unavailable' using errcode='22023';end if;
  perform public.assert_automation_target(j);
  update public.automation_jobs set status='retry_scheduled',scheduled_for=clock_timestamp(),next_retry_at=clock_timestamp(),provider_job_id=null,claim_token=null,lease_until=null,
    completed_at=null where id=j.id returning * into j;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'manual_retry_requested',
    'Manual retry requested within the existing attempt and dispatch budgets',jsonb_build_object('job_id',j.id,'actor',p_actor));
  return j;
end; $$;

-- Reply jobs retain the original approved thread, current read connection and
-- owner. A cancelled/finished plan cannot acquire a new mailbox worker.
alter function public.assert_automation_target(public.automation_jobs) rename to assert_automation_target_before_reply_guard;
create function public.assert_automation_target(p_job public.automation_jobs) returns void
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;t public.execution_attempts%rowtype;s public.action_approval_snapshots%rowtype;c public.integration_connections%rowtype;
begin
  perform public.assert_automation_target_before_reply_guard(p_job);
  if p_job.job_type='reply_check' then
    select * into p from public.follow_up_plans where id=p_job.follow_up_plan_id and workspace_id=p_job.workspace_id and workflow_id=p_job.workflow_id;
    select * into t from public.execution_attempts where id=p.parent_attempt_id and workspace_id=p.workspace_id and workflow_id=p.workflow_id and status='succeeded';
    select * into s from public.action_approval_snapshots where id=t.snapshot_id and workspace_id=t.workspace_id and workflow_id=t.workflow_id and action_type='send_email';
    select * into c from public.integration_connections where id=t.connection_id and workspace_id=p.workspace_id and provider='gmail' and status='connected';
    if p.id is null or p.status<>'planned' or p.automation_status not in ('scheduled','due','drafting','waiting_for_approval','approved') or p.last_reply_at is not null
      or t.id is null or s.id is null or c.id is null or nullif(t.result->>'threadId','') is null or nullif(t.result->>'messageId','') is null
      or c.id::text is distinct from s.envelope#>>'{connection,id}' or c.generation::text is distinct from s.envelope#>>'{connection,generation}'
      or c.provider_identity is distinct from s.envelope#>>'{connection,identity}'
      or not (c.scopes && array['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.metadata'])
      then raise exception 'Reply monitoring target unavailable' using errcode='22023';end if;
    if p_job.actor_id is not null and (p_job.actor_id is distinct from s.approved_by or not exists(select 1 from public.workspace_members where workspace_id=p.workspace_id and user_id=p_job.actor_id and role='owner'))
      then raise exception 'Reply monitoring owner unavailable' using errcode='42501';end if;
  end if;
end; $$;
revoke all on function public.assert_automation_target_before_reply_guard(public.automation_jobs),public.assert_automation_target(public.automation_jobs) from public,anon,authenticated,service_role;

alter function public.schedule_automation_job(uuid,uuid,uuid,text,timestamptz,text,jsonb,uuid,uuid,uuid,uuid,integer) rename to schedule_automation_job_before_reply_guard;
create function public.schedule_automation_job(p_workspace uuid,p_actor uuid,p_workflow uuid,p_job_type text,p_scheduled timestamptz,p_key text,p_input jsonb default '{}',p_task uuid default null,p_lead uuid default null,p_action uuid default null,p_plan uuid default null,p_max_attempts integer default 3) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  j:=public.schedule_automation_job_before_reply_guard(p_workspace,p_actor,p_workflow,p_job_type,p_scheduled,p_key,p_input,p_task,p_lead,p_action,p_plan,p_max_attempts);
  if j.job_type='reply_check' then perform public.assert_automation_target(j);end if;
  return j;
end; $$;
revoke all on function public.schedule_automation_job_before_reply_guard(uuid,uuid,uuid,text,timestamptz,text,jsonb,uuid,uuid,uuid,uuid,integer),public.schedule_automation_job(uuid,uuid,uuid,text,timestamptz,text,jsonb,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.schedule_automation_job(uuid,uuid,uuid,text,timestamptz,text,jsonb,uuid,uuid,uuid,uuid,integer) to service_role;

alter function public.claim_automation_job(uuid,uuid,uuid,uuid) rename to claim_automation_job_before_reply_guard;
create function public.claim_automation_job(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;p public.follow_up_plans%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002';end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501';end if;
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
revoke all on function public.claim_automation_job_before_reply_guard(uuid,uuid,uuid,uuid),public.claim_automation_job(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_automation_job(uuid,uuid,uuid,uuid) to service_role;
