-- Historical failed preparations did not prove a mailbox check. Do not invent one.
-- This correction preserves usage, costs, job claims and the saved failure dedupe.
update public.agent_runs set input=jsonb_set(input,'{replyStatus}','"unavailable"'::jsonb)
  where agent_type='outreach' and status='failed' and input?'followupPlanId';

-- A stored check is evidence only for this attempt and the exact current approval connection.
create function public.followup_reply_observation_07(p_plan public.follow_up_plans,p_started timestamptz) returns text
language plpgsql security definer set search_path='' as $$
declare reply_status text:='unavailable';
begin
  -- Only a check during this attempt with the still-exact approved read connection
  -- can establish a checked no-reply observation. Preserve that fact on replay.
  if p_plan.last_reply_at is not null then
    reply_status:='detected';
  elsif p_plan.last_checked_at is not null and p_started is not null
    and p_plan.last_checked_at>=p_started and p_plan.last_checked_at<=clock_timestamp()
    and exists(
      select 1 from public.execution_attempts t
      join public.action_approval_snapshots s on s.id=t.snapshot_id and s.workspace_id=t.workspace_id and s.workflow_id=t.workflow_id
      join public.integration_connections c on c.id=t.connection_id and c.workspace_id=t.workspace_id
      where t.id=p_plan.parent_attempt_id and t.workspace_id=p_plan.workspace_id and t.workflow_id=p_plan.workflow_id and t.status='succeeded'
        and s.action_type='send_email' and s.connection_id=c.id and s.authorization_generation=c.generation
        and c.id::text=s.envelope#>>'{connection,id}' and c.generation::text=s.envelope#>>'{connection,generation}'
        and c.provider_identity=s.envelope#>>'{connection,identity}' and c.provider='gmail' and c.status='connected'
        and c.scopes&&array['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.metadata']
        and nullif(t.result->>'threadId','') is not null and nullif(t.result->>'messageId','') is not null
    ) then
    reply_status:='none_detected';
  end if;

  return reply_status;
