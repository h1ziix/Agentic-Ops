-- Aggregate saved execution evidence without letting connection changes or exhausted
-- pre-dispatch claims appear ready/completed. Every caller already follows workflow -> action -> attempt.
create or replace function public.aggregate_execution(p_workflow uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  w public.workflows%rowtype;
  unresolved integer; pending integer; terminal integer; failed integer; unknowns integer; blocked integer;
begin
  select * into w from public.workflows where id=p_workflow for update;
  update public.approvals g set status='executed' where g.workflow_id=p_workflow and g.status='approved'
    and exists(select 1 from public.proposed_actions a where a.approval_id=g.id and a.status='executed')
    and not exists(select 1 from public.proposed_actions a where a.approval_id=g.id and a.status='approved' and a.superseded_by_id is null);
  if w.status in ('completed','cancelled') then return; end if;
  if not exists(select 1 from public.proposed_actions where workflow_id=p_workflow and not is_auxiliary) then return; end if;
  select
    count(*) filter(where a.status='approved'),
    count(*) filter(where a.status in ('pending_approval','waiting_for_approval')),
    count(*) filter(where a.status='approved' and exists(select 1 from public.execution_attempts t where t.action_id=a.id
      and (t.status='failed_terminal' or (t.status='cancelled_before_dispatch' and t.attempt_number=3)))),
    count(*) filter(where a.status='approved' and exists(select 1 from public.execution_attempts t where t.action_id=a.id and t.status='failed_retryable'
      and not exists(select 1 from public.execution_attempts n where n.action_id=a.id and n.attempt_number>t.attempt_number))),
    count(*) filter(where a.status='approved' and exists(select 1 from public.execution_attempts t where t.action_id=a.id
      and t.status='outcome_unknown' and t.verification_method<>'closed_for_replacement')),
    count(*) filter(where a.status='approved' and (a.schema_version<>2 or not exists(
      select 1 from public.action_approval_snapshots s
      left join public.integration_connections c on c.id=s.connection_id and c.workspace_id=s.workspace_id
      where s.action_id=a.id and s.revision=a.revision and s.envelope=a.executable_envelope
        and s.digest=public.action_envelope_digest(a.executable_envelope)
        and (a.action_type='schedule_follow_up' or (c.status='connected' and c.generation=s.authorization_generation
          and c.provider_identity=s.envelope #>> '{connection,identity}' and c.provider=s.envelope #>> '{connection,provider}'
          and c.scopes @> case when a.action_type='send_email'
            then array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send']
            else array['oauth','crm.objects.contacts.read','crm.objects.contacts.write'] end)))))
  into unresolved,pending,terminal,failed,unknowns,blocked
  from public.proposed_actions a where a.workflow_id=p_workflow and not a.is_auxiliary and a.superseded_by_id is null;
  if pending>0 then return; end if;
  if unresolved=0 then
    update public.workflow_tasks set status='completed',completed_at=clock_timestamp(),error=null,output='{"outcome":"approved_primary_actions_completed"}'
      where workflow_id=p_workflow and type='execute_approved_actions' and status<>'cancelled';
    if not exists(select 1 from public.workflow_tasks where workflow_id=p_workflow and status not in ('completed','cancelled')) then
      update public.workflows set status='completed',completed_at=clock_timestamp(),current_step='Approved primary actions completed' where id=p_workflow;
      insert into public.agent_events(workspace_id,workflow_id,event_type,summary)
        values(w.workspace_id,p_workflow,'workflow_completed','Approved primary actions completed; auxiliary proposals remain independent');
    end if;
  elsif terminal>0 then
    update public.workflow_tasks set status='failed',error='{"code":"execution_terminal","message":"Execution failed; successful actions remain saved."}'
      where workflow_id=p_workflow and type='execute_approved_actions';
    update public.workflows set status='failed',failed_at=coalesce(failed_at,clock_timestamp()),current_step='Execution failed; successful actions retained' where id=p_workflow;
  elsif unknowns>0 or blocked>0 or failed>0 then
    update public.workflow_tasks set status=case when failed>0 and unknowns=0 and blocked=0 then 'failed'::public.workflow_task_status else 'blocked'::public.workflow_task_status end,
      error=jsonb_build_object('code','execution_attention','message',case when unknowns>0 then 'Outcome unknown; never resend blindly'
        when blocked>0 then 'Approval or its connection is not executable; review a replacement' else 'Explicit retry required after definitive rejection' end)
      where workflow_id=p_workflow and type='execute_approved_actions';
    update public.workflows set status='paused',current_step=case when unknowns>0 then 'Outcome unknown; check provider before further execution'
      when blocked>0 then 'Blocked approval or connection; review readiness' else 'Execution paused; explicit retry required' end where id=p_workflow;
  end if;
  update public.workflows set progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1)
    from public.workflow_tasks where workflow_id=p_workflow) where id=p_workflow;
end; $$;

