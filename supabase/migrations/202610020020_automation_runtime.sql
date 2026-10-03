-- Trigger.dev delivers explicit bounded operations; existing runtime RPCs retain domain authority.
alter table public.leads add constraint leads_automation_reference unique(workspace_id,workflow_id,id);
alter table public.follow_up_plans add constraint followups_automation_reference unique(workspace_id,workflow_id,id);
alter table public.follow_up_plans add column automation_status text not null default 'inactive'
  check(automation_status in ('inactive','scheduled','due','drafting','waiting_for_approval','approved','completed','skipped_reply_detected','failed','cancelled'));
alter table public.follow_up_plans add column lead_id uuid;
alter table public.follow_up_plans add column company_id uuid;
alter table public.follow_up_plans add column draft_action_id uuid;
alter table public.follow_up_plans add column last_reply_at timestamptz;
alter table public.follow_up_plans add column last_checked_at timestamptz;
alter table public.follow_up_plans add column completed_at timestamptz;
alter table public.follow_up_plans add column updated_at timestamptz not null default now();
alter table public.follow_up_plans add foreign key(workspace_id,workflow_id,lead_id) references public.leads(workspace_id,workflow_id,id);
alter table public.follow_up_plans add foreign key(workspace_id,company_id) references public.companies(workspace_id,id);
alter table public.follow_up_plans add foreign key(workspace_id,workflow_id,draft_action_id) references public.proposed_actions(workspace_id,workflow_id,id);
update public.follow_up_plans p set lead_id=(a.executable_envelope->>'leadId')::uuid,company_id=(a.executable_envelope->>'companyId')::uuid,
  automation_status=case when p.status='cancelled' then 'cancelled' else 'inactive' end
  from public.execution_attempts t join public.proposed_actions a on a.id=t.action_id where t.id=p.parent_attempt_id;
create trigger automation_followup_updated before update on public.follow_up_plans for each row execute function public.set_updated_at();

create table public.automation_jobs (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null,workflow_id uuid not null,workflow_task_id uuid,lead_id uuid,
  proposed_action_id uuid,follow_up_plan_id uuid,actor_id uuid not null references auth.users(id),
  job_type text not null check(job_type in ('workflow_continue','research_retry','external_action_retry','followup_due','reply_check','workflow_health_check','stale_run_recovery')),
  status text not null default 'scheduled' check(status in ('scheduled','queued','running','retry_scheduled','completed','failed','cancelled')),
  provider text not null default 'trigger' check(provider='trigger'),provider_job_id text check(char_length(provider_job_id) between 1 and 240),
  scheduled_for timestamptz not null,started_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,
  attempt_count integer not null default 0,max_attempts integer not null default 3 check(max_attempts between 1 and 5),
  idempotency_key text not null check(char_length(idempotency_key) between 1 and 240),
  input jsonb not null default '{}' check(jsonb_typeof(input)='object' and pg_column_size(input)<=2048),
  result jsonb check(jsonb_typeof(result)='object' and pg_column_size(result)<=4096),
  error_category text check(error_category in ('validation','authorization','provider_auth','rate_limit','network','timeout','provider_error','invalid_state','duplicate','unknown_execution_state','internal')),
  error_code text check(error_code ~ '^[a-z0-9_]{1,80}$'),error_summary text check(char_length(error_summary)<=500),retryable boolean not null default false,next_retry_at timestamptz,
  claim_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(attempt_count between 0 and max_attempts),check(status<>'running' or (claim_token is not null and lease_until is not null)),
  unique(workspace_id,idempotency_key),unique(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id) references public.workflows(workspace_id,id),
  foreign key(workspace_id,workflow_id,workflow_task_id) references public.workflow_tasks(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,lead_id) references public.leads(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,proposed_action_id) references public.proposed_actions(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,follow_up_plan_id) references public.follow_up_plans(workspace_id,workflow_id,id)
);
create index automation_due_idx on public.automation_jobs(status,scheduled_for) where status in ('scheduled','queued','retry_scheduled');
create index automation_workflow_idx on public.automation_jobs(workspace_id,workflow_id,created_at desc);
create unique index automation_one_active_plan on public.automation_jobs(follow_up_plan_id) where job_type='followup_due' and status in ('scheduled','queued','running','retry_scheduled');
create index automation_stale_idx on public.automation_jobs(lease_until) where status='running';
create index followup_lead_idx on public.follow_up_plans(workspace_id,lead_id,due_at);
create trigger automation_job_updated before update on public.automation_jobs for each row execute function public.set_updated_at();