end; $$;
revoke all on function public.followup_reply_observation_07(public.follow_up_plans,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.fail_automation_followup_run(p_workspace uuid,p_actor uuid,p_job uuid,p_claim uuid,p_run uuid,p_metrics jsonb,p_error jsonb)
returns public.agent_runs language plpgsql security definer set search_path='' as $$
declare j public.automation_jobs%rowtype;p public.follow_up_plans%rowtype;r public.agent_runs%rowtype;h text;reply_status text:='unavailable';
begin
  h:=encode(extensions.digest(convert_to(p_claim::text,'UTF8'),'sha256'),'hex');
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into j from public.automation_jobs where id=p_job and workspace_id=p_workspace;
  if not found then raise exception 'Job missing' using errcode='P0002'; end if;
  perform 1 from public.workflows where id=j.workflow_id for update;
  select * into p from public.follow_up_plans where id=j.follow_up_plan_id for update;
  select * into j from public.automation_jobs where id=p_job for update;
  -- Cancellation/expiry cannot authorize a draft, but failed observed provider usage can
  -- still be recorded against the original fenced attempt without reviving the job.
  if p_claim is null or j.actor_id is distinct from p_actor or j.job_type<>'followup_due' or j.claim_token is distinct from p_claim or p.id is null
    or jsonb_typeof(p_metrics) is distinct from 'object' or jsonb_typeof(p_error) is distinct from 'object'
    or length(p_error->>'code')>100 or length(p_error->>'message')>600
    or coalesce(p_error->>'category','internal') not in ('validation','authorization','provider_auth','rate_limit','network','timeout','provider_error','invalid_state','duplicate','unknown_execution_state','internal')
    then raise exception 'Invalid failure observation' using errcode='40001'; end if;
  select * into r from public.agent_runs where id=p_run;
  if found then
    if r.workspace_id is distinct from p_workspace or r.input->>'automationJobId' is distinct from j.id::text
      or r.input->>'claimHash' is distinct from h then raise exception 'Run conflict' using errcode='40001'; end if;
    return r;
  end if;
  select * into r from public.agent_runs where workspace_id=p_workspace and agent_type='outreach' and status='failed'
    and input->>'automationJobId'=j.id::text and input->>'claimHash'=h;
  if found then return r; end if;
  reply_status:=public.followup_reply_observation_07(p,j.started_at);
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,model,input,error,started_at,completed_at,duration_ms,retry_count,task_count,input_tokens,output_tokens,total_tokens)
    values(p_run,p_workspace,j.workflow_id,'outreach','failed',p_metrics->>'model',
      jsonb_build_object('followupPlanId',p.id,'automationJobId',j.id,'claimHash',h,'replyStatus',reply_status),
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

-- Completed publication uses the same evidence test; an old check cannot outlive read permission.
create or replace function public.publish_followup_draft(p_workspace uuid,p_actor uuid,p_plan uuid,p_claim uuid,p_envelope jsonb,p_metrics jsonb) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;j public.automation_jobs%rowtype;parent public.proposed_actions%rowtype;t public.execution_attempts%rowtype;
  result public.proposed_actions%rowtype;approval uuid;run_id uuid;metadata jsonb;body jsonb;proof jsonb;fact jsonb;reply_status text;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.workflows where id=(select workflow_id from public.follow_up_plans where id=p_plan and workspace_id=p_workspace) and status<>'cancelled' for update;
  if not found then raise exception 'Workflow unavailable' using errcode='22023'; end if;
  select * into p from public.follow_up_plans where id=p_plan and workspace_id=p_workspace for update;
  if not found then raise exception 'Plan missing' using errcode='P0002'; end if;
  if p.draft_action_id is not null then select * into result from public.proposed_actions where id=p.draft_action_id;return result; end if;
  select * into j from public.automation_jobs where follow_up_plan_id=p_plan and job_type='followup_due' and actor_id=p_actor and status='running' and claim_token=p_claim and lease_until>now() for update;
  if not found or p.status<>'planned' or (p.due_at>now() and j.input->>'developmentTest' is distinct from 'true') or p.automation_status not in ('scheduled','due','drafting','failed')
    or exists(select 1 from public.leads where id=p.lead_id and status in ('rejected','responded','converted'))
    or exists(select 1 from public.reply_observations where lead_id=p.lead_id)
    then raise exception 'Follow-up publication fenced' using errcode='40001'; end if;
  select * into t from public.execution_attempts where id=p.parent_attempt_id and status='succeeded';
  select * into parent from public.proposed_actions where id=t.action_id and action_type='send_email';
  if parent.id is null or exists(select 1 from public.proposed_actions where workflow_id=p.workflow_id and target->>'leadId'=p.lead_id::text
    and action_type='send_email' and status in ('pending_approval','waiting_for_approval','approved') and superseded_by_id is null)
    then raise exception 'Another pending communication exists' using errcode='22023'; end if;
  reply_status:=public.followup_reply_observation_07(p,j.started_at);
  proof:=p_envelope->'provenance';metadata:=proof->'generationMetadata';run_id:=(metadata->>'outreachRunId')::uuid;
  if p_envelope->>'workspaceId' is distinct from p_workspace::text or p_envelope->>'workflowId' is distinct from p.workflow_id::text
    or p_envelope->>'companyId' is distinct from p.company_id::text or p_envelope->>'leadId' is distinct from p.lead_id::text
    or p_envelope->>'revision' is distinct from '1' or p_envelope->>'actionType' is distinct from 'send_email' or p_envelope->>'schemaVersion' is distinct from '2'
    or p_envelope->>'lineageId' is distinct from p_envelope->>'actionId'
    or p_envelope->'recipient' is distinct from parent.executable_envelope->'recipient'
    or p_envelope->'connection' is distinct from parent.executable_envelope->'connection'
    or (metadata-'outreachRunId'-'model'-'generationSummary') is distinct from ((parent.payload->'generationMetadata')-'outreachRunId'-'model'-'generationSummary')
    or proof#>>'{personalization,angle}' is distinct from parent.payload#>>'{personalization,angle}' or proof#>>'{personalization,isHypothesis}' is distinct from 'true' or proof#>'{personalization,claimsUsed}' is distinct from proof->'evidenceReferences'
    or jsonb_typeof(proof->'evidenceReferences') is distinct from 'array' or jsonb_array_length(proof->'evidenceReferences') not between 1 and 3
    or run_id is null or p_metrics->>'model' is distinct from metadata->>'model' or pg_column_size(p_envelope)>65536
    then raise exception 'Follow-up provenance invalid' using errcode='22023'; end if;
  for fact in select value from jsonb_array_elements(proof->'evidenceReferences') loop
    if not (coalesce(parent.payload#>'{generationMetadata,review,usableEvidence}',parent.payload->'evidenceReferences') @> jsonb_build_array(fact)) then raise exception 'Unsupported evidence' using errcode='22023'; end if;
  end loop;
  body:=jsonb_build_object('subject',p_envelope->>'subject','body',p_envelope->>'body','generationMetadata',metadata,'personalization',proof->'personalization',
    'evidenceReferences',proof->'evidenceReferences','warnings',coalesce(parent.payload->'warnings','[]'::jsonb),'executionReadiness','ready');
  insert into public.agent_runs(id,workspace_id,workflow_id,agent_type,status,model,input,output,started_at,completed_at,duration_ms,retry_count,task_count,input_tokens,output_tokens,total_tokens)
    values(run_id,p_workspace,p.workflow_id,'outreach','completed',p_metrics->>'model',jsonb_build_object('followupPlanId',p.id,'parentActionId',parent.id,'replyStatus',reply_status),
      jsonb_build_object('draft',jsonb_build_object('subject',p_envelope->>'subject','body',p_envelope->>'body'),'summary',metadata->>'generationSummary'),
      clock_timestamp()-make_interval(secs=>coalesce((p_metrics->>'durationMs')::numeric,0)::double precision/1000),clock_timestamp(),(p_metrics->>'durationMs')::integer,
      (p_metrics->>'retryCount')::integer,1,(p_metrics->>'inputTokens')::integer,(p_metrics->>'outputTokens')::integer,(p_metrics->>'totalTokens')::integer);
  perform public.apply_agent_run_telemetry_07(run_id,p_metrics);
  insert into public.approvals(workspace_id,workflow_id,requested_by_agent_run_id,type,title,description,risk_level)
    values(p_workspace,p.workflow_id,run_id,'auxiliary_followup_email','Review follow-up email',case when reply_status<>'none_detected' then 'New message requires fresh exact approval and explicit Execute. Reply monitoring is unavailable; review the conversation before sending.' else 'New message requires fresh exact approval and explicit Execute. No reply was found in the monitored thread.' end,'medium') returning id into approval;
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision)
    values((p_envelope->>'actionId')::uuid,p_workspace,p.workflow_id,approval,'send_email',parent.target,body,'pending_approval','medium','followup-draft:'||p.id::text,2,p_envelope,
      (p_envelope->>'lineageId')::uuid,true,1) returning * into result;
  perform public.assert_executable_envelope(result);
  update public.follow_up_plans set automation_status='waiting_for_approval',draft_action_id=result.id where id=p.id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'followup_draft_created','Follow-up draft ready; independent human approval required',jsonb_build_object('plan_id',p.id,'action_id',result.id,'job_id',j.id,'parent_action_id',parent.id));
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'approval_requested','New follow-up message awaits exact review',jsonb_build_object('approval_id',approval,'action_id',result.id));
  return result;
