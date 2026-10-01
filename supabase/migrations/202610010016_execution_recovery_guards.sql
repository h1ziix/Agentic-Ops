-- Preserve exact action/snapshot linkage even for trusted direct maintenance operations.
alter table public.integration_connections add constraint connection_authorization_reference unique(workspace_id,id,provider,generation);
alter table public.integration_credentials add constraint credential_authorization_reference foreign key(workspace_id,connection_id,provider,generation)
  references public.integration_connections(workspace_id,id,provider,generation) deferrable initially deferred;
alter table public.execution_attempts add constraint execution_safe_error check(safe_error_code is null or safe_error_code ~ '^[a-z0-9_]{1,80}$');
alter table public.follow_up_plans add constraint plan_action_snapshot foreign key(workspace_id,workflow_id,action_id,snapshot_id)
  references public.action_approval_snapshots(workspace_id,workflow_id,action_id,id);

-- Connection failures observed by a verified member are audited against the owner's retained authorization.
-- This does not grant that member connect/disconnect/reconnect permission.
create function public.mark_execution_connection_blocked(p_workspace uuid,p_actor uuid,p_attempt uuid,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.integration_connections%rowtype; t public.execution_attempts%rowtype; s public.action_approval_snapshots%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into t from public.execution_attempts where id=p_attempt and workspace_id=p_workspace;
  select * into s from public.action_approval_snapshots where id=t.snapshot_id;
  select * into c from public.integration_connections where id=t.connection_id and workspace_id=p_workspace for update;
  if not found or c.generation<>s.authorization_generation or c.status<>'connected' then return; end if;
  perform public.integration_assert_actor(p_workspace,c.connected_by,true);
  update public.integration_connections set status='reconnect_required',updated_at=clock_timestamp() where id=c.id;
  insert into public.agent_events(workspace_id,event_type,summary,metadata) values(p_workspace,'integration_reconnect_required','Provider rejected authorization; owner reconnection required',
    jsonb_build_object('connection_id',c.id,'provider',c.provider,'generation',c.generation,'actor',p_actor,'authorization_owner',c.connected_by,'safe_error_code',p_error));
end; $$;
alter function public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text) rename to finish_execution_before_connection_guard;
create function public.finish_execution(p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid,p_status text,p_result jsonb default null,p_error text default null,p_retry_seconds integer default 0,p_verification text default 'provider_response') returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype;
begin
  t:=public.finish_execution_before_connection_guard(p_workspace,p_actor,p_attempt,p_claim,p_status,p_result,p_error,p_retry_seconds,p_verification);
  if p_error in ('gmail_permission_rejected','reconnect_required') and t.status in ('failed_retryable','failed_terminal','cancelled_before_dispatch') then
    perform public.mark_execution_connection_blocked(p_workspace,p_actor,p_attempt,p_error);
  end if;
  return t;
end; $$;

create function public.reconcile_crm_outcome(p_workspace uuid,p_actor uuid,p_attempt uuid,p_claim uuid,p_result jsonb,p_note text) returns public.execution_attempts
language plpgsql security definer set search_path='' as $$
declare t public.execution_attempts%rowtype; a public.proposed_actions%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into t from public.execution_attempts where id=p_attempt and workspace_id=p_workspace;
  if not found then raise exception 'Attempt missing' using errcode='P0002'; end if;
  perform 1 from public.workflows where id=t.workflow_id for update;
  select * into a from public.proposed_actions where id=t.action_id for update;
  select * into t from public.execution_attempts where id=p_attempt for update;
  if a.action_type<>'upsert_crm_contact' or t.status<>'outcome_unknown' or coalesce(char_length(trim(p_note)),0) not between 10 and 2000 then raise exception 'Invalid CRM reconciliation' using errcode='22023'; end if;
  t:=public.finish_execution(p_workspace,p_actor,p_attempt,p_claim,'succeeded',p_result,null,0,'provider_read');
  update public.execution_attempts set reconciled_by=p_actor,reconciled_at=clock_timestamp(),reconciliation_note=p_note where id=t.id returning * into t;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,event_type,summary,metadata) values(p_workspace,t.workflow_id,t.executor_run_id,'execution_reconciled','Read-only provider lookup verified the exact approved CRM fields',
    jsonb_build_object('attempt_id',t.id,'action_id',a.id,'actor',p_actor,'verification_method','provider_read'));
  return t;
