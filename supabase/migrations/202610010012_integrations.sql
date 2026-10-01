-- Public metadata is separate from protected credentials and one-use browser-bound state.
alter table public.agent_events alter column workflow_id drop not null;
alter table public.agent_events add constraint agent_events_workspace_fk foreign key(workspace_id) references public.workspaces(id) on delete cascade;
alter table public.agent_events add constraint workspace_event_linkage check(workflow_id is not null or
  (agent_run_id is null and workflow_task_id is null and event_type in ('integration_connected','integration_disconnected','integration_reconnect_required')));

create table public.integration_connections (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id), provider text not null check(provider in ('gmail','hubspot')),
  status text not null check(status in ('connected','disconnected','reconnect_required','blocked')), generation integer not null check(generation>0),
  provider_identity text not null check(char_length(provider_identity) between 1 and 320), display_name text not null check(char_length(display_name)<=500),
  scopes text[] not null, connected_by uuid not null references auth.users(id), connected_at timestamptz not null default now(), disconnected_at timestamptz,
  updated_at timestamptz not null default now(), unique(workspace_id,provider), unique(workspace_id,id)
);
create unique index integration_one_active_provider on public.integration_connections(workspace_id,provider) where status='connected';
create table public.integration_credentials (
  connection_id uuid primary key, workspace_id uuid not null, provider text not null, generation integer not null,
  encrypted_tokens text not null check(char_length(encrypted_tokens)<=32768), expires_at timestamptz not null, version integer not null default 1,
  refresh_claim uuid, refresh_lease timestamptz,
  foreign key(workspace_id,connection_id) references public.integration_connections(workspace_id,id) on delete cascade
);
create table public.integration_oauth_states (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'), workspace_id uuid not null references public.workspaces(id), user_id uuid not null references auth.users(id),
  provider text not null check(provider in ('gmail','hubspot')), binding_hash text not null, connection_id uuid not null,
  encrypted_verifier text not null, expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now(),
  check(expires_at <= created_at + interval '10 minutes')
);
alter table public.integration_connections enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.integration_oauth_states enable row level security;
create policy integration_metadata_member on public.integration_connections for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.integration_connections,public.integration_credentials,public.integration_oauth_states from public,anon,authenticated;
grant select on public.integration_connections to authenticated,service_role;
grant select on public.integration_credentials to service_role;

create function public.integration_assert_actor(p_workspace uuid,p_actor uuid,p_owner boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and (not p_owner or role='owner'))
    then raise exception 'Integration access denied' using errcode='42501'; end if;
end; $$;

create function public.begin_integration_oauth(p_workspace uuid,p_actor uuid,p_provider text,p_hash text,p_binding text,p_connection uuid,p_verifier text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.integration_assert_actor(p_workspace,p_actor,true);
  -- Bounded local cleanup, no worker. Existing unexpired states remain independently bound.
  delete from public.integration_oauth_states where workspace_id=p_workspace and expires_at < now();
  insert into public.integration_oauth_states(state_hash,workspace_id,user_id,provider,binding_hash,connection_id,encrypted_verifier,expires_at)
    values(p_hash,p_workspace,p_actor,p_provider,p_binding,p_connection,p_verifier,now()+interval '10 minutes');
end; $$;
create function public.consume_integration_oauth(p_hash text,p_actor uuid,p_provider text,p_binding text) returns public.integration_oauth_states
language plpgsql security definer set search_path='' as $$
declare v public.integration_oauth_states%rowtype;
begin
  select * into v from public.integration_oauth_states where state_hash=p_hash for update;
  if not found or v.user_id is distinct from p_actor or v.provider is distinct from p_provider or v.binding_hash is distinct from p_binding or v.expires_at<=now() or v.consumed_at is not null
    then raise exception 'OAuth state invalid' using errcode='42501'; end if;
  perform public.integration_assert_actor(v.workspace_id,p_actor,true);
  update public.integration_oauth_states set consumed_at=clock_timestamp() where state_hash=p_hash returning * into v;
  return v;
end; $$;
create function public.connect_integration(p_workspace uuid,p_actor uuid,p_id uuid,p_provider text,p_identity text,p_display text,p_scopes text[],p_tokens text,p_expires timestamptz) returns public.integration_connections
language plpgsql security definer set search_path='' as $$
declare v public.integration_connections%rowtype; v_required text[];
begin
  perform public.integration_assert_actor(p_workspace,p_actor,true);
  perform 1 from public.workspaces where id=p_workspace for update;
  select * into v from public.integration_connections where workspace_id=p_workspace and provider=p_provider for update;
  if found and v.id<>p_id then raise exception 'Connection changed' using errcode='40001'; end if;
  v_required:=case p_provider when 'gmail' then array['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.send']
    when 'hubspot' then array['oauth','crm.objects.contacts.read','crm.objects.contacts.write'] else null end;
  if v_required is null or p_scopes is null or not (p_scopes @> v_required) or p_expires<=now() or p_tokens is null then raise exception 'Invalid integration' using errcode='22023'; end if;
  insert into public.integration_connections(id,workspace_id,provider,status,generation,provider_identity,display_name,scopes,connected_by)
    values(p_id,p_workspace,p_provider,'connected',1,p_identity,p_display,p_scopes,p_actor)
    on conflict(workspace_id,provider) do update set status='connected',generation=public.integration_connections.generation+1,
      provider_identity=excluded.provider_identity,display_name=excluded.display_name,scopes=excluded.scopes,connected_by=p_actor,connected_at=clock_timestamp(),disconnected_at=null,updated_at=clock_timestamp() returning * into v;
  insert into public.integration_credentials(connection_id,workspace_id,provider,generation,encrypted_tokens,expires_at)
    values(v.id,p_workspace,p_provider,v.generation,p_tokens,p_expires) on conflict(connection_id) do update set generation=v.generation,
      encrypted_tokens=p_tokens,expires_at=p_expires,version=public.integration_credentials.version+1,refresh_claim=null,refresh_lease=null;
  insert into public.agent_events(workspace_id,event_type,summary,metadata) values(p_workspace,'integration_connected',p_provider || ' connected; previous approvals require review after reconnect',
    jsonb_build_object('connection_id',v.id,'generation',v.generation,'provider',p_provider,'actor',p_actor));
  return v;
end; $$;
create function public.disconnect_integration(p_workspace uuid,p_actor uuid,p_connection uuid) returns public.integration_connections
language plpgsql security definer set search_path='' as $$
declare v public.integration_connections%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor,true);
  select * into v from public.integration_connections where workspace_id=p_workspace and id=p_connection for update;
  if not found then raise exception 'Connection not found' using errcode='P0002'; end if;
  if v.status='disconnected' then return v; end if;
  update public.integration_connections set status='disconnected',generation=generation+1,disconnected_at=clock_timestamp(),updated_at=clock_timestamp() where id=v.id returning * into v;
  delete from public.integration_credentials where connection_id=v.id;
  insert into public.agent_events(workspace_id,event_type,summary,metadata) values(p_workspace,'integration_disconnected',v.provider || ' disconnected locally; in-flight requests cannot be revoked',
    jsonb_build_object('connection_id',v.id,'provider',v.provider,'actor',p_actor,'generation',v.generation));
  return v;