end; $$;

-- Operational summaries must retain the recorded monitoring availability.
create or replace view public.agent_run_observations_07 with (security_invoker=true) as
select id,workspace_id,workflow_id,workflow_task_id,agent_type,status,model,
  case when input is null then null else jsonb_build_object('summary',case
    when input ? 'followupPlanId' and input->>'replyStatus'='none_detected' then 'Saved message and company evidence; no reply found in monitored thread'
    when input ? 'followupPlanId' and input->>'replyStatus'='detected' then 'Saved message and company evidence; reply detected'
    when input ? 'followupPlanId' then 'Saved message and company evidence; reply monitoring unavailable'
    when input ? 'goal' then 'Workflow goal, target criteria and approval constraints'
    else 'Validated task context and accepted evidence' end) end as input,
  case when output is null then null else jsonb_build_object('summary',left(coalesce(output->>'summary',
    case when output ? 'tasks' and jsonb_typeof(output->'tasks')='array' then jsonb_array_length(output->'tasks')::text||' planned tasks'
      when output ? 'kind' then 'Task: '||replace(output->>'kind','_',' ')
      when output ? 'review' then 'Evidence review saved' else 'Validated structured output saved' end),600)) end as output,
  case when error is null then null else jsonb_build_object('code',error->>'code','message',left(error->>'message',600)) end as error,
  started_at,completed_at,created_at,duration_ms,retry_count,task_count,input_tokens,output_tokens,total_tokens,
  cached_input_tokens,reasoning_tokens,usage_status,usage_observation_count,estimated_cost_usd,cost_status,pricing_version,error_category,cache_write_tokens
from public.agent_runs;
