-- Explicit mocked fixtures; no provider request. Every assertion and fixture rolls back.
begin;
create function pg_temp.automation_parent(p_ws uuid,p_actor uuid,p_connection uuid) returns uuid language plpgsql as $$
declare wf uuid:=gen_random_uuid();company uuid:=gen_random_uuid();lead uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();
  approval uuid:=gen_random_uuid();run uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();plan uuid:=gen_random_uuid();plan_action uuid:=gen_random_uuid();plan_snapshot uuid:=gen_random_uuid();
  e jsonb;meta jsonb;payload jsonb;follow jsonb;
begin
  insert into public.workflows(id,workspace_id,created_by,title,goal,status,progress) values(wf,p_ws,p_actor,'Automation fixture','Test deterministic automation safeguards','completed',100);
  insert into public.companies(id,workspace_id,name,website) values(company,p_ws,'Automation SQL fixture','https://example.com');
  insert into public.leads(id,workspace_id,workflow_id,company_id,status,outreach_status) values(lead,p_ws,wf,company,'contacted','sent');
  meta:=jsonb_build_object('researchRunId',gen_random_uuid(),'reviewerRunId',gen_random_uuid(),'outreachRunId',gen_random_uuid(),'taskId',gen_random_uuid(),'version',1,'model','mock-model','generationSummary','Accepted public evidence',
    'company',jsonb_build_object('name','Automation SQL fixture','website','https://example.com'));
  payload:=jsonb_build_object('subject','Original approved message','body','Original exact approved SQL test email content.','generationMetadata',meta,
    'personalization',jsonb_build_object('angle','Test automation','isHypothesis',true,'claimsUsed',jsonb_build_array(jsonb_build_object('claim','Public service','sourceUrl','https://example.com','quote','Public service'))),
    'evidenceReferences',jsonb_build_array(jsonb_build_object('claim','Public service','sourceUrl','https://example.com','quote','Public service'),jsonb_build_object('claim','Supported second service','sourceUrl','https://example.com/services','quote','Supported second service')),'warnings','[]'::jsonb,'executionReadiness','ready');
  meta:=meta||jsonb_build_object('review',jsonb_build_object('usableEvidence',payload->'evidenceReferences'));
  payload:=jsonb_set(payload,'{generationMetadata}',meta);payload:=jsonb_set(payload,'{personalization,claimsUsed}',payload->'evidenceReferences');
  e:=jsonb_build_object('schemaVersion',2,'actionType','send_email','workspaceId',p_ws,'workflowId',wf,'actionId',aid,'snapshotId',sid,'revision',1,'lineageId',aid,'companyId',company,'leadId',lead,
    'recipient',jsonb_build_object('email','recipient@example.com','name','Test recipient','role',null,'provenance','user_supplied','confirmedBy',p_actor,'confirmedAt',now()-interval '1 day'),
    'connection',jsonb_build_object('provider','gmail','id',p_connection,'generation',1,'identity','sender@example.com'),'subject',payload->>'subject','body',payload->>'body',
    'provenance',jsonb_build_object('generationMetadata',meta,'personalization',payload->'personalization','evidenceReferences',payload->'evidenceReferences'));
  insert into public.approvals(id,workspace_id,workflow_id,type,title,status) values(approval,p_ws,wf,'outreach','Approved original','executed');
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,revision)
    values(aid,p_ws,wf,approval,'send_email',jsonb_build_object('leadId',lead,'companyId',company,'recipientEmail','recipient@example.com','recipientName','Test recipient'),payload,'executed','medium','parent:'||aid::text,2,e,aid,1);
  insert into public.action_approval_snapshots(id,workspace_id,workflow_id,action_id,revision,schema_version,action_type,connection_id,authorization_generation,envelope,digest,approved_by)
    values(sid,p_ws,wf,aid,1,2,'send_email',p_connection,1,e,public.action_envelope_digest(e),p_actor);
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,started_at,completed_at) values(run,p_ws,wf,'executor','completed',now()-interval '1 day',now()-interval '1 day');
  insert into public.execution_attempts(id,workspace_id,workflow_id,action_id,snapshot_id,connection_id,attempt_number,operation_key,executor_run_id,claim_token,lease_until,status,claimed_at,dispatched_at,completed_at,result,verification_method)
    values(attempt,p_ws,wf,aid,sid,p_connection,1,attempt::text,run,gen_random_uuid(),now()-interval '1 day','succeeded',now()-interval '1 day',now()-interval '1 day',now()-interval '1 day',
      jsonb_build_object('messageId','mock-original-'||aid::text,'threadId','mock-thread-'||aid::text,'acceptedAt',now()-interval '1 day'),'provider_response');
  follow:=jsonb_build_object('schemaVersion',2,'actionType','schedule_follow_up','workspaceId',p_ws,'workflowId',wf,'actionId',plan_action,'snapshotId',plan_snapshot,'lineageId',plan_action,'revision',1,
    'parentAttemptId',attempt,'parentActionId',aid,'dueAt',now()-interval '1 minute','timezone','Asia/Qyzylorda','note','SQL test internal follow-up');
  insert into public.approvals(id,workspace_id,workflow_id,type,title,status) values(gen_random_uuid(),p_ws,wf,'auxiliary_follow_up','Saved internal follow-up','executed') returning id into approval;
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision)
    values(plan_action,p_ws,wf,approval,'schedule_follow_up',jsonb_build_object('leadId',lead,'companyId',company),'{}','executed','low','plan:'||plan::text,2,follow,plan_action,true,1);
  insert into public.action_approval_snapshots(id,workspace_id,workflow_id,action_id,revision,schema_version,action_type,envelope,digest,approved_by)
    values(plan_snapshot,p_ws,wf,plan_action,1,2,'schedule_follow_up',follow,public.action_envelope_digest(follow),p_actor);
  insert into public.follow_up_plans(id,workspace_id,workflow_id,action_id,snapshot_id,parent_attempt_id,due_at,timezone,note)
    values(plan,p_ws,wf,plan_action,plan_snapshot,attempt,now()-interval '1 minute','Asia/Qyzylorda','SQL test internal follow-up');
  return plan;
