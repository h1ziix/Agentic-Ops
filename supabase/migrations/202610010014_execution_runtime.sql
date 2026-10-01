-- External attempts have their own policy; do not broaden LLM regeneration retries.
alter table public.agent_runs drop constraint agent_runs_retry_count_check;
alter table public.agent_runs add constraint agent_runs_retry_count_check check(retry_count between 0 and case when agent_type='executor' then 2 else 1 end);
alter table public.agent_runs add constraint deterministic_executor_metrics check(agent_type<>'executor' or (model is null and input_tokens is null and output_tokens is null and total_tokens is null));
create table public.execution_attempts (
  id uuid primary key, workspace_id uuid not null, workflow_id uuid not null, action_id uuid not null, snapshot_id uuid not null, connection_id uuid,
  attempt_number integer not null check(attempt_number between 1 and 3), operation_key text not null unique, executor_run_id uuid not null,
  claim_token uuid not null, lease_until timestamptz not null,
  status text not null check(status in ('claimed','dispatching','succeeded','failed_retryable','failed_terminal','outcome_unknown','cancelled_before_dispatch')),
  claimed_at timestamptz not null default now(), dispatched_at timestamptz, completed_at timestamptz, rfc_message_id text,
  result jsonb, safe_error_code text, retry_eligible boolean not null default false, next_retry_at timestamptz, duration_ms integer,
  verification_method text not null default 'unresolved' check(verification_method in ('provider_response','provider_read','user_confirmed','internal_transaction','unresolved','closed_for_replacement')),
  reconciled_by uuid references auth.users(id), reconciled_at timestamptz, reconciliation_note text check(char_length(reconciliation_note)<=2000),
  foreign key(workspace_id,workflow_id,action_id) references public.proposed_actions(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,action_id,snapshot_id) references public.action_approval_snapshots(workspace_id,workflow_id,action_id,id),
  foreign key(workspace_id,connection_id) references public.integration_connections(workspace_id,id),
  foreign key(workspace_id,workflow_id,executor_run_id) references public.agent_runs(workspace_id,workflow_id,id),
  unique(snapshot_id,attempt_number), unique(workspace_id,workflow_id,id)
);
create unique index execution_one_active_action on public.execution_attempts(action_id) where status in ('claimed','dispatching');
create unique index execution_one_active_workflow on public.execution_attempts(workflow_id) where status in ('claimed','dispatching');
create unique index execution_one_success on public.execution_attempts(snapshot_id) where status='succeeded';
create table public.follow_up_plans (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, workflow_id uuid not null, action_id uuid not null unique,
  snapshot_id uuid not null unique, parent_attempt_id uuid not null, due_at timestamptz not null, timezone text not null, note text,
  status text not null default 'planned' check(status in ('planned','cancelled')), created_at timestamptz not null default now(), cancelled_at timestamptz,
  foreign key(workspace_id,workflow_id,action_id) references public.proposed_actions(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,snapshot_id) references public.action_approval_snapshots(workspace_id,workflow_id,id),
  foreign key(workspace_id,workflow_id,parent_attempt_id) references public.execution_attempts(workspace_id,workflow_id,id)
);
alter table public.execution_attempts enable row level security;
alter table public.follow_up_plans enable row level security;
create policy attempt_member_read on public.execution_attempts for select to authenticated using(public.is_workspace_member(workspace_id));
create policy follow_up_member_read on public.follow_up_plans for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.execution_attempts,public.follow_up_plans from public,anon,authenticated;
grant select(id,workspace_id,workflow_id,action_id,snapshot_id,connection_id,attempt_number,operation_key,executor_run_id,lease_until,status,claimed_at,dispatched_at,completed_at,rfc_message_id,result,safe_error_code,retry_eligible,next_retry_at,duration_ms,verification_method,reconciled_by,reconciled_at,reconciliation_note) on public.execution_attempts to authenticated;
grant select on public.follow_up_plans to authenticated,service_role;
grant select on public.execution_attempts to service_role;

