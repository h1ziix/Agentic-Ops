alter table public.proposed_actions add constraint proposed_actions_workspace_id unique(workspace_id,workflow_id,id);
alter table public.proposed_actions add column schema_version integer not null default 1 check(schema_version in (1,2));
alter table public.proposed_actions add column executable_envelope jsonb;
alter table public.proposed_actions add column lineage_id uuid;
alter table public.proposed_actions add column replaces_action_id uuid;
alter table public.proposed_actions add column superseded_by_id uuid;
alter table public.proposed_actions add column is_auxiliary boolean not null default false;
update public.proposed_actions set lineage_id=id;
alter table public.proposed_actions alter column lineage_id set not null;
alter table public.proposed_actions add foreign key(workspace_id,workflow_id,replaces_action_id) references public.proposed_actions(workspace_id,workflow_id,id);
alter table public.proposed_actions add foreign key(workspace_id,workflow_id,superseded_by_id) references public.proposed_actions(workspace_id,workflow_id,id);
create unique index proposal_single_replacement on public.proposed_actions(replaces_action_id) where replaces_action_id is not null;
create table public.action_approval_snapshots (
  id uuid primary key, workspace_id uuid not null, workflow_id uuid not null, action_id uuid not null, revision integer not null check(revision>0),
  schema_version integer not null check(schema_version=2), action_type text not null check(action_type in ('send_email','upsert_crm_contact','schedule_follow_up')),
  connection_id uuid, authorization_generation integer, envelope jsonb not null, digest text not null check(digest ~ '^[0-9a-f]{64}$'),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
  foreign key(workspace_id,workflow_id,action_id) references public.proposed_actions(workspace_id,workflow_id,id),
  foreign key(workspace_id,connection_id) references public.integration_connections(workspace_id,id), unique(action_id,revision), unique(workspace_id,workflow_id,id), unique(workspace_id,workflow_id,action_id,id),
  check((action_type='schedule_follow_up' and connection_id is null and authorization_generation is null) or (action_type<>'schedule_follow_up' and connection_id is not null and authorization_generation is not null))
);
alter table public.action_approval_snapshots enable row level security;
create policy snapshot_member_read on public.action_approval_snapshots for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.action_approval_snapshots from public,anon,authenticated;
grant select on public.action_approval_snapshots to authenticated,service_role;
create function public.immutable_snapshot() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Approval snapshots are immutable' using errcode='42501'; end; $$;
create trigger immutable_snapshot before update or delete on public.action_approval_snapshots for each row execute function public.immutable_snapshot();
create function public.canonical_action_json(p_value jsonb) returns text language plpgsql immutable set search_path='' as $$
declare v text; begin
  case jsonb_typeof(p_value)
    when 'object' then select '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || public.canonical_action_json(value),',' order by key collate "C"),'') || '}' into v from jsonb_each(p_value);
    when 'array' then select '[' || coalesce(string_agg(public.canonical_action_json(value),',' order by ordinal),'') || ']' into v from jsonb_array_elements(p_value) with ordinality a(value,ordinal);
    else v:=p_value::text;
  end case; return v;
