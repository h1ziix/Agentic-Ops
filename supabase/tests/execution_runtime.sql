-- Transactional Release 0.6 fixtures. All provider results below are MOCKED records; no network calls.
begin;
create function pg_temp.execution_fixture(ws uuid,actor uuid,label text,items integer default 1) returns uuid language plpgsql as $$
declare wf uuid; approve uuid; draft_task uuid; company uuid; lead uuid; run uuid; i integer; body text:='A grounded proposal for a short, human-reviewed pilot.';
begin
  insert into public.workflows(workspace_id,created_by,title,goal,status,target_companies) values(ws,actor,label,'Research software companies and prepare grounded outreach.','waiting_for_approval',items) returning id into wf;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,status,input) values(ws,wf,'generate_outreach','Draft','Grounded draft',1,'completed','{}') returning id into draft_task;
  insert into public.workflow_tasks(workspace_id,workflow_id,type,title,description,position,status,input) values(ws,wf,'request_approval','Review','Human review',2,'blocked','{}'),(ws,wf,'execute_approved_actions','Execute','Explicit bounded execution',3,'pending','{}');
  insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level) values(ws,wf,'outreach','Review emails','Grounded emails','medium') returning id into approve;
  for i in 1..items loop
    insert into public.companies(workspace_id,name,website) values(ws,'Execution fixture '||label||i,'https://example.com') returning id into company;
    insert into public.leads(workspace_id,workflow_id,company_id,status,score,confidence,outreach_status) values(ws,wf,company,'waiting_approval',80,'medium','waiting_approval') returning id into lead;
    insert into public.agent_runs(workspace_id,workflow_id,workflow_task_id,agent_type,status,model,input,output) values(ws,wf,draft_task,'outreach','completed','sql-mock','{}',jsonb_build_object('draft',jsonb_build_object('body',body))) returning id into run;
    insert into public.proposed_actions(workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key)
      values(ws,wf,approve,'send_email',jsonb_build_object('companyId',company,'leadId',lead,'recipientEmail',null,'recipientName',null),
        jsonb_build_object('subject','Fixture outreach','body',body,'executionReadiness','blocked_missing_recipient','generationMetadata',jsonb_build_object('outreachRunId',run,'company',jsonb_build_object('name','Execution fixture '||label||i,'website','https://example.com')),
          'personalization',jsonb_build_object('claimsUsed','[]'::jsonb),'evidenceReferences','[]'::jsonb),'pending_approval','medium','sql-execution:'||wf::text||':'||i);
  end loop;
  return wf;
end; $$;
create function pg_temp.reject_dispatch_audit() returns trigger language plpgsql as $$ begin if new.event_type='execution_started' then raise exception 'Mock audit outage' using errcode='P0001'; end if; return new; end $$;
do $$
declare u uuid:=gen_random_uuid(); other_u uuid:=gen_random_uuid(); member_u uuid:=gen_random_uuid(); ws uuid; other_ws uuid; wf uuid; unknown_wf uuid; late_wf uuid; claim_wf uuid; exhausted_wf uuid; closed_wf uuid; failed_wf uuid;
  gmail uuid:=gen_random_uuid(); hubspot uuid:=gen_random_uuid(); other_gmail uuid:=gen_random_uuid(); conn public.integration_connections%rowtype;
  a public.proposed_actions%rowtype; b public.proposed_actions%rowtype; aux public.proposed_actions%rowtype; replacement public.proposed_actions%rowtype;
  approval uuid; snapshot uuid; t public.execution_attempts%rowtype; replay public.execution_attempts%rowtype; parent public.execution_attempts%rowtype; token uuid; plan uuid;
  request_id uuid:=gen_random_uuid(); old_digest text; n integer; fresh_claim uuid; state_hash text:=repeat('a',64); other_state text:=repeat('b',64); creds public.integration_credentials%rowtype;