-- Replacements cannot erase uncertainty. Approval data itself is immutable after decision.
create function public.guard_action_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status in ('approved','executed','rejected','cancelled') and (new.executable_envelope is distinct from old.executable_envelope or new.payload is distinct from old.payload or new.target is distinct from old.target or new.revision<>old.revision or new.schema_version<>old.schema_version)
    then raise exception 'Decided proposal is immutable' using errcode='42501'; end if;
  if new.superseded_by_id is distinct from old.superseded_by_id and exists(select 1 from public.execution_attempts where action_id=old.id and
    (status in ('claimed','dispatching','succeeded') or (status='outcome_unknown' and verification_method<>'closed_for_replacement')))
    then raise exception 'Active, successful or uncertain operation cannot be replaced' using errcode='22023'; end if;
  return new;
end; $$;
create trigger guard_action_revision before update on public.proposed_actions for each row execute function public.guard_action_revision();

create function public.aggregate_execution(p_workflow uuid) returns void language plpgsql security definer set search_path='' as $$
declare w public.workflows%rowtype; unresolved integer; pending integer; terminal integer; failed integer; unknowns integer; blocked integer;
begin
  select * into w from public.workflows where id=p_workflow;
  -- Auxiliary operations never reopen core tasks; cancellation is terminal even after a late success.
  update public.approvals g set status='executed' where g.workflow_id=p_workflow and g.status='approved'
    and exists(select 1 from public.proposed_actions a where a.approval_id=g.id and a.status='executed')
    and not exists(select 1 from public.proposed_actions a where a.approval_id=g.id and a.status='approved' and a.superseded_by_id is null);
  if w.status in ('completed','cancelled') then return; end if;
  if not exists(select 1 from public.proposed_actions where workflow_id=p_workflow and not is_auxiliary) then return; end if;
  select count(*) filter(where a.status='approved'), count(*) filter(where a.status in ('pending_approval','waiting_for_approval')),
    count(*) filter(where a.status='approved' and exists(select 1 from public.execution_attempts t where t.action_id=a.id and (t.status='failed_terminal' or (t.status='cancelled_before_dispatch' and t.attempt_number=3)))),
    count(*) filter(where a.status='approved' and exists(select 1 from public.execution_attempts t where t.action_id=a.id and t.status='failed_retryable' and not exists(select 1 from public.execution_attempts n where n.action_id=a.id and n.attempt_number>t.attempt_number))),
    count(*) filter(where a.status='approved' and exists(select 1 from public.execution_attempts t where t.action_id=a.id and t.status='outcome_unknown' and t.verification_method<>'closed_for_replacement')),
    count(*) filter(where a.status='approved' and (a.schema_version<>2 or not exists(select 1 from public.action_approval_snapshots s where s.action_id=a.id and s.revision=a.revision)))
    into unresolved,pending,terminal,failed,unknowns,blocked from public.proposed_actions a where a.workflow_id=p_workflow and not a.is_auxiliary and a.superseded_by_id is null;
  if pending>0 then return; end if;
  if unresolved=0 then
    update public.workflow_tasks set status='completed',completed_at=clock_timestamp(),error=null,output='{"outcome":"approved_primary_actions_completed"}' where workflow_id=p_workflow and type='execute_approved_actions' and status<>'cancelled';
    if not exists(select 1 from public.workflow_tasks where workflow_id=p_workflow and status not in ('completed','cancelled')) then
      update public.workflows set status='completed',completed_at=clock_timestamp(),current_step='Approved primary actions completed' where id=p_workflow;
      insert into public.agent_events(workspace_id,workflow_id,event_type,summary) values(w.workspace_id,p_workflow,'workflow_completed','Approved primary actions completed; auxiliary proposals remain independent');
    end if;
  elsif terminal>0 then
    update public.workflow_tasks set status='failed',error='{"code":"execution_terminal","message":"Execution failed; successful actions remain saved."}' where workflow_id=p_workflow and type='execute_approved_actions';
    update public.workflows set status='failed',failed_at=clock_timestamp(),current_step='Execution failed; successful actions retained' where id=p_workflow;
  elsif unknowns>0 or blocked>0 or failed>0 then
    update public.workflow_tasks set status=case when failed>0 then 'failed'::public.workflow_task_status else 'blocked'::public.workflow_task_status end,
      error=jsonb_build_object('code','execution_attention','message',case when unknowns>0 then 'Outcome unknown; never resend blindly' when blocked>0 then 'Legacy approval requires a recipient, connection and new approval' else 'Explicit retry required after definitive rejection' end)
      where workflow_id=p_workflow and type='execute_approved_actions';
    update public.workflows set status='paused',current_step=case when unknowns>0 then 'Outcome unknown; check provider before further execution' when blocked>0 then 'Blocked approval; create executable revision' else 'Execution paused; explicit retry required' end where id=p_workflow;
  end if;
  update public.workflows set progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1) from public.workflow_tasks where workflow_id=p_workflow) where id=p_workflow;
