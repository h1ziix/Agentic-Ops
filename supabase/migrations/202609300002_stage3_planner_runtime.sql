-- Extend the Stage 2 RPC architecture. Runtime writes are server/service-role only.
alter table public.agent_runs
  add column duration_ms integer check (duration_ms >= 0),
  add column retry_count integer not null default 0 check (retry_count between 0 and 1),
  add column task_count integer not null default 0 check (task_count between 0 and 10),
  add column input_tokens integer check (input_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0),
  add column total_tokens integer check (total_tokens >= 0);

create unique index agent_runs_one_active_planner_per_workflow
  on public.agent_runs(workflow_id) where agent_type = 'planner' and status in ('queued', 'running');

-- Replace starter task generation for NEW workflows only; existing records are preserved.
create or replace function public.create_workflow(
  p_workspace_id uuid, p_title text, p_goal text, p_target_companies integer default 20
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_workflow_id uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_goal, ''))) not between 24 and 4000
     or p_target_companies is null or p_target_companies not between 1 and 1000 then
    raise exception 'Invalid workflow input' using errcode = '22023';
  end if;
  insert into public.workflows (workspace_id, created_by, title, goal, status, current_step, target_companies)
  values (p_workspace_id, auth.uid(), trim(p_title), trim(p_goal), 'planning', 'Waiting for Planner Agent', p_target_companies)
  returning id into v_workflow_id;
  insert into public.agent_events (workspace_id, workflow_id, event_type, summary, metadata)
  values (p_workspace_id, v_workflow_id, 'workflow_created', 'Workflow created. Planner execution is queued.', '{"source":"user"}');
  return v_workflow_id;
end;
$$;

create function public.start_planner_run(
  p_run_id uuid, p_user_id uuid, p_workspace_id uuid, p_workflow_id uuid, p_model text, p_input jsonb
) returns public.agent_runs
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow public.workflows%rowtype;
  v_run public.agent_runs%rowtype;
  v_previous_status public.workflow_status;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id
  ) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select * into v_workflow from public.workflows
    where id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  v_previous_status := v_workflow.status;

  select * into v_run from public.agent_runs where workflow_id = p_workflow_id
    and agent_type = 'planner' and status = 'completed' order by created_at desc limit 1;
  if found then return v_run; end if;
  if exists (select 1 from public.workflow_tasks where workflow_id = p_workflow_id) then
    raise exception 'Workflow already has tasks' using errcode = '22023';
  end if;
  if v_workflow.status not in ('draft', 'planning', 'failed') then
    raise exception 'Invalid workflow transition' using errcode = '22023';
  end if;
  if v_workflow.status = 'failed' and not exists (
    select 1 from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'planner' and status = 'failed'
  ) then raise exception 'Only failed planning may be retried' using errcode = '22023'; end if;

  select * into v_run from public.agent_runs where workflow_id = p_workflow_id
    and agent_type = 'planner' and status in ('queued', 'running') order by created_at desc limit 1;
  if found then
    -- Two 60s model attempts plus persistence fit inside this three-minute claim.
    if v_run.started_at > now() - interval '3 minutes' then return v_run; end if;
    update public.agent_runs set status = 'failed', completed_at = clock_timestamp(),
      duration_ms = least(2147483647, greatest(0, extract(epoch from (clock_timestamp() - started_at)) * 1000))::integer,
      error = '{"code":"ai_timeout","message":"Planning was interrupted before a plan could be saved. Please retry planning."}'
      where id = v_run.id;
    insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (p_workspace_id, p_workflow_id, v_run.id, 'agent_failed', 'Interrupted Planner run expired before a plan could be saved.', '{"error_code":"ai_timeout"}', clock_timestamp());
  end if;
  if p_run_id is null or char_length(trim(coalesce(p_model, ''))) not between 1 and 200
     or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input) > 16384 then
    raise exception 'Invalid Planner input' using errcode = '22023';
  end if;
  update public.workflows set status = 'planning', current_step = 'Planner Agent generating execution plan', failed_at = null
    where id = p_workflow_id;
  insert into public.agent_runs (id, workspace_id, workflow_id, agent_type, status, model, input, started_at)
    values (p_run_id, p_workspace_id, p_workflow_id, 'planner', 'running', p_model, p_input, clock_timestamp()) returning * into v_run;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (p_workspace_id, p_workflow_id, v_run.id, 'workflow_planning_started', 'Workflow planning started.',
      jsonb_build_object('from_status', v_previous_status, 'to_status', 'planning'), clock_timestamp());
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (p_workspace_id, p_workflow_id, v_run.id, 'agent_started', 'Planner Agent started',
      jsonb_build_object('agent_type', 'planner', 'model', p_model), clock_timestamp());
  return v_run;
end;
$$;

