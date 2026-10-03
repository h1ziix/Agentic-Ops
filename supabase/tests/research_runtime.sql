-- Real database regression fixtures roll back; no provider calls.
begin;
do $$
declare
  v_user uuid := gen_random_uuid(); v_other uuid := gen_random_uuid(); v_workspace uuid;
  v_workflow uuid; v_second uuid; v_task uuid; v_research_task uuid; v_score_task uuid; v_company uuid; v_failed_company uuid;
  v_run public.agent_runs%rowtype; v_replay public.agent_runs%rowtype; v_input jsonb; v_output jsonb; v_result jsonb; v_count integer;
  v_metrics jsonb := '{"durationMs":10,"retryCount":0,"taskCount":1,"inputTokens":1,"outputTokens":2,"totalTokens":3}';
  v_url text;
begin
  if public.research_domain('https://www.rekassa.kz./product?lang=ru') <> 'rekassa.kz'
    or public.research_domain('https://www.rekassa.kz.#details') <> 'rekassa.kz'
    or not public.public_research_url('https://rekassa.kz.')
    or not public.public_research_url('https://rekassa.kz./product?lang=ru#details') then
    raise exception 'Public DNS root evidence must retain canonical identity'; end if;
  foreach v_url in array array['https://127.0.0.1./private','https://host.internal./private','https://host.local./',
    'https://host.test./','https://host.invalid./','https://host.localdomain./','https://host.home./','https://host.lan./',
    'https://localhost./','https://host.internal.#fragment','https://host.internal#fragment','https://127.0.0.1.#fragment',
    'https://user:password@rekassa.kz./','https://rekassa.kz.:443/','https://rekassa.kz..'] loop
    if public.public_research_url(v_url) then raise exception 'Unsafe rooted source accepted: %',v_url; end if;
  end loop;
  if has_function_privilege('authenticated','public.start_research_task_run(uuid,uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.complete_research_task_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.complete_research_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Research RPC permissions or legacy outreach boundary are unsafe'; end if;
  insert into auth.users(id,email,raw_user_meta_data) values(v_user,v_user::text || '@stage4-test.invalid','{}'),(v_other,v_other::text || '@stage4-test.invalid','{}');
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_workspace := public.bootstrap_workspace();
  v_workflow := public.create_workflow(v_workspace,'Stage 4 regression','Find companies and qualify AI automation opportunities without outreach.',5);
  update public.workflows set status='running' where id=v_workflow;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
    select v_workspace,v_workflow,type,type,type,position,jsonb_build_object('planTaskId',type,'objective',type,'expectedOutput',type,'dependencies',dependencies)
    from (values(1,'define_target_profile','[]'::jsonb),(2,'discover_companies','["define_target_profile"]'::jsonb),
      (3,'research_companies','["discover_companies"]'::jsonb),(4,'score_leads','["research_companies"]'::jsonb),(5,'request_approval','["score_leads"]'::jsonb)) t(position,type,dependencies);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  select id into v_task from public.workflow_tasks where workflow_id=v_workflow and type='discover_companies';
  v_input := '{"workKey":"discover_companies","requestedCompanyCount":5,"companyId":null,"retry":false}';
  begin
    perform public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_task,'test',v_input);
    raise exception 'Dependencies must block discovery';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.start_research_task_run(gen_random_uuid(),v_other,v_workspace,v_workflow,v_task,'test',v_input);
    raise exception 'Other workspace users must be denied';
  exception when insufficient_privilege then null; end;
  select id into v_task from public.workflow_tasks where workflow_id=v_workflow and type='define_target_profile';
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_task,'test',jsonb_set(v_input,'{workKey}','"define_target_profile"'));
  perform public.complete_research_task_run(v_run.id,'completed','{"kind":"define_target_profile","profile":{"targetMarket":"SaaS","location":null,"industry":null,"icp":{"description":"Evidence-based SaaS qualification","offering":"AI operations automation"},"queries":["software firms","fintech companies"]}}',null,v_metrics);
  select id into v_task from public.workflow_tasks where workflow_id=v_workflow and type='discover_companies';
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_task,'test',v_input);
  select * into v_replay from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_task,'test',v_input);
  if v_run.id<>v_replay.id then raise exception 'Concurrent claims must reuse one run'; end if;
  v_output := '{"kind":"discover_companies","summary":"Discovered public companies","candidates":[
    {"name":"Acme Inc.","website":"https://example.com","normalizedDomain":"example.com","normalizedName":"acme","source":{"url":"https://example.com/product","title":"Product","type":"company_website","accessedAt":"2026-10-01T00:00:00Z"}},
    {"name":"ACME","website":"https://www.example.com/","normalizedDomain":"example.com","normalizedName":"acme","source":{"url":"https://example.com/product","title":"Product","type":"company_website","accessedAt":"2026-10-01T00:00:00Z"}},
    {"name":"Unavailable Co","website":null,"normalizedDomain":null,"normalizedName":"unavailable co","source":{"url":"https://directory.example.com/companies","title":"Directory","type":"directory","accessedAt":"2026-10-01T00:00:00Z"}}]}';
  perform public.complete_research_task_run(v_run.id,'completed',v_output,null,v_metrics);
  perform public.complete_research_task_run(v_run.id,'completed',v_output,null,v_metrics);
  select count(*) into v_count from public.companies where workspace_id=v_workspace;
  if v_count<>2 then raise exception 'Company domain normalization must prevent duplicates, got %',v_count; end if;
  select id into v_company from public.companies where workspace_id=v_workspace and normalized_domain='example.com';
  select id into v_failed_company from public.companies where workspace_id=v_workspace and website is null;
  select id into v_research_task from public.workflow_tasks where workflow_id=v_workflow and type='research_companies';
  v_input := jsonb_build_object('workKey',v_company,'companyId',v_company,'requestedCompanyCount',5,'retry',false);
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_research_task,'test',v_input);
  v_result := '{"researchOnly":true,"company":{"name":"Acme Inc.","website":"https://example.com"},"sources":[{"id":"source_1","url":"https://example.com/product","title":"Product","content":"Software for operational teams with integrations.","relevance":0.9,"retrievedAt":"2026-10-01T00:00:00Z"}],"analysis":{"company":{"description":"Operations software","industry":"SaaS","location":null,"employeeEstimate":null,"researchSummary":"Workflow automation is a hypothesis."},"facts":[{"claim":"Software","sourceId":"source_1","quote":"Software"},{"claim":"Integrations","sourceId":"source_1","quote":"integrations"}],"automationOpportunities":[{"category":"operations","title":"Workflow triage","explanation":"Explore intake assistance","sourceIds":["source_1"]}],"lead":{"score":80,"scoreReason":"Fit 20, potential 25, signals 15, evidence 12, public context 8.","opportunity":"Workflow triage","confidence":"medium","sourceIds":["source_1"],"components":{"icpFit":20,"automationPotential":25,"operationalSignals":15,"evidenceQuality":12,"reachability":8}},"uncertainties":["Buying intent unknown"]},"queries":[],"budget":{"searchRequests":2,"searchCreditsReserved":2,"modelRequests":1,"cacheHits":0}}';
  -- Invalid sources roll back the full result transaction.
  begin
    perform public.complete_research_task_run(v_run.id,'completed',jsonb_build_object('kind','research_companies','companyId',v_company,'result',jsonb_set(v_result,'{sources,0,url}','"http://127.0.0.1/private"')),null,v_metrics);
    raise exception 'Unsafe source must be rejected';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.companies where id=v_company and research_status='researched') then raise exception 'Invalid result persisted'; end if;
  -- Cached evidence from before canonicalization may still use an equivalent DNS root dot.
  v_result := jsonb_set(v_result,'{sources,0,url}','"https://example.com./product?evidence=1#overview"');
  perform public.complete_research_task_run(v_run.id,'completed',jsonb_build_object('kind','research_companies','companyId',v_company,'result',v_result),null,v_metrics);
  select * into v_replay from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_research_task,'test',v_input);
  if v_replay.id<>v_run.id then raise exception 'Completed company replay must not rerun'; end if;
  v_input := jsonb_build_object('workKey',v_failed_company,'companyId',v_failed_company,'requestedCompanyCount',5,'retry',false);
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_research_task,'test',v_input);
  perform public.complete_research_task_run(v_run.id,'failed',null,'{"code":"ai_timeout","message":"One company timed out","isolated":true}',v_metrics);
  if not exists(select 1 from public.workflow_tasks where id=v_research_task and status='completed') or not exists(select 1 from public.companies where id=v_company and research_status='researched')
    or not exists(select 1 from public.workflow_companies where workflow_id=v_workflow and company_id=v_failed_company and research_status='failed') then raise exception 'Partial failure isolation failed'; end if;
  select id into v_score_task from public.workflow_tasks where workflow_id=v_workflow and type='score_leads';
  v_input := '{"workKey":"score_leads","requestedCompanyCount":5,"companyId":null,"retry":false}';
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_score_task,'test',v_input);
  perform public.complete_research_task_run(v_run.id,'completed',jsonb_build_object('kind','score_leads','companyIds',jsonb_build_array(v_company)),null,v_metrics);
  perform public.complete_research_task_run(v_run.id,'completed',jsonb_build_object('kind','score_leads','companyIds',jsonb_build_array(v_company)),null,v_metrics);
  if (select count(*) from public.leads where workflow_id=v_workflow)<>1 or not exists(select 1 from public.leads where workflow_id=v_workflow and score=80 and status='qualified' and outreach_status='not_started' and score_components is not null)
    then raise exception 'Lead scoring/persistence is not idempotent'; end if;
  if exists(select 1 from public.approvals where workflow_id=v_workflow) or exists(select 1 from public.proposed_actions where workflow_id=v_workflow)
    then raise exception 'Stage 4 must not create outreach or approvals'; end if;
  perform public.finish_research_workflow(v_workspace,v_workflow,v_user);
  perform public.finish_research_workflow(v_workspace,v_workflow,v_user);
  if not exists(select 1 from public.workflows where id=v_workflow and status='running' and progress=80)
    or not exists(select 1 from public.workflow_tasks where workflow_id=v_workflow and type='request_approval' and status='pending') then raise exception 'Release boundary/progress failed'; end if;
  if not exists(select 1 from public.companies where id=v_company and jsonb_array_length(sources)=1 and last_researched_at is not null) then raise exception 'Structured sources not saved'; end if;
  -- Same company in another workflow must reuse the canonical workspace record.
  insert into public.workflows(workspace_id,created_by,title,goal,status,target_companies) values(v_workspace,v_user,'Second research','Research the same company again without outreach.','running',5) returning id into v_second;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input) values(v_workspace,v_second,'discover_companies','Discover','Discover',1,'{"planTaskId":"discover","dependencies":[]}') returning id into v_task;
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_second,v_task,'test','{"workKey":"discover","requestedCompanyCount":5,"retry":false}');
  perform public.complete_research_task_run(v_run.id,'completed',jsonb_set(v_output,'{candidates}',jsonb_build_array(v_output #> '{candidates,0}')),null,v_metrics);
  if (select count(*) from public.companies where workspace_id=v_workspace)<>2
    or not exists(select 1 from public.workflow_companies where workflow_id=v_second and company_id=v_company) then raise exception 'Cross-workflow company deduplication failed'; end if;
  -- A name-only discovery that resolves to an existing domain must merge into its canonical company.
  insert into public.companies(workspace_id,workflow_id,name,normalized_name,source_urls)
    values(v_workspace,v_second,'Acme product alias','acme product alias','["https://directory.example.com/alias"]') returning id into v_failed_company;
  insert into public.workflow_companies(workspace_id,workflow_id,company_id) values(v_workspace,v_second,v_failed_company);
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
    values(v_workspace,v_second,'research_companies','Research','Research',2,'{"planTaskId":"research","dependencies":["discover"]}') returning id into v_research_task;
  v_input := jsonb_build_object('workKey',v_failed_company,'companyId',v_failed_company,'requestedCompanyCount',5,'retry',false);
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_second,v_research_task,'test',v_input);
  v_result := jsonb_set(v_result,'{company,website}','"https://www.example.com./"');
  select * into v_run from public.complete_research_task_run(v_run.id,'completed',jsonb_build_object('kind','research_companies','companyId',v_failed_company,'result',v_result),null,v_metrics);
  if v_run.input->>'companyId' is distinct from v_company::text or v_run.output->>'companyId' is distinct from v_company::text
    or exists(select 1 from public.companies where id=v_failed_company) or (select count(*) from public.companies where workspace_id=v_workspace)<>2
    then raise exception 'Resolved canonical company merge failed'; end if;
  -- Late completion after a pause cannot create leads or complete a future task.
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
    values(v_workspace,v_second,'score_leads','Score','Score',3,'{"planTaskId":"score","dependencies":["research"]}') returning id into v_score_task;
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_second,v_score_task,'test','{"workKey":"score","requestedCompanyCount":5,"retry":false}');
  update public.workflows set status='paused' where id=v_second;
  select * into v_run from public.complete_research_task_run(v_run.id,'completed',jsonb_build_object('kind','score_leads','companyIds',jsonb_build_array(v_company)),null,v_metrics);
  if v_run.status<>'cancelled' or exists(select 1 from public.leads where workflow_id=v_second) then raise exception 'Late completion bypassed pause'; end if;
  -- Explicit all-company recovery requeues the whole failed batch once.
  insert into public.workflows(workspace_id,created_by,title,goal,status,target_companies)
    values(v_workspace,v_user,'Recovery regression','Research two companies with isolated failures.','running',2) returning id into v_second;
  insert into public.workflow_companies(workspace_id,workflow_id,company_id,research_status)
    select v_workspace,v_second,id,'failed' from public.companies where workspace_id=v_workspace;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,status,position,input)
    values(v_workspace,v_second,'research_companies','Recover','Recover','failed',1,'{"planTaskId":"recover","dependencies":[]}') returning id into v_research_task;
  v_input := jsonb_build_object('workKey',v_company,'companyId',v_company,'requestedCompanyCount',2,'retry',true);
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_second,v_research_task,'test',v_input);
  if (select count(*) from public.workflow_companies where workflow_id=v_second and research_status='queued')<>1 then raise exception 'Batch recovery skipped failed items'; end if;
  perform public.complete_research_task_run(v_run.id,'failed',null,'{"code":"ai_timeout","message":"First failed","isolated":true}',v_metrics);
  select company_id into v_failed_company from public.workflow_companies where workflow_id=v_second and research_status='queued';
  v_input := jsonb_build_object('workKey',v_failed_company,'companyId',v_failed_company,'requestedCompanyCount',2,'retry',false);
  select * into v_run from public.start_research_task_run(gen_random_uuid(),v_user,v_workspace,v_second,v_research_task,'test',v_input);
  perform public.complete_research_task_run(v_run.id,'failed',null,'{"code":"ai_timeout","message":"Second failed","isolated":true}',v_metrics);
  if not exists(select 1 from public.workflow_tasks where id=v_research_task and status='failed')
    or not exists(select 1 from public.companies where id=v_company and research_status='researched') then raise exception 'All-company failure corrupted saved success'; end if;
  -- Membership RLS must hide every fixture from a different authenticated user.
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.workflow_companies where workflow_id=v_workflow) or exists(select 1 from public.companies where workspace_id=v_workspace)
    or exists(select 1 from public.leads where workflow_id=v_workflow) or exists(select 1 from public.agent_runs where workflow_id=v_workflow) then raise exception 'Workspace isolation failed'; end if;
  execute 'reset role';
  raise notice 'Stage 4 regression passed: dependencies, claims, canonical companies, partial failures, rubric, sources, idempotent leads, isolation and release boundary.';
end;
$$;
rollback;