end; $$;
create function public.recover_execution_claims(p_workspace uuid,p_actor uuid,p_workflow uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=p_workflow and workspace_id=p_workspace for update;
  if not found then raise exception 'Workflow missing' using errcode='P0002'; end if;
  for t in select * from public.execution_attempts where workflow_id=p_workflow and status in ('claimed','dispatching') and lease_until<=now() order by action_id loop
    perform 1 from public.proposed_actions where id=t.action_id for update;
    select * into t from public.execution_attempts where id=t.id for update;
    update public.execution_attempts set status=case when t.status='claimed' then 'cancelled_before_dispatch' else 'outcome_unknown' end,
      retry_eligible=(t.status='claimed'),completed_at=clock_timestamp(),safe_error_code=case when t.status='claimed' then 'claim_expired_before_dispatch' else 'dispatch_lease_expired' end where id=t.id;
    update public.agent_runs set status='failed',completed_at=clock_timestamp(),duration_ms=greatest(0,(extract(epoch from clock_timestamp()-t.claimed_at)*1000)::integer),task_count=1,retry_count=t.attempt_number-1,error=jsonb_build_object('code','interrupted_execution','message','Execution interrupted; inspect persisted attempt') where id=t.executor_run_id;
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p_workflow,t.executor_run_id,
      case when t.status='claimed' then 'execution_failed'::public.agent_event_type else 'execution_outcome_unknown'::public.agent_event_type end,
      case when t.status='claimed' then 'Expired claim recovered before dispatch' else 'Expired dispatch has unknown outcome; resend is blocked' end,
      jsonb_build_object('attempt_id',t.id,'action_id',t.action_id,'actor',p_actor));
  end loop;
  perform public.aggregate_execution(p_workflow);
end; $$;

