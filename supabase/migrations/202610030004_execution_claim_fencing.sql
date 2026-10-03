-- SQL comparisons with NULL must never stand in for an execution capability or
-- explicit retry intent. Keep the existing locks, exact snapshots and provider
-- outcome guards authoritative, and close the missing-input boundary before them.
alter function public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean)
  rename to claim_execution_before_claim_fencing;
create function public.claim_execution(
  p_workspace uuid,p_actor uuid,p_workflow uuid,p_action uuid,p_snapshot uuid,
  p_attempt uuid,p_claim uuid,p_retry boolean default false
) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  if p_claim is null or p_retry is null then
    raise exception 'Execution claim and explicit retry intent required' using errcode='22023';
  end if;
  return public.claim_execution_before_claim_fencing(
    p_workspace,p_actor,p_workflow,p_action,p_snapshot,p_attempt,p_claim,p_retry);
end; $$;

alter function public.dispatch_execution(uuid,uuid,uuid,uuid)
  rename to dispatch_execution_before_claim_fencing;
create function public.dispatch_execution(p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid)
returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  if p_claim is null then
    raise exception 'Dispatch fenced' using errcode='40001';
  end if;
  return public.dispatch_execution_before_claim_fencing(p_workspace,p_actor,p_attempt,p_claim);
end; $$;

alter function public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text)
  rename to finish_execution_before_claim_fencing;
create function public.finish_execution(
  p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid,p_status text,
  p_result jsonb default null,p_error text default null,p_retry_seconds integer default 0,
  p_verification text default 'provider_response'
) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  if p_claim is null then
    raise exception 'Completion fenced' using errcode='40001';
  end if;
  return public.finish_execution_before_claim_fencing(
    p_workspace,p_actor,p_attempt,p_claim,p_status,p_result,p_error,p_retry_seconds,p_verification);
end; $$;

-- Renamed implementations are private so callers cannot bypass the new boundary.
revoke all on function
  public.claim_execution_before_claim_fencing(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean),
  public.dispatch_execution_before_claim_fencing(uuid,uuid,uuid,uuid),
  public.finish_execution_before_claim_fencing(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),
  public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean),
  public.dispatch_execution(uuid,uuid,uuid,uuid),
  public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function
  public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean),
  public.dispatch_execution(uuid,uuid,uuid,uuid),
  public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text)
  to service_role;
