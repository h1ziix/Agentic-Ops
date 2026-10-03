-- A completed read-only thread lookup is required before claiming a checked no-reply state.
create or replace function public.publish_followup_draft(p_workspace uuid,p_actor uuid,p_plan uuid,p_claim uuid,p_envelope jsonb,p_metrics jsonb) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare p public.follow_up_plans%rowtype;j public.automation_jobs%rowtype;parent public.proposed_actions%rowtype;t public.execution_attempts%rowtype;
  result public.proposed_actions%rowtype;approval uuid;run_id uuid;metadata jsonb;body jsonb;proof jsonb;fact jsonb;
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
    values(run_id,p_workspace,p.workflow_id,'outreach','completed',p_metrics->>'model',jsonb_build_object('followupPlanId',p.id,'parentActionId',parent.id,'replyStatus',case when p.last_checked_at is null then 'unavailable' else 'none_detected' end),
      jsonb_build_object('draft',jsonb_build_object('subject',p_envelope->>'subject','body',p_envelope->>'body'),'summary',metadata->>'generationSummary'),
      clock_timestamp()-make_interval(secs=>coalesce((p_metrics->>'durationMs')::numeric,0)::double precision/1000),clock_timestamp(),(p_metrics->>'durationMs')::integer,
      (p_metrics->>'retryCount')::integer,1,(p_metrics->>'inputTokens')::integer,(p_metrics->>'outputTokens')::integer,(p_metrics->>'totalTokens')::integer);
  perform public.apply_agent_run_telemetry_07(run_id,p_metrics);
  insert into public.approvals(workspace_id,workflow_id,requested_by_agent_run_id,type,title,description,risk_level)
    values(p_workspace,p.workflow_id,run_id,'auxiliary_followup_email','Review follow-up email',case when p.last_checked_at is null then 'New message requires fresh exact approval and explicit Execute. Reply monitoring is unavailable; review the conversation before sending.' else 'New message requires fresh exact approval and explicit Execute. No reply was found in the monitored thread.' end,'medium') returning id into approval;
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision)
    values((p_envelope->>'actionId')::uuid,p_workspace,p.workflow_id,approval,'send_email',parent.target,body,'pending_approval','medium','followup-draft:'||p.id::text,2,p_envelope,
      (p_envelope->>'lineageId')::uuid,true,1) returning * into result;
  perform public.assert_executable_envelope(result);
  update public.follow_up_plans set automation_status='waiting_for_approval',draft_action_id=result.id where id=p.id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'followup_draft_created','Follow-up draft ready; independent human approval required',jsonb_build_object('plan_id',p.id,'action_id',result.id,'job_id',j.id,'parent_action_id',parent.id));
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,p.workflow_id,run_id,'approval_requested','New follow-up message awaits exact review',jsonb_build_object('approval_id',approval,'action_id',result.id));
  return result;
end; $$;