create function public.claim_execution(p_workspace uuid,p_actor uuid,p_workflow uuid,p_action uuid,p_snapshot uuid,p_attempt uuid,p_claim uuid,p_retry boolean default false) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare w public.workflows%rowtype; a public.proposed_actions%rowtype; s public.action_approval_snapshots%rowtype; t public.execution_attempts%rowtype; n integer; run_id uuid; task_id uuid;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into w from public.workflows where id=p_workflow and workspace_id=p_workspace for update;
  if not found then raise exception 'Workflow not found' using errcode='P0002'; end if;
  perform public.recover_execution_claims(p_workspace,p_actor,p_workflow);
  select * into w from public.workflows where id=p_workflow;
  select * into a from public.proposed_actions where id=p_action and workflow_id=p_workflow and workspace_id=p_workspace for update;
  if not found then raise exception 'Action not found' using errcode='P0002'; end if;
  select * into s from public.action_approval_snapshots where id=p_snapshot and action_id=a.id and workspace_id=p_workspace;
  if not found or s.revision<>a.revision or s.envelope is distinct from a.executable_envelope or s.digest is distinct from public.action_envelope_digest(a.executable_envelope)
    then raise exception 'Snapshot mismatch' using errcode='40001'; end if;
  select * into t from public.execution_attempts where snapshot_id=p_snapshot and status='succeeded'; if found then return t; end if;
  if a.status<>'approved' or a.superseded_by_id is not null or w.status='cancelled' or (not a.is_auxiliary and w.status not in ('ready_for_execution','running','paused','failed'))
    or (a.is_auxiliary and w.status not in ('ready_for_execution','running','paused','completed')) then raise exception 'Execution not allowed' using errcode='22023'; end if;
  perform public.assert_executable_envelope(a);
  if not a.is_auxiliary and exists(select 1 from public.proposed_actions where workflow_id=p_workflow and not is_auxiliary and superseded_by_id is null and status in ('pending_approval','waiting_for_approval')) then raise exception 'Resolve the primary batch first' using errcode='22023'; end if;
  if exists(select 1 from public.execution_attempts where workflow_id=p_workflow and status='outcome_unknown' and verification_method<>'closed_for_replacement') then raise exception 'Unknown outcome unresolved' using errcode='22023'; end if;
  select * into t from public.execution_attempts where workflow_id=p_workflow and status in ('claimed','dispatching') for update;
  if found then return t; end if;
  select count(*)+1 into n from public.execution_attempts where snapshot_id=p_snapshot;
  if n>3 then raise exception 'Attempt limit exhausted' using errcode='22023'; end if;
  select * into t from public.execution_attempts where snapshot_id=p_snapshot order by attempt_number desc limit 1;
  if found and (not p_retry or not t.retry_eligible or t.status not in ('failed_retryable','cancelled_before_dispatch') or t.next_retry_at>now()) then raise exception 'Explicit safe retry unavailable' using errcode='22023'; end if;
  -- Failed core recovery is possible only for this exact safely retryable persisted attempt.
  if w.status='failed' and (t.id is null or not t.retry_eligible) then raise exception 'Terminal workflow' using errcode='22023'; end if;
  if not a.is_auxiliary then
    select id into task_id from public.workflow_tasks where workflow_id=p_workflow and type='execute_approved_actions';
    if task_id is null then raise exception 'Execution task missing' using errcode='22023'; end if;
    if exists(select 1 from public.workflow_tasks where workflow_id=p_workflow and type<>'execute_approved_actions' and status not in ('completed','cancelled')) then raise exception 'Prerequisites incomplete' using errcode='22023'; end if;
    update public.workflows set status='running',current_step='Executor dispatch requested explicitly',failed_at=null where id=p_workflow;
    update public.workflow_tasks set status='running',started_at=coalesce(started_at,clock_timestamp()),error=null where id=task_id;
  end if;
  run_id:=gen_random_uuid();
  insert into public.agent_runs(id,workspace_id,workflow_id,workflow_task_id,agent_type,status,model,input,started_at,input_tokens,output_tokens,total_tokens)
    values(run_id,p_workspace,p_workflow,task_id,'executor','running',null,jsonb_build_object('actionId',a.id,'snapshotId',s.id,'attempt',n),clock_timestamp(),null,null,null);
  insert into public.execution_attempts(id,workspace_id,workflow_id,action_id,snapshot_id,connection_id,attempt_number,operation_key,executor_run_id,claim_token,lease_until,status,rfc_message_id)
    values(p_attempt,p_workspace,p_workflow,p_action,p_snapshot,s.connection_id,n,p_attempt::text,run_id,p_claim,now()+interval '120 seconds','claimed',
      case when a.action_type='send_email' then '<' || s.id::text || '@execution.agentic-ops.local>' else null end) returning * into t;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata) values(p_workspace,p_workflow,run_id,task_id,'execution_claimed','One approved action claimed',
    jsonb_build_object('action_id',a.id,'snapshot_id',s.id,'revision',a.revision,'attempt_id',t.id,'attempt',n,'actor',p_actor));
  if p_retry then insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p_workflow,run_id,'execution_retry_requested','Explicit safe retry requested',jsonb_build_object('attempt_id',t.id,'actor',p_actor)); end if;
  return t;
end; $$;

create function public.dispatch_execution(p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; a public.proposed_actions%rowtype; w public.workflows%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into t from public.execution_attempts where id=p_attempt and workspace_id=p_workspace;
  if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
  select * into w from public.workflows where id=t.workflow_id for update;
  select * into a from public.proposed_actions where id=t.action_id for update;
  select * into t from public.execution_attempts where id=p_attempt for update;
  if not found or t.claim_token<>p_claim or t.status<>'claimed' or t.lease_until<=now() then raise exception 'Dispatch fenced' using errcode='40001'; end if;
  if w.status='cancelled' or (not a.is_auxiliary and w.status<>'running') or a.status<>'approved' or a.superseded_by_id is not null then raise exception 'Dispatch stopped' using errcode='22023'; end if;
  perform public.assert_executable_envelope(a);
  if exists(select 1 from public.execution_attempts where workflow_id=w.id and status='outcome_unknown' and verification_method<>'closed_for_replacement') then raise exception 'Uncertainty blocks dispatch' using errcode='22023'; end if;
  update public.execution_attempts set status='dispatching',dispatched_at=clock_timestamp() where id=p_attempt returning * into t;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,t.workflow_id,t.executor_run_id,'execution_started','Dispatch recorded before provider request',jsonb_build_object('attempt_id',t.id,'action_id',a.id,'actor',p_actor));
  return t;
end; $$;