end; $$;
create function public.claim_integration_refresh(p_workspace uuid,p_actor uuid,p_connection uuid,p_generation integer,p_claim uuid) returns public.integration_credentials
language plpgsql security definer set search_path='' as $$
declare v public.integration_credentials%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  perform 1 from public.integration_connections where id=p_connection and workspace_id=p_workspace and generation=p_generation and status='connected' for update;
  if not found then raise exception 'Connection authorization changed' using errcode='40001'; end if;
  select * into v from public.integration_credentials where connection_id=p_connection for update;
  if not found then raise exception 'Credentials unavailable' using errcode='22023'; end if;
  if v.expires_at>now()+interval '60 seconds' then return v; end if;
  if v.refresh_claim is not null and v.refresh_lease>now() then raise exception 'Refresh in progress' using errcode='40001'; end if;
  update public.integration_credentials set refresh_claim=p_claim,refresh_lease=now()+interval '60 seconds' where connection_id=p_connection returning * into v;
  return v;
end; $$;
create function public.finish_integration_refresh(p_workspace uuid,p_actor uuid,p_connection uuid,p_generation integer,p_claim uuid,p_version integer,p_tokens text,p_expires timestamptz,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare v public.integration_connections%rowtype;
begin
  perform public.integration_assert_actor(p_workspace,p_actor);
  select * into v from public.integration_connections where id=p_connection and workspace_id=p_workspace for update;
  if not found or v.generation<>p_generation or v.status<>'connected' then raise exception 'Connection changed' using errcode='40001'; end if;
  perform 1 from public.integration_credentials where connection_id=p_connection and generation=p_generation and refresh_claim=p_claim and version=p_version for update;
  if not found then raise exception 'Refresh fenced' using errcode='40001'; end if;
  if p_error is not null then
    if p_error not in ('reconnect_required','missing_scopes','identity_changed','refresh_failed') then raise exception 'Invalid error' using errcode='22023'; end if;
    perform public.integration_assert_actor(p_workspace,v.connected_by,true);
    update public.integration_connections set status=case when p_error='missing_scopes' then 'blocked' else 'reconnect_required' end,updated_at=clock_timestamp() where id=p_connection;
    update public.integration_credentials set refresh_claim=null,refresh_lease=null where connection_id=p_connection;
    insert into public.agent_events(workspace_id,event_type,summary,metadata) values(p_workspace,'integration_reconnect_required','Owner reconnection required',
      jsonb_build_object('connection_id',p_connection,'provider',v.provider,'safe_error_code',p_error,'actor',p_actor,'authorization_owner',v.connected_by));
  else
    if p_tokens is null or p_expires<=now() then raise exception 'Invalid refresh' using errcode='22023'; end if;
    update public.integration_credentials set encrypted_tokens=p_tokens,expires_at=p_expires,version=version+1,refresh_claim=null,refresh_lease=null where connection_id=p_connection;
  end if;
end; $$;
-- All writer entry points are service-only; each independently verifies the supplied verified actor.
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
  ('integration_assert_actor','begin_integration_oauth','consume_integration_oauth','connect_integration','disconnect_integration','claim_integration_refresh','finish_integration_refresh') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
end loop; end $$;