create table public.reply_observations (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null,workflow_id uuid not null,lead_id uuid not null,parent_attempt_id uuid not null,
  connection_id uuid not null,authorization_generation integer not null check(authorization_generation>0),external_thread_id text not null check(char_length(external_thread_id) between 1 and 240),
  external_message_id text not null check(char_length(external_message_id) between 1 and 240),received_at timestamptz not null,detected_at timestamptz not null default now(),processed_at timestamptz not null default now(),
  foreign key(workspace_id,workflow_id,lead_id) references public.leads(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,parent_attempt_id) references public.execution_attempts(workspace_id,workflow_id,id),
  foreign key(workspace_id,connection_id) references public.integration_connections(workspace_id,id),
  unique(workspace_id,connection_id,authorization_generation,external_message_id)
);
create index reply_lead_idx on public.reply_observations(workspace_id,lead_id,received_at desc);
alter table public.automation_jobs enable row level security;
alter table public.reply_observations enable row level security;
create policy automation_member_read on public.automation_jobs for select to authenticated using(public.is_workspace_member(workspace_id));
create policy reply_member_read on public.reply_observations for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.automation_jobs,public.reply_observations from public,anon,authenticated;
grant select(id,workspace_id,workflow_id,workflow_task_id,lead_id,proposed_action_id,follow_up_plan_id,actor_id,job_type,status,provider,provider_job_id,scheduled_for,
  started_at,completed_at,cancelled_at,attempt_count,max_attempts,idempotency_key,input,result,error_category,error_code,error_summary,retryable,next_retry_at,created_at,updated_at) on public.automation_jobs to authenticated;
grant select on public.automation_jobs,public.reply_observations to service_role;
grant select on public.reply_observations to authenticated;

create function public.assert_automation_target(p_job public.automation_jobs) returns void
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; p public.follow_up_plans%rowtype;
begin
  if exists(select 1 from public.workflows where id=p_job.workflow_id and status='cancelled') then raise exception 'Workflow cancelled' using errcode='22023'; end if;
  if p_job.job_type='external_action_retry' then
    select * into t from public.execution_attempts where id=(p_job.input->>'attemptId')::uuid and workspace_id=p_job.workspace_id and workflow_id=p_job.workflow_id and action_id=p_job.proposed_action_id;
    if not found or t.status not in ('failed_retryable','cancelled_before_dispatch') or not t.retry_eligible or t.attempt_number>=3
      or t.snapshot_id::text is distinct from p_job.input->>'expectedSnapshotId'
      or exists(select 1 from public.execution_attempts n where n.action_id=t.action_id and n.attempt_number>t.attempt_number)
      or exists(select 1 from public.execution_attempts n where n.workflow_id=t.workflow_id and n.status='outcome_unknown' and n.verification_method<>'closed_for_replacement')
      then raise exception 'Unsafe external retry' using errcode='22023'; end if;
  elsif p_job.job_type in ('followup_due','reply_check') then
    select * into p from public.follow_up_plans where id=p_job.follow_up_plan_id and workspace_id=p_job.workspace_id and workflow_id=p_job.workflow_id;
    if not found or (p_job.job_type='followup_due' and (p.status<>'planned' or p.automation_status in ('waiting_for_approval','approved','completed','skipped_reply_detected','cancelled')))
      or not exists(select 1 from public.execution_attempts where id=p.parent_attempt_id and status='succeeded')
      then raise exception 'Follow-up unavailable' using errcode='22023'; end if;
    if p_job.job_type='followup_due' and exists(select 1 from public.leads where id=p.lead_id and status in ('rejected','responded','converted')) then raise exception 'Lead no longer eligible' using errcode='22023'; end if;
  elsif p_job.job_type in ('workflow_continue','research_retry') and exists(select 1 from public.workflows where id=p_job.workflow_id and status in ('completed','waiting_for_approval','ready_for_execution','paused')) then
    raise exception 'Workflow does not allow continuation' using errcode='22023';
  end if;