create function public.complete_planner_run(
  p_run_id uuid, p_status public.agent_run_status, p_plan jsonb, p_tasks jsonb, p_error jsonb, p_metrics jsonb
) returns public.agent_runs
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.agent_runs%rowtype;
  v_workflow public.workflows%rowtype;
  v_workflow_id uuid;
  v_task jsonb;
  v_task_id uuid;
  v_position integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Privileged run writer required' using errcode = '42501';
  end if;
  select workflow_id into v_workflow_id from public.agent_runs where id = p_run_id and agent_type = 'planner';
  if not found then raise exception 'Planner run not found' using errcode = 'P0002'; end if;
  -- Match the start RPC's lock order.
  select * into v_workflow from public.workflows where id = v_workflow_id for update;
  select * into v_run from public.agent_runs where id = p_run_id for update;
  if v_run.status in ('completed', 'failed', 'cancelled') then return v_run; end if;
  if p_status is null or p_status not in ('completed', 'failed', 'cancelled')
    or jsonb_typeof(p_metrics) is distinct from 'object' then
    raise exception 'Invalid completion input' using errcode = '22023';
  end if;
  -- A late provider result cannot resurrect a cancelled/changed workflow.
  if v_workflow.status <> 'planning' then
    update public.agent_runs set status = 'cancelled', completed_at = clock_timestamp()
      where id = p_run_id returning * into v_run;
    return v_run;
  end if;
  if p_status = 'completed' then
    if jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_plan -> 'tasks') is distinct from 'array'
      or jsonb_typeof(p_tasks) is distinct from 'array' then
      raise exception 'Invalid plan' using errcode = '22023';
    end if;
    if jsonb_array_length(p_tasks) not between 5 and 10
      or jsonb_array_length(p_plan -> 'tasks') <> jsonb_array_length(p_tasks)
      or pg_column_size(p_plan) > 131072 or pg_column_size(p_tasks) > 131072
      or exists (select 1 from public.workflow_tasks where workflow_id = v_workflow.id) then
      raise exception 'Invalid or duplicate plan' using errcode = '22023';
    end if;
    insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
      values (v_run.workspace_id, v_run.workflow_id, v_run.id, 'plan_generated',
        'Planner generated ' || jsonb_array_length(p_tasks) || ' workflow tasks',
        jsonb_build_object('task_count', jsonb_array_length(p_tasks), 'validation', 'passed'), clock_timestamp());
    for v_task in select value from jsonb_array_elements(p_tasks) loop
      v_position := v_position + 1;
      if (v_task ->> 'type') not in ('define_target_profile', 'discover_companies', 'research_companies',
        'identify_opportunities', 'score_leads', 'generate_outreach', 'request_approval')
        or (v_task ->> 'position')::integer <> v_position
        or jsonb_typeof(v_task -> 'input') is distinct from 'object' then
        raise exception 'Invalid plan task' using errcode = '22023';
      end if;
      insert into public.workflow_tasks (workspace_id, workflow_id, type, title, description, position, input)
        values (v_run.workspace_id, v_run.workflow_id, v_task ->> 'type', v_task ->> 'title',
          v_task ->> 'description', v_position, v_task -> 'input') returning id into v_task_id;
      insert into public.agent_events (workspace_id, workflow_id, agent_run_id, workflow_task_id, event_type, summary, metadata, created_at)
        values (v_run.workspace_id, v_run.workflow_id, v_run.id, v_task_id, 'task_created',
          v_task ->> 'title', jsonb_build_object('position', v_position, 'type', v_task ->> 'type'), clock_timestamp());
    end loop;
  elsif p_status = 'failed' and (jsonb_typeof(p_error) is distinct from 'object'
    or char_length(coalesce(p_error ->> 'message', '')) not between 1 and 500) then
    raise exception 'Invalid safe error' using errcode = '22023';
  end if;
  update public.agent_runs set status = p_status,
    output = case when p_status = 'completed' then p_plan else null end,
    error = case when p_status = 'failed' then p_error else null end,
    completed_at = clock_timestamp(), duration_ms = (p_metrics ->> 'durationMs')::integer,
    retry_count = (p_metrics ->> 'retryCount')::integer, task_count = v_position,
    input_tokens = (p_metrics ->> 'inputTokens')::integer,
    output_tokens = (p_metrics ->> 'outputTokens')::integer,
    total_tokens = (p_metrics ->> 'totalTokens')::integer
    where id = p_run_id returning * into v_run;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (v_run.workspace_id, v_run.workflow_id, v_run.id,
      case when p_status = 'failed' then 'agent_failed'::public.agent_event_type else 'agent_completed'::public.agent_event_type end,
      case when p_status = 'failed' then p_error ->> 'message' when p_status = 'cancelled' then 'Planner Agent cancelled' else 'Planner Agent completed' end,
      jsonb_build_object('duration_ms', v_run.duration_ms, 'retry_count', v_run.retry_count,
        'task_count', v_run.task_count, 'total_tokens', v_run.total_tokens, 'error_code', p_error ->> 'code'), clock_timestamp());
  update public.workflows set
    status = case when p_status = 'completed' then 'running'::public.workflow_status when p_status = 'failed' then 'failed'::public.workflow_status else 'cancelled'::public.workflow_status end,
    current_step = case when p_status = 'completed' then 'Plan ready; research awaits implementation' when p_status = 'failed' then 'Planning failed' else 'Cancelled' end,
    started_at = case when p_status = 'completed' then coalesce(started_at, clock_timestamp()) else started_at end,
    failed_at = case when p_status = 'failed' then clock_timestamp() else null end
    where id = v_workflow.id;
  insert into public.agent_events (workspace_id, workflow_id, agent_run_id, event_type, summary, metadata, created_at)
    values (v_run.workspace_id, v_run.workflow_id, v_run.id,
      case when p_status = 'completed' then 'workflow_started'::public.agent_event_type when p_status = 'failed' then 'workflow_failed'::public.agent_event_type else 'workflow_cancelled'::public.agent_event_type end,
      case when p_status = 'completed' then 'Workflow ready for execution. Research has not started.' when p_status = 'failed' then 'Workflow planning failed. No tasks were saved.' else 'Workflow planning cancelled.' end,
      jsonb_build_object('from_status', 'planning', 'to_status', case when p_status = 'completed' then 'running' else p_status::text end), clock_timestamp());
  return v_run;
end;
$$;

revoke all on function public.start_planner_run(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_planner_run(uuid, public.agent_run_status, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_planner_run(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.complete_planner_run(uuid, public.agent_run_status, jsonb, jsonb, jsonb, jsonb) to service_role;