create function public.finish_execution(p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid,p_status text,p_result jsonb default null,p_error text default null,p_retry_seconds integer default 0,p_verification text default 'provider_response') returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; a public.proposed_actions%rowtype; w public.workflows%rowtype; status_value text:=p_status; e jsonb;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into t from public.execution_attempts where id=p_attempt and workspace_id=p_workspace;
  if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
  select * into w from public.workflows where id=t.workflow_id for update;
  select * into a from public.proposed_actions where id=t.action_id for update;
  select * into t from public.execution_attempts where id=p_attempt for update;
  if not found or t.claim_token<>p_claim then raise exception 'Completion fenced' using errcode='40001'; end if;
  if t.status='succeeded' then return t; end if;
  if t.status not in ('claimed','dispatching','outcome_unknown') or t.verification_method='closed_for_replacement' then raise exception 'Completion fenced' using errcode='40001'; end if;
  if p_status not in ('succeeded','failed_retryable','failed_terminal','outcome_unknown','cancelled_before_dispatch') or p_status is null
    or (p_status='succeeded' and t.dispatched_at is null) or (p_status='outcome_unknown' and t.dispatched_at is null)
    or (p_status='cancelled_before_dispatch' and t.dispatched_at is not null) then raise exception 'Invalid result' using errcode='22023'; end if;
  if p_error is not null and p_error !~ '^[a-z0-9_]{1,80}$' then raise exception 'Invalid safe error' using errcode='22023'; end if;
  if p_status='failed_retryable' and t.attempt_number>=3 then status_value:='failed_terminal'; end if;
  if p_status='succeeded' then
    e:=a.executable_envelope;
    if p_verification not in ('provider_response','provider_read','user_confirmed','internal_transaction') or p_result is null or pg_column_size(p_result)>4096
      or (select count(*) from jsonb_object_keys(p_result) where jsonb_object_keys not in ('messageId','threadId','contactId','acceptedAt'))>0
      or (a.action_type='send_email' and p_verification='provider_response' and coalesce(p_result ->> 'messageId','')='')
      or (a.action_type='upsert_crm_contact' and coalesce(p_result ->> 'contactId','') !~ '^\d+$') then raise exception 'Invalid verified result' using errcode='22023'; end if;
    if a.action_type='schedule_follow_up' then
      if p_verification<>'internal_transaction' or (e ->> 'dueAt')::timestamptz<=now() or not exists(select 1 from public.execution_attempts parent join public.proposed_actions pa on pa.id=parent.action_id
        where parent.id=(e ->> 'parentAttemptId')::uuid and parent.workflow_id=a.workflow_id and parent.status='succeeded' and pa.action_type='send_email') then raise exception 'Follow-up parent or date invalid' using errcode='22023'; end if;
      insert into public.follow_up_plans(workspace_id,workflow_id,action_id,snapshot_id,parent_attempt_id,due_at,timezone,note) values(a.workspace_id,a.workflow_id,a.id,t.snapshot_id,
        (e ->> 'parentAttemptId')::uuid,(e ->> 'dueAt')::timestamptz,e ->> 'timezone',e ->> 'note');
      insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(a.workspace_id,a.workflow_id,t.executor_run_id,'follow_up_planned','Plan saved; automatic execution belongs to Release 0.7',jsonb_build_object('action_id',a.id,'actor',p_actor));
    end if;
    update public.proposed_actions set status='executed',executed_at=clock_timestamp() where id=a.id;
    if a.action_type='send_email' then update public.leads set status='contacted',outreach_status='sent' where id=(e ->> 'leadId')::uuid and workflow_id=a.workflow_id; end if;
  end if;
  update public.execution_attempts set status=status_value,result=case when status_value='succeeded' then p_result else null end,safe_error_code=p_error,completed_at=clock_timestamp(),
    retry_eligible=status_value in ('failed_retryable','cancelled_before_dispatch') and t.attempt_number<3,
    next_retry_at=case when status_value='failed_retryable' then now()+make_interval(secs=>greatest(0,least(p_retry_seconds,3600))) else null end,
    duration_ms=greatest(0,(extract(epoch from clock_timestamp()-claimed_at)*1000)::integer),
    verification_method=case when status_value='succeeded' then p_verification else 'unresolved' end where id=t.id returning * into t;
  update public.agent_runs set status=case when status_value='succeeded' then 'completed'::public.agent_run_status else 'failed'::public.agent_run_status end,
    output=case when status_value='succeeded' then jsonb_build_object('attemptId',t.id,'result',p_result,'verificationMethod',p_verification) else null end,
    error=case when status_value<>'succeeded' then jsonb_build_object('code',coalesce(p_error,'execution_failure'),'message','Inspect the persisted execution attempt before continuing.') else null end,
    completed_at=clock_timestamp(),duration_ms=t.duration_ms,task_count=1,retry_count=t.attempt_number-1,input_tokens=null,output_tokens=null,total_tokens=null where id=t.executor_run_id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,a.workflow_id,t.executor_run_id,
    case when status_value='succeeded' then 'execution_succeeded'::public.agent_event_type when status_value='outcome_unknown' then 'execution_outcome_unknown'::public.agent_event_type else 'execution_failed'::public.agent_event_type end,
    case when status_value='succeeded' then 'Approved action completed; verification: ' || p_verification when status_value='outcome_unknown' then 'Provider may have accepted the action; blind retry prohibited' else 'Execution stopped; inspect the safe error' end,
    jsonb_build_object('action_id',a.id,'snapshot_id',t.snapshot_id,'attempt_id',t.id,'actor',p_actor,'safe_error_code',p_error,'duration_ms',t.duration_ms,'verification_method',t.verification_method));
  perform public.aggregate_execution(a.workflow_id);
  -- Connection/preview blockers pause; no terminal failure is fabricated.
  if status_value='cancelled_before_dispatch' and not a.is_auxiliary and w.status<>'cancelled' then
    update public.workflow_tasks set status='blocked',error=jsonb_build_object('code',p_error,'message','Connection or CRM preview needs review') where workflow_id=a.workflow_id and type='execute_approved_actions';
    update public.workflows set status='paused',current_step='Execution blocked before dispatch; review connection or proposal' where id=a.workflow_id;
  end if;
  return t;