end; $$;

create function public.schedule_automation_job(p_workspace uuid,p_actor uuid,p_workflow uuid,p_job_type text,p_scheduled timestamptz,p_key text,p_input jsonb default '{}',p_task uuid default null,p_lead uuid default null,p_action uuid default null,p_plan uuid default null,p_max_attempts integer default 3) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype; k text;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=p_workflow and workspace_id=p_workspace for update;
  if not found then raise exception 'Workflow missing' using errcode='P0002'; end if;
  if p_scheduled is null or p_scheduled>now()+interval '5 years' or p_input is null or jsonb_typeof(p_input)<>'object' or pg_column_size(p_input)>2048
    or p_key is null or char_length(p_key) not between 1 and 240 or p_max_attempts not between 1 and 5 then raise exception 'Invalid schedule' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p_input) loop
    if k not in ('retry','expectedSnapshotId','attemptId','planId','iteration','developmentTest','scope') then raise exception 'Unsupported job input' using errcode='22023'; end if;
  end loop;
  if (p_input?'retry' and jsonb_typeof(p_input->'retry')<>'boolean')
    or (p_input?'iteration' and (jsonb_typeof(p_input->'iteration')<>'number' or (p_input->>'iteration')::numeric not between 0 and 500 or (p_input->>'iteration')::numeric<>trunc((p_input->>'iteration')::numeric)))
    or (p_input?'scope' and p_input->>'scope' not in ('planning','research','preparation','execution'))
    or (p_input?'planId' and p_input->>'planId' is distinct from p_plan::text)
    or (p_input?'developmentTest' and (p_job_type<>'followup_due' or p_input->>'developmentTest' is distinct from 'true'))
    then raise exception 'Invalid job input' using errcode='22023'; end if;
  select * into j from public.automation_jobs where workspace_id=p_workspace and idempotency_key=p_key for update;
  if found then
    if j.workflow_id<>p_workflow or j.job_type<>p_job_type or j.input<>p_input or j.workflow_task_id is distinct from p_task or j.lead_id is distinct from p_lead
      or j.proposed_action_id is distinct from p_action or j.follow_up_plan_id is distinct from p_plan then raise exception 'Idempotency mismatch' using errcode='40001'; end if;
    return j;
  end if;
  j.workspace_id:=p_workspace;j.workflow_id:=p_workflow;j.job_type:=p_job_type;j.input:=p_input;j.proposed_action_id:=p_action;j.follow_up_plan_id:=p_plan;
  perform public.assert_automation_target(j);
  if p_job_type='followup_due' and p_input->>'developmentTest' is distinct from 'true'
    and p_scheduled<(select due_at from public.follow_up_plans where id=p_plan) then raise exception 'Normal follow-up cannot run before approved due time' using errcode='22023';end if;
  insert into public.automation_jobs(workspace_id,workflow_id,workflow_task_id,lead_id,proposed_action_id,follow_up_plan_id,actor_id,job_type,scheduled_for,idempotency_key,input,max_attempts)
    values(p_workspace,p_workflow,p_task,p_lead,p_action,p_plan,p_actor,p_job_type,p_scheduled,p_key,p_input,p_max_attempts) returning * into j;
  if p_job_type='followup_due' then update public.follow_up_plans set automation_status='scheduled' where id=p_plan; end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,p_workflow,'automation_scheduled','Scheduled '||replace(p_job_type,'_',' '),
    jsonb_build_object('job_id',j.id,'job_type',p_job_type,'scheduled_for',p_scheduled,'actor',p_actor));
  return j;
end; $$;

