-- Offline rollback fixtures: pricing values are synthetic, never claimed provider rates.
begin;
do $$
declare u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();ws uuid;other_ws uuid;wf uuid;other_wf uuid;
  r public.agent_runs%rowtype;replay public.agent_runs%rowtype;m jsonb;event_count integer;
begin
  if has_function_privilege('authenticated','public.apply_agent_run_telemetry_07(uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.complete_planner_run(uuid,public.agent_run_status,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.fail_automation_followup_run(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.followup_reply_observation_07(public.follow_up_plans,timestamptz)','EXECUTE')
    or has_table_privilege('anon','public.agent_run_observations_07','SELECT') then raise exception 'Unsafe observability grants'; end if;
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@obs.invalid','{}'),(other_u,other_u::text||'@obs.invalid','{}');
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);ws:=public.bootstrap_workspace();
  wf:=public.create_workflow(ws,'Observability fixture','Find evidence-supported companies and request human review.',2);
  perform set_config('request.jwt.claim.sub',other_u::text,true);other_ws:=public.bootstrap_workspace();
  other_wf:=public.create_workflow(other_ws,'Other observability fixture','Find evidence-supported companies and request human review.',2);
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','service_role',true);
  r:=public.start_planner_run(gen_random_uuid(),u,ws,wf,'fixture-model','{"goal":"Validated workflow goal","hiddenReasoning":"must-not-render","rawHtml":"<html>must-not-render</html>"}');
  if r.estimated_cost_usd is not null or r.cost_status<>'unknown' or r.usage_status<>'unknown' then raise exception 'Unknown fabricated zero'; end if;
  m:='{"durationMs":12,"retryCount":0,"taskCount":0,"inputTokens":40,"outputTokens":10,"totalTokens":50,"usageStatus":"complete","usageObservationCount":1,"cachedInputTokens":5,"reasoningTokens":3,"costStatus":"estimated","pricingVersion":"synthetic-test-rates"}';
  event_count:=(select count(*) from public.agent_events where workflow_id=wf);
  begin
    perform public.complete_planner_run(r.id,'failed',null,'[]','{"code":"ai_timeout","message":"Safe timeout summary"}',m);
    raise exception 'Estimated cost without value accepted';
  exception when invalid_parameter_value then null; end;
  if (select status from public.agent_runs where id=r.id)<>'running' or (select status from public.workflows where id=wf)<>'planning'
    or (select count(*) from public.agent_events where workflow_id=wf)<>event_count then raise exception 'Telemetry completion not atomic'; end if;
  m:=m||'{"estimatedCostUsd":0.0007,"cacheWriteTokens":35}';
  r:=public.complete_planner_run(r.id,'failed',null,'[]','{"code":"ai_timeout","message":"Safe timeout summary"}',m);
  if r.estimated_cost_usd<>0.0007 or r.cached_input_tokens<>5 or r.cache_write_tokens<>35 or r.reasoning_tokens<>3 or r.usage_observation_count<>1
    or r.usage_status<>'complete' or r.cost_status<>'estimated' or r.error_category<>'timeout' then raise exception 'Saved normalized observation incorrect';end if;
  replay:=public.complete_planner_run(r.id,'failed',null,'[]','{"code":"validation","message":"Wrong replay"}',m||'{"estimatedCostUsd":999}');
  if replay.estimated_cost_usd<>0.0007 or replay.error_category<>'timeout' then raise exception 'Replay rewrote telemetry'; end if;
  if exists(select 1 from public.agent_run_observations_07 where id=r.id and (input::text like '%must-not-render%' or output::text like '%must-not-render%')) then raise exception 'Unsafe payload in operational view'; end if;
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,model,input_tokens,output_tokens,total_tokens)
    values(other_ws,other_wf,'executor','completed',null,null,null,null) returning * into replay;
  if replay.usage_status<>'not_applicable' or replay.cost_status<>'not_applicable' or replay.estimated_cost_usd is not null then raise exception 'Executor invented AI cost';end if;
  r:=public.start_planner_run(gen_random_uuid(),u,ws,wf,'fixture-model','{}');
  r:=public.complete_planner_run(r.id,'failed',null,'[]','{"code":"ai_invalid_output","message":"Safe validation summary"}',
    '{"durationMs":10,"retryCount":0,"taskCount":0,"inputTokens":10,"outputTokens":null,"totalTokens":null,"usageStatus":"partial","usageObservationCount":1,"estimatedCostUsd":null,"costStatus":"unknown"}');
  if r.usage_status<>'partial' or r.output_tokens is not null or r.total_tokens is not null or r.estimated_cost_usd is not null then raise exception 'Partial usage fabricated zeros';end if;
  insert into public.agent_runs(workspace_id,workflow_id,agent_type,status,model,input)
    values(ws,wf,'outreach','failed','fixture-model','{"followupPlanId":"fixture","replyStatus":"unavailable","rawHtml":"must-not-render","claimHash":"must-not-render"}') returning * into r;
  if (select input from public.agent_run_observations_07 where id=r.id) is distinct from '{"summary":"Saved message and company evidence; reply monitoring unavailable"}'::jsonb
    then raise exception 'Unavailable reply observation fabricated checked no-reply or leaked input';end if;
  update public.agent_runs set input=jsonb_set(input,'{replyStatus}','"none_detected"') where id=r.id;
  if (select input->>'summary' from public.agent_run_observations_07 where id=r.id) is distinct from 'Saved message and company evidence; no reply found in monitored thread'
    then raise exception 'Checked reply observation unavailable in safe view';end if;
  update public.agent_runs set input=jsonb_set(input,'{replyStatus}','"detected"') where id=r.id;
  if (select input->>'summary' from public.agent_run_observations_07 where id=r.id) is distinct from 'Saved message and company evidence; reply detected'
    then raise exception 'Detected reply observation presented as no-reply';end if;
  update public.agent_runs set input=input-'replyStatus' where id=r.id;
  if (select input->>'summary' from public.agent_run_observations_07 where id=r.id) is distinct from 'Saved message and company evidence; reply monitoring unavailable'
    then raise exception 'Unknown historical reply status fabricated checked no-reply';end if;
end; $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.agent_run_observations_07 where not public.is_workspace_member(workspace_id)) then raise exception 'Cross-workspace observation leaked';end if;
  if not exists(select 1 from public.agent_run_observations_07 where input->>'summary'='Workflow goal, target criteria and approval constraints') then raise exception 'Own safe observation unavailable';end if;
end; $$;
reset role;
rollback;
