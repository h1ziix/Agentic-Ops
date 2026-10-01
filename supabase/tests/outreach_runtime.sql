-- Transactional database fixtures only. No external provider or executor calls.
begin;
do $$
declare
  v_user uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid(); v_workspace uuid; v_workflow uuid;
  v_review_task uuid; v_outreach_task uuid; v_approval_task uuid; v_company uuid; v_lead uuid; v_research uuid;
  v_run public.agent_runs%rowtype; v_replay public.agent_runs%rowtype; v_review_run uuid;
  v_review jsonb; v_input jsonb; v_draft jsonb; v_action jsonb; v_actions jsonb; v_approval uuid; v_second_approval uuid;
  v_action_id uuid; v_second_action uuid; v_case text; v_item integer; v_count integer;
  v_metrics jsonb:='{"durationMs":10,"retryCount":0,"taskCount":1,"inputTokens":3,"outputTokens":4,"totalTokens":7}';
begin
  if has_function_privilege('authenticated','public.start_preparation_run(uuid,uuid,uuid,uuid,uuid,public.agent_type,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.publish_outreach_approval(uuid,uuid,uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.request_approval(uuid,uuid,text,text,text,public.risk_level,jsonb)','EXECUTE') then
    raise exception 'Preparation or legacy approval privileges unsafe'; end if;
  insert into auth.users(id,email,raw_user_meta_data) values(v_user,v_user::text||'@stage5.invalid','{}'),(v_other,v_other::text||'@stage5.invalid','{}');
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_workspace:=public.bootstrap_workspace();
  foreach v_case in array array['mixed','rejected','empty'] loop
    insert into public.workflows(workspace_id,created_by,title,goal,status,target_companies)
      values(v_workspace,v_user,'Stage 5 '||v_case,'Research companies and prepare outreach for review.','running',2) returning id into v_workflow;
    insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
      values(v_workspace,v_workflow,'review_qualified_leads','Review','Review evidence',1,'{"planTaskId":"review","dependencies":[]}') returning id into v_review_task;
    insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
      values(v_workspace,v_workflow,'generate_outreach','Draft','Draft accepted evidence',2,'{"planTaskId":"outreach","dependencies":["review"]}') returning id into v_outreach_task;
    insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
      values(v_workspace,v_workflow,'request_approval','Approve','Human review',3,'{"planTaskId":"approval","dependencies":["outreach"]}') returning id into v_approval_task;
    insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
      values(v_workspace,v_workflow,'execute_approved_actions','Execution','Future stage',4,'{"planTaskId":"execute","dependencies":["approval"],"runtimeAdded":true}');
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
    v_actions:='[]';
    for v_item in 1..case when v_case='empty' then 0 else 2 end loop
      insert into public.companies(workspace_id,name,website) values(v_workspace,'Fixture '||v_case||v_item,'https://example.com') returning id into v_company;
      insert into public.leads(workspace_id,workflow_id,company_id,status,score,confidence,outreach_status)
        values(v_workspace,v_workflow,v_company,'qualified',80,'medium','not_started') returning id into v_lead;
      insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,model,input,output)
        values(v_workspace,v_workflow,'researcher','completed','fixture','{}',jsonb_build_object('companyId',v_company)) returning id into v_research;
      v_input:=jsonb_build_object('leadId',v_lead,'companyId',v_company,'version',1);
      begin
        perform public.start_preparation_run(gen_random_uuid(),v_other,v_workspace,v_workflow,v_review_task,'reviewer','fixture',v_input);
        raise exception 'Nonmember claim allowed'; exception when insufficient_privilege then null; end;
      begin
        perform public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_outreach_task,'outreach','fixture',v_input);
        raise exception 'Incomplete dependency allowed'; exception when invalid_parameter_value then null; end;
      select * into v_run from public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_review_task,'reviewer','fixture',v_input);
      select * into v_replay from public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_review_task,'reviewer','fixture',v_input);
      if v_run.id<>v_replay.id then raise exception 'Active claim duplicated'; end if;
      v_review:='{"decision":"approve_for_outreach","confidence":"medium","summary":"Accepted public evidence"}';
      perform public.complete_preparation_run(v_run.id,'completed',jsonb_build_object('leadId',v_lead,'reviewInput',jsonb_build_object('researchRunId',v_research),'review',v_review),null,v_metrics);
      select * into v_replay from public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_review_task,'reviewer','fixture',v_input);
      if v_run.id<>v_replay.id then raise exception 'Completed reviewer replay duplicated'; end if;
    end loop;
    perform public.finish_preparation_task(v_workspace,v_workflow,v_user,v_review_task);
    for v_input in select jsonb_build_object('leadId',id,'companyId',company_id,'version',1) from public.leads where workflow_id=v_workflow order by id loop
      v_lead:=(v_input->>'leadId')::uuid; v_company:=(v_input->>'companyId')::uuid;
      select id into v_review_run from public.agent_runs where workflow_id=v_workflow and agent_type='reviewer' and input->>'leadId'=v_lead::text;
      select research_run_id into v_research from public.leads where id=v_lead;
      select * into v_run from public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_outreach_task,'outreach','fixture',v_input);
      v_draft:='{"status":"ready_for_review","channel":"email","subject":"Public product evidence","body":"A grounded proposal for a short pilot.","recipient":{"email":null},"executionReadiness":"blocked_missing_recipient","personalization":{"claimsUsed":[{"claim":"Public product","sourceUrl":"https://example.com","quote":"Public product"}]}}';
      begin
        perform public.complete_preparation_run(v_run.id,'completed',jsonb_build_object('leadId',v_lead,'reviewInput',jsonb_build_object('researchRunId',v_research),'review',v_review,'reviewerRunId',v_review_run,'draft',jsonb_set(v_draft,'{recipient,email}','"invented@example.com"')),null,v_metrics);
        raise exception 'Fabricated recipient persisted'; exception when invalid_parameter_value then null; end;
      if (select status from public.agent_runs where id=v_run.id)<>'running' then raise exception 'Invalid completion did not roll back'; end if;
      perform public.complete_preparation_run(v_run.id,'completed',jsonb_build_object('leadId',v_lead,'reviewInput',jsonb_build_object('researchRunId',v_research),'review',v_review,'reviewerRunId',v_review_run,'draft',v_draft),null,v_metrics);
      v_action:=jsonb_build_object('action_type','send_email','risk_level','medium','dedupe_key',v_workflow::text||':'||v_lead::text||':email:'||v_outreach_task::text||':v1',
        'target',jsonb_build_object('leadId',v_lead,'companyId',v_company,'recipientEmail',null),
        'payload',jsonb_build_object('subject',v_draft->'subject','body',v_draft->'body','personalization',v_draft->'personalization','evidenceReferences',v_draft#>'{personalization,claimsUsed}',
          'executionReadiness','blocked_missing_recipient','generationMetadata',jsonb_build_object('outreachRunId',v_run.id,'reviewerRunId',v_review_run,'researchRunId',v_research,'taskId',v_outreach_task,'model','fixture','review',v_review)));
      v_actions:=v_actions||jsonb_build_array(v_action);
    end loop;
    perform public.finish_preparation_task(v_workspace,v_workflow,v_user,v_outreach_task);
    if v_case<>'empty' then
      begin
        perform public.publish_outreach_approval(v_workspace,v_workflow,v_user,v_approval_task,jsonb_set(v_actions,'{0,payload,body}','"Changed unsupported draft"'));
        raise exception 'Unsupported action persisted'; exception when invalid_parameter_value then null; end;
      if exists(select 1 from public.approvals where workflow_id=v_workflow) then raise exception 'Partial approval persisted'; end if;
      -- Identical body text cannot be used to attribute another lead's run to this lead.
      v_action:=jsonb_set(jsonb_set(v_actions->0,'{target}',v_actions#>'{1,target}'),'{dedupe_key}',v_actions#>'{1,dedupe_key}');
      begin
        perform public.publish_outreach_approval(v_workspace,v_workflow,v_user,v_approval_task,jsonb_build_array(v_action));
        raise exception 'Cross-lead provenance allowed'; exception when invalid_parameter_value then null; end;
    end if;
    v_approval:=public.publish_outreach_approval(v_workspace,v_workflow,v_user,v_approval_task,v_actions);
    if v_case='empty' then
      if v_approval is not null or (select status from public.workflows where id=v_workflow)<>'completed'
        or exists(select 1 from public.proposed_actions where workflow_id=v_workflow) then raise exception 'Empty outcome stuck'; end if;
      continue;
    end if;
    v_second_approval:=public.publish_outreach_approval(v_workspace,v_workflow,v_user,v_approval_task,v_actions);
    if v_approval<>v_second_approval or (select count(*) from public.proposed_actions where workflow_id=v_workflow)<>2 then raise exception 'Publication duplicated'; end if;
    if (select status from public.workflows where id=v_workflow)<>'waiting_for_approval' or exists(select 1 from public.proposed_actions where workflow_id=v_workflow and approval_id is null) then raise exception 'Approval linkage invalid'; end if;
    select id into v_action_id from public.proposed_actions where approval_id=v_approval order by id limit 1;
    select id into v_second_action from public.proposed_actions where approval_id=v_approval and id<>v_action_id;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
    perform public.edit_proposed_email(v_action_id,'Edited subject','An independently saved human-edited draft.',0);
    if (select status from public.approvals where id=v_approval)<>'pending' or (select revision from public.proposed_actions where id=v_action_id)<>1 then raise exception 'Edit implicitly authorized'; end if;
    begin
      perform public.edit_proposed_email(v_action_id,'Stale overwrite','This edit must fail the revision check.',0);
      raise exception 'Stale edit allowed'; exception when invalid_parameter_value then null; end;
    perform set_config('request.jwt.claim.sub',v_other::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated')::text,true);
    begin
      perform public.resolve_outreach_actions(v_approval,'approved',array[v_action_id]);
      raise exception 'Nonmember decision allowed'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',v_user::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
    if v_case='mixed' then
      perform public.resolve_outreach_actions(v_approval,'approved',array[v_action_id]);
      if (select status from public.approvals where id=v_approval)<>'pending' or (select status from public.workflows where id=v_workflow)<>'waiting_for_approval' then raise exception 'Partial decision prematurely resolved'; end if;
      perform public.resolve_outreach_actions(v_approval,'rejected',array[v_second_action]);
      if (select status from public.workflows where id=v_workflow)<>'ready_for_execution'
        or not exists(select 1 from public.workflow_tasks where workflow_id=v_workflow and type='execute_approved_actions' and status='pending')
        or not exists(select 1 from public.leads where workflow_id=v_workflow and outreach_status='blocked_missing_recipient') then raise exception 'Authorized execution boundary failed'; end if;
    else
      perform public.resolve_outreach_actions(v_approval,'rejected',null);
      if (select status from public.workflows where id=v_workflow)<>'completed' or (select status from public.approvals where id=v_approval)<>'rejected'
        or not exists(select 1 from public.workflow_tasks where workflow_id=v_workflow and type='execute_approved_actions' and status='cancelled') then raise exception 'Rejected workflow stuck'; end if;
    end if;
    begin
      perform public.edit_proposed_email(v_action_id,'After decision','Must remain immutable after a human decision.',1);
      raise exception 'Resolved draft editable'; exception when invalid_parameter_value then null; end;
    if exists(select 1 from public.agent_runs where workflow_id=v_workflow and agent_type='executor') or exists(select 1 from public.proposed_actions where workflow_id=v_workflow and status='executed') then raise exception 'Unexpected execution'; end if;
    select count(*) into v_count from public.agent_events where workflow_id=v_workflow and event_type in ('proposed_action_edited','proposed_action_approved','proposed_action_rejected');
    if v_count<>3 then raise exception 'Audit events missing'; end if;
  end loop;
  -- A legacy outreach plan gains a Reviewer prerequisite only after explicit resumption.
  insert into public.workflows(workspace_id,created_by,title,goal,status,target_companies)
    values(v_workspace,v_user,'Legacy continuation','Research and prepare outreach.','paused',1) returning id into v_workflow;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,status,position,input)
    values(v_workspace,v_workflow,'score_leads','Score','Research complete','completed',1,'{"planTaskId":"score","dependencies":[]}'),
      (v_workspace,v_workflow,'generate_outreach','Draft','Draft after review','pending',2,'{"planTaskId":"outreach","dependencies":["score"]}'),
      (v_workspace,v_workflow,'request_approval','Approval','Human gate','pending',3,'{"planTaskId":"approval","dependencies":["outreach"]}');
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  perform public.finish_research_workflow(v_workspace,v_workflow,v_user);
  if (select status from public.workflows where id=v_workflow)<>'paused'
    or exists(select 1 from public.workflow_tasks where workflow_id=v_workflow and type='review_qualified_leads') then raise exception 'Intentional pause ignored'; end if;
  update public.workflows set status='running' where id=v_workflow;
  perform public.finish_research_workflow(v_workspace,v_workflow,v_user);
  perform public.finish_research_workflow(v_workspace,v_workflow,v_user);
  if (select count(*) from public.workflow_tasks where workflow_id=v_workflow)<>5
    or not exists(select 1 from public.workflow_tasks where workflow_id=v_workflow and type='review_qualified_leads' and position=2 and input->>'runtimeAdded'='true')
    or not exists(select 1 from public.workflow_tasks where workflow_id=v_workflow and type='generate_outreach' and position=3 and input->'dependencies' ? 'stage5_review')
    or (select status from public.workflows where id=v_workflow)<>'running' then raise exception 'Legacy dependency continuation invalid'; end if;
  -- Late provider completion must respect an intentional pause.
  insert into public.workflows(workspace_id,created_by,title,goal,status,target_companies)
    values(v_workspace,v_user,'Paused preparation','Review one lead.','running',1) returning id into v_workflow;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,input)
    values(v_workspace,v_workflow,'review_qualified_leads','Review','Review evidence',1,'{"planTaskId":"review","dependencies":[]}') returning id into v_review_task;
  insert into public.companies(workspace_id,name,website) values(v_workspace,'Paused fixture','https://example.com') returning id into v_company;
  insert into public.leads(workspace_id,workflow_id,company_id,status,score,confidence,outreach_status)
    values(v_workspace,v_workflow,v_company,'qualified',80,'medium','not_started') returning id into v_lead;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  select * into v_run from public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_review_task,'reviewer','fixture',jsonb_build_object('leadId',v_lead,'companyId',v_company));
  update public.workflows set status='paused' where id=v_workflow;
  select * into v_run from public.complete_preparation_run(v_run.id,'completed','{}',null,v_metrics);
  if v_run.status<>'cancelled' or (select review_metadata from public.leads where id=v_lead) is not null
    or exists(select 1 from public.proposed_actions where workflow_id=v_workflow) then raise exception 'Late completion bypassed pause'; end if;
  update public.workflows set status='running' where id=v_workflow;
  select * into v_run from public.start_preparation_run(gen_random_uuid(),v_user,v_workspace,v_workflow,v_review_task,'reviewer','fixture',jsonb_build_object('leadId',v_lead,'companyId',v_company));
  perform public.complete_preparation_run(v_run.id,'failed',null,'{"code":"ai_invalid_output","message":"Evidence review failed validation"}',v_metrics);
  if exists(select 1 from public.agent_events where agent_run_id=v_run.id and event_type='outreach_draft_failed')
    or not exists(select 1 from public.agent_events where agent_run_id=v_run.id and event_type='agent_failed') then raise exception 'Reviewer failure misclassified as a failed draft'; end if;
  raise notice 'Stage 5 regression passed: claims, replay, dependencies, evidence linkage, missing recipients, atomic publication, edits, partial/batch decisions, audit and execution boundary.';
end;
$$;
rollback;