create function public.bind_automation_provider(p_workspace uuid,p_actor uuid,p_job uuid,p_provider_id text) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  if p_provider_id is null or char_length(p_provider_id) not between 1 and 240 then raise exception 'Invalid provider ID' using errcode='22023'; end if;
  if j.provider_job_id=p_provider_id then return j; end if;
  if j.provider_job_id is not null or j.status not in ('scheduled','queued','retry_scheduled') then raise exception 'Provider binding fenced' using errcode='40001'; end if;
  update public.automation_jobs set provider_job_id=p_provider_id where id=j.id returning * into j;
  return j;
end; $$;

create function public.claim_automation_job(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  if j.actor_id<>p_actor then raise exception 'Worker actor changed' using errcode='42501'; end if;
  if j.status in ('completed','cancelled','failed','running') then return j; end if;
  if p_claim is null or j.scheduled_for>now() or j.next_retry_at>now() or j.attempt_count>=j.max_attempts then raise exception 'Job not due' using errcode='22023'; end if;
  perform public.assert_automation_target(j);
  update public.automation_jobs set status='running',claim_token=p_claim,lease_until=now()+interval '5 minutes',attempt_count=attempt_count+1,
    started_at=clock_timestamp(),completed_at=null,error_category=null,error_code=null,error_summary=null,retryable=false,next_retry_at=null where id=j.id returning * into j;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,
    case when j.job_type='reply_check' then 'reply_check_started'::public.agent_event_type else 'automation_started'::public.agent_event_type end,
    'Background '||replace(j.job_type,'_',' ')||' started',jsonb_build_object('job_id',j.id,'attempt',j.attempt_count,'actor',p_actor));
  return j;
end; $$;

create function public.mark_automation_dispatch_failure(p_workspace uuid,p_actor uuid,p_job uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  if j.status not in ('scheduled','queued','retry_scheduled') or j.provider_job_id is not null then return j; end if;
  update public.automation_jobs set status='failed',error_category='provider_error',error_code='scheduler_unavailable',
    error_summary='Background provider could not accept this job. No domain attempt started; retry scheduling explicitly.',retryable=true,
    next_retry_at=null,completed_at=clock_timestamp() where id=j.id returning * into j;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'automation_failed',
    'Background scheduling failed before any domain attempt',jsonb_build_object('job_id',j.id,'error_code','scheduler_unavailable','actor',p_actor));
  return j;
end; $$;

create function public.finish_automation_job(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid,p_status text,p_result jsonb default null,p_category text default null,p_code text default null,p_summary text default null,p_retryable boolean default false,p_retry_at timestamptz default null) returns public.automation_jobs
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
  if p_status='completed' and j.job_type='workflow_continue' and p_result->>'continue'='true'
    and coalesce((j.input->>'iteration')::integer,0)<500
    and exists(select 1 from public.workflows where id=j.workflow_id and status in ('planning','running')) then
    perform public.schedule_automation_job(p_workspace,p_actor,j.workflow_id,'workflow_continue',
      now()+case when p_result->>'inProgress'='true' then interval '3 seconds' else interval '0 seconds' end,j.id::text||':next',
      jsonb_build_object('iteration',coalesce((j.input->>'iteration')::integer,0)+1,'scope',coalesce(p_result->>'scope',j.input->>'scope','research')));
  end if;
  return j;
end; $$;

create function public.cancel_automation_job(p_workspace uuid,p_actor uuid,p_job uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  if j.status in ('completed','cancelled') then return j; end if;
  update public.automation_jobs set status='cancelled',cancelled_at=clock_timestamp(),lease_until=null,retryable=false,next_retry_at=null where id=j.id returning * into j;
  if j.job_type='followup_due' then update public.follow_up_plans set status='cancelled',automation_status='cancelled',cancelled_at=clock_timestamp()
    where id=j.follow_up_plan_id and automation_status not in ('waiting_for_approval','approved','completed','skipped_reply_detected'); end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'automation_cancelled','Future job cancelled; completed external actions remain in history',jsonb_build_object('job_id',j.id,'actor',p_actor));
  return j;
end; $$;

