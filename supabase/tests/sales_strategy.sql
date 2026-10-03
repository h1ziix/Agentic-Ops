-- Reusable sales strategy regression fixtures. All changes are rolled back; no provider calls.
begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();ws uuid;other_ws uuid;
  i jsonb;i2 jsonb;t jsonb;copy jsonb;wf uuid;wf2 uuid;custom_goal text:='Research payment companies in Kazakhstan; focus on evidence-backed customer support opportunities.';
  payload jsonb;tpl jsonb;old_snapshot jsonb;event_count integer;c uuid;run_id uuid;lead_id uuid;research jsonb;legacy_wf uuid;legacy_lead uuid;
begin
  if has_table_privilege('authenticated','public.ideal_customer_profiles','INSERT')
    or has_table_privilege('authenticated','public.workflow_templates','UPDATE')
    or has_function_privilege('anon','public.mutate_sales_strategy(uuid,text,text,uuid,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.mutate_sales_strategy(uuid,text,text,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.capture_lead_strategy()','EXECUTE') then raise exception 'Unsafe strategy grants';end if;
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@strategy.invalid','{}'),(v,v::text||'@strategy.invalid','{}'),(member_id,member_id::text||'@strategy.invalid','{}');
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);ws:=public.bootstrap_workspace();
  perform set_config('request.jwt.claim.sub',v::text,true);other_ws:=public.bootstrap_workspace();
  perform set_config('request.jwt.claim.sub',u::text,true);
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,member_id,'member');
  payload:='{"name":"Kazakhstan B2B Fintech","description":"Evidence-backed AI automation prospects","industries":["FinTech","Payments"],"locations":["Kazakhstan"],"company_size_min":null,"company_size_max":null,"business_models":["B2B"],"required_signals":[],"preferred_signals":["digital products"],"excluded_signals":["gambling"],"automation_focus":["customer support"],"minimum_lead_score":75,"default_company_count":5}';
  i:=public.mutate_sales_strategy(ws,'icp','create',null,payload);
  if i->>'created_by'<>u::text or i->>'workspace_id'<>ws::text then raise exception 'Ownership not derived from session';end if;
  begin perform public.mutate_sales_strategy(ws,'icp','create',null,payload||jsonb_build_object('created_by',v));raise exception 'Client ownership accepted';exception when invalid_parameter_value then null;end;
  begin perform public.mutate_sales_strategy(ws,'icp','create',null,payload||'{"company_size_min":200,"company_size_max":50}');raise exception 'Invalid company size accepted';exception when check_violation then null;end;
  begin perform public.mutate_sales_strategy(ws,'icp','create',null,payload||'{"required_signals":["gambling"]}');raise exception 'Conflicting signals accepted';exception when invalid_parameter_value then null;end;
  tpl:=jsonb_build_object('name','Fintech AI Opportunity Research','description','Research strategy, not a prebuilt task list','category','Fintech',
    'default_goal','Find evidence-backed fintech companies for human-reviewed AI outreach.','task_strategy','Prioritize first-party product evidence and published support workflows.',
    'default_icp_id',i->>'id','default_company_count',5,'approval_required',true,'followup_enabled',false);
  t:=public.mutate_sales_strategy(ws,'template','create',null,tpl);
  begin perform public.mutate_sales_strategy(ws,'template','create',null,tpl||'{"approval_required":false}');raise exception 'Approval disabled';exception when check_violation then null;end;
  copy:=public.mutate_sales_strategy(ws,'template','duplicate',(t->>'id')::uuid);
  if copy->>'id'=t->>'id' or copy->>'name'<>t->>'name'||' (copy)' or copy->>'created_by'<>u::text then raise exception 'Template duplication incorrect';end if;
  wf:=public.create_workflow_from_strategy(ws,'Combined strategy workflow',custom_goal,5,null,(t->>'id')::uuid);
  select icp_snapshot into old_snapshot from public.workflows where id=wf;
  if (select goal from public.workflows where id=wf)<>custom_goal or old_snapshot->>'name'<>i->>'name'
    or (select template_snapshot->>'task_strategy' from public.workflows where id=wf)<>tpl->>'task_strategy'
    or exists(select 1 from public.workflow_tasks where workflow_id=wf) then raise exception 'Strategy replaced goal or bypassed Planner';end if;
  t:=public.mutate_sales_strategy(ws,'template','update',(t->>'id')::uuid,tpl||'{"task_strategy":"Updated source guidance must affect only later workflows."}');
  if (select template_snapshot->>'task_strategy' from public.workflows where id=wf)<>tpl->>'task_strategy' then raise exception 'Template edit rewrote history';end if;
  i:=public.mutate_sales_strategy(ws,'icp','update',(i->>'id')::uuid,payload||'{"minimum_lead_score":80,"name":"Updated Kazakhstan Fintech"}');
  if (select icp_snapshot from public.workflows where id=wf) is distinct from old_snapshot then raise exception 'ICP edit rewrote history';end if;
  wf2:=public.create_workflow_from_strategy(ws,'Updated ICP workflow',custom_goal,5,(i->>'id')::uuid,null);
  if (select icp_snapshot->>'minimum_lead_score' from public.workflows where id=wf2)<>'80' then raise exception 'New workflow missed latest strategy';end if;
  begin update public.workflows set icp_snapshot=icp_snapshot||'{"minimum_lead_score":1}' where id=wf;raise exception 'Frozen workflow modified';exception when invalid_parameter_value then null;end;
  begin update public.workflows set template_id=null,template_snapshot=null where id=wf;raise exception 'Snapshot removed';exception when invalid_parameter_value then null;end;
  copy:=public.mutate_sales_strategy(ws,'icp','duplicate',(i->>'id')::uuid);
  if copy->>'id'=i->>'id' or copy->>'minimum_lead_score'<>'80' then raise exception 'ICP duplication incorrect';end if;
  -- Members can own strategy changes, but cannot cross the workspace boundary.
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  i2:=public.mutate_sales_strategy(ws,'icp','create',null,payload||'{"name":"Member profile"}');
  if i2->>'created_by'<>member_id::text then raise exception 'Member mutation denied or attributed incorrectly';end if;
  perform set_config('request.jwt.claim.sub',v::text,true);
  begin perform public.mutate_sales_strategy(ws,'icp','archive',(i->>'id')::uuid);raise exception 'Cross-workspace archive accepted';exception when insufficient_privilege then null;end;
  begin perform public.create_workflow_from_strategy(other_ws,'Foreign strategy',custom_goal,5,(i->>'id')::uuid,null);raise exception 'Foreign ICP accepted';exception when invalid_parameter_value then null;end;
  begin perform public.mutate_sales_strategy(other_ws,'template','create',null,tpl);raise exception 'Foreign default ICP accepted';exception when invalid_parameter_value then null;end;
  perform set_config('request.jwt.claim.sub',u::text,true);
  -- Qualification freezes the exact scored research. A stricter threshold and a cited exclusion both block outreach.
  insert into public.companies(workspace_id,workflow_id,name,website) values(ws,wf,'Evidence company','https://evidence.example') returning id into c;
  research:='{"company":{"name":"Evidence company","website":"https://evidence.example"},"analysis":{"company":{"industry":"FinTech","location":"Kazakhstan"},"facts":[{"claim":"Company operates a gambling platform","quote":"gambling platform","sourceId":"source_1"}]}}';
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,output) values(ws,wf,'researcher','completed',jsonb_build_object('companyId',c,'result',research)) returning id into run_id;
  insert into public.leads(workspace_id,workflow_id,company_id,status,score,outreach_status,score_components)
    values(ws,wf,c,'qualified',72,'not_started','{"icpFit":20,"automationPotential":25,"operationalSignals":12,"evidenceQuality":10,"reachability":5}') returning id into lead_id;
  if (select status from public.leads where id=lead_id)<>'rejected' or (select research_run_id from public.leads where id=lead_id)<>run_id
    or (select qualification_snapshot->>'minimumLeadScore' from public.leads where id=lead_id)<>'75'
    or (select qualification_snapshot->'exclusionMatches' from public.leads where id=lead_id)<>'["gambling"]'::jsonb then raise exception 'Saved ICP gate failed';end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(ws,wf,'lead_qualified','Legacy qualification audit',jsonb_build_object('lead_id',lead_id));
  if exists(select 1 from public.agent_events where workflow_id=wf and event_type='lead_qualified' and metadata->>'lead_id'=lead_id::text) then raise exception 'Incorrect qualification audit';end if;
  begin update public.leads set research_snapshot='{}' where id=lead_id;raise exception 'Historical research changed';exception when invalid_parameter_value then null;end;
  begin update public.leads set score=99 where id=lead_id;raise exception 'Historical score changed';exception when invalid_parameter_value then null;end;
  begin update public.leads set confidence='high' where id=lead_id;raise exception 'Historical confidence changed';exception when invalid_parameter_value then null;end;
  update public.leads set review_metadata='{"decision":"reject_for_outreach"}',outreach_status='rejected' where id=lead_id;
  if public.strategy_exclusion_matches(old_snapshot,'{"analysis":{"facts":[{"claim":"Company does not operate gambling products","quote":"No gambling"}]}}')<>'[]'::jsonb then raise exception 'Negated signal treated as exclusion';end if;
  -- Legacy enrichment preserves initial qualification independently of a later rejection and never changes current state.
  legacy_wf:=public.create_workflow(ws,'Historical rejected lead',custom_goal,1);
  insert into public.leads(workspace_id,workflow_id,company_id,status,score,outreach_status,score_components)
    values(ws,legacy_wf,c,'rejected',80,'rejected','{"icpFit":20,"automationPotential":25,"operationalSignals":15,"evidenceQuality":12,"reachability":8}') returning id into legacy_lead;
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,output) values(ws,legacy_wf,'researcher','completed',jsonb_build_object('companyId',c,'result',research));
  update public.leads set research_run_id=research_run_id where id=legacy_lead;
  if (select status from public.leads where id=legacy_lead)<>'rejected' or (select outreach_status from public.leads where id=legacy_lead)<>'rejected'
    or (select score from public.leads where id=legacy_lead)<>80 or (select qualification_snapshot->>'qualified' from public.leads where id=legacy_lead)<>'true'
    then raise exception 'Legacy enrichment changed historical outcome';end if;
  perform public.mutate_sales_strategy(ws,'icp','archive',(i->>'id')::uuid);
  event_count:=(select count(*) from public.agent_events where workspace_id=ws);
  perform public.mutate_sales_strategy(ws,'icp','archive',(i->>'id')::uuid);
  if event_count<>(select count(*) from public.agent_events where workspace_id=ws) then raise exception 'Repeated archive duplicated event';end if;
  begin perform public.create_workflow_from_strategy(ws,'Archived profile',custom_goal,5,(i->>'id')::uuid,null);raise exception 'Archived ICP started';exception when invalid_parameter_value then null;end;
  begin perform public.create_workflow_from_strategy(ws,'Archived default profile',custom_goal,5,null,(t->>'id')::uuid);raise exception 'Archived template default ICP started';exception when invalid_parameter_value then null;end;
  perform public.mutate_sales_strategy(ws,'template','archive',(t->>'id')::uuid);
  begin perform public.create_workflow_from_strategy(ws,'Archived template',custom_goal,5,null,(t->>'id')::uuid);raise exception 'Archived template started';exception when invalid_parameter_value then null;end;
  if (select icp_snapshot from public.workflows where id=wf) is distinct from old_snapshot then raise exception 'Archive changed history';end if;
  if not exists(select 1 from public.agent_events where workspace_id=ws and event_type='icp_created')
    or not exists(select 1 from public.agent_events where workflow_id=wf and event_type='workflow_created_from_template') then raise exception 'Missing mutation audit';end if;
end;$$;
set local role authenticated;
do $$begin
  if exists(select 1 from public.ideal_customer_profiles where not public.is_workspace_member(workspace_id))
    or exists(select 1 from public.workflow_templates where not public.is_workspace_member(workspace_id)) then raise exception 'Cross-workspace RLS leaked';end if;
  if not exists(select 1 from public.ideal_customer_profiles) then raise exception 'Own strategy unavailable';end if;
  begin insert into public.ideal_customer_profiles(workspace_id,name) values(gen_random_uuid(),'Direct write');raise exception 'Direct mutation bypassed audit';exception when insufficient_privilege then null;end;
end;$$;
reset role;
rollback;
