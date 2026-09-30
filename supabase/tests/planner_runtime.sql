-- Run against a migrated development database with `supabase db query --linked --file ...`.
-- All fixtures, including the temporary auth user, are rolled back. No OpenAI calls.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_workspace uuid;
  v_workflow uuid;
  v_failed_workflow uuid;
  v_run public.agent_runs%rowtype;
  v_replay public.agent_runs%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_plan jsonb;
  v_tasks jsonb;
  v_metrics jsonb := '{"durationMs":1250,"retryCount":0,"taskCount":5,"inputTokens":40,"outputTokens":160,"totalTokens":200}';
  v_count integer;
begin
  if has_function_privilege('authenticated', 'public.start_planner_run(uuid,uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.complete_planner_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Runtime RPCs must not be client accessible';
  end if;
  insert into auth.users (id, email, raw_user_meta_data) values (v_user, v_user::text || '@planner-test.invalid', '{}');
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  v_workspace := public.bootstrap_workspace();
  v_workflow := public.create_workflow(v_workspace, 'Planner regression fixture', 'Find 20 SaaS companies in Kazakhstan for a reviewed sales research plan.', 20);
  if exists (select 1 from public.workflow_tasks where workflow_id = v_workflow) then raise exception 'Creation must not generate placeholder tasks'; end if;
  begin
    perform public.start_planner_run(v_new_id, v_user, v_workspace, v_workflow, 'test-model', '{}');
    raise exception 'Authenticated callers must not start privileged runs';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'service_role')::text, true);
  select * into v_run from public.start_planner_run(v_new_id, v_user, v_workspace, v_workflow, 'test-model', '{}');
  select * into v_replay from public.start_planner_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'test-model', '{}');
  if v_run.id <> v_new_id or v_replay.id <> v_run.id then raise exception 'Active requests must reuse one run'; end if;

  select jsonb_agg(jsonb_build_object('id', type, 'type', type, 'title', title, 'description', title,
    'objective', title, 'expectedOutput', title, 'dependencies', dependencies) order by position),
    jsonb_agg(jsonb_build_object('type', type, 'title', title, 'description', title, 'position', position,
      'input', jsonb_build_object('planTaskId', type, 'objective', title, 'expectedOutput', title, 'dependencies', dependencies)) order by position)
    into v_plan, v_tasks
  from (values
    (1, 'define_target_profile', 'Define target profile', '[]'::jsonb),
    (2, 'discover_companies', 'Discover companies', '["define_target_profile"]'::jsonb),
    (3, 'research_companies', 'Research company websites', '["discover_companies"]'::jsonb),
    (4, 'score_leads', 'Score opportunities', '["research_companies"]'::jsonb),
    (5, 'request_approval', 'Request human approval', '["score_leads"]'::jsonb)
  ) as t(position, type, title, dependencies);
  v_plan := jsonb_build_object('summary', 'A structured sales research plan for review.', 'assumptions', '[]'::jsonb, 'tasks', v_plan);

  -- Invalid inserts roll back the entire completion, including its plan event.
  begin
    perform public.complete_planner_run(v_run.id, 'completed', v_plan,
      jsonb_set(v_tasks, '{2,type}', '"send_email"'), null, v_metrics);
    raise exception 'Unknown executable tasks must be rejected';
  exception when invalid_parameter_value then null; end;
  if exists (select 1 from public.workflow_tasks where workflow_id = v_workflow)
    or exists (select 1 from public.agent_events where workflow_id = v_workflow and event_type = 'plan_generated') then
    raise exception 'Invalid completion must not persist partial tasks/events';
  end if;

  select * into v_run from public.complete_planner_run(v_run.id, 'completed', v_plan, v_tasks, null, v_metrics);
  select * into v_replay from public.complete_planner_run(v_run.id, 'completed', v_plan, v_tasks, null, v_metrics);
  select * into v_replay from public.start_planner_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'test-model', '{}');
  select count(*) into v_count from public.workflow_tasks where workflow_id = v_workflow;
  if v_count <> 5 or v_replay.id <> v_run.id or v_run.status <> 'completed' or v_run.total_tokens <> 200 then
    raise exception 'Completed planning must be idempotent and persist metrics';
  end if;
  if exists (select 1 from public.workflow_tasks where workflow_id = v_workflow and status <> 'pending')
    or not exists (select 1 from public.workflows where id = v_workflow and status = 'running') then
    raise exception 'Planning completion must not claim task execution';
  end if;
  select count(*) into v_count from public.agent_events where workflow_id = v_workflow;
  if v_count <> 11 then raise exception 'Exactly 11 creation/start/completion events expected, got %', v_count; end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_failed_workflow := public.create_workflow(v_workspace, 'Failed planning fixture', 'Find SaaS companies and prepare an approved sales research plan.', 20);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select * into v_run from public.start_planner_run(gen_random_uuid(), v_user, v_workspace, v_failed_workflow, 'test-model', '{}');
  perform public.complete_planner_run(v_run.id, 'failed', null, '[]', '{"code":"ai_configuration","message":"Planning is not configured."}', v_metrics);
  if not exists (select 1 from public.workflows where id = v_failed_workflow and status = 'failed')
    or exists (select 1 from public.workflow_tasks where workflow_id = v_failed_workflow) then raise exception 'Failed planning must persist failure without tasks'; end if;
  select * into v_replay from public.start_planner_run(gen_random_uuid(), v_user, v_workspace, v_failed_workflow, 'test-model', '{}');
  if v_replay.id = v_run.id or v_replay.status <> 'running' then raise exception 'Explicit failure retry must create a new run'; end if;
  -- Expired claims are recoverable, and their late result cannot overwrite the new run.
  update public.agent_runs set started_at = now() - interval '4 minutes' where id = v_replay.id;
  select * into v_run from public.start_planner_run(gen_random_uuid(), v_user, v_workspace, v_failed_workflow, 'test-model', '{}');
  if v_run.id = v_replay.id then raise exception 'An interrupted claim must expire'; end if;
  select * into v_replay from public.complete_planner_run(v_replay.id, 'completed', v_plan, v_tasks, null, v_metrics);
  if v_replay.status <> 'failed' or exists (select 1 from public.workflow_tasks where workflow_id = v_failed_workflow) then raise exception 'A late expired run must not persist tasks'; end if;
  raise notice 'Planner database regression checks passed';
end;
$$;
rollback;