create function public.retry_automation_job(p_workspace uuid,p_actor uuid,p_job uuid) returns public.automation_jobs
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.automation_jobs where id=p_job and workspace_id=p_workspace) for update;
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace for update;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  if j.status in ('scheduled','queued','retry_scheduled') then return j; end if;
  if j.status<>'failed' or not j.retryable or j.attempt_count>=j.max_attempts or j.error_category not in ('rate_limit','network','timeout','provider_error','internal')
    then raise exception 'Retry unavailable' using errcode='22023'; end if;
  perform public.assert_automation_target(j);
  -- Actor changes require a new explicit job; workers always use the original verified initiator.
  update public.automation_jobs set status='retry_scheduled',scheduled_for=clock_timestamp(),next_retry_at=clock_timestamp(),provider_job_id=null,claim_token=null,lease_until=null,
    completed_at=null where id=j.id returning * into j;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'manual_retry_requested','Manual retry requested within the existing attempt budget',jsonb_build_object('job_id',j.id,'actor',p_actor));
  return j;
end; $$;

create function public.recover_automation_jobs(p_workspace uuid,p_actor uuid,p_workflow uuid default null,p_job uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype; n integer:=0; safe boolean;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  for j in select * from public.automation_jobs where workspace_id=p_workspace and actor_id=p_actor and (p_workflow is null or workflow_id=p_workflow) and (p_job is null or id=p_job)
    and status='running' and lease_until<=now() order by workflow_id,id limit 50 loop
    perform 1 from public.workflows where id=j.workflow_id for update;
    select * into j from public.automation_jobs where id=j.id for update;
    if j.status<>'running' or j.lease_until>now() then continue; end if;
    safe:=j.job_type<>'external_action_retry' and j.attempt_count<j.max_attempts and not exists(select 1 from public.workflows where id=j.workflow_id and status='cancelled');
    update public.automation_jobs set status=case when safe then 'retry_scheduled' else 'failed' end,error_category=case when safe then 'timeout' else 'unknown_execution_state' end,
      error_code='worker_lease_expired',error_summary=case when safe then 'Worker stopped; existing safe runtime claims will be reconciled before continuation.' else 'External execution requires reconciliation; this job cannot blindly retry.' end,
      retryable=safe,next_retry_at=case when safe then now()+interval '30 seconds' else null end,scheduled_for=case when safe then now()+interval '30 seconds' else scheduled_for end,
      provider_job_id=case when safe then null else provider_job_id end,claim_token=null,lease_until=null,completed_at=clock_timestamp() where id=j.id;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'run_marked_stale','Expired background lease fenced; saved external history remains authoritative',jsonb_build_object('job_id',j.id,'retryable',safe,'actor',p_actor));
    if safe then insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,j.workflow_id,'run_recovered','Safe internal operation scheduled for bounded recovery',jsonb_build_object('job_id',j.id,'actor',p_actor)); end if;
    n:=n+1;
  end loop;
  return n;
end; $$;

-- Workflow row lock precedes every job lock. Cancellation fences generation without erasing dispatched results.
create function public.cancel_workflow_automation() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;
begin
  if new.status='cancelled' and old.status<>'cancelled' then
    for j in select * from public.automation_jobs where workflow_id=new.id and status in ('scheduled','queued','running','retry_scheduled','failed') order by id for update loop
      update public.automation_jobs set status='cancelled',cancelled_at=clock_timestamp(),retryable=false,next_retry_at=null,lease_until=null where id=j.id;
      insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(new.workspace_id,new.id,'automation_cancelled','Workflow cancellation stopped future automation',jsonb_build_object('job_id',j.id));
    end loop;
    update public.follow_up_plans set status='cancelled',automation_status='cancelled',cancelled_at=coalesce(cancelled_at,clock_timestamp())
      where workflow_id=new.id and status='planned' and automation_status<>'completed';
  end if;
  return new;
end; $$;
create trigger cancel_workflow_automation after update of status on public.workflows for each row execute function public.cancel_workflow_automation();

create function public.followup_internal_saved() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype;
begin
  select a.* into a from public.execution_attempts t join public.proposed_actions a on a.id=t.action_id where t.id=new.parent_attempt_id;
  new.lead_id:=(a.executable_envelope->>'leadId')::uuid;new.company_id:=(a.executable_envelope->>'companyId')::uuid;
  return new;
end; $$;
create trigger followup_internal_saved before insert on public.follow_up_plans for each row execute function public.followup_internal_saved();