begin
  -- Writer RPC and credential/state tables are never available to browser roles.
  if has_table_privilege('authenticated','public.integration_credentials','SELECT') or has_table_privilege('anon','public.integration_oauth_states','SELECT')
    or has_column_privilege('authenticated','public.execution_attempts','claim_token','SELECT')
    or has_function_privilege('authenticated','public.claim_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean)','EXECUTE')
    or has_function_privilege('anon','public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text)','EXECUTE')
    or has_function_privilege('service_role','public.claim_execution_before_claim_fencing(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean)','EXECUTE')
    or has_function_privilege('service_role','public.dispatch_execution_before_claim_fencing(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('service_role','public.finish_execution_before_claim_fencing(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text)','EXECUTE')
    or has_function_privilege('authenticated','public.resolve_outreach_actions_stage5(uuid,public.approval_status,uuid[])','EXECUTE') then raise exception 'Unsafe grants'; end if;
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@execution.invalid','{}'),(other_u,other_u::text||'@execution.invalid','{}'),(member_u,member_u::text||'@execution.invalid','{}');
  perform set_config('request.jwt.claim.sub',u::text,true); perform set_config('request.jwt.claim.role','authenticated',true); ws:=public.bootstrap_workspace();
  perform set_config('request.jwt.claim.sub',other_u::text,true); other_ws:=public.bootstrap_workspace(); perform set_config('request.jwt.claim.sub',u::text,true);
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,member_u,'member');
  perform set_config('request.jwt.claim.role','service_role',true);
  conn:=public.connect_integration(ws,u,gmail,'gmail','sender@example.com','Test sender',array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'],'sql-test-encrypted-fixture',now()+interval '1 hour');
  perform public.connect_integration(ws,u,hubspot,'hubspot','1234','Test portal',array['oauth','crm.objects.contacts.read','crm.objects.contacts.write'],'sql-test-encrypted-fixture',now()+interval '1 hour');
  perform public.connect_integration(other_ws,other_u,other_gmail,'gmail','other@example.com','Other sender',array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'],'sql-test-encrypted-fixture',now()+interval '1 hour');
  begin perform public.disconnect_integration(ws,member_u,gmail); raise exception 'Member disconnect allowed'; exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.agent_events where workspace_id=ws and workflow_id is null and event_type='integration_connected') then raise exception 'Missing workspace audit'; end if;
  begin insert into public.agent_events(workspace_id,event_type,summary) values(ws,'execution_started','Invalid workspace event'); raise exception 'Unlinked workflow event allowed'; exception when check_violation then null; end;
  -- OAuth replay, expiry, browser/session binding, verified owner and provider mismatch.
  perform public.begin_integration_oauth(ws,u,'gmail',state_hash,'browser-session-hash',gmail,'protected-verifier');
  begin perform public.consume_integration_oauth(state_hash,u,'hubspot','browser-session-hash'); raise exception 'Provider mismatch accepted'; exception when insufficient_privilege then null; end;
  begin perform public.consume_integration_oauth(state_hash,other_u,'gmail','browser-session-hash'); raise exception 'User mismatch accepted'; exception when insufficient_privilege then null; end;
  begin perform public.consume_integration_oauth(state_hash,u,'gmail','different-session'); raise exception 'Binding mismatch accepted'; exception when insufficient_privilege then null; end;
  perform public.consume_integration_oauth(state_hash,u,'gmail','browser-session-hash');
  begin perform public.consume_integration_oauth(state_hash,u,'gmail','browser-session-hash'); raise exception 'OAuth replay accepted'; exception when insufficient_privilege then null; end;
  perform public.begin_integration_oauth(ws,u,'gmail',other_state,'browser-session-hash',gmail,'protected-verifier');
  update public.workspace_members set role='member' where workspace_id=ws and user_id=u;
  begin perform public.consume_integration_oauth(other_state,u,'gmail','browser-session-hash'); raise exception 'Owner recheck skipped'; exception when insufficient_privilege then null; end;
  update public.workspace_members set role='owner' where workspace_id=ws and user_id=u;
  update public.integration_oauth_states s set expires_at=now()-interval '1 second' where s.state_hash=other_state;
  begin perform public.consume_integration_oauth(other_state,u,'gmail','browser-session-hash'); raise exception 'Expired state accepted'; exception when insufficient_privilege then null; end;
  -- Refresh claim/version/generation guards; normal refresh does not change approval identity.
  update public.integration_credentials set expires_at=now() where connection_id=gmail;
  token:=gen_random_uuid(); creds:=public.claim_integration_refresh(ws,member_u,gmail,1,token);
  begin perform public.claim_integration_refresh(ws,u,gmail,1,gen_random_uuid()); raise exception 'Concurrent refresh allowed'; exception when serialization_failure then null; end;
  begin perform public.finish_integration_refresh(ws,u,gmail,1,gen_random_uuid(),creds.version,'new-encrypted',now()+interval '1 hour'); raise exception 'Unfenced refresh allowed'; exception when serialization_failure then null; end;
  perform public.finish_integration_refresh(ws,member_u,gmail,1,token,creds.version,'new-encrypted',now()+interval '1 hour');
  if (select generation from public.integration_connections where id=gmail)<>1 then raise exception 'Refresh changed generation'; end if;
  wf:=pg_temp.execution_fixture(ws,u,'primary',2); select * into a from public.proposed_actions where workflow_id=wf order by id limit 1; select * into b from public.proposed_actions where workflow_id=wf and id<>a.id; approval:=a.approval_id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  -- Wrong workspace/connection and stale edits fail atomically; human confirmation is server-authored.
  begin perform public.save_executable_email(a.id,a.revision,'test@example.com',null,null,other_gmail,'Test','Test approved content'); raise exception 'Foreign connection accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_executable_email(a.id,a.revision,null,null,null,gmail,'Test','Test approved content'); raise exception 'Missing recipient accepted'; exception when invalid_parameter_value then null; end;
  a:=public.save_executable_email(a.id,a.revision,'test@example.com','Test user',null,gmail,'Approved subject','Exact human-approved test content.');
  b:=public.save_executable_email(b.id,b.revision,'other-test@example.com',null,null,gmail,'Second subject','Second exact approved content.');
  begin perform public.decide_action_revisions(approval,'approved',jsonb_build_array(jsonb_build_object('actionId',a.id,'revision',a.revision),jsonb_build_object('actionId',b.id,'revision',b.revision-1))); raise exception 'Stale bulk approval accepted'; exception when serialization_failure then null; end;
  if exists(select 1 from public.action_approval_snapshots where workflow_id=wf) or (select status from public.proposed_actions where id=a.id)<>'pending_approval' then raise exception 'Approval atomicity failed'; end if;
  perform public.decide_action_revisions(approval,'approved',jsonb_build_array(jsonb_build_object('actionId',a.id,'revision',a.revision),jsonb_build_object('actionId',b.id,'revision',b.revision)));
  snapshot:=(a.executable_envelope->>'snapshotId')::uuid; select digest into old_digest from public.action_approval_snapshots where id=snapshot;
  if (select approved_by from public.action_approval_snapshots where id=snapshot)<>u or exists(select 1 from public.execution_attempts where workflow_id=wf) then raise exception 'Approval actor or side-effect boundary broken'; end if;
  begin update public.action_approval_snapshots set digest=repeat('0',64) where id=snapshot; raise exception 'Snapshot changed'; exception when insufficient_privilege then null; end;
  begin update public.proposed_actions set revision=revision+1 where id=a.id; raise exception 'Approved proposal changed'; exception when insufficient_privilege then null; end;
  begin perform public.transition_workflow(wf,'running','Bypass'); raise exception 'Generic workflow bypass'; exception when invalid_parameter_value then null; end;
  begin perform public.transition_workflow_task((select id from public.workflow_tasks where workflow_id=wf and type='execute_approved_actions'),'completed','Bypass'); raise exception 'Generic task bypass'; exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid();
  begin perform public.claim_execution(ws,u,wf,a.id,snapshot,gen_random_uuid(),null); raise exception 'Missing execution capability accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.claim_execution(ws,u,wf,a.id,snapshot,gen_random_uuid(),token,null); raise exception 'Missing explicit retry intent accepted'; exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.execution_attempts where workflow_id=wf) then raise exception 'Invalid claim input mutated execution history'; end if;
  t:=public.claim_execution(ws,u,wf,a.id,snapshot,gen_random_uuid(),token);
  replay:=public.claim_execution(ws,u,wf,a.id,snapshot,gen_random_uuid(),gen_random_uuid()); if replay.id<>t.id then raise exception 'Replay duplicated claim'; end if;
  replay:=public.claim_execution(ws,u,wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),gen_random_uuid()); if replay.id<>t.id then raise exception 'Concurrent sibling claimed'; end if;
  begin perform public.dispatch_execution(ws,u,t.id,null); raise exception 'NULL capability bypassed dispatch fence'; exception when serialization_failure then null; end;
  begin perform public.dispatch_execution(ws,u,t.id,gen_random_uuid()); raise exception 'Wrong capability bypassed dispatch fence'; exception when serialization_failure then null; end;
  begin perform public.finish_execution(ws,u,t.id,null,'cancelled_before_dispatch',null,'test_claim_fence'); raise exception 'NULL capability bypassed completion fence'; exception when serialization_failure then null; end;
  begin perform public.finish_execution(ws,u,t.id,gen_random_uuid(),'cancelled_before_dispatch',null,'test_claim_fence'); raise exception 'Wrong capability bypassed completion fence'; exception when serialization_failure then null; end;
  if (select status from public.execution_attempts where id=t.id)<>'claimed'
    or exists(select 1 from public.agent_events where agent_run_id=t.executor_run_id and event_type in ('execution_started','execution_failed')) then raise exception 'Fenced caller mutated state or audit history'; end if;
  execute 'create trigger mock_dispatch_audit before insert on public.agent_events for each row execute function pg_temp.reject_dispatch_audit()';
  begin perform public.dispatch_execution(ws,u,t.id,token); raise exception 'Mock audit should fail'; exception when raise_exception then null; end;
  if (select status from public.execution_attempts where id=t.id)<>'claimed' then raise exception 'Audit failure did not roll back dispatch'; end if;
  execute 'drop trigger mock_dispatch_audit on public.agent_events';
  perform public.dispatch_execution(ws,u,t.id,token);
  begin perform public.finish_execution(ws,u,t.id,null,'succeeded','{"messageId":"mock-null-capability"}'); raise exception 'NULL capability accepted a dispatched result'; exception when serialization_failure then null; end;
  begin perform public.finish_execution(ws,u,t.id,token,'succeeded','{"unexpected":"secret"}'); raise exception 'Malformed result accepted'; exception when invalid_parameter_value then null; end;
  if (select status from public.execution_attempts where id=t.id)<>'dispatching' or (select status from public.proposed_actions where id=a.id)<>'approved' then raise exception 'Completion rollback failed'; end if;
  t:=public.finish_execution(ws,u,t.id,token,'succeeded','{"messageId":"mock-gmail-1","threadId":"mock-thread","acceptedAt":"2026-10-01T00:00:00Z"}');
  begin perform public.finish_execution(ws,u,t.id,null,'succeeded','{"messageId":"mock-null-replay"}'); raise exception 'NULL capability accepted a successful replay'; exception when serialization_failure then null; end;
  begin insert into public.execution_attempts(id,workspace_id,workflow_id,action_id,snapshot_id,connection_id,attempt_number,operation_key,executor_run_id,claim_token,lease_until,status)
    values(gen_random_uuid(),ws,wf,a.id,snapshot,gmail,2,gen_random_uuid()::text,t.executor_run_id,gen_random_uuid(),now(),'succeeded'); raise exception 'Second success allowed'; exception when unique_violation then null; end;
  replay:=public.claim_execution(ws,u,wf,a.id,snapshot,gen_random_uuid(),gen_random_uuid()); if replay.id<>t.id then raise exception 'Successful replay duplicated'; end if;
  if (select status from public.leads where id=(a.target->>'leadId')::uuid)<>'contacted' then raise exception 'Confirmed send not reflected on lead'; end if;
  token:=gen_random_uuid(); t:=public.claim_execution(ws,u,wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token); perform public.dispatch_execution(ws,u,t.id,token);
  perform public.finish_execution(ws,u,t.id,token,'failed_retryable',null,'gmail_rate_limited',60);
  if (select status from public.workflows where id=wf)<>'paused' or (select status from public.proposed_actions where id=a.id)<>'executed' then raise exception 'Partial failure lost successful sibling'; end if;
  begin perform public.claim_execution(ws,u,wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),gen_random_uuid(),true); raise exception 'Early retry allowed'; exception when invalid_parameter_value then null; end;
  for n in 2..3 loop
    update public.execution_attempts set next_retry_at=now()-interval '1 second' where id=t.id; token:=gen_random_uuid();
    t:=public.claim_execution(ws,u,wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token,true); perform public.dispatch_execution(ws,u,t.id,token); t:=public.finish_execution(ws,u,t.id,token,'failed_retryable',null,'gmail_rate_limited',0);
  end loop;
  if t.status<>'failed_terminal' or (select status from public.workflows where id=wf)<>'failed' then raise exception 'Attempt exhaustion failed'; end if;
  begin perform public.claim_execution(ws,u,wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),gen_random_uuid(),true); raise exception 'Fourth attempt allowed'; exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.role','authenticated',true);
  replacement:=public.save_executable_email(b.id,b.revision,'test@example.com',null,null,gmail,'Reviewed replacement','A new approval is required after definitive exhausted rejection.');
  if replacement.replaces_action_id<>b.id or replacement.status<>'pending_approval' or (select status from public.proposed_actions where id=a.id)<>'executed'
    or exists(select 1 from public.action_approval_snapshots where action_id=replacement.id) then raise exception 'Definitive failure replacement lost isolation'; end if;
  -- Editing is not a general escape from failed research or other terminal workflow states.
  failed_wf:=pg_temp.execution_fixture(ws,u,'failed-preparation'); select * into aux from public.proposed_actions where workflow_id=failed_wf;
  update public.workflow_tasks set status='failed' where workflow_id=failed_wf and type='generate_outreach'; update public.workflows set status='failed' where id=failed_wf;
  begin perform public.save_executable_email(aux.id,aux.revision,'test@example.com',null,null,gmail,'Forbidden reopen','Research failure cannot be hidden through the email editor.'); raise exception 'Terminal preparation bypass allowed'; exception when invalid_parameter_value then null; end;
  -- Expired dispatch is unknown; no retry or edit. Manual not-found does not remove uncertainty.
  unknown_wf:=pg_temp.execution_fixture(ws,u,'unknown'); select * into a from public.proposed_actions where workflow_id=unknown_wf;
  perform set_config('request.jwt.claim.role','authenticated',true); a:=public.save_executable_email(a.id,a.revision,'test@example.com',null,null,gmail,'Unknown test','Exact unknown outcome test content.'); perform public.decide_action_revisions(a.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',a.id,'revision',a.revision)));
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid(); t:=public.claim_execution(ws,u,unknown_wf,a.id,(a.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token); perform public.dispatch_execution(ws,u,t.id,token);
  update public.execution_attempts set lease_until=now()-interval '1 second' where id=t.id; perform public.recover_execution_claims(ws,u,unknown_wf);
  begin perform public.claim_execution(ws,u,unknown_wf,a.id,(a.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),gen_random_uuid(),true); raise exception 'Unknown blind retry allowed'; exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin perform public.save_executable_email(a.id,a.revision,'changed@example.com',null,null,gmail,'New recipient','Replacement blocked while outcome unknown.'); raise exception 'Uncertain replacement allowed'; exception when invalid_parameter_value then null; end;
  t:=public.reconcile_email_outcome(t.id,'not_found','Checked Sent manually; could not establish absence.'); if t.status<>'outcome_unknown' or t.verification_method<>'unresolved' then raise exception 'Not found cleared uncertainty'; end if;
  parent:=public.reconcile_email_outcome(t.id,'user_confirmed','Found exact Message-ID in my controlled test Sent folder.');
  if parent.verification_method<>'user_confirmed' or parent.reconciled_by<>u or (select status from public.workflows where id=unknown_wf)<>'completed' then raise exception 'Manual confirmation not distinguished'; end if;
  -- Explicit uncertain closure grants no success or resend rights. A new proposal/approval is mandatory.
  closed_wf:=pg_temp.execution_fixture(ws,u,'closed-unknown'); select * into aux from public.proposed_actions where workflow_id=closed_wf;
  aux:=public.save_executable_email(aux.id,aux.revision,'test@example.com',null,null,gmail,'Closed unknown','A replacement may duplicate a previously accepted email.');
  perform public.decide_action_revisions(aux.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',aux.id,'revision',aux.revision)));
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid(); t:=public.claim_execution(ws,u,closed_wf,aux.id,(aux.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token); perform public.dispatch_execution(ws,u,t.id,token);
  t:=public.finish_execution(ws,u,t.id,token,'outcome_unknown',null,'gmail_acceptance_unknown');
  perform set_config('request.jwt.claim.role','authenticated',true); t:=public.reconcile_email_outcome(t.id,'close_for_replacement','Checked Gmail Sent; accept duplicate risk only after new review.');
  if t.status<>'outcome_unknown' or t.verification_method<>'closed_for_replacement' or t.retry_eligible then raise exception 'Closure fabricated execution permission'; end if;
  replacement:=public.save_executable_email(aux.id,aux.revision,'changed@example.com',null,null,gmail,'Newly reviewed recipient','New recipient and duplicate risk require a new immutable approval.');
  if replacement.replaces_action_id<>aux.id or exists(select 1 from public.action_approval_snapshots where action_id=replacement.id) then raise exception 'Closed unknown inherited approval'; end if;
  -- Completed core admits independently approved auxiliary CRM and internal plans only.
  begin perform public.propose_crm_contact(a.id,a.revision,hubspot,'{"lifecyclestage":"customer"}','{"lifecyclestage":null}',null,now(),gen_random_uuid()); raise exception 'Forbidden CRM field allowed'; exception when invalid_parameter_value then null; end;
  aux:=public.propose_crm_contact(a.id,a.revision,hubspot,'{"firstname":"Test"}','{"firstname":null}',null,now(),request_id);
  replacement:=public.propose_crm_contact(a.id,a.revision,hubspot,'{"firstname":"Test"}','{"firstname":null}',null,now(),request_id); if replacement.id<>aux.id then raise exception 'CRM proposal replay duplicated'; end if;
  if exists(select 1 from public.action_approval_snapshots where action_id=aux.id) then raise exception 'CRM inherited email permission'; end if;
  perform public.decide_action_revisions(aux.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',aux.id,'revision',aux.revision)));
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid(); t:=public.claim_execution(ws,u,unknown_wf,aux.id,(aux.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token); perform public.dispatch_execution(ws,u,t.id,token); perform public.finish_execution(ws,u,t.id,token,'succeeded','{"contactId":"42"}');
  if (select status from public.workflows where id=unknown_wf)<>'completed' then raise exception 'Auxiliary CRM reopened core'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin perform public.propose_follow_up(parent.id,now()-interval '1 day','UTC',null,gen_random_uuid()); raise exception 'Past plan allowed'; exception when invalid_parameter_value then null; end;
  aux:=public.propose_follow_up(parent.id,now()+interval '1 day','Asia/Qyzylorda','Internal plan; no automatic email.',request_id);
  replacement:=public.propose_follow_up(parent.id,now()+interval '1 day','Asia/Qyzylorda',null,request_id); if replacement.id<>aux.id then raise exception 'Plan proposal replay duplicated'; end if;
  perform public.decide_action_revisions(aux.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',aux.id,'revision',aux.revision)));
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid(); t:=public.claim_execution(ws,u,unknown_wf,aux.id,(aux.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token); perform public.dispatch_execution(ws,u,t.id,token);
  update public.execution_attempts set lease_until=now()-interval '1 second' where id=t.id; perform public.recover_execution_claims(ws,u,unknown_wf);
  if (select status from public.execution_attempts where id=t.id)<>'failed_retryable' or exists(select 1 from public.follow_up_plans where action_id=aux.id)
    then raise exception 'Internal absence recovery confused with external uncertainty'; end if;
  token:=gen_random_uuid(); t:=public.claim_execution(ws,u,unknown_wf,aux.id,(aux.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token,true); perform public.dispatch_execution(ws,u,t.id,token);
  perform public.finish_execution(ws,u,t.id,token,'succeeded','{}',null,0,'internal_transaction'); perform public.finish_execution(ws,u,t.id,token,'succeeded','{}',null,0,'internal_transaction');
  if (select count(*) from public.follow_up_plans where action_id=aux.id)<>1 then raise exception 'Duplicate saved plan'; end if;
  select id into plan from public.follow_up_plans where action_id=aux.id; perform set_config('request.jwt.claim.role','authenticated',true); perform public.cancel_follow_up(plan);
  if (select status from public.follow_up_plans where id=plan)<>'cancelled' then raise exception 'Plan cancellation not persisted'; end if;
  replacement:=public.propose_follow_up(parent.id,now()+interval '2 days','Asia/Qyzylorda','New date needs new approval.',gen_random_uuid(),aux.id);
  if replacement.lineage_id<>aux.lineage_id or replacement.status<>'pending_approval' or exists(select 1 from public.action_approval_snapshots where action_id=replacement.id) then raise exception 'Plan reschedule inherited approval'; end if;
  aux:=public.propose_crm_contact(a.id,a.revision,hubspot,'{"firstname":"Another test"}','{"firstname":"Test"}','42',now(),gen_random_uuid());
  replacement:=public.propose_crm_contact(a.id,a.revision,hubspot,'{"firstname":"Fresh approved preview"}','{"firstname":"External change"}','42',now(),gen_random_uuid(),aux.id);
  if replacement.lineage_id<>aux.lineage_id or (select status from public.proposed_actions where id=aux.id)<>'cancelled' then raise exception 'CRM replacement lifecycle failed'; end if;
  -- Late provider acceptance persists after cancellation; next sibling cannot dispatch.
  late_wf:=pg_temp.execution_fixture(ws,u,'late',2); select * into a from public.proposed_actions where workflow_id=late_wf order by id limit 1; select * into b from public.proposed_actions where workflow_id=late_wf and id<>a.id;
  a:=public.save_executable_email(a.id,a.revision,'test@example.com',null,null,gmail,'Late test','Exact content for cancellation scenario.'); b:=public.save_executable_email(b.id,b.revision,'test@example.com',null,null,gmail,'Late sibling','Must never dispatch after cancellation.');
  perform public.decide_action_revisions(a.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',a.id,'revision',a.revision),jsonb_build_object('actionId',b.id,'revision',b.revision)));
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid(); t:=public.claim_execution(ws,u,late_wf,a.id,(a.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token); perform public.dispatch_execution(ws,u,t.id,token);
  perform set_config('request.jwt.claim.role','authenticated',true); perform public.transition_workflow(late_wf,'cancelled','User cancelled during bounded provider request'); perform set_config('request.jwt.claim.role','service_role',true);
  perform public.finish_execution(ws,u,t.id,token,'succeeded','{"messageId":"mock-late"}'); if (select status from public.workflows where id=late_wf)<>'cancelled' then raise exception 'Late success reopened cancellation'; end if;
  begin perform public.claim_execution(ws,u,late_wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),gen_random_uuid()); raise exception 'Cancelled sibling dispatched'; exception when invalid_parameter_value then null; end;
  begin perform public.finish_execution(other_ws,other_u,t.id,token,'succeeded','{"messageId":"cross-workspace"}'); raise exception 'Foreign completion accepted'; exception when no_data_found then null; end;
  begin insert into public.agent_events(workspace_id,workflow_id,event_type,summary) values(other_ws,late_wf,'execution_started','Cross workspace'); raise exception 'Composite workflow audit FK broken'; exception when foreign_key_violation then null; end;
  -- Expired pre-dispatch claim is safely recovered; reconnect invalidates old authorization generation.
  claim_wf:=pg_temp.execution_fixture(ws,u,'claim'); select * into a from public.proposed_actions where workflow_id=claim_wf; perform set_config('request.jwt.claim.role','authenticated',true);
  a:=public.save_executable_email(a.id,a.revision,'test@example.com',null,null,gmail,'Claim test','Exact pre-dispatch recovery scenario.'); perform public.decide_action_revisions(a.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',a.id,'revision',a.revision)));
  perform set_config('request.jwt.claim.role','service_role',true); token:=gen_random_uuid(); t:=public.claim_execution(ws,u,claim_wf,a.id,(a.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),token);
  update public.execution_attempts set lease_until=now()-interval '1 second' where id=t.id; perform public.recover_execution_claims(ws,u,claim_wf);
  if (select status from public.execution_attempts where id=t.id)<>'cancelled_before_dispatch' then raise exception 'Expired claim not safely recovered'; end if;
  fresh_claim:=gen_random_uuid(); replay:=public.claim_execution(ws,u,claim_wf,a.id,(a.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),fresh_claim,true); if replay.attempt_number<>2 then raise exception 'Safe claim retry failed'; end if;
  begin perform public.dispatch_execution(ws,u,replay.id,token); raise exception 'Old claim fenced incorrectly'; exception when serialization_failure then null; end;
  -- All three failed claims remain bounded even when credentials/preview block HTTP.
  perform public.finish_execution(ws,u,replay.id,fresh_claim,'cancelled_before_dispatch',null,'execution_pre_dispatch_blocked');
  fresh_claim:=gen_random_uuid(); replay:=public.claim_execution(ws,u,claim_wf,a.id,(a.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),fresh_claim,true);
  perform public.finish_execution(ws,u,replay.id,fresh_claim,'cancelled_before_dispatch',null,'execution_pre_dispatch_blocked');
  if (select status from public.workflows where id=claim_wf)<>'failed' or (select status from public.workflow_tasks where workflow_id=claim_wf and type='execute_approved_actions')<>'failed'
    then raise exception 'Exhausted pre-dispatch claim was only paused'; end if;
  -- Reconnection blocks a fresh, approved snapshot before any claim and preserves core progress.
  exhausted_wf:=pg_temp.execution_fixture(ws,u,'reconnect-blocked'); select * into b from public.proposed_actions where workflow_id=exhausted_wf;
  perform set_config('request.jwt.claim.role','authenticated',true); b:=public.save_executable_email(b.id,b.revision,'test@example.com',null,null,gmail,'Generation test','An approval cannot silently substitute a new mailbox.');
  perform public.decide_action_revisions(b.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',b.id,'revision',b.revision)));
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.disconnect_integration(ws,u,gmail); if exists(select 1 from public.integration_credentials where connection_id=gmail) then raise exception 'Credentials retained after disconnect'; end if;
  perform public.connect_integration(ws,u,gmail,'gmail','changed@example.com','Changed mailbox',array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'],'new-fixture',now()+interval '1 hour');
  perform public.recover_execution_claims(ws,u,exhausted_wf);
  if (select status from public.workflows where id=exhausted_wf)<>'paused' or (select progress from public.workflows where id=exhausted_wf)=100 then raise exception 'Reconnect did not block workflow readiness'; end if;
  begin perform public.claim_execution(ws,u,exhausted_wf,b.id,(b.executable_envelope->>'snapshotId')::uuid,gen_random_uuid(),gen_random_uuid()); raise exception 'New mailbox substituted into old approval'; exception when invalid_parameter_value then null; end;
  -- Historical loose v1 stays readable; its content-only approval confers no dispatch rights.
  wf:=pg_temp.execution_fixture(ws,u,'legacy'); select * into a from public.proposed_actions where workflow_id=wf; update public.proposed_actions set payload='{"subject":"historical loose JSON"}' where id=a.id;
  perform set_config('request.jwt.claim.role','authenticated',true); perform public.resolve_outreach_actions(a.approval_id,'approved',array[a.id]); perform set_config('request.jwt.claim.role','service_role',true);
  begin perform public.claim_execution(ws,u,wf,a.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid()); raise exception 'Legacy dispatch allowed'; exception when serialization_failure then null; end;
  -- RLS actually runs under browser role, not merely postgres with a claimed JWT.
  perform set_config('request.jwt.claim.sub',other_u::text,true); perform set_config('request.jwt.claim.role','authenticated',true); execute 'set local role authenticated';
  if exists(select 1 from public.integration_connections where workspace_id=ws) or exists(select 1 from public.action_approval_snapshots where workspace_id=ws)
    or exists(select 1 from public.execution_attempts where workspace_id=ws) or exists(select 1 from public.follow_up_plans where workspace_id=ws) or exists(select 1 from public.agent_events where workspace_id=ws)
    then raise exception 'Two-workspace RLS failed'; end if;
  begin perform public.save_executable_email(a.id,a.revision,'test@example.com',null,null,gmail,'Foreign','Foreign mutation should not succeed.'); raise exception 'Cross-workspace edit allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise notice 'Release 0.6 SQL regression passed: OAuth/refresh guards, grants/RLS, snapshots, atomicity, claims/replay, fencing, unknown recovery, retries, cancellation, auxiliary independence, follow-up uniqueness and legacy compatibility. No provider calls.';
end; $$;
rollback;