end; $$;

-- Generic transitions remain subject to the original terminal rules and cannot impersonate Executor.
alter function public.transition_workflow(uuid,public.workflow_status,text) rename to transition_workflow_before_execution;
revoke all on function public.transition_workflow_before_execution(uuid,public.workflow_status,text) from public,anon,authenticated,service_role;
create function public.transition_workflow(p_workflow_id uuid,p_next_status public.workflow_status,p_summary text default null) returns public.workflows
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workflows where id=p_workflow_id for update;
  if exists(select 1 from public.workflow_tasks where workflow_id=p_workflow_id and type='execute_approved_actions' and status not in ('completed','cancelled'))
    and (p_next_status in ('ready_for_execution','completed') or (p_next_status='running' and exists(select 1 from public.proposed_actions where workflow_id=p_workflow_id and not is_auxiliary))) then raise exception 'Explicit checked Executor required' using errcode='22023'; end if;
  if p_next_status='completed' and exists(select 1 from public.workflow_tasks where workflow_id=p_workflow_id and status not in ('completed','cancelled')) then raise exception 'Required tasks incomplete' using errcode='22023'; end if;
  return public.transition_workflow_before_execution(p_workflow_id,p_next_status,p_summary);
end; $$;
-- Signature preserves Stage 2 callers.
alter function public.transition_workflow_task(uuid,public.workflow_task_status,text) rename to transition_workflow_task_before_execution;
revoke all on function public.transition_workflow_task_before_execution(uuid,public.workflow_task_status,text) from public,anon,authenticated,service_role;
create function public.transition_workflow_task(p_task_id uuid,p_next_status public.workflow_task_status,p_summary text default null) returns public.workflow_tasks
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workflows where id=(select workflow_id from public.workflow_tasks where id=p_task_id) for update;
  if exists(select 1 from public.workflow_tasks where id=p_task_id and type='execute_approved_actions') then raise exception 'Checked execution evidence required' using errcode='22023'; end if;
  return public.transition_workflow_task_before_execution(p_task_id,p_next_status,p_summary);
end; $$;
revoke all on function public.transition_workflow(uuid,public.workflow_status,text),public.transition_workflow_task(uuid,public.workflow_task_status,text) from public,anon;
grant execute on function public.transition_workflow(uuid,public.workflow_status,text),public.transition_workflow_task(uuid,public.workflow_task_status,text) to authenticated;
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
  ('guard_action_revision','aggregate_execution','recover_execution_claims','claim_execution','dispatch_execution','finish_execution') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
end loop; end $$;