end; $$;
create function pg_temp.reject_automation_audit() returns trigger language plpgsql as $$
begin if new.event_type='automation_scheduled' then raise exception 'Mock audit outage';end if;return new;end; $$;

do $$
declare u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();ws uuid;other_ws uuid;wf uuid:=gen_random_uuid();other_wf uuid:=gen_random_uuid();
  connection uuid:=gen_random_uuid();j public.automation_jobs%rowtype;replay public.automation_jobs%rowtype;token uuid;old_token uuid;plan uuid;p public.follow_up_plans%rowtype;
  original public.proposed_actions%rowtype;draft public.proposed_actions%rowtype;replacement public.proposed_actions%rowtype;metrics jsonb;e jsonb;reply public.reply_observations%rowtype;
  n integer;audit_before integer;parent public.execution_attempts%rowtype;failed_run public.agent_runs%rowtype;failed_replay public.agent_runs%rowtype;bad_envelope jsonb;
begin
  if has_column_privilege('authenticated','public.automation_jobs','claim_token','SELECT')
    or has_column_privilege('authenticated','public.automation_jobs','lease_until','SELECT')
    or has_column_privilege('authenticated','public.automation_jobs','dispatch_failure_count','SELECT')
    or has_table_privilege('authenticated','public.automation_jobs','INSERT')
    or has_function_privilege('authenticated','public.claim_automation_job(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.reconcile_automation_provider(uuid,uuid,uuid,text,text)','EXECUTE')
    or has_function_privilege('anon','public.schedule_automation_job(uuid,uuid,uuid,text,timestamptz,text,jsonb,uuid,uuid,uuid,uuid,integer)','EXECUTE') then raise exception 'Unsafe automation grants';end if;
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@automation.invalid','{}'),(other_u,other_u::text||'@automation.invalid','{}');
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);ws:=public.bootstrap_workspace();
  perform set_config('request.jwt.claim.sub',other_u::text,true);other_ws:=public.bootstrap_workspace();perform set_config('request.jwt.claim.sub',u::text,true);
  insert into public.workflows(id,workspace_id,created_by,title,goal,status) values(wf,ws,u,'Continue fixture','Test safe continuation','running'),(other_wf,other_ws,other_u,'Other fixture','Test isolation','running');
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.schedule_automation_job(other_ws,other_u,other_wf,'workflow_continue',now(),'other-workspace-job');
  begin perform public.schedule_automation_job(ws,other_u,wf,'workflow_continue',now(),'foreign');raise exception 'Cross-workspace schedule accepted';exception when insufficient_privilege then null;end;
  begin perform public.schedule_automation_job(ws,u,other_wf,'workflow_continue',now(),'foreign-workflow');raise exception 'Foreign workflow accepted';exception when no_data_found then null;end;
  begin perform public.schedule_automation_job(ws,u,wf,'workflow_continue',now(),'unsafe-input','{"body":"secret raw content"}');raise exception 'Unbounded input accepted';exception when invalid_parameter_value then null;end;
  execute 'create trigger reject_automation_audit before insert on public.agent_events for each row execute function pg_temp.reject_automation_audit()';
  begin perform public.schedule_automation_job(ws,u,wf,'workflow_continue',now(),'audit-fail');raise exception 'Expected audit rejection';exception when raise_exception then null;end;
  if exists(select 1 from public.automation_jobs where idempotency_key='audit-fail') then raise exception 'Schedule not atomic with audit';end if;
  execute 'drop trigger reject_automation_audit on public.agent_events';
  j:=public.schedule_automation_job(ws,u,wf,'workflow_continue',now(),'logical-continue','{"iteration":0,"scope":"research"}');
  replay:=public.schedule_automation_job(ws,u,wf,'workflow_continue',now()+interval '1 second','logical-continue','{"iteration":0,"scope":"research"}');
  if replay.id<>j.id then raise exception 'Idempotency duplicated job';end if;
  begin perform public.schedule_automation_job(ws,u,wf,'workflow_continue',now(),'logical-continue','{"iteration":1}');raise exception 'Mismatched idempotency accepted';exception when serialization_failure then null;end;
  j:=public.bind_automation_provider(ws,u,j.id,'mock-provider-1');token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);
  replay:=public.claim_automation_job(ws,u,j.id,gen_random_uuid());if replay.id<>j.id or replay.claim_token<>token or replay.attempt_count<>1 then raise exception 'Duplicate delivery claimed twice';end if;
  begin perform public.finish_automation_job(ws,u,j.id,gen_random_uuid(),'completed','{}');raise exception 'Wrong claim accepted';exception when serialization_failure then null;end;
  j:=public.finish_automation_job(ws,u,j.id,token,'completed','{"continue":true,"scope":"research","inProgress":true}');
  if j.status<>'completed' or not exists(select 1 from public.automation_jobs where idempotency_key=j.id::text||':next' and input->>'iteration'='1') then raise exception 'Atomic continuation missing';end if;
  replay:=public.finish_automation_job(ws,u,j.id,token,'completed','{"continue":true,"scope":"research"}');
  if (select count(*) from public.automation_jobs where idempotency_key=j.id::text||':next')<>1 then raise exception 'Completion replay duplicated continuation';end if;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now(),'retry-policy');token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);
  j:=public.finish_automation_job(ws,u,j.id,token,'failed',null,'network','mock_network','Safe mocked network failure',true,now()+interval '1 minute');
  if j.status<>'retry_scheduled' or j.provider_job_id is not null or j.attempt_count<>1 then raise exception 'Transient retry not persisted';end if;
  begin perform public.claim_automation_job(ws,u,j.id,gen_random_uuid());raise exception 'Early retry accepted';exception when invalid_parameter_value then null;end;
  for n in 2..3 loop
    update public.automation_jobs set scheduled_for=now()-interval '1 second',next_retry_at=now()-interval '1 second' where id=j.id;
    token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);j:=public.finish_automation_job(ws,u,j.id,token,'failed',null,'network','mock_network','Safe mocked network failure',true,now()+interval '1 minute');
  end loop;
  if j.status<>'failed' or j.retryable or j.attempt_count<>3 then raise exception 'Retry exhaustion incorrect';end if;
  begin perform public.retry_automation_job(ws,u,j.id);raise exception 'Fourth retry accepted';exception when invalid_parameter_value then null;end;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now(),'permanent');token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);
  j:=public.finish_automation_job(ws,u,j.id,token,'failed',null,'provider_auth','reconnect_required','Owner reconnection required',true,now()+interval '1 minute');
  if j.retryable or j.status<>'failed' then raise exception 'Permanent error auto-retried';end if;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now()+interval '1 day','bound-future');
  j:=public.bind_automation_provider(ws,u,j.id,'mock-future-provider');replay:=public.reconcile_automation_provider(ws,u,j.id,'mock-future-provider','CANCELED');
  if replay.provider_job_id<>j.provider_job_id or replay.dispatch_failure_count<>0 then raise exception 'Future provider binding recovered early';end if;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now(),'bound-callback');j:=public.bind_automation_provider(ws,u,j.id,'mock-callback-1');
  begin perform public.reconcile_automation_provider(ws,other_u,j.id,j.provider_job_id,'FAILED');raise exception 'Foreign actor provider recovery accepted';exception when insufficient_privilege then null;end;
  begin perform public.reconcile_automation_provider(ws,u,j.id,j.provider_job_id,'EXECUTING');raise exception 'Active provider recovered';exception when invalid_parameter_value then null;end;
  replay:=public.reconcile_automation_provider(ws,u,j.id,'old-unrelated-provider','FAILED');if replay.dispatch_failure_count<>0 then raise exception 'Unrelated run recovered job';end if;
  j:=public.reconcile_automation_provider(ws,u,j.id,'mock-callback-1','FAILED');
  if j.status<>'retry_scheduled' or j.provider_job_id is not null or j.dispatch_failure_count<>1 or j.attempt_count<>0 or j.scheduled_for<=now() then raise exception 'Unclaimed callback recovery unsafe';end if;
  replay:=public.reconcile_automation_provider(ws,u,j.id,'mock-callback-1','FAILED');if replay.dispatch_failure_count<>1 then raise exception 'Provider recovery replay consumed budget';end if;
  for n in 2..3 loop
    update public.automation_jobs set scheduled_for=now()-interval '1 second',next_retry_at=now()-interval '1 second' where id=j.id;
    j:=public.bind_automation_provider(ws,u,j.id,'mock-callback-'||n::text);j:=public.reconcile_automation_provider(ws,u,j.id,'mock-callback-'||n::text,'CRASHED');
  end loop;
  if j.status<>'failed' or j.retryable or j.dispatch_failure_count<>3 or j.attempt_count<>0 then raise exception 'Provider dispatch recovery unbounded';end if;
  begin perform public.retry_automation_job(ws,u,j.id);raise exception 'Dispatch budget bypassed manually';exception when invalid_parameter_value then null;end;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now(),'bound-claimed');j:=public.bind_automation_provider(ws,u,j.id,'mock-claimed-provider');
  token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);replay:=public.reconcile_automation_provider(ws,u,j.id,'mock-claimed-provider','COMPLETED');
  if replay.status<>'running' or replay.claim_token<>token or replay.dispatch_failure_count<>0 then raise exception 'Claim raced with queued reconciliation';end if;
  perform public.finish_automation_job(ws,u,j.id,token,'completed','{}');
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now(),'bounded-api-dispatch');
  for n in 1..3 loop
    j:=public.mark_automation_dispatch_failure(ws,u,j.id);
    if n<3 then j:=public.retry_automation_job(ws,u,j.id);end if;
  end loop;
  if j.retryable or j.dispatch_failure_count<>3 or j.attempt_count<>0 then raise exception 'Scheduler API failure retry unbounded';end if;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now(),'dispatch-failure');j:=public.mark_automation_dispatch_failure(ws,u,j.id);
  if j.status<>'failed' or not j.retryable or j.attempt_count<>0 then raise exception 'Scheduling failure lost';end if;
  j:=public.retry_automation_job(ws,u,j.id);if j.status<>'retry_scheduled' or j.attempt_count<>0 then raise exception 'Manual retry duplicated logical job';end if;
  update public.automation_jobs set scheduled_for=now()-interval '1 second',next_retry_at=now()-interval '1 second' where id=j.id;
  token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);old_token:=token;
  update public.automation_jobs set lease_until=now()-interval '1 second' where id=j.id;n:=public.recover_automation_jobs(ws,u,wf);
  select * into j from public.automation_jobs where id=j.id;
  if n<>1 or j.status<>'retry_scheduled' or j.claim_token is not null then raise exception 'Stale safe recovery incorrect';end if;
  begin perform public.finish_automation_job(ws,u,j.id,old_token,'completed','{}');raise exception 'Stale worker result accepted';exception when serialization_failure then null;end;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now()+interval '1 day','cancel');audit_before:=(select count(*) from public.agent_events where event_type='automation_cancelled' and metadata->>'job_id'=j.id::text);
  j:=public.cancel_automation_job(ws,u,j.id);replay:=public.cancel_automation_job(ws,u,j.id);
  if j.status<>'cancelled' or (select count(*) from public.agent_events where event_type='automation_cancelled' and metadata->>'job_id'=j.id::text)<>audit_before+1 then raise exception 'Cancellation nonidempotent';end if;
  j:=public.schedule_automation_job(ws,u,wf,'workflow_health_check',now()+interval '1 day','workflow-cancel');
  perform set_config('request.jwt.claim.role','authenticated',true);perform public.transition_workflow(wf,'cancelled','Cancel SQL workflow');
  perform public.transition_workflow(wf,'cancelled','Repeated cancellation');
  if (select status from public.automation_jobs where id=j.id)<>'cancelled' or not exists(select 1 from public.automation_jobs where workflow_id=wf and status='completed') then raise exception 'Workflow cancellation lost history or future job';end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.connect_integration(ws,u,connection,'gmail','sender@example.com','Mock sender',array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'],'explicit-sql-fixture',now()+interval '1 hour');
  plan:=pg_temp.automation_parent(ws,u,connection);select * into p from public.follow_up_plans where id=plan;select * into parent from public.execution_attempts where id=p.parent_attempt_id;select * into original from public.proposed_actions where id=parent.action_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,other_u,'member');
  begin perform public.schedule_automation_job(ws,other_u,p.workflow_id,'followup_due',now(),'other-member-followup:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);raise exception 'Unrelated member became followup actor';exception when insufficient_privilege then null;end;
  if exists(select 1 from public.automation_jobs where idempotency_key='other-member-followup:'||plan::text) or (select automation_status from public.follow_up_plans where id=plan)<>'inactive' then raise exception 'Actor rejection was not atomic';end if;
  begin perform public.schedule_automation_job(ws,u,p.workflow_id,'external_action_retry',now(),'unsafe-success','{}',null,p.lead_id,original.id);raise exception 'Successful external action scheduled for resend';exception when invalid_parameter_value then null;end;
  j:=public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now(),'followup:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);
  token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);perform public.mark_automation_followup(ws,u,plan,token,'due');perform public.mark_automation_followup(ws,u,plan,token,'drafting');
  if (select last_checked_at from public.follow_up_plans where id=plan) is not null then raise exception 'Draft eligibility fabricated mailbox check';end if;
  e:=original.executable_envelope||jsonb_build_object('actionId',gen_random_uuid(),'snapshotId',gen_random_uuid(),'lineageId',gen_random_uuid(),'subject','Follow-up test','body','No response has been detected. This is a fresh SQL test draft requiring approval.');
  e:=jsonb_set(e,'{lineageId}',e->'actionId');e:=jsonb_set(e,'{provenance,generationMetadata,outreachRunId}',to_jsonb(gen_random_uuid()::text));
  e:=jsonb_set(e,'{provenance,evidenceReferences}',jsonb_build_array(e#>'{provenance,evidenceReferences,0}'));
  e:=jsonb_set(e,'{provenance,personalization,claimsUsed}',e#>'{provenance,evidenceReferences}');
  metrics:='{"model":"mock-model","durationMs":12,"retryCount":0,"inputTokens":null,"outputTokens":null,"totalTokens":null,"cachedInputTokens":null,"reasoningTokens":null,"usageStatus":"unknown","usageObservationCount":0,"usageMissingCount":1,"estimatedCostUsd":null,"costStatus":"unknown","pricingVersion":null}';
  failed_run:=public.fail_automation_followup_run(ws,u,j.id,token,gen_random_uuid(),metrics||'{"inputTokens":20,"outputTokens":5,"totalTokens":25,"usageStatus":"complete","usageObservationCount":1,"usageMissingCount":0,"estimatedCostUsd":0.001,"costStatus":"estimated","pricingVersion":"sql-test"}',
    '{"code":"mock_timeout","message":"Explicit mocked provider failure","category":"timeout"}');
  failed_replay:=public.fail_automation_followup_run(ws,u,j.id,token,gen_random_uuid(),metrics,'{"code":"mock_timeout","message":"Explicit mocked provider failure","category":"timeout"}');
  if failed_run.id<>failed_replay.id or failed_run.total_tokens<>25 or failed_run.estimated_cost_usd<>0.001 or failed_run.input?'claimToken'
    or failed_run.input->>'claimHash'!~'^[0-9a-f]{64}$' then raise exception 'Failed paid usage or private claim guard lost';end if;
  if failed_run.input->>'replyStatus' is distinct from 'unavailable'
    or (select input->>'summary' from public.agent_run_observations_07 where id=failed_run.id) is distinct from 'Saved message and company evidence; reply monitoring unavailable'
    then raise exception 'Failed send-only preparation fabricated checked no-reply';end if;
  -- other_u is now a workspace member for the actor-reassignment fixture above.
  -- Membership passes; the original stored actor/claim guard rejects with 40001.
  if j.actor_id<>u then raise exception 'Failure fixture lost original worker actor';end if;
  begin perform public.fail_automation_followup_run(ws,other_u,j.id,token,gen_random_uuid(),metrics,'{"code":"mock_timeout","message":"Foreign actor","category":"timeout"}');raise exception 'Foreign actor failure recording accepted';exception when serialization_failure then null;end;
  bad_envelope:=jsonb_set(e,'{provenance,evidenceReferences}','[{"claim":"Invented unsupported fact","sourceUrl":"https://example.com","quote":"Unknown"}]');
  bad_envelope:=jsonb_set(bad_envelope,'{provenance,personalization,claimsUsed}',bad_envelope#>'{provenance,evidenceReferences}');
  begin perform public.publish_followup_draft(ws,u,plan,token,bad_envelope,metrics);raise exception 'Unsupported followup evidence accepted';exception when invalid_parameter_value then null;end;
  draft:=public.publish_followup_draft(ws,u,plan,token,e,metrics);
  if (select input->>'replyStatus' from public.agent_runs where id=(e#>>'{provenance,generationMetadata,outreachRunId}')::uuid)<>'unavailable'
    or not exists(select 1 from public.approvals where id=draft.approval_id and description like '%monitoring is unavailable%') then raise exception 'Missing read scope presented as checked no-reply';end if;
  -- Crash after atomic publish, before job completion. Recovery must reuse the saved draft.
  update public.automation_jobs set lease_until=now()-interval '1 second' where id=j.id;perform public.recover_automation_jobs(ws,u,p.workflow_id,j.id);
  update public.automation_jobs set scheduled_for=now()-interval '1 second',next_retry_at=now()-interval '1 second' where id=j.id;
  replay:=public.claim_automation_job(ws,u,j.id,gen_random_uuid());
  if replay.status<>'completed' or replay.result->>'actionId'<>draft.id::text or replay.attempt_count<>1 then raise exception 'Saved draft replay regenerated work';end if;
  replacement:=public.publish_followup_draft(ws,u,plan,token,e,metrics);
  if replacement.id<>draft.id or draft.status<>'pending_approval' or not draft.is_auxiliary or exists(select 1 from public.execution_attempts where action_id=draft.id)
    or (select status from public.workflows where id=p.workflow_id)<>'completed' then raise exception 'Followup duplicate/send/core boundary broken';end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  draft:=public.save_executable_email(draft.id,draft.revision,'recipient@example.com','Test recipient',null,connection,'Reviewed follow-up','Exact edited follow-up. New approval and explicit Execute required.');
  perform public.decide_action_revisions(draft.approval_id,'approved',jsonb_build_array(jsonb_build_object('actionId',draft.id,'revision',draft.revision)));
  if (select status from public.leads where id=p.lead_id)<>'contacted' or (select status from public.workflows where id=p.workflow_id)<>'completed' then raise exception 'Followup approval erased previous send';end if;
  replacement:=public.save_executable_email(draft.id,draft.revision,'recipient@example.com','Test recipient',null,connection,'Replacement follow-up','Changed exact content requires fresh approval.');
  if replacement.status<>'pending_approval' or not replacement.is_auxiliary or exists(select 1 from public.action_approval_snapshots where action_id=replacement.id) then raise exception 'Replacement inherited execution rights';end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  begin perform public.record_automation_reply(ws,u,parent.id,connection,1,parent.result->>'threadId','mock-reply-1',now()-interval '1 hour','recipient@example.com');raise exception 'Reply read without scope accepted';exception when invalid_parameter_value then null;end;
  update public.integration_connections set scopes=scopes||array['https://www.googleapis.com/auth/gmail.readonly'] where id=connection;
  perform public.record_automation_reply_check(ws,u,plan,connection,1);
  if (select last_checked_at from public.follow_up_plans where id=plan) is null then raise exception 'Successful mailbox check not persisted';end if;
  reply:=public.record_automation_reply(ws,u,parent.id,connection,1,parent.result->>'threadId','mock-reply-1',now()-interval '1 hour','recipient@example.com');
  perform public.record_automation_reply(ws,u,parent.id,connection,1,parent.result->>'threadId','mock-reply-1',now()-interval '1 hour','recipient@example.com');
  if (select count(*) from public.reply_observations where lead_id=p.lead_id)<>1 or (select count(*) from public.agent_events where event_type='reply_detected' and metadata->>'lead_id'=p.lead_id::text)<>1
    or (select automation_status from public.follow_up_plans where id=plan)<>'skipped_reply_detected' or (select status from public.leads where id=p.lead_id)<>'responded'
    then raise exception 'Reply dedup/cancellation failed';end if;
  begin perform public.assert_executable_envelope(replacement);raise exception 'Reply did not block prepared followup';exception when invalid_parameter_value then null;end;
  plan:=pg_temp.automation_parent(ws,u,connection);select * into p from public.follow_up_plans where id=plan;
  update public.follow_up_plans set due_at=now()+interval '1 day' where id=plan;
  begin perform public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now(),'forbidden-early:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);raise exception 'Normal follow-up bypassed approved due time';exception when invalid_parameter_value then null;end;
  j:=public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now()+interval '1 day','cancel-plan:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);
  j:=public.bind_automation_provider(ws,u,j.id,'mock-old-test-provider');
  begin perform public.schedule_automation_followup_test(ws,other_u,plan);raise exception 'Development test rebound actor to another member';exception when insufficient_privilege then null;end;
  if (select actor_id from public.automation_jobs where id=j.id)<>u or (select provider_job_id from public.automation_jobs where id=j.id)<>'mock-old-test-provider' then raise exception 'Rejected actor reassignment changed job';end if;
  replay:=public.schedule_automation_followup_test(ws,u,plan);
  if replay.id<>j.id or replay.provider_job_id is not null or replay.input->>'developmentTest'<>'true'
    or (select due_at from public.follow_up_plans where id=plan)<>now()+interval '1 day' then raise exception 'Development preparation duplicate or changed approved due time';end if;
  perform set_config('request.jwt.claim.role','authenticated',true);perform public.cancel_follow_up(plan);
  if (select status from public.automation_jobs where id=j.id)<>'cancelled' then raise exception 'Plan cancellation did not cancel job';end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  begin perform public.schedule_automation_job(ws,u,p.workflow_id,'reply_check',now(),'cancelled-reply:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);raise exception 'Cancelled plan scheduled new reply worker';exception when invalid_parameter_value then null;end;
  plan:=pg_temp.automation_parent(ws,u,connection);select * into p from public.follow_up_plans where id=plan;
  begin perform public.schedule_automation_job(ws,u,p.workflow_id,'reply_check',now(),'inactive-reply:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);raise exception 'Inactive plan monitored';exception when invalid_parameter_value then null;end;
  update public.follow_up_plans set automation_status='scheduled' where id=plan;
  j:=public.schedule_automation_job(ws,u,p.workflow_id,'reply_check',now(),'owner-reply:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);
  update public.workspace_members set role='member' where workspace_id=ws and user_id=u;
  begin perform public.claim_automation_job(ws,u,j.id,gen_random_uuid());raise exception 'Demoted owner claimed mailbox worker';exception when insufficient_privilege then null;end;
  update public.workspace_members set role='owner' where workspace_id=ws and user_id=u;
  update public.follow_up_plans set automation_status='completed' where id=plan;
  replay:=public.claim_automation_job(ws,u,j.id,gen_random_uuid());
  if replay.status<>'cancelled' or replay.attempt_count<>0 then raise exception 'Completed plan reply claim not cancelled';end if;
  begin perform public.schedule_automation_job(ws,u,p.workflow_id,'reply_check',now(),'completed-reply:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);raise exception 'Completed plan scheduled new reply worker';exception when invalid_parameter_value then null;end;
  plan:=pg_temp.automation_parent(ws,u,connection);select * into p from public.follow_up_plans where id=plan;
  update public.workspace_members set role='member' where workspace_id=ws and user_id=u;
  begin perform public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now(),'demoted-read-followup:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);raise exception 'Read-capable followup used demoted owner';exception when insufficient_privilege then null;end;
  update public.integration_connections set scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'] where id=connection;
  j:=public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now(),'send-only-member-followup:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);
  if j.actor_id<>u then raise exception 'Send-only internal preparation lost original member actor';end if;
  update public.integration_connections set scopes=scopes||array['https://www.googleapis.com/auth/gmail.readonly'] where id=connection;
  begin perform public.claim_automation_job(ws,u,j.id,gen_random_uuid());raise exception 'New read permission bypassed claim owner check';exception when insufficient_privilege then null;end;
  update public.workspace_members set role='owner' where workspace_id=ws and user_id=u;
  -- A failed model request retains only an actually checked, still-exact read observation.
  for n in 1..6 loop
    update public.integration_connections set generation=1,provider_identity='sender@example.com',
      scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'] where id=connection;
    plan:=pg_temp.automation_parent(ws,u,connection);select * into p from public.follow_up_plans where id=plan;
    j:=public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now(),'failed-reply-status:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);
    token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);
    if n>1 then perform public.record_automation_reply_check(ws,u,plan,connection,1);end if;
    if n=3 then update public.follow_up_plans set last_checked_at=j.started_at-interval '1 second' where id=plan;end if;
    if n=4 then update public.integration_connections set scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'] where id=connection;end if;
    if n=5 then update public.integration_connections set generation=2 where id=connection;end if;
    if n=6 then update public.integration_connections set provider_identity='changed@example.com' where id=connection;end if;
    failed_run:=public.fail_automation_followup_run(ws,u,j.id,token,gen_random_uuid(),metrics,
      '{"code":"mock_timeout","message":"Explicit mocked provider failure","category":"timeout"}');
    if n=2 then
      if failed_run.input->>'replyStatus' is distinct from 'none_detected'
        or (select input->>'summary' from public.agent_run_observations_07 where id=failed_run.id) is distinct from 'Saved message and company evidence; no reply found in monitored thread'
        then raise exception 'Fresh exact mailbox check lost from failure observation';end if;
      update public.integration_connections set scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'] where id=connection;
      failed_replay:=public.fail_automation_followup_run(ws,u,j.id,token,gen_random_uuid(),metrics,
        '{"code":"mock_timeout","message":"Explicit mocked provider failure","category":"timeout"}');
      if failed_replay.id<>failed_run.id or failed_replay.input is distinct from failed_run.input then raise exception 'Failure replay rewrote observed monitoring fact';end if;
    elsif failed_run.input->>'replyStatus' is distinct from 'unavailable'
      or (select input->>'summary' from public.agent_run_observations_07 where id=failed_run.id) is distinct from 'Saved message and company evidence; reply monitoring unavailable'
      then raise exception 'Missing/stale/changed mailbox check fabricated no-reply, case %',n;end if;
  end loop;
  -- Completed publication also distinguishes a fresh check from stale send-only history.
  for n in 1..2 loop
    update public.integration_connections set generation=1,provider_identity='sender@example.com',
      scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'] where id=connection;
    plan:=pg_temp.automation_parent(ws,u,connection);select * into p from public.follow_up_plans where id=plan;
    j:=public.schedule_automation_job(ws,u,p.workflow_id,'followup_due',now(),'published-reply-status:'||plan::text,jsonb_build_object('planId',plan),null,p.lead_id,null,plan);
    token:=gen_random_uuid();j:=public.claim_automation_job(ws,u,j.id,token);
    perform public.record_automation_reply_check(ws,u,plan,connection,1);
    if n=1 then
      update public.follow_up_plans set last_checked_at=j.started_at-interval '1 second' where id=plan;
      update public.integration_connections set scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'] where id=connection;
    end if;
    select a.* into original from public.proposed_actions a join public.execution_attempts t on t.action_id=a.id where t.id=p.parent_attempt_id;
    e:=original.executable_envelope||jsonb_build_object('actionId',gen_random_uuid(),'snapshotId',gen_random_uuid(),'subject','Follow-up observation test','body','Fresh SQL draft requiring independent approval and explicit Execute.');
    e:=jsonb_set(e,'{lineageId}',e->'actionId');e:=jsonb_set(e,'{provenance,generationMetadata,outreachRunId}',to_jsonb(gen_random_uuid()::text));
    e:=jsonb_set(e,'{provenance,evidenceReferences}',jsonb_build_array(e#>'{provenance,evidenceReferences,0}'));
    e:=jsonb_set(e,'{provenance,personalization,claimsUsed}',e#>'{provenance,evidenceReferences}');
    draft:=public.publish_followup_draft(ws,u,plan,token,e,metrics);
    if n=1 then
      if (select input->>'replyStatus' from public.agent_runs where id=(e#>>'{provenance,generationMetadata,outreachRunId}')::uuid) is distinct from 'unavailable'
        or not exists(select 1 from public.approvals where id=draft.approval_id and description like '%monitoring is unavailable%')
        then raise exception 'Completed stale/send-only check fabricated no-reply';end if;
    else
      if (select input->>'replyStatus' from public.agent_runs where id=(e#>>'{provenance,generationMetadata,outreachRunId}')::uuid) is distinct from 'none_detected'
        or not exists(select 1 from public.approvals where id=draft.approval_id and description like '%monitored thread%')
        then raise exception 'Completed fresh exact check lost no-reply observation';end if;
      update public.integration_connections set scopes=array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'] where id=connection;
      update public.automation_jobs set started_at=clock_timestamp()+interval '1 second' where id=j.id;
      replacement:=public.publish_followup_draft(ws,u,plan,token,e,metrics);
      if replacement.id<>draft.id or (select input->>'replyStatus' from public.agent_runs where id=(e#>>'{provenance,generationMetadata,outreachRunId}')::uuid) is distinct from 'none_detected'
        then raise exception 'Completed replay rewrote original checked observation';end if;
    end if;
  end loop;
end; $$;

-- Read RLS is enforced under the actual browser role (not just a JWT role string).
set local role authenticated;
do $$ begin
  if exists(select 1 from public.automation_jobs j where not public.is_workspace_member(j.workspace_id))
    or exists(select 1 from public.reply_observations r where not public.is_workspace_member(r.workspace_id)) then raise exception 'Cross-workspace RLS read';end if;
end; $$;
reset role;
rollback;
