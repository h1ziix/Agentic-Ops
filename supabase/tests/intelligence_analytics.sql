-- Entirely synthetic rollback fixtures; never production/demo analytics or provider calls.
begin;
create temporary table intelligence_fixture_08(ws uuid,other_ws uuid,empty_ws uuid,wf uuid,old_wf uuid,owner_id uuid,other_wf uuid);
grant select on intelligence_fixture_08 to authenticated;
do $$
declare u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();ws uuid;other_ws uuid;empty_ws uuid:=gen_random_uuid();wf uuid;old_wf uuid;other_wf uuid;
  c uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();lead uuid;research uuid:=gen_random_uuid();approval uuid:=gen_random_uuid();
  connection uuid:=gen_random_uuid();action1 uuid:=gen_random_uuid();action2 uuid:=gen_random_uuid();snap1 uuid:=gen_random_uuid();snap2 uuid:=gen_random_uuid();
  executor uuid:=gen_random_uuid();attempt1 uuid:=gen_random_uuid();attempt2 uuid:=gen_random_uuid();snapshot jsonb;
begin
  if has_function_privilege('anon','public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb)','EXECUTE')
    or (select prosecdef from pg_proc where oid='public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb)'::regprocedure)
    then raise exception 'Analytics grants or security mode unsafe';end if;
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@analytics.invalid','{}'),(other_u,other_u::text||'@analytics.invalid','{}');
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);ws:=public.bootstrap_workspace();
  wf:=public.create_workflow(ws,'Intelligence test workflow','Research verified fintech firms and prepare approved outreach.',2);
  old_wf:=public.create_workflow(ws,'Old cohort workflow','Research verified software firms and prepare approved outreach.',2);
  update public.workflows set created_at=now()-interval '180 days' where id=old_wf;
  insert into public.workspaces(id,name,slug,created_by) values(empty_ws,'Empty analytics fixture','empty-'||replace(empty_ws::text,'-',''),u);
  insert into public.workspace_members(workspace_id,user_id,role) values(empty_ws,u,'owner');
  perform set_config('request.jwt.claim.sub',other_u::text,true);other_ws:=public.bootstrap_workspace();
  other_wf:=public.create_workflow(other_ws,'Private competing workspace','Research evidence in a private separate workspace.',2);
  perform set_config('request.jwt.claim.sub',u::text,true);
  insert into public.companies(id,workspace_id,workflow_id,name,industry,location,research_status) values
    (c,ws,wf,'Synthetic Fintech','Mutable incorrect industry','Mutable incorrect location','researched'),
    (c2,ws,wf,'Synthetic unknown company',null,null,'researched');
  insert into public.workflow_companies(workspace_id,workflow_id,company_id,research_status) values(ws,wf,c,'researched'),(ws,wf,c2,'researched');
  snapshot:=jsonb_build_object('company',jsonb_build_object('name','Synthetic Fintech','website','https://fixture-analytics.example'),
    'sources','[{"id":"source_1","url":"https://fixture-analytics.example","title":"Fixture website","content":"Synthetic evidence of customer service.","relevance":0.8,"retrievedAt":"2026-10-03T00:00:00Z"},{"id":"source_2","url":"https://directory.example/fixture","title":"Fixture directory","content":"The company provides digital payment products.","relevance":0.8,"retrievedAt":"2026-10-03T00:00:00Z"}]'::jsonb,
    'analysis','{"company":{"description":"Synthetic payments company","industry":"FIN-tech","location":"Almaty, Kazakhstan","employeeEstimate":null,"researchSummary":"Synthetic saved company research"},"facts":[{"claim":"The company offers customer service","sourceId":"source_1","quote":"customer service"},{"claim":"The company offers digital payments","sourceId":"source_2","quote":"digital payment products"}],"automationOpportunities":[{"category":"support ticket classification","title":"Ticket routing","explanation":"Synthetic support opportunity","sourceIds":["source_1"]},{"category":"customer_support","title":"Support answers","explanation":"Synthetic support opportunity","sourceIds":["source_1"]}],"lead":{"score":80,"scoreReason":"Synthetic qualification rationale","opportunity":"Customer support opportunity","confidence":"high","sourceIds":["source_1","source_2"],"components":{"icpFit":20,"automationPotential":25,"operationalSignals":15,"evidenceQuality":13,"reachability":7}},"uncertainties":[]}'::jsonb,
    'queries','[]'::jsonb,'budget','{"searchRequests":1,"searchCreditsReserved":1,"modelRequests":1,"cacheHits":0}'::jsonb,'researchOnly',true);
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,model,input,output,duration_ms,total_tokens,input_tokens,output_tokens,cost_status,estimated_cost_usd)
    values(research,ws,wf,'researcher','completed','synthetic-model',jsonb_build_object('companyId',c),jsonb_build_object('kind','research_companies','companyId',c,'result',snapshot),120,120,100,20,'estimated',0.4);
  insert into public.leads(workspace_id,workflow_id,company_id,status,score,confidence,score_components,review_metadata)
    values(ws,wf,c,'qualified',80,'high','{"icpFit":20,"automationPotential":25,"operationalSignals":15,"evidenceQuality":13,"reachability":7}',
      '{"decision":"approve_for_outreach"}') returning id into lead;
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,model) values(ws,wf,'planner','failed','unknown-price-model');
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,model,input,retry_count) values
    (ws,wf,'researcher','failed',null,jsonb_build_object('companyId',c2),1),
    (ws,wf,'researcher','failed',null,jsonb_build_object('companyId',c2),0);
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,model,total_tokens,input_tokens,output_tokens,cost_status,estimated_cost_usd)
    values(ws,old_wf,'planner','completed','synthetic-model',30,20,10,'estimated',0.2);
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values
    (ws,wf,research,'tool_called','Synthetic tool starts','{"tool_call_id":"one-call"}'),
    (ws,wf,research,'tool_called','Synthetic duplicate telemetry','{"tool_call_id":"one-call"}');
  insert into public.approvals(id,workspace_id,workflow_id,type,title,status) values(approval,ws,wf,'email_outreach','Synthetic email review','executed');
  insert into public.integration_connections(id,workspace_id,provider,status,generation,provider_identity,display_name,scopes,connected_by)
    values(connection,ws,'gmail','connected',1,'operator@fixture.invalid','Synthetic connection','{}',u);
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,revision) values
    (action1,ws,wf,approval,'send_email',jsonb_build_object('companyId',c,'leadId',lead),'{}','executed',1),
    (action2,ws,wf,approval,'send_email',jsonb_build_object('companyId',c,'leadId',lead),'{}','executed',1);
  insert into public.action_approval_snapshots(id,workspace_id,workflow_id,action_id,revision,schema_version,action_type,connection_id,authorization_generation,envelope,digest,approved_by) values
    (snap1,ws,wf,action1,1,2,'send_email',connection,1,'{}',repeat('a',64),u),
    (snap2,ws,wf,action2,1,2,'send_email',connection,1,'{}',repeat('b',64),u);
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,model) values(executor,ws,wf,'executor','completed',null);
  insert into public.execution_attempts(id,workspace_id,workflow_id,action_id,snapshot_id,connection_id,attempt_number,operation_key,executor_run_id,claim_token,lease_until,status,dispatched_at,completed_at) values
    (attempt1,ws,wf,action1,snap1,connection,1,'analytics:'||attempt1::text,executor,gen_random_uuid(),now(),'succeeded',now()-interval '1 minute',now()),
    (attempt2,ws,wf,action2,snap2,connection,1,'analytics:'||attempt2::text,executor,gen_random_uuid(),now(),'succeeded',now()-interval '1 minute',now());
  insert into public.reply_observations(workspace_id,workflow_id,lead_id,parent_attempt_id,connection_id,authorization_generation,external_thread_id,external_message_id,received_at) values
    (ws,wf,lead,attempt1,connection,1,'thread-1','message-1',now()),(ws,wf,lead,attempt2,connection,1,'thread-2','message-2',now());
  insert into intelligence_fixture_08 values(ws,other_ws,empty_ws,wf,old_wf,u,other_wf);