end; $$;
create function public.action_envelope_digest(p_value jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(public.canonical_action_json(p_value),'UTF8'),'sha256'),'hex'); $$;
create function public.valid_contact_email(p_email text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(char_length(p_email) between 3 and 254 and p_email ~ '^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$' and p_email !~ E'[\r\n\x01]',false); $$;
create function public.assert_executable_envelope(p_action public.proposed_actions) returns void
language plpgsql security definer set search_path='' as $$
declare e jsonb:=p_action.executable_envelope; c public.integration_connections%rowtype; required text[];
begin
  if p_action.schema_version<>2 or e is null or e ->> 'schemaVersion' is distinct from '2' or e ->> 'actionType' is distinct from p_action.action_type
    or e ->> 'actionId' is distinct from p_action.id::text or e ->> 'workspaceId' is distinct from p_action.workspace_id::text
    or e ->> 'workflowId' is distinct from p_action.workflow_id::text or e ->> 'revision' is distinct from p_action.revision::text or pg_column_size(e)>65536
    then raise exception 'Non-executable action' using errcode='22023'; end if;
  if p_action.action_type in ('send_email','upsert_crm_contact') then
    if not public.valid_contact_email(e #>> '{recipient,email}') or e #>> '{recipient,provenance}' is distinct from 'user_supplied'
      or e #>> '{recipient,confirmedBy}' is null or e #>> '{recipient,confirmedAt}' is null
      or not exists(select 1 from public.leads where id=(e ->> 'leadId')::uuid and company_id=(e ->> 'companyId')::uuid and workflow_id=p_action.workflow_id and workspace_id=p_action.workspace_id)
      then raise exception 'Recipient or lead invalid' using errcode='22023'; end if;
    select * into c from public.integration_connections where id=(e #>> '{connection,id}')::uuid and workspace_id=p_action.workspace_id;
    required:=case p_action.action_type when 'send_email' then array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send'] else array['oauth','crm.objects.contacts.read','crm.objects.contacts.write'] end;
    if not found or c.status<>'connected' or c.generation::text is distinct from e #>> '{connection,generation}' or c.provider_identity is distinct from e #>> '{connection,identity}'
      or c.provider is distinct from e #>> '{connection,provider}' or not(c.scopes @> required) or (c.provider='gmail') is distinct from (p_action.action_type='send_email')
      then raise exception 'Connection not ready' using errcode='22023'; end if;
    if p_action.action_type='send_email' and (coalesce(char_length(e ->> 'subject'),0) not between 1 and 200 or e ->> 'subject' ~ E'[\r\n]' or coalesce(char_length(e ->> 'body'),0) not between 10 and 10000
      or e #> '{provenance,generationMetadata}' is distinct from p_action.payload -> 'generationMetadata'
      or e #> '{provenance,evidenceReferences}' is distinct from p_action.payload -> 'evidenceReferences') then raise exception 'Invalid approved content' using errcode='22023'; end if;
  elsif p_action.action_type='schedule_follow_up' then
    if e ->> 'dueAt' is null or (e ->> 'dueAt')::timestamptz<=now() or not exists(select 1 from pg_timezone_names where name=e ->> 'timezone') then raise exception 'Invalid follow-up date' using errcode='22023'; end if;
  else raise exception 'Unknown action type' using errcode='22023'; end if;
end; $$;

-- Keep legacy content decisions readable and usable, but never let them authorize v2.
alter function public.resolve_outreach_actions(uuid,public.approval_status,uuid[]) rename to resolve_outreach_actions_stage5;
revoke all on function public.resolve_outreach_actions_stage5(uuid,public.approval_status,uuid[]) from public,anon,authenticated,service_role;
create function public.resolve_outreach_actions(p_approval_id uuid,p_decision public.approval_status,p_action_ids uuid[] default null) returns public.approvals
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workflows where id=(select workflow_id from public.approvals where id=p_approval_id) for update;
  if exists(select 1 from public.proposed_actions where approval_id=p_approval_id and schema_version=2 and (p_action_ids is null or id=any(p_action_ids)))
    then raise exception 'Exact revisions required' using errcode='40001'; end if;
  return public.resolve_outreach_actions_stage5(p_approval_id,p_decision,p_action_ids);
end; $$;
revoke all on function public.resolve_outreach_actions(uuid,public.approval_status,uuid[]) from public,anon;
grant execute on function public.resolve_outreach_actions(uuid,public.approval_status,uuid[]) to authenticated;

alter function public.edit_proposed_email(uuid,text,text,integer) rename to edit_proposed_email_stage5;
revoke all on function public.edit_proposed_email_stage5(uuid,text,text,integer) from public,anon,authenticated,service_role;
create function public.edit_proposed_email(p_action_id uuid,p_subject text,p_body text,p_revision integer) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workflows where id=(select workflow_id from public.proposed_actions where id=p_action_id) for update;
  if exists(select 1 from public.proposed_actions where id=p_action_id and schema_version=2) then raise exception 'Executable revision requires recipient and sender review' using errcode='40001'; end if;
  return public.edit_proposed_email_stage5(p_action_id,p_subject,p_body,p_revision);
end; $$;
revoke all on function public.edit_proposed_email(uuid,text,text,integer) from public,anon;
grant execute on function public.edit_proposed_email(uuid,text,text,integer) to authenticated;

create function public.refresh_execution_decisions(p_workflow uuid,p_approval uuid) returns void
language plpgsql security definer set search_path='' as $$
declare pending integer; approved integer; auxiliary boolean;
begin
  select count(*) filter(where status in ('pending_approval','waiting_for_approval')),count(*) filter(where status in ('approved','executed')),coalesce(bool_and(is_auxiliary),false)
    into pending,approved,auxiliary from public.proposed_actions where approval_id=p_approval and superseded_by_id is null;
  if pending=0 then update public.approvals set status=case when approved>0 then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
    resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=p_approval and status='pending'; end if;
  if auxiliary then return; end if;
  if not exists(select 1 from public.proposed_actions where workflow_id=p_workflow and not is_auxiliary and superseded_by_id is null and status in ('pending_approval','waiting_for_approval')) then
    update public.workflow_tasks set status='completed',completed_at=clock_timestamp(),output=jsonb_build_object('approvalId',p_approval) where workflow_id=p_workflow and type='request_approval' and status in ('pending','blocked','running');
    if exists(select 1 from public.proposed_actions where workflow_id=p_workflow and not is_auxiliary and superseded_by_id is null and status in ('approved','executed')) then
      update public.workflows set status='ready_for_execution',current_step='Exact approvals saved; explicit Execute required' where id=p_workflow and status in ('waiting_for_approval','ready_for_execution','paused');
    else
      update public.workflow_tasks set status='cancelled',output='{"outcome":"no_authorized_actions"}' where workflow_id=p_workflow and type='execute_approved_actions' and status in ('pending','blocked');
      update public.workflows set status='completed',completed_at=clock_timestamp(),current_step='All outreach declined; no external execution' where id=p_workflow and status in ('waiting_for_approval','ready_for_execution','paused');
    end if;
  end if;
  update public.workflows set progress=(select 100*count(*) filter(where status='completed')/greatest(count(*),1) from public.workflow_tasks where workflow_id=p_workflow) where id=p_workflow;
end; $$;

create function public.decide_action_revisions(p_approval_id uuid,p_decision public.approval_status,p_revisions jsonb) returns public.approvals
language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype; approval public.approvals%rowtype; item jsonb; e jsonb;
begin
  select * into approval from public.approvals where id=p_approval_id;
  if not found then raise exception 'Approval not found' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(approval.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.workflows where id=approval.workflow_id and status<>'cancelled' for update;
  if not found then raise exception 'Workflow cancelled' using errcode='22023'; end if;
  select * into approval from public.approvals where id=p_approval_id for update;
  if approval.status<>'pending' or p_decision is null or p_decision not in ('approved','rejected') or jsonb_typeof(p_revisions) is distinct from 'array'
    or jsonb_array_length(p_revisions) not between 1 and 20 or (select count(distinct value ->> 'actionId') from jsonb_array_elements(p_revisions))<>jsonb_array_length(p_revisions)
    then raise exception 'Invalid decision' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_revisions) order by value ->> 'actionId' loop
    if (select count(*) from jsonb_object_keys(item))<>2 then raise exception 'Invalid revision selection' using errcode='22023'; end if;
    select * into a from public.proposed_actions where id=(item ->> 'actionId')::uuid and approval_id=p_approval_id for update;
    if not found or a.revision::text is distinct from item ->> 'revision' or a.status not in ('pending_approval','waiting_for_approval') or a.superseded_by_id is not null then raise exception 'Stale action revision' using errcode='40001'; end if;
    if p_decision='approved' and a.schema_version=2 then
      perform public.assert_executable_envelope(a); e:=a.executable_envelope;
      insert into public.action_approval_snapshots(id,workspace_id,workflow_id,action_id,revision,schema_version,action_type,connection_id,authorization_generation,envelope,digest,approved_by)
        values((e ->> 'snapshotId')::uuid,a.workspace_id,a.workflow_id,a.id,a.revision,2,a.action_type,(e #>> '{connection,id}')::uuid,(e #>> '{connection,generation}')::integer,e,public.action_envelope_digest(e),auth.uid());
    end if;
    update public.proposed_actions set status=case when p_decision='approved' then 'approved'::public.proposed_action_status else 'rejected'::public.proposed_action_status end where id=a.id;
    if a.action_type='send_email' then update public.leads set status=case when p_decision='approved' then 'outreach_ready'::public.lead_status else 'qualified'::public.lead_status end,
      outreach_status=case when p_decision='rejected' then 'rejected'::public.outreach_status when a.schema_version=1 then 'blocked_missing_recipient'::public.outreach_status else 'approved'::public.outreach_status end
      where id=(a.target ->> 'leadId')::uuid and workflow_id=a.workflow_id; end if;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(a.workspace_id,a.workflow_id,
      case when p_decision='approved' then 'proposed_action_approved'::public.agent_event_type else 'proposed_action_rejected'::public.agent_event_type end,
      'Action ' || p_decision::text || '; no provider mutation performed',jsonb_build_object('action_id',a.id,'revision',a.revision,'schema_version',a.schema_version,'actor',auth.uid(),'snapshot_id',e ->> 'snapshotId'));
    e:=null;
  end loop;
  perform public.refresh_execution_decisions(approval.workflow_id,p_approval_id);
  select * into approval from public.approvals where id=p_approval_id; return approval;
end; $$;

-- The caller supplies typed human edits only. IDs, provenance, confirmation actor/time and envelope are server-built.
create function public.save_executable_email(p_action_id uuid,p_revision integer,p_email text,p_name text,p_role text,p_connection uuid,p_subject text,p_body text) returns public.proposed_actions
language plpgsql security definer set search_path='' as $$
declare a public.proposed_actions%rowtype; old public.proposed_actions%rowtype; w public.workflows%rowtype; c public.integration_connections%rowtype; e jsonb; new_id uuid; new_approval uuid;
begin
  select * into a from public.proposed_actions where id=p_action_id;
  if not found then raise exception 'Action not found' using errcode='P0002'; end if;
  if auth.uid() is null or not public.is_workspace_member(a.workspace_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into w from public.workflows where id=a.workflow_id for update;
  select * into a from public.proposed_actions where id=p_action_id for update;
  if a.revision is distinct from p_revision or a.superseded_by_id is not null then raise exception 'Stale revision; review replacement' using errcode='40001'; end if;
  if a.action_type<>'send_email' or a.status not in ('pending_approval','waiting_for_approval','approved') or w.status in ('completed','cancelled')
    or not public.valid_contact_email(p_email) or coalesce(char_length(p_subject),0) not between 1 and 200 or p_subject ~ E'[\r\n]' or coalesce(char_length(p_body),0) not between 10 and 10000
    or coalesce(char_length(p_name),0)>240 or coalesce(char_length(p_role),0)>240 or coalesce(p_name,'') ~ E'[\r\n]' or coalesce(p_role,'') ~ E'[\r\n]'
    or a.payload -> 'generationMetadata' is null or not exists(select 1 from public.agent_runs where id=(a.payload #>> '{generationMetadata,outreachRunId}')::uuid and workflow_id=a.workflow_id and agent_type='outreach' and status='completed')
    then raise exception 'Draft is not editable or grounded' using errcode='22023'; end if;
  select * into c from public.integration_connections where id=p_connection and workspace_id=a.workspace_id and provider='gmail' and status='connected';
  if not found then raise exception 'Choose an active Gmail connection' using errcode='22023'; end if;
  -- The execution migration supplies the checked no-dispatch/no-uncertainty guard before allowing replacement.
  if a.status='approved' then
    if exists(select 1 from public.agent_runs where workflow_id=a.workflow_id and agent_type='executor' and status='running') then raise exception 'Executor active; replacement blocked' using errcode='22023'; end if;
    old:=a; new_id:=gen_random_uuid();
    insert into public.approvals(workspace_id,workflow_id,type,title,description,risk_level) values(a.workspace_id,a.workflow_id,'execution_replacement','Review replacement email','Previous approval remains in history. Review recipient, sender and content again.','medium') returning id into new_approval;
    insert into public.proposed_actions(id,workspace_id,workflow_id,approval_id,action_type,target,payload,status,risk_level,dedupe_key,lineage_id,replaces_action_id)
      values(new_id,a.workspace_id,a.workflow_id,new_approval,'send_email',a.target,a.payload,'pending_approval',a.risk_level,a.dedupe_key || ':replacement:' || a.revision,a.lineage_id,a.id) returning * into a;
    update public.proposed_actions set status='cancelled',superseded_by_id=new_id where id=old.id;
    insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(a.workspace_id,a.workflow_id,'proposal_superseded','Unexecuted approval replaced; new review required',jsonb_build_object('action_id',old.id,'replacement_id',a.id,'actor',auth.uid()));
  end if;
  e:=jsonb_build_object('schemaVersion',2,'actionType','send_email','workspaceId',a.workspace_id,'workflowId',a.workflow_id,'actionId',a.id,'snapshotId',gen_random_uuid(),
    'revision',a.revision+1,'lineageId',a.lineage_id,'companyId',a.target ->> 'companyId','leadId',a.target ->> 'leadId',
    'recipient',jsonb_build_object('email',p_email,'name',p_name,'role',p_role,'provenance','user_supplied','confirmedBy',auth.uid(),'confirmedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'connection',jsonb_build_object('provider','gmail','id',c.id,'generation',c.generation,'identity',c.provider_identity),'subject',p_subject,'body',p_body,
    'provenance',jsonb_build_object('generationMetadata',a.payload -> 'generationMetadata','evidenceReferences',a.payload -> 'evidenceReferences','personalization',a.payload -> 'personalization'));
  update public.proposed_actions set revision=revision+1,schema_version=2,executable_envelope=e,
    target=target || jsonb_build_object('recipientEmail',p_email,'recipientName',p_name),payload=payload || jsonb_build_object('subject',p_subject,'body',p_body,'executionReadiness','ready') where id=a.id returning * into a;
  perform public.assert_executable_envelope(a);
  update public.leads set status='waiting_approval',outreach_status='waiting_approval' where id=(a.target ->> 'leadId')::uuid and workflow_id=a.workflow_id;
  update public.workflows set status='waiting_for_approval',current_step='Recipient and sender saved; exact revision awaits approval' where id=a.workflow_id;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(a.workspace_id,a.workflow_id,'recipient_confirmed','User confirmed recipient; deliverability has not been verified',jsonb_build_object('action_id',a.id,'revision',a.revision,'connection_id',c.id,'actor',auth.uid()));
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(a.workspace_id,a.workflow_id,'proposed_action_edited','Human edits saved; original AI output retained',jsonb_build_object('action_id',a.id,'revision',a.revision,'actor',auth.uid()));
  return a;
end; $$;
-- Existing publisher gets a database-generated lineage without changing its 0.5 contract.
create function public.proposal_lineage_default() returns trigger language plpgsql set search_path='' as $$ begin new.lineage_id:=coalesce(new.lineage_id,new.id); return new; end; $$;
create trigger proposal_lineage_default before insert on public.proposed_actions for each row execute function public.proposal_lineage_default();
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
  ('immutable_snapshot','canonical_action_json','action_envelope_digest','valid_contact_email','assert_executable_envelope','refresh_execution_decisions','proposal_lineage_default','decide_action_revisions','save_executable_email') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.signature::text like 'decide_action_revisions%' or f.signature::text like 'save_executable_email%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
end loop; end $$;