create function public.mark_automation_followup(p_workspace uuid,p_actor uuid,p_plan uuid,p_claim uuid,p_status text) returns public.follow_up_plans
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
  update public.follow_up_plans set automation_status=p_status,last_checked_at=clock_timestamp() where id=p_plan returning * into p;
  if p_status='due' then insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,'followup_due','Follow-up due; draft preparation grants no sending permission',jsonb_build_object('plan_id',p.id,'actor',p_actor)); end if;
  return p;
end; $$;

create function public.publish_followup_draft(p_workspace uuid,p_actor uuid,p_plan uuid,p_claim uuid,p_envelope jsonb,p_metrics jsonb) returns public.proposed_actions
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
    or proof->'personalization' is distinct from parent.payload->'personalization'
    or jsonb_typeof(proof->'evidenceReferences') is distinct from 'array' or jsonb_array_length(proof->'evidenceReferences') not between 1 and 3
    or run_id is null or p_metrics->>'model' is distinct from metadata->>'model' or pg_column_size(p_envelope)>65536
    then raise exception 'Follow-up provenance invalid' using errcode='22023'; end if;
  for fact in select value from jsonb_array_elements(proof->'evidenceReferences') loop
    if not (parent.payload->'evidenceReferences' @> jsonb_build_array(fact)) then raise exception 'Unsupported evidence' using errcode='22023'; end if;
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
  update public.follow_up_plans set automation_status='waiting_for_approval',draft_action_id=result.id,last_checked_at=clock_timestamp() where id=p.id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'followup_draft_created','Follow-up draft ready; independent human approval required',jsonb_build_object('plan_id',p.id,'action_id',result.id,'job_id',j.id,'parent_action_id',parent.id));
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'approval_requested','New follow-up message awaits exact review',jsonb_build_object('approval_id',approval,'action_id',result.id));
  return result;
end; $$;

create function public.record_automation_reply(p_workspace uuid,p_actor uuid,p_parent uuid,p_connection uuid,p_generation integer,p_thread text,p_message text,p_received timestamptz,p_sender text) returns public.reply_observations
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype;a public.proposed_actions%rowtype;c public.integration_connections%rowtype;r public.reply_observations%rowtype;j public.automation_jobs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into t from public.execution_attempts where id=p_parent and workspace_id=p_workspace;
  if not found then raise exception 'Parent missing' using errcode='P0002'; end if;
  perform 1 from public.workflows where id=t.workflow_id for update;
  select * into a from public.proposed_actions where id=t.action_id;
  select * into c from public.integration_connections where id=p_connection and workspace_id=p_workspace and provider='gmail' and status='connected' and generation=p_generation;
  if not found or not(c.scopes @> array['https://www.googleapis.com/auth/gmail.metadata']) or a.action_type<>'send_email' or t.status<>'succeeded'
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

-- Existing plan cancellation now stops its durable preparation job as part of the same transaction.
create function public.followup_cancelled_jobs() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='cancelled' and old.status<>'cancelled' then
    if new.automation_status<>'skipped_reply_detected' then update public.follow_up_plans set automation_status='cancelled' where id=new.id;end if;
    update public.proposed_actions set status='cancelled' where id=new.draft_action_id and status in ('pending_approval','waiting_for_approval','approved')
      and not exists(select 1 from public.execution_attempts where action_id=new.draft_action_id and status in ('dispatching','succeeded','outcome_unknown'));
    update public.approvals set status='cancelled' where id=(select approval_id from public.proposed_actions where id=new.draft_action_id and status='cancelled');
    update public.automation_jobs set status='cancelled',cancelled_at=clock_timestamp(),retryable=false,next_retry_at=null,lease_until=null
      where follow_up_plan_id=new.id and status in ('scheduled','queued','running','retry_scheduled');
  end if;
  return new;
end; $$;
create trigger followup_cancelled_jobs after update of status on public.follow_up_plans for each row execute function public.followup_cancelled_jobs();

