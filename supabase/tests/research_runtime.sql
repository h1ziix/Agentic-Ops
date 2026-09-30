-- Regression fixtures only; no provider calls. All changes roll back.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_workspace uuid;
  v_workflow uuid;
  v_run public.agent_runs%rowtype;
  v_replay public.agent_runs%rowtype;
  v_input jsonb;
  v_output jsonb;
  v_metrics jsonb := '{"durationMs":1000,"retryCount":0,"taskCount":1,"inputTokens":30,"outputTokens":50,"totalTokens":80}';
  v_company uuid;
begin
  if has_function_privilege('authenticated', 'public.start_research_run(uuid,uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.complete_research_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.research_cache', 'SELECT') then
    raise exception 'Research writers and cache must be server-only';
  end if;
  insert into auth.users(id, email, raw_user_meta_data) values (v_user, v_user::text || '@research-test.invalid', '{}');
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  v_workspace := public.bootstrap_workspace();
  v_workflow := public.create_workflow(v_workspace, 'Research regression', 'Research one B2B SaaS company for a reviewed outreach draft.', 1);
  update public.workflows set status = 'running' where id = v_workflow;
  v_input := jsonb_build_object('name', 'Fixture SaaS', 'website', 'https://fixture.example.com', 'requestKey', repeat('a', 64),
    'icp', jsonb_build_object('description', 'B2B SaaS', 'offering', 'Approved sales research'), 'companyId', null);
  begin
    perform public.start_research_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'fixture-model', v_input);
    raise exception 'Authenticated research writes must be forbidden';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'service_role')::text, true);
  begin
    perform public.start_research_run(gen_random_uuid(), gen_random_uuid(), v_workspace, v_workflow, 'fixture-model', v_input);
    raise exception 'Nonmember must not claim a research run';
  exception when insufficient_privilege then null; end;
  select * into v_run from public.start_research_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'fixture-model', v_input);
  v_company := (v_run.input ->> 'companyId')::uuid;
  select * into v_replay from public.start_research_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'fixture-model', v_input);
  if v_replay.id <> v_run.id then raise exception 'Concurrent claims must reuse one run'; end if;
  v_output := jsonb_build_object('company', jsonb_build_object('name', 'Fixture SaaS', 'website', 'https://fixture.example.com'),
    'sources', '[{"id":"source_1","url":"https://fixture.example.com/product","title":"Product","content":"Software teams","relevance":1,"retrievedAt":"2026-09-30T12:00:00.000Z"}]'::jsonb,
    'approvalRequired', true, 'budget', '{"searchRequests":2,"searchCreditsReserved":2,"modelRequests":1,"cacheHits":0}'::jsonb,
    'analysis', jsonb_build_object('company', jsonb_build_object('description', 'Team software', 'industry', 'SaaS', 'location', null, 'employeeEstimate', null, 'researchSummary', 'Evidence summary'),
      'icp', jsonb_build_object('score', 80), 'lead', jsonb_build_object('score', 58, 'scoreReason', 'Evidence-led score', 'opportunity', 'Explore automation', 'confidence', 'low'),
      'outreach', jsonb_build_object('subject', 'Explore automation', 'body', 'Hi team, would you like to explore sales research automation?')));
  begin
    perform public.complete_research_run(v_run.id, 'completed', jsonb_set(v_output, '{approvalRequired}', 'false'), null, v_metrics);
    raise exception 'An approval bypass must fail';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.complete_research_run(v_run.id, 'completed', jsonb_set(v_output, '{analysis,lead,score}', '101'), null, v_metrics);
    raise exception 'Out-of-range scoring must fail';
  exception when invalid_parameter_value then null; end;
  if exists (select 1 from public.approvals where workflow_id = v_workflow)
    or exists (select 1 from public.leads where workflow_id = v_workflow) then raise exception 'Invalid completion must be atomic'; end if;
  select * into v_run from public.complete_research_run(v_run.id, 'completed', v_output, null, v_metrics);
  select * into v_replay from public.complete_research_run(v_run.id, 'completed', v_output, null, v_metrics);
  select * into v_replay from public.start_research_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'fixture-model', v_input);
  if v_run.status <> 'completed' or v_run.total_tokens <> 80 or v_replay.id <> v_run.id then raise exception 'Completion/replay must be idempotent'; end if;
  if (select count(*) from public.approvals where workflow_id = v_workflow and status = 'pending') <> 1
    or (select count(*) from public.proposed_actions where workflow_id = v_workflow and status = 'waiting_for_approval' and executed_at is null) <> 1
    or not exists (select 1 from public.workflows where id = v_workflow and status = 'waiting_for_approval')
    or not exists (select 1 from public.leads where workflow_id = v_workflow and score = 58 and outreach_status = 'waiting_approval')
    or not exists (select 1 from public.companies where id = v_company and source_urls = '["https://fixture.example.com/product"]'::jsonb) then
    raise exception 'Evidence, lead, proposal and approval gate must be saved together';
  end if;
  -- Even approval records only authorization and cannot send a message.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform public.resolve_approval((select id from public.approvals where workflow_id = v_workflow), 'approved', '[]');
  if exists (select 1 from public.proposed_actions where workflow_id = v_workflow and (executed_at is not null or status = 'executed')) then
    raise exception 'Approval must not perform outbound execution';
  end if;
  -- A result arriving after cancellation cannot resurrect a workflow or create an approval.
  v_workflow := public.create_workflow(v_workspace, 'Cancelled research', 'Research one company and prepare a reviewed outreach proposal.', 1);
  update public.workflows set status = 'running' where id = v_workflow;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'service_role')::text, true);
  select * into v_run from public.start_research_run(gen_random_uuid(), v_user, v_workspace, v_workflow, 'fixture-model', v_input);
  update public.workflows set status = 'cancelled' where id = v_workflow;
  select * into v_run from public.complete_research_run(v_run.id, 'completed', v_output, null, v_metrics);
  if v_run.status <> 'cancelled' or exists (select 1 from public.approvals where workflow_id = v_workflow) then
    raise exception 'Cancellation must prevent saving approval proposals';
  end if;
end;
$$;
rollback;