end; $$;

-- Internal plans may be rescheduled through a new reviewed proposal; sent emails remain immutable.
create or replace function public.guard_action_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status in ('approved','executed','rejected','cancelled') and (new.executable_envelope is distinct from old.executable_envelope or new.payload is distinct from old.payload or new.target is distinct from old.target or new.revision<>old.revision or new.schema_version<>old.schema_version)
    then raise exception 'Decided proposal is immutable' using errcode='42501'; end if;
  if new.superseded_by_id is distinct from old.superseded_by_id and exists(select 1 from public.execution_attempts where action_id=old.id and
    (status in ('claimed','dispatching') or (status='succeeded' and not(old.action_type='schedule_follow_up' and exists(select 1 from public.follow_up_plans where action_id=old.id and status='cancelled')))
      or (status='outcome_unknown' and verification_method<>'closed_for_replacement')))
    then raise exception 'Active, successful or uncertain operation cannot be replaced' using errcode='22023'; end if;
  return new;
end; $$;
alter function public.propose_follow_up(uuid,timestamptz,text,text,uuid,uuid) rename to propose_follow_up_before_reschedule;
create function public.propose_follow_up(p_parent uuid,p_due timestamptz,p_timezone text,p_note text,p_request uuid,p_replaces uuid default null) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare old public.proposed_actions%rowtype; t public.execution_attempts%rowtype; result public.proposed_actions%rowtype; aid uuid:=gen_random_uuid(); approval uuid; e jsonb; plan uuid;
begin
  if p_replaces is null then return public.propose_follow_up_before_reschedule(p_parent,p_due,p_timezone,p_note,p_request,null); end if;
  select * into t from public.execution_attempts where id=p_parent;
  if not found then raise exception 'Parent missing' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(t.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=t.workflow_id and status<>'cancelled' for update;
  if not found then raise exception 'Cancelled workflow' using errcode='22023'; end if;
  select * into result from public.proposed_actions where workspace_id=t.workspace_id and dedupe_key='follow:'||p_parent::text||':'||p_request::text;
  if found then return result; end if;
  select * into old from public.proposed_actions where id=p_replaces and workflow_id=t.workflow_id for update;
  if not found or old.action_type<>'schedule_follow_up' or old.superseded_by_id is not null or old.executable_envelope->>'parentAttemptId' is distinct from p_parent::text
    or old.status not in ('approved','pending_approval','waiting_for_approval','executed') then raise exception 'Invalid replacement plan' using errcode='22023'; end if;
  if old.status<>'executed' then return public.propose_follow_up_before_reschedule(p_parent,p_due,p_timezone,p_note,p_request,p_replaces); end if;
  if p_request is null or p_due is null or p_due<=now() or p_due>now()+interval '5 years' or not exists(select 1 from pg_timezone_names where name=p_timezone)
    or coalesce(char_length(p_note),0)>2000 or t.status<>'succeeded' then raise exception 'Invalid follow-up' using errcode='22023'; end if;
  select id into plan from public.follow_up_plans where action_id=old.id;
  if plan is null then raise exception 'Saved plan missing' using errcode='22023'; end if;
  perform public.cancel_follow_up(plan);
  insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level) values(t.workspace_id,t.workflow_id,'auxiliary_follow_up','Review replacement follow-up plan','Previous plan cancelled. New date requires new approval and explicit save.','low') returning id into approval;
  e:=old.executable_envelope||jsonb_build_object('actionId',aid,'snapshotId',gen_random_uuid(),'revision',1,'dueAt',to_char(p_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timezone',p_timezone,'note',p_note);
  insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,schema_version,executable_envelope,lineage_id,is_auxiliary,revision,replaces_action_id)
    values(aid,t.workspace_id,t.workflow_id,approval,'schedule_follow_up',old.target,'{}','pending_approval','low','follow:'||p_parent::text||':'||p_request::text,2,e,old.lineage_id,true,1,old.id) returning * into result;
  update public.proposed_actions set superseded_by_id=aid where id=old.id;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(t.workspace_id,t.workflow_id,'proposal_superseded','Saved plan replaced; original execution retained and new approval required',jsonb_build_object('action_id',old.id,'replacement_id',aid,'actor',auth.uid()));
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(t.workspace_id,t.workflow_id,'approval_requested','Replacement follow-up date awaits independent approval',jsonb_build_object('action_id',aid,'approval_id',approval,'actor',auth.uid()));
  return result;
end; $$;
revoke all on function public.propose_follow_up_before_reschedule(uuid,timestamptz,text,text,uuid,uuid),public.propose_follow_up(uuid,timestamptz,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.propose_follow_up(uuid,timestamptz,text,text,uuid,uuid) to authenticated;
revoke all on function public.finish_execution_before_connection_guard(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),public.mark_execution_connection_blocked(uuid,uuid,uuid,text),public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),public.reconcile_crm_outcome(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_execution(uuid,uuid,uuid,uuid,text,jsonb,text,integer,text),public.reconcile_crm_outcome(uuid,uuid,uuid,uuid,jsonb,text) to service_role;

alter function public.propose_crm_contact(uuid,integer,uuid,jsonb,jsonb,text,timestamptz,uuid) rename to propose_crm_contact_before_replacement;
create function public.propose_crm_contact(p_source uuid,p_revision integer,p_connection uuid,p_patch jsonb,p_expected jsonb,p_contact_id text,p_previewed_at timestamptz,p_request uuid,p_replaces uuid default null) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare source public.proposed_actions%rowtype; old public.proposed_actions%rowtype; result public.proposed_actions%rowtype;
begin
  if p_replaces is null then return public.propose_crm_contact_before_replacement(p_source,p_revision,p_connection,p_patch,p_expected,p_contact_id,p_previewed_at,p_request); end if;
  select * into source from public.proposed_actions where id=p_source;
  if not found then raise exception 'Source missing' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(source.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=source.workflow_id and status<>'cancelled' for update;
  if not found then raise exception 'Cancelled workflow' using errcode='22023'; end if;
  select * into result from public.proposed_actions where workspace_id=source.workspace_id and dedupe_key='crm:'||p_source::text||':'||p_request::text;
  if found then return result; end if;
  select * into old from public.proposed_actions where id=p_replaces and workflow_id=source.workflow_id for update;
  if not found or old.action_type<>'upsert_crm_contact' or old.superseded_by_id is not null or old.status not in ('approved','pending_approval','waiting_for_approval')
    or old.executable_envelope->>'sourceActionId' is distinct from p_source::text or exists(select 1 from public.execution_attempts where action_id=old.id and (status in ('claimed','dispatching','succeeded') or status='outcome_unknown')) then raise exception 'CRM proposal cannot be replaced' using errcode='22023'; end if;
  result:=public.propose_crm_contact_before_replacement(p_source,p_revision,p_connection,p_patch,p_expected,p_contact_id,p_previewed_at,p_request);
  update public.proposed_actions set lineage_id=old.lineage_id,replaces_action_id=old.id,executable_envelope=executable_envelope||jsonb_build_object('lineageId',old.lineage_id) where id=result.id returning * into result;
  update public.proposed_actions set status='cancelled',superseded_by_id=result.id where id=old.id;
  update public.approvals set status='cancelled' where id=old.approval_id;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(source.workspace_id,source.workflow_id,'proposal_superseded','CRM preview replaced; new exact field approval required',jsonb_build_object('action_id',old.id,'replacement_id',result.id,'actor',auth.uid()));
  return result;
end; $$;
revoke all on function public.propose_crm_contact_before_replacement(uuid,integer,uuid,jsonb,jsonb,text,timestamptz,uuid),public.propose_crm_contact(uuid,integer,uuid,jsonb,jsonb,text,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.propose_crm_contact(uuid,integer,uuid,jsonb,jsonb,text,timestamptz,uuid,uuid) to authenticated;