create function public.followup_action_state() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    update public.follow_up_plans set automation_status=case when new.status='executed' then 'completed' when new.status='approved' then 'approved'
      when new.status in ('rejected','cancelled') then 'cancelled' else automation_status end,
      completed_at=case when new.status='executed' then clock_timestamp() else completed_at end
      where draft_action_id=new.id and automation_status not in ('skipped_reply_detected','completed','cancelled');
  end if;
  return new;
end; $$;
create trigger followup_action_state after update of status on public.proposed_actions for each row execute function public.followup_action_state();

-- A reply/cancellation also blocks a prepared follow-up at the final checked Executor gate.
alter function public.assert_executable_envelope(public.proposed_actions) rename to assert_executable_envelope_before_automation;
create function public.assert_executable_envelope(p_action public.proposed_actions) returns void
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;
begin
  perform public.assert_executable_envelope_before_automation(p_action);
  select * into p from public.follow_up_plans where draft_action_id=p_action.id;
  if found and (p.status<>'planned' or p.automation_status in ('cancelled','skipped_reply_detected')
    or exists(select 1 from public.leads where id=p.lead_id and status in ('responded','rejected','converted'))
    or exists(select 1 from public.reply_observations where lead_id=p.lead_id)) then raise exception 'Follow-up no longer eligible' using errcode='22023';end if;
end; $$;
revoke all on function public.assert_executable_envelope_before_automation(public.proposed_actions),public.assert_executable_envelope(public.proposed_actions) from public,anon,authenticated,service_role;

