-- Extend existing runs; provider prices are supplied by validated server configuration.
-- Historical unknown costs stay NULL. No separate run/audit system is introduced.
alter table public.agent_runs
  add column cached_input_tokens bigint check(cached_input_tokens >= 0),
  add column reasoning_tokens bigint check(reasoning_tokens >= 0),
  add column usage_status text not null default 'unknown' check(usage_status in ('complete','partial','unknown','not_applicable')),
  add column usage_observation_count integer not null default 0 check(usage_observation_count >= 0),
  add column estimated_cost_usd numeric(20,10) check(estimated_cost_usd >= 0),
  add column cost_status text not null default 'unknown' check(cost_status in ('estimated','unknown','not_applicable')),
  add column pricing_version text check(length(pricing_version) <= 100),
  add column error_category text check(error_category in ('validation','authorization','provider_auth','rate_limit','network','timeout','provider_error','invalid_state','duplicate','unknown_execution_state','internal')),
  add constraint agent_runs_cost_known check((cost_status='estimated' and estimated_cost_usd is not null) or (cost_status<>'estimated' and estimated_cost_usd is null));

create function public.normalize_run_observation_07() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.agent_type='executor' or new.model is null then
    new.usage_status:='not_applicable'; new.cost_status:='not_applicable'; new.estimated_cost_usd:=null;
  elsif new.usage_status='unknown' and new.total_tokens is not null then
    new.usage_status:=case when new.input_tokens is not null and new.output_tokens is not null then 'complete' else 'partial' end;
  end if;
  new.error_category:=case when new.error is null then null else case new.error ->> 'code'
    when 'validation' then 'validation' when 'ai_invalid_output' then 'validation' when 'ai_refused' then 'validation'
    when 'unauthenticated' then 'authorization' when 'unauthorized' then 'authorization'
    when 'ai_configuration' then 'provider_auth' when 'integration_configuration' then 'provider_auth' when 'oauth_expired' then 'provider_auth'
    when 'rate_limit' then 'rate_limit' when 'ai_quota_exhausted' then 'rate_limit'
    when 'network' then 'network' when 'ai_timeout' then 'timeout' when 'timeout' then 'timeout'
    when 'ai_unavailable' then 'provider_error' when 'provider_error' then 'provider_error'
    when 'invalid_transition' then 'invalid_state' when 'execution_blocked' then 'invalid_state'
    when 'conflict' then 'duplicate' when 'duplicate' then 'duplicate'
    when 'outcome_unknown' then 'unknown_execution_state' when 'transport_uncertain' then 'unknown_execution_state'
    else 'internal' end end;
  return new;
end;
$$;
create trigger agent_run_observation_07 before insert or update on public.agent_runs
  for each row execute function public.normalize_run_observation_07();

-- Only populate metadata derivable from preserved fields; no retrospective pricing guess.
update public.agent_runs set usage_status=usage_status;

create function public.apply_agent_run_telemetry_07(p_run_id uuid,p_metrics jsonb) returns public.agent_runs
language plpgsql security definer set search_path='' as $$
declare v_run public.agent_runs%rowtype; v_cost_status text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode='42501'; end if;
  if jsonb_typeof(p_metrics) is distinct from 'object' then raise exception 'Invalid telemetry' using errcode='22023'; end if;
  v_cost_status:=coalesce(p_metrics ->> 'costStatus','unknown');
  if v_cost_status not in ('estimated','unknown','not_applicable')
    or (v_cost_status='estimated' and (p_metrics ->> 'estimatedCostUsd') is null)
    or coalesce(p_metrics ->> 'usageStatus','unknown') not in ('complete','partial','unknown','not_applicable') then
    raise exception 'Invalid telemetry' using errcode='22023';
  end if;
  update public.agent_runs set
    cached_input_tokens=(p_metrics ->> 'cachedInputTokens')::bigint,
    reasoning_tokens=(p_metrics ->> 'reasoningTokens')::bigint,
    usage_status=coalesce(p_metrics ->> 'usageStatus','unknown'),
    usage_observation_count=coalesce((p_metrics ->> 'usageObservationCount')::integer,0),
    estimated_cost_usd=case when v_cost_status='estimated' then (p_metrics ->> 'estimatedCostUsd')::numeric else null end,
    cost_status=v_cost_status, pricing_version=p_metrics ->> 'pricingVersion'
    where id=p_run_id returning * into v_run;
  if not found then raise exception 'Run not found' using errcode='P0002'; end if;
  return v_run;
end;
$$;

-- The existing checked completions still own domain changes. Wrappers acquire the same
-- workflow -> run lock order and save extra telemetry within the same transaction.
alter function public.complete_planner_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb,jsonb) rename to complete_planner_run_core_07;
alter function public.complete_research_task_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb) rename to complete_research_task_run_core_07;
alter function public.complete_preparation_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb) rename to complete_preparation_run_core_07;

