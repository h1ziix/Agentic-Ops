-- Internal plan persistence is transactional. Unlike a lost external HTTP response,
-- an absent plan after lease recovery proves that no internal mutation committed.
alter function public.recover_execution_claims(uuid,uuid,uuid) rename to recover_execution_claims_before_internal_plan;
create function public.recover_execution_claims(p_workspace uuid,p_actor uuid,p_workflow uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; can_retry boolean;
begin
  perform public.recover_execution_claims_before_internal_plan(p_workspace,p_actor,p_workflow);
  for t in select attempt.* from public.execution_attempts attempt
    join public.proposed_actions a on a.id=attempt.action_id
    where attempt.workspace_id=p_workspace and attempt.workflow_id=p_workflow and a.action_type='schedule_follow_up'
      and attempt.status='outcome_unknown' and not exists(select 1 from public.follow_up_plans p where p.snapshot_id=attempt.snapshot_id)
    order by attempt.action_id loop
    perform 1 from public.proposed_actions where id=t.action_id for update;
    select * into t from public.execution_attempts where id=t.id for update;
    select t.attempt_number<3 and (s.envelope->>'dueAt')::timestamptz>now() into can_retry
      from public.action_approval_snapshots s where s.id=t.snapshot_id;
    update public.execution_attempts set status=case when can_retry then 'failed_retryable' else 'failed_terminal' end,
      safe_error_code='internal_plan_not_saved',retry_eligible=can_retry,next_retry_at=null,
      completed_at=coalesce(completed_at,clock_timestamp()),verification_method='unresolved'
      where id=t.id;
    update public.agent_runs set error=jsonb_build_object('code','internal_plan_not_saved','message','No internal plan committed. Explicit retry requires a future approved date.')
      where id=t.executor_run_id;
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata)
      values(p_workspace,p_workflow,t.executor_run_id,'execution_reconciled','Transactional lookup established that no internal follow-up plan was saved; no email transport involved',
        jsonb_build_object('attempt_id',t.id,'action_id',t.action_id,'actor',p_actor,'verification_method','internal_transaction','safe_error_code','internal_plan_not_saved'));
  end loop;
  perform public.aggregate_execution(p_workflow);
end; $$;
revoke all on function public.recover_execution_claims_before_internal_plan(uuid,uuid,uuid),public.recover_execution_claims(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.recover_execution_claims(uuid,uuid,uuid) to service_role;