-- The third unsuccessful claim is terminal even if the provider was never called.
alter function public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text) rename to finish_execution_before_terminal_guard;
create function public.finish_execution(p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid,p_status text,p_result jsonb default null,p_error text default null,p_retry_seconds integer default 0,p_verification text default 'provider_response') returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype;
begin
  t:=public.finish_execution_before_terminal_guard(p_workspace,p_actor,p_attempt,p_claim,p_status,p_result,p_error,p_retry_seconds,p_verification);
  -- Re-run after connection rejection and the earlier pre-dispatch pause branch.
  perform public.aggregate_execution(t.workflow_id);
  return t;
end; $$;

-- New approval may recover only a definitive unsent failure of this exact email,
-- never a failed research/preparation workflow or an unresolved external outcome.
alter function public.save_executable_email(uuid,integer,text,text,text,uuid,text,text) rename to save_executable_email_before_terminal_guard;
create function public.save_executable_email(p_action_id uuid,p_revision integer,p_email text,p_name text,p_role text,p_connection uuid,p_subject text,p_body text) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype; w public.workflows%rowtype; t public.execution_attempts%rowtype;
begin
  select * into a from public.proposed_actions where id=p_action_id;
  if not found then raise exception 'Action missing' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(a.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into w from public.workflows where id=a.workflow_id for update;
  select * into a from public.proposed_actions where id=p_action_id for update;
  if w.status='failed' then
    select * into t from public.execution_attempts where action_id=a.id order by attempt_number desc limit 1;
    if a.status<>'approved' or t.id is null or not (t.status='cancelled_before_dispatch'
      or (t.status='failed_terminal' and t.safe_error_code in ('gmail_request_rejected','gmail_rate_limited','gmail_permission_rejected')))
      or not exists(select 1 from public.workflow_tasks where workflow_id=w.id and type='execute_approved_actions' and status='failed'
        and error->>'code'='execution_terminal')
      or exists(select 1 from public.workflow_tasks where workflow_id=w.id and type<>'execute_approved_actions' and status not in ('completed','cancelled'))
      or exists(select 1 from public.execution_attempts where workflow_id=w.id and (status in ('claimed','dispatching') or (status='outcome_unknown' and verification_method<>'closed_for_replacement')))
      then raise exception 'Terminal workflow cannot be reopened by draft editing' using errcode='22023'; end if;
  end if;
  return public.save_executable_email_before_terminal_guard(p_action_id,p_revision,p_email,p_name,p_role,p_connection,p_subject,p_body);
end; $$;

-- Failed workflow retry must not escape another terminal sibling's evidence.
alter function public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean) rename to claim_execution_before_terminal_guard;
create function public.claim_execution(p_workspace uuid,p_actor uuid,p_workflow uuid,p_action uuid,p_snapshot uuid,p_attempt uuid,p_claim uuid,p_retry boolean default false) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare w public.workflows%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into w from public.workflows where id=p_workflow and workspace_id=p_workspace for update;
  if not found then raise exception 'Workflow missing' using errcode='P0002'; end if;
  perform public.recover_execution_claims(p_workspace,p_actor,p_workflow);
  select * into w from public.workflows where id=p_workflow;
  if w.status='failed' and exists(select 1 from public.proposed_actions a join public.execution_attempts t on t.action_id=a.id
    where a.workflow_id=w.id and not a.is_auxiliary and a.superseded_by_id is null
      and (t.status='failed_terminal' or (t.status='cancelled_before_dispatch' and t.attempt_number=3))) then
    raise exception 'Terminal action requires a new reviewed proposal' using errcode='22023';
  end if;
  return public.claim_execution_before_terminal_guard(p_workspace,p_actor,p_workflow,p_action,p_snapshot,p_attempt,p_claim,p_retry);
end; $$;

alter function public.recover_execution_claims(uuid,uuid,uuid) rename to recover_execution_claims_before_duration;
create function public.recover_execution_claims(p_workspace uuid,p_actor uuid,p_workflow uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.recover_execution_claims_before_duration(p_workspace,p_actor,p_workflow);
  update public.execution_attempts set duration_ms=greatest(0,(extract(epoch from completed_at-claimed_at)*1000)::integer)
    where workspace_id=p_workspace and workflow_id=p_workflow and completed_at is not null and duration_ms is null
      and safe_error_code in ('claim_expired_before_dispatch','dispatch_lease_expired');
end; $$;

revoke all on function public.finish_execution_before_terminal_guard(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),
  public.save_executable_email_before_terminal_guard(uuid,integer,text,text,text,uuid,text,text),
  public.claim_execution_before_terminal_guard(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean),
  public.recover_execution_claims_before_duration(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),
  public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean),public.recover_execution_claims(uuid,uuid,uuid),
  public.save_executable_email(uuid,integer,text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),
  public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean),public.recover_execution_claims(uuid,uuid,uuid) to service_role;
grant execute on function public.save_executable_email(uuid,integer,text,text,text,uuid,text,text) to authenticated;
