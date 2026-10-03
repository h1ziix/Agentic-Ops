-- Failed paid preparation attempts remain in the existing run/audit history.
create unique index agent_runs_followup_failure_attempt_07 on public.agent_runs(workspace_id,(input->>'automationJobId'),(input->>'claimToken'))
  where agent_type='outreach' and status='failed' and input ? 'automationJobId' and input ? 'claimToken';
create function public.fail_automation_followup_run(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid,p_run uuid,p_metrics jsonb,p_error jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;p public.follow_up_plans%rowtype;r public.agent_runs%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  perform 1 from public.workflows where id=j.workflow_id for update;
  select * into p from public.follow_up_plans where id=j.follow_up_plan_id for update;
  select * into j from public.automation_jobs where id=p_job for update;
  -- Cancellation/expiry cannot authorize a draft, but failed observed provider usage can
  -- still be recorded against the original fenced attempt without reviving the job.
  if j.actor_id is distinct from p_actor or j.job_type<>'followup_due' or j.claim_token is distinct from p_claim or p.id is null
    or jsonb_typeof(p_metrics) is distinct from 'object' or jsonb_typeof(p_error) is distinct from 'object'
    or length(p_error->>'code')>100 or length(p_error->>'message')>600
    or coalesce(p_error->>'category','internal') not in ('validation','authorization','provider_auth','rate_limit','network','timeout','provider_error','invalid_state','duplicate','unknown_execution_state','internal')
    then raise exception 'Invalid failure observation' using errcode='40001'; end if;
  select * into r from public.agent_runs where id=p_run;
  if found then
    if r.workspace_id is distinct from p_workspace or r.input->>'automationJobId' is distinct from j.id::text
      or r.input->>'claimToken' is distinct from p_claim::text then raise exception 'Run conflict' using errcode='40001'; end if;
    return r;
  end if;
  select * into r from public.agent_runs where workspace_id=p_workspace and agent_type='outreach' and status='failed'
    and input->>'automationJobId'=j.id::text and input->>'claimToken'=p_claim::text;
  if found then return r; end if;
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,model,input,error,started_at,completed_at,duration_ms,retry_count,task_count,input_tokens,output_tokens,total_tokens)
    values(p_run,p_workspace,j.workflow_id,'outreach','failed',p_metrics->>'model',
      jsonb_build_object('followupPlanId',p.id,'automationJobId',j.id,'claimToken',p_claim,'replyStatus','none_detected'),
      jsonb_build_object('code',p_error->>'code','message',p_error->>'message'),
      clock_timestamp()-make_interval(secs=>coalesce((p_metrics->>'durationMs')::numeric,0)::double precision/1000),clock_timestamp(),
      (p_metrics->>'durationMs')::integer,coalesce((p_metrics->>'retryCount')::integer,0),1,
      (p_metrics->>'inputTokens')::integer,(p_metrics->>'outputTokens')::integer,(p_metrics->>'totalTokens')::integer) returning * into r;
  r:=public.apply_agent_run_telemetry_07(r.id,p_metrics);
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata)
    values(p_workspace,j.workflow_id,r.id,'agent_failed','Follow-up preparation failed; observed usage retained',
      jsonb_build_object('job_id',j.id,'plan_id',p.id,'error_code',p_error->>'code','duration_ms',r.duration_ms,'retry_count',r.retry_count));
  return r;
end; $$;
revoke all on function public.fail_automation_followup_run(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.fail_automation_followup_run(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) to service_role;