-- Human follow-up edits remain possible after core completion; the completed workflow never reopens.
alter function public.save_executable_email(uuid,integer,text,text,text,uuid,text,text) rename to save_executable_email_before_automation;
create function public.save_executable_email(p_action_id uuid,p_revision integer,p_email text,p_name text,p_role text,p_connection uuid,p_subject text,p_body text) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype;old public.proposed_actions%rowtype;p public.follow_up_plans%rowtype;c public.integration_connections%rowtype;aid uuid;approval uuid;e jsonb;
begin
  select * into p from public.follow_up_plans where draft_action_id=p_action_id;
  if not found then return public.save_executable_email_before_automation(p_action_id,p_revision,p_email,p_name,p_role,p_connection,p_subject,p_body);end if;
  if auth.uid() is null or not public.is_workspace_member(p.workspace_id) then raise exception 'Access denied' using errcode='42501';end if;
  perform 1 from public.workflows where id=p.workflow_id and status<>'cancelled' for update;
  if not found then raise exception 'Workflow cancelled' using errcode='22023';end if;
  select * into p from public.follow_up_plans where id=p.id for update;
  select * into a from public.proposed_actions where id=p_action_id for update;
  if a.revision is distinct from p_revision or a.superseded_by_id is not null then raise exception 'Stale proposal' using errcode='40001';end if;
  if p.status<>'planned' or p.automation_status not in ('waiting_for_approval','approved') or a.status not in ('pending_approval','waiting_for_approval','approved')
    or not public.valid_contact_email(p_email) or coalesce(char_length(p_subject),0) not between 1 and 200 or p_subject~E'[\r\n]'
    or coalesce(char_length(p_body),0) not between 10 and 10000 or coalesce(char_length(p_name),0)>240 or coalesce(char_length(p_role),0)>240
    or coalesce(p_name,'')~E'[\r\n]' or coalesce(p_role,'')~E'[\r\n]'
    or exists(select 1 from public.execution_attempts where action_id=a.id and (status in ('claimed','dispatching','succeeded') or (status='outcome_unknown' and verification_method<>'closed_for_replacement')))
    then raise exception 'Follow-up edit unavailable' using errcode='22023';end if;
  select * into c from public.integration_connections where id=p_connection and workspace_id=p.workspace_id and provider='gmail' and status='connected';
  if not found then raise exception 'Connection unavailable' using errcode='22023';end if;
  if a.status='approved' then
    old:=a;aid:=gen_random_uuid();
    insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level) values(p.workspace_id,p.workflow_id,'auxiliary_followup_email','Review replacement follow-up','Recipient/content changed; new approval and explicit Execute required.','medium') returning id into approval;
    insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,lineage_id,replaces_action_id,is_auxiliary)
      values(aid,p.workspace_id,p.workflow_id,approval,'send_email',a.target,a.payload,'pending_approval','medium',a.dedupe_key||':replacement:'||a.revision,a.lineage_id,a.id,true) returning * into a;
    update public.proposed_actions set status='cancelled',superseded_by_id=aid where id=old.id;
    update public.approvals set status='cancelled' where id=old.approval_id;
    update public.follow_up_plans set draft_action_id=aid,automation_status='waiting_for_approval' where id=p.id;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p.workspace_id,p.workflow_id,'proposal_superseded','Follow-up approval replaced; fresh human review required',jsonb_build_object('action_id',old.id,'replacement_id',aid,'actor',auth.uid()));
  end if;
  e:=coalesce(a.executable_envelope,old.executable_envelope)||jsonb_build_object('actionId',a.id,'snapshotId',gen_random_uuid(),'revision',a.revision+1,'lineageId',a.lineage_id,
    'subject',p_subject,'body',p_body,'recipient',jsonb_build_object('email',p_email,'name',p_name,'role',p_role,'provenance','user_supplied','confirmedBy',auth.uid(),
      'confirmedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'connection',jsonb_build_object('provider','gmail','id',c.id,'generation',c.generation,'identity',c.provider_identity));
  update public.proposed_actions set revision=revision+1,schema_version=2,executable_envelope=e,target=target||jsonb_build_object('recipientEmail',p_email,'recipientName',p_name),
    payload=payload||jsonb_build_object('subject',p_subject,'body',p_body,'executionReadiness','ready') where id=a.id returning * into a;
  perform public.assert_executable_envelope(a);
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p.workspace_id,p.workflow_id,'proposed_action_edited','Follow-up human edits saved; prior sent content remains immutable',jsonb_build_object('action_id',a.id,'revision',a.revision,'actor',auth.uid()));
  return a;
end; $$;
revoke all on function public.save_executable_email_before_automation(uuid,integer,text,text,text,uuid,text,text),public.save_executable_email(uuid,integer,text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_executable_email(uuid,integer,text,text,text,uuid,text,text) to authenticated;

-- An independent follow-up decision does not erase the already-contacted lead state.
alter function public.decide_action_revisions(uuid,public.approval_status,jsonb) rename to decide_action_revisions_before_automation;
create function public.decide_action_revisions(p_approval_id uuid,p_decision public.approval_status,p_revisions jsonb) returns public.approvals
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;status_before public.lead_status;outreach_before public.outreach_status;result public.approvals%rowtype;
begin
  select p.* into p from public.follow_up_plans p join public.proposed_actions a on a.id=p.draft_action_id where a.approval_id=p_approval_id;
  if p.id is not null then
    perform 1 from public.workflows where id=p.workflow_id for update;
    select status,outreach_status into status_before,outreach_before from public.leads where id=p.lead_id;
  end if;
  result:=public.decide_action_revisions_before_automation(p_approval_id,p_decision,p_revisions);
  if p.id is not null then update public.leads set status=status_before,outreach_status=outreach_before where id=p.lead_id;end if;
  return result;
end; $$;
revoke all on function public.decide_action_revisions_before_automation(uuid,public.approval_status,jsonb),public.decide_action_revisions(uuid,public.approval_status,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.decide_action_revisions(uuid,public.approval_status,jsonb) to authenticated;

do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
  ('assert_automation_target','schedule_automation_job','bind_automation_provider','mark_automation_dispatch_failure','claim_automation_job','finish_automation_job','cancel_automation_job','retry_automation_job',
   'recover_automation_jobs','cancel_workflow_automation','followup_internal_saved','mark_automation_followup','publish_followup_draft','record_automation_reply','followup_cancelled_jobs','followup_action_state') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.signature::text not like 'assert_automation_target%' and f.signature::text not like 'cancel_workflow_automation%' and f.signature::text not like 'followup_internal_saved%'
    and f.signature::text not like 'followup_cancelled_jobs%' and f.signature::text not like 'followup_action_state%' then execute format('grant execute on function %s to service_role',f.signature);end if;
end loop;end $$;