end;$$;
set local role authenticated;
do $$
declare f intelligence_fixture_08%rowtype;data jsonb;empty_data jsonb;rows_before integer;
begin
  select * into f from intelligence_fixture_08;
  select count(*) into rows_before from public.agent_events where workspace_id=f.ws;
  data:=public.intelligence_analytics_08(f.ws,now()-interval '30 days',now(),'Asia/Qyzylorda','{}');
  if data#>>'{summary,discovered}'<>'2' or data#>>'{summary,researched}'<>'2' or data#>>'{summary,qualified}'<>'1'
    or data#>>'{summary,approved}'<>'1' or data#>>'{summary,sent}'<>'1' or data#>>'{summary,replies}'<>'1'
    or data#>>'{summary,messagesSent}'<>'2' or data#>>'{summary,repliesDetected}'<>'2' then raise exception 'Funnel joins inflated distinct company/workflow counts';end if;
  if data#>>'{summary,estimatedCostUsd}' is not null or data#>>'{summary,unknownCostRuns}'<>'3'
    or (data#>>'{summary,knownEstimatedCostUsd}')::numeric<>0.4 or data#>>'{summary,costPerQualifiedLead}' is not null
    then raise exception 'Unknown cohort cost fabricated zero or ratio';end if;
  if (data#>>'{costPeriods,today,knownEstimatedCostUsd}')::numeric<>0.6 then raise exception 'Actual activity cost period excluded old workflow';end if;
  if data#>>'{summary,toolCalls}'<>'1' or jsonb_array_length(data->'workflows')<>1 then raise exception 'Tool deduplication/date cohort failed';end if;
  if not exists(select 1 from jsonb_array_elements(data->'workflowFunnel') v where v->>'key'='created' and v->>'count'='1')
    or not exists(select 1 from jsonb_array_elements(data->'workflowFunnel') v where v->>'key'='planned' and v->>'count'='0')
    or not exists(select 1 from jsonb_array_elements(data->'workflowFunnel') v where v->>'key'='sent' and v->>'count'='1')
    then raise exception 'Workflow milestones incorrectly inferred or counted actions';end if;
  if not exists(select 1 from jsonb_array_elements(data->'industries') v where v->>'key'='Fintech' and v->>'qualified'='1')
    or exists(select 1 from jsonb_array_elements(data->'industries') v where v->>'key' ilike '%mutable%')
    or not exists(select 1 from jsonb_array_elements(data->'locations') v where v->>'key'='Kazakhstan')
    or data#>>'{researchQuality,unknownSnapshots}'<>'1' or data#>>'{researchQuality,withoutEvidence}'<>'0'
    or (data#>>'{researchQuality,averageSources}')::numeric<>2 or data#>>'{researchQuality,failures}'<>'2'
    or data#>>'{researchQuality,partialFailureWorkflows}'<>'1' or data#>>'{summary,retries}'<>'1'
    then raise exception 'Historical snapshot/normalization/evidence/retry semantics failed';end if;
  if not exists(select 1 from jsonb_array_elements(data->'opportunities') v where v->>'key'='Customer support' and v->>'companies'='1') then raise exception 'Repeated opportunity category inflated companies';end if;
  data:=public.intelligence_analytics_08(f.ws,now()-interval '30 days',now(),'Asia/Qyzylorda','{"industry":"SaaS"}');
  if data#>>'{summary,researched}'<>'0' or jsonb_array_length(data->'workflows')<>0 then raise exception 'Industry filter failed';end if;
  data:=public.intelligence_analytics_08(f.ws,now()-interval '30 days',now(),'Asia/Qyzylorda','{"minScore":81}');
  if data#>>'{summary,qualified}'<>'0' then raise exception 'Score filter failed';end if;
  data:=public.intelligence_analytics_08(f.ws,null,now(),'Asia/Qyzylorda',jsonb_build_object('workflowId',f.old_wf));
  if (data#>>'{summary,estimatedCostUsd}')::numeric<>0.2 or data#>>'{summary,costPerQualifiedLead}' is not null then raise exception 'Known cost or zero denominator failed';end if;
  empty_data:=public.intelligence_analytics_08(f.empty_ws,null,now(),'Asia/Qyzylorda','{}');
  if empty_data#>>'{summary,researched}'<>'0' or empty_data#>>'{summary,estimatedCostUsd}' is not null
    or jsonb_array_length(empty_data->'workflows')<>0 then raise exception 'Empty analytics fabricated data';end if;
  begin perform public.intelligence_analytics_08(f.other_ws,null,now(),'Asia/Qyzylorda','{}');raise exception 'Cross-workspace aggregate leaked';exception when insufficient_privilege then null;end;
  data:=public.intelligence_analytics_08(f.ws,null,now(),'Asia/Qyzylorda',jsonb_build_object('workflowId',f.other_wf));
  if jsonb_array_length(data->'workflows')<>0 then raise exception 'Foreign workflow filter escaped workspace';end if;
  if (select count(*) from public.agent_events where workspace_id=f.ws)<>rows_before then raise exception 'Analytics view spammed events';end if;
  if public.intelligence_normalize_08('industry','FIN-tech')<>'Fintech' or public.intelligence_normalize_08('location','Almaty')<>'Almaty'
    or public.intelligence_normalize_08('industry',null)<>'Unknown' or public.intelligence_normalize_08('opportunity','Internal_operations')<>'Internal operations'
    or public.intelligence_normalize_08('opportunity','not_specified')<>'Unknown' then raise exception 'Normalization mismatch';end if;
end;$$;
reset role;
rollback;
