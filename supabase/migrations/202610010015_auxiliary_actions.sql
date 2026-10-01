alter function public.assert_executable_envelope(public.proposed_actions) rename to assert_executable_envelope_before_execution;
create function public.assert_executable_envelope(p_action public.proposed_actions) returns void language plpgsql security definer set search_path='' as $$
declare e jsonb:=p_action.executable_envelope;
begin
  perform public.assert_executable_envelope_before_execution(p_action);
  if p_action.action_type='schedule_follow_up' and not exists(select 1 from public.execution_attempts t join public.proposed_actions a on a.id=t.action_id
    where t.id=(e ->> 'parentAttemptId')::uuid and t.workflow_id=p_action.workflow_id and t.workspace_id=p_action.workspace_id and t.status='succeeded' and a.action_type='send_email'
      and a.id=(e ->> 'parentActionId')::uuid) then raise exception 'Confirmed successful parent required' using errcode='22023'; end if;
end; $$;
revoke all on function public.assert_executable_envelope(public.proposed_actions),public.assert_executable_envelope_before_execution(public.proposed_actions) from public,anon,authenticated;

create function public.propose_crm_contact(p_source uuid,p_revision integer,p_connection uuid,p_patch jsonb,p_expected jsonb,p_contact_id text,p_previewed_at timestamptz,p_request uuid) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype; result public.proposed_actions%rowtype; c public.integration_connections%rowtype; proposal uuid; aid uuid:=gen_random_uuid(); e jsonb; k text; val jsonb;
begin
  select * into a from public.proposed_actions where id=p_source;
  if not found then raise exception 'Source not found' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(a.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=a.workflow_id and status<>'cancelled' for update;
  if not found then raise exception 'Cancelled workflow' using errcode='22023'; end if;
  select * into a from public.proposed_actions where id=p_source for update;
  select * into result from public.proposed_actions where workspace_id=a.workspace_id and dedupe_key='crm:' || p_source::text || ':' || p_request::text;
  if found then return result; end if;
  if a.action_type<>'send_email' or a.schema_version<>2 or a.revision is distinct from p_revision or a.superseded_by_id is not null or a.status in ('rejected','cancelled') or a.executable_envelope #>> '{recipient,confirmedBy}' is null
    or jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object' or p_patch='{}' or pg_column_size(p_patch)>8192
    or p_request is null or p_previewed_at is null or p_previewed_at<now()-interval '10 minutes' or p_previewed_at>now()+interval '30 seconds' or (p_contact_id is not null and p_contact_id !~ '^\d+$')
    then raise exception 'Invalid CRM preview' using errcode='22023'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_patch) key) is distinct from (select array_agg(key order by key) from jsonb_object_keys(p_expected) key) then raise exception 'Preview keys mismatch' using errcode='22023'; end if;
  for k,val in select * from jsonb_each(p_patch) loop
    if k not in ('firstname','lastname','jobtitle','company','website') or jsonb_typeof(val)<>'string' or char_length(trim(val #>> '{}'))=0 or char_length(val #>> '{}')>2048 then raise exception 'CRM patch not allowlisted' using errcode='22023'; end if;
    if k='company' and val #>> '{}' is distinct from a.payload #>> '{generationMetadata,company,name}' then raise exception 'Company unsupported' using errcode='22023'; end if;
    if k='website' and val #>> '{}' is distinct from a.payload #>> '{generationMetadata,company,website}' then raise exception 'Website unsupported' using errcode='22023'; end if;
    if jsonb_typeof(p_expected -> k) not in ('string','null') then raise exception 'Expected values invalid' using errcode='22023'; end if;
  end loop;
  select * into c from public.integration_connections where id=p_connection and workspace_id=a.workspace_id and provider='hubspot' and status='connected';
  if not found then raise exception 'HubSpot unavailable' using errcode='22023'; end if;
  insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level) values(a.workspace_id,a.workflow_id,'auxiliary_crm','Review CRM contact changes','Exact field changes require separate approval and explicit Execute.','medium') returning id into proposal;
  e:=jsonb_build_object('schemaVersion',2,'actionType','upsert_crm_contact','workspaceId',a.workspace_id,'workflowId',a.workflow_id,'actionId',aid,'snapshotId',gen_random_uuid(),'lineageId',aid,'revision',1,
    'companyId',a.target ->> 'companyId','leadId',a.target ->> 'leadId','recipient',a.executable_envelope -> 'recipient',
    'connection',jsonb_build_object('provider','hubspot','id',c.id,'generation',c.generation,'identity',c.provider_identity),'contactId',p_contact_id,'patch',p_patch,'expected',p_expected,
    'previewedAt',to_char(p_previewed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'sourceActionId',a.id);
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision)
    values(aid,a.workspace_id,a.workflow_id,proposal,'upsert_crm_contact',a.target,'{}','pending_approval','medium','crm:' || p_source::text || ':' || p_request::text,2,e,aid,true,1) returning * into result;
  perform public.assert_executable_envelope(result);
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(a.workspace_id,a.workflow_id,'approval_requested','CRM field changes await independent human approval',jsonb_build_object('action_id',aid,'approval_id',proposal,'actor',auth.uid()));
  return result;
end; $$;

create function public.propose_follow_up(p_parent uuid,p_due timestamptz,p_timezone text,p_note text,p_request uuid,p_replaces uuid default null) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; a public.proposed_actions%rowtype; result public.proposed_actions%rowtype; proposal uuid; aid uuid:=gen_random_uuid(); e jsonb;
begin
  select * into t from public.execution_attempts where id=p_parent;
  if not found then raise exception 'Parent not found' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(t.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=t.workflow_id and status<>'cancelled' for update;
  if not found then raise exception 'Workflow cancelled' using errcode='22023'; end if;
  select * into a from public.proposed_actions where id=t.action_id for update;
  select * into result from public.proposed_actions where workspace_id=t.workspace_id and dedupe_key='follow:' || p_parent::text || ':' || p_request::text;
  if found then return result; end if;
  if t.status<>'succeeded' or a.action_type<>'send_email' or p_request is null or p_due is null or p_due<=now() or p_due>now()+interval '5 years' or not exists(select 1 from pg_timezone_names where name=p_timezone) or coalesce(char_length(p_note),0)>2000 then raise exception 'Invalid follow-up' using errcode='22023'; end if;
  if p_replaces is not null then
    select * into result from public.proposed_actions where id=p_replaces and workflow_id=t.workflow_id and action_type='schedule_follow_up' for update;
    if not found or result.status not in ('approved','pending_approval','waiting_for_approval') or result.superseded_by_id is not null or exists(select 1 from public.execution_attempts where action_id=p_replaces)
      then raise exception 'Follow-up cannot be replaced; cancel saved plan first' using errcode='22023'; end if;
  end if;
  insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level) values(t.workspace_id,t.workflow_id,'auxiliary_follow_up','Review internal follow-up plan','Saves a plan only; no future email permission or automatic sending.','low') returning id into proposal;
  e:=jsonb_build_object('schemaVersion',2,'actionType','schedule_follow_up','workspaceId',t.workspace_id,'workflowId',t.workflow_id,'actionId',aid,'snapshotId',gen_random_uuid(),'lineageId',coalesce(result.lineage_id,aid),'revision',1,
    'parentAttemptId',t.id,'parentActionId',a.id,'dueAt',to_char(p_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timezone',p_timezone,'note',p_note);
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision,replaces_action_id)
    values(aid,t.workspace_id,t.workflow_id,proposal,'schedule_follow_up',a.target,'{}','pending_approval','low','follow:' || p_parent::text || ':' || p_request::text,2,e,coalesce(result.lineage_id,aid),true,1,p_replaces) returning * into result;
  if p_replaces is not null then update public.proposed_actions set status='cancelled',superseded_by_id=aid where id=p_replaces;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(t.workspace_id,t.workflow_id,'proposal_superseded','Follow-up proposal replaced; new approval required',jsonb_build_object('action_id',p_replaces,'replacement_id',aid,'actor',auth.uid())); end if;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(t.workspace_id,t.workflow_id,'approval_requested','Internal follow-up plan awaits approval',jsonb_build_object('action_id',aid,'approval_id',proposal,'actor',auth.uid()));
  return result;
end; $$;
create function public.cancel_follow_up(p_plan uuid) returns void language plpgsql security definer set search_path='' as $$
declare plan public.follow_up_plans%rowtype;
begin
  select * into plan from public.follow_up_plans where id=p_plan;
  if not found then raise exception 'Plan missing' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(plan.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=plan.workflow_id for update;
  if plan.status='cancelled' then return; end if;
  update public.follow_up_plans set status='cancelled',cancelled_at=clock_timestamp() where id=p_plan;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(plan.workspace_id,plan.workflow_id,'follow_up_cancelled','Internal follow-up plan cancelled',jsonb_build_object('plan_id',p_plan,'actor',auth.uid()));
end; $$;

-- Not-found is evidence of a manual check, not permission to resend. Explicit closure creates no success.
create function public.reconcile_email_outcome(p_attempt uuid,p_resolution text,p_note text) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; a public.proposed_actions%rowtype;
begin
  select * into t from public.execution_attempts where id=p_attempt;
  if not found then raise exception 'Attempt missing' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(t.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=t.workflow_id for update;
  select * into a from public.proposed_actions where id=t.action_id for update;
  select * into t from public.execution_attempts where id=p_attempt for update;
  if a.action_type<>'send_email' or t.status<>'outcome_unknown' or t.verification_method='closed_for_replacement' or p_resolution is null or p_resolution not in ('user_confirmed','not_found','close_for_replacement') or coalesce(char_length(trim(p_note)),0) not between 10 and 2000
    then raise exception 'Invalid reconciliation' using errcode='22023'; end if;
  if p_resolution='user_confirmed' then
    update public.execution_attempts set status='succeeded',verification_method='user_confirmed',result=jsonb_build_object('acceptedAt',clock_timestamp()),retry_eligible=false where id=t.id;
    update public.proposed_actions set status='executed',executed_at=clock_timestamp() where id=a.id;
    update public.leads set status='contacted',outreach_status='sent' where id=(a.executable_envelope ->> 'leadId')::uuid and workflow_id=a.workflow_id;
    update public.agent_runs set status='completed',completed_at=clock_timestamp(),output=jsonb_build_object('attemptId',t.id,'verificationMethod','user_confirmed'),error=null where id=t.executor_run_id;
  elsif p_resolution='close_for_replacement' then
    update public.execution_attempts set verification_method='closed_for_replacement',retry_eligible=false where id=t.id;
  end if;
  update public.execution_attempts set reconciled_by=auth.uid(),reconciled_at=clock_timestamp(),reconciliation_note=p_note where id=t.id returning * into t;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(t.workspace_id,t.workflow_id,t.executor_run_id,'execution_reconciled',
    case when p_resolution='user_confirmed' then 'Operator confirmed sent mail manually; not API-confirmed' when p_resolution='not_found' then 'Operator did not find mail; uncertainty and resend block remain' else 'Uncertain operation explicitly closed; replacement review required with duplicate risk' end,
    jsonb_build_object('attempt_id',t.id,'action_id',a.id,'actor',auth.uid(),'verification_method',t.verification_method));
  perform public.aggregate_execution(t.workflow_id); return t;
end; $$;
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
  ('propose_crm_contact','propose_follow_up','cancel_follow_up','reconcile_email_outcome') loop
  execute format('revoke all on function %s from public,anon',f.signature); execute format('grant execute on function %s to authenticated',f.signature);
end loop; end $$;