create function public.complete_planner_run(p_run_id uuid,p_status public.agent_run_status,p_plan jsonb,p_tasks jsonb,p_error jsonb,p_metrics jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare v_run public.agent_runs%rowtype; v_status public.agent_run_status; v_workflow uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode='42501'; end if;
  select workflow_id into v_workflow from public.agent_runs where id=p_run_id;
  perform 1 from public.workflows where id=v_workflow for update;
  select status into v_status from public.agent_runs where id=p_run_id for update;
  v_run:=public.complete_planner_run_core_07(p_run_id,p_status,p_plan,p_tasks,p_error,p_metrics);
  if v_status='running' then v_run:=public.apply_agent_run_telemetry_07(p_run_id,p_metrics); end if;
  return v_run;
end;
$$;
create function public.complete_research_task_run(p_run_id uuid,p_status public.agent_run_status,p_output jsonb,p_error jsonb,p_metrics jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare v_run public.agent_runs%rowtype; v_status public.agent_run_status; v_workflow uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode='42501'; end if;
  select workflow_id into v_workflow from public.agent_runs where id=p_run_id;
  perform 1 from public.workflows where id=v_workflow for update;
  select status into v_status from public.agent_runs where id=p_run_id for update;
  v_run:=public.complete_research_task_run_core_07(p_run_id,p_status,p_output,p_error,p_metrics);
  if v_status='running' then v_run:=public.apply_agent_run_telemetry_07(p_run_id,p_metrics); end if;
  return v_run;
end;
$$;
create function public.complete_preparation_run(p_run_id uuid,p_status public.agent_run_status,p_output jsonb,p_error jsonb,p_metrics jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare v_run public.agent_runs%rowtype; v_status public.agent_run_status; v_workflow uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Privileged writer required' using errcode='42501'; end if;
  select workflow_id into v_workflow from public.agent_runs where id=p_run_id;
  perform 1 from public.workflows where id=v_workflow for update;
  select status into v_status from public.agent_runs where id=p_run_id for update;
  v_run:=public.complete_preparation_run_core_07(p_run_id,p_status,p_output,p_error,p_metrics);
  if v_status='running' then v_run:=public.apply_agent_run_telemetry_07(p_run_id,p_metrics); end if;
  return v_run;
end;
$$;

revoke all on function public.normalize_run_observation_07(),public.apply_agent_run_telemetry_07(uuid,jsonb),
  public.complete_planner_run_core_07(uuid,public.agent_run_status,jsonb,jsonb,jsonb,jsonb),
  public.complete_research_task_run_core_07(uuid,public.agent_run_status,jsonb,jsonb,jsonb),
  public.complete_preparation_run_core_07(uuid,public.agent_run_status,jsonb,jsonb,jsonb),
  public.complete_planner_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb,jsonb),
  public.complete_research_task_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb),
  public.complete_preparation_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_agent_run_telemetry_07(uuid,jsonb),
  public.complete_planner_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb,jsonb),
  public.complete_research_task_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb),
  public.complete_preparation_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb) to service_role;
create index agent_runs_workspace_started_07 on public.agent_runs(workspace_id,started_at desc);

-- Operational reads do not transfer whole research/model payloads to Dashboard.
-- SECURITY INVOKER retains the existing workspace membership RLS on agent_runs.
create view public.agent_run_observations_07 with (security_invoker=true) as
select id,workspace_id,workflow_id,workflow_task_id,agent_type,status,model,
  case when input is null then null else jsonb_build_object('summary',case
    when input ? 'followupPlanId' then 'Saved message, company evidence and no detected response'
    when input ? 'goal' then 'Workflow goal, target criteria and approval constraints'
    else 'Validated task context and accepted evidence' end) end as input,
  case when output is null then null else jsonb_build_object('summary',left(coalesce(output->>'summary',
    case when output ? 'tasks' and jsonb_typeof(output->'tasks')='array' then jsonb_array_length(output->'tasks')::text||' planned tasks'
      when output ? 'kind' then 'Task: '||replace(output->>'kind','_',' ')
      when output ? 'review' then 'Evidence review saved' else 'Validated structured output saved' end),600)) end as output,
  case when error is null then null else jsonb_build_object('code',error->>'code','message',left(error->>'message',600)) end as error,
  started_at,completed_at,created_at,duration_ms,retry_count,task_count,input_tokens,output_tokens,total_tokens,
  cached_input_tokens,reasoning_tokens,usage_status,usage_observation_count,estimated_cost_usd,cost_status,pricing_version,error_category
from public.agent_runs;
revoke all on public.agent_run_observations_07 from public,anon;
grant select on public.agent_run_observations_07 to authenticated,service_role;
