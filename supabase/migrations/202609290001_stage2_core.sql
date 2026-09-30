-- Stage 2 persistence. Apply through Supabase migrations, never through dashboard-only edits.
-- The client role may read only its workspaces. State changes and audit writes use RPCs below.

create type public.workspace_member_role as enum ('owner', 'member');
create type public.workflow_status as enum (
  'draft', 'planning', 'running', 'waiting_for_approval',
  'ready_for_execution', 'needs_revision', 'paused',
  'completed', 'failed', 'cancelled'
);
create type public.workflow_task_status as enum ('pending', 'running', 'blocked', 'completed', 'failed', 'cancelled');
create type public.company_research_status as enum ('queued', 'researching', 'researched', 'failed');
create type public.lead_status as enum (
  'new', 'qualified', 'outreach_ready', 'waiting_approval',
  'contacted', 'responded', 'converted', 'rejected'
);
create type public.lead_confidence as enum ('low', 'medium', 'high');
create type public.outreach_status as enum ('not_started', 'drafted', 'waiting_approval', 'approved', 'sent');
create type public.agent_type as enum ('planner', 'researcher', 'reviewer', 'executor');
create type public.agent_run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.agent_event_type as enum (
  'workflow_created', 'workflow_started', 'workflow_paused',
  'workflow_resumed', 'workflow_completed', 'workflow_failed',
  'workflow_cancelled', 'workflow_ready_for_execution', 'workflow_needs_revision',
  'agent_started', 'agent_completed', 'agent_failed', 'reasoning_summary',
  'task_started', 'task_completed', 'task_failed',
  'tool_called', 'tool_completed', 'tool_failed',
  'company_discovered', 'company_researched', 'lead_scored',
  'approval_requested', 'approval_approved', 'approval_rejected',
  'execution_started', 'execution_completed', 'execution_failed',
  'error', 'retry'
);
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'executed');
create type public.risk_level as enum ('low', 'medium', 'high');
create type public.proposed_action_status as enum (
  'waiting_for_approval', 'approved', 'rejected', 'cancelled', 'executed', 'failed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 160),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  is_personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workspaces_one_personal_per_creator on public.workspaces(created_by) where is_personal;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  goal text not null check (char_length(trim(goal)) between 1 and 4000),
  status public.workflow_status not null default 'draft',
  progress smallint not null default 0 check (progress between 0 and 100),
  current_step text not null default 'Awaiting start' check (char_length(current_step) <= 240),
  target_companies integer not null default 20 check (target_companies between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  unique (workspace_id, id)
);

create table public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workflow_id uuid not null,
  type text not null check (type ~ '^[a-z][a-z0-9_]{1,63}$'),
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '' check (char_length(description) <= 2000),
  status public.workflow_task_status not null default 'pending',
  position integer not null check (position > 0),
  input jsonb,
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, workflow_id) references public.workflows(workspace_id, id) on delete cascade,
  unique (workspace_id, workflow_id, id),
  unique (workflow_id, position)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 240),
  website text check (website is null or char_length(website) <= 2048),
  industry text check (industry is null or char_length(industry) <= 240),
  location text check (location is null or char_length(location) <= 240),
  description text check (description is null or char_length(description) <= 4000),
  employee_estimate text check (employee_estimate is null or char_length(employee_estimate) <= 100),
  research_summary text check (research_summary is null or char_length(research_summary) <= 8000),
  research_status public.company_research_status not null default 'queued',
  -- Seed rows use []. Later stages can migrate entries to typed source objects.
  source_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(source_urls) = 'array'),
  last_researched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, workflow_id) references public.workflows(workspace_id, id) on delete set null (workflow_id),
  unique (workspace_id, id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null,
  workflow_id uuid not null,
  status public.lead_status not null default 'new',
  score smallint check (score between 0 and 100),
  score_reason text check (score_reason is null or char_length(score_reason) <= 4000),
  opportunity text check (opportunity is null or char_length(opportunity) <= 2000),
  confidence public.lead_confidence,
  outreach_status public.outreach_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, company_id) references public.companies(workspace_id, id) on delete cascade,
  foreign key (workspace_id, workflow_id) references public.workflows(workspace_id, id) on delete cascade,
  unique (workspace_id, workflow_id, company_id)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workflow_id uuid not null,
  workflow_task_id uuid,
  agent_type public.agent_type not null,
  status public.agent_run_status not null default 'queued',
  model text check (model is null or char_length(model) <= 200),
  input jsonb,
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, workflow_id) references public.workflows(workspace_id, id) on delete cascade,
  foreign key (workspace_id, workflow_id, workflow_task_id)
    references public.workflow_tasks(workspace_id, workflow_id, id) on delete set null (workflow_task_id),
  unique (workspace_id, workflow_id, id)
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workflow_id uuid not null,
  agent_run_id uuid,
  workflow_task_id uuid,
  event_type public.agent_event_type not null,
  summary text not null check (char_length(trim(summary)) between 1 and 500),
  -- Safe summaries and structured context only. Never write model chain-of-thought.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 16384),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, workflow_id) references public.workflows(workspace_id, id) on delete cascade,
  foreign key (workspace_id, workflow_id, agent_run_id)
    references public.agent_runs(workspace_id, workflow_id, id) on delete set null (agent_run_id),
  foreign key (workspace_id, workflow_id, workflow_task_id)
    references public.workflow_tasks(workspace_id, workflow_id, id) on delete set null (workflow_task_id)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workflow_id uuid not null,
  requested_by_agent_run_id uuid,
  type text not null check (type ~ '^[a-z][a-z0-9_]{1,63}$'),
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '' check (char_length(description) <= 4000),
  status public.approval_status not null default 'pending',
  risk_level public.risk_level not null default 'medium',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  foreign key (workspace_id, workflow_id) references public.workflows(workspace_id, id) on delete cascade,
  foreign key (workspace_id, workflow_id, requested_by_agent_run_id)
    references public.agent_runs(workspace_id, workflow_id, id) on delete set null (requested_by_agent_run_id),
  unique (workspace_id, workflow_id, id)
);

create table public.proposed_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workflow_id uuid not null,
  approval_id uuid not null,
  action_type text not null check (action_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  target jsonb not null default '{}'::jsonb check (jsonb_typeof(target) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status public.proposed_action_status not null default 'waiting_for_approval',
  risk_level public.risk_level not null default 'medium',
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  error jsonb,
  foreign key (workspace_id, workflow_id, approval_id)
    references public.approvals(workspace_id, workflow_id, id) on delete cascade
);

create index workspace_members_user_id_idx on public.workspace_members(user_id, workspace_id);
create index workflows_workspace_created_idx on public.workflows(workspace_id, created_at desc);
create index workflows_workspace_status_idx on public.workflows(workspace_id, status, updated_at desc);
create index workflow_tasks_workflow_position_idx on public.workflow_tasks(workflow_id, position);
create index companies_workspace_name_idx on public.companies(workspace_id, name);
create index companies_workspace_workflow_idx on public.companies(workspace_id, workflow_id);
create index companies_workspace_status_idx on public.companies(workspace_id, research_status);
create index leads_workspace_workflow_idx on public.leads(workspace_id, workflow_id);
create index leads_workspace_company_idx on public.leads(workspace_id, company_id);
create index leads_workspace_status_score_idx on public.leads(workspace_id, status, score desc);
create index agent_runs_workflow_created_idx on public.agent_runs(workflow_id, created_at desc);
create index agent_events_workspace_created_idx on public.agent_events(workspace_id, created_at desc);
create index agent_events_workflow_created_idx on public.agent_events(workflow_id, created_at desc);
create index approvals_workspace_status_created_idx on public.approvals(workspace_id, status, created_at desc);
create index approvals_workflow_created_idx on public.approvals(workflow_id, created_at desc);
create index proposed_actions_approval_idx on public.proposed_actions(approval_id, created_at);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger workflows_updated_at before update on public.workflows
  for each row execute function public.set_updated_at();
create trigger workflow_tasks_updated_at before update on public.workflow_tasks
  for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- Definer helper avoids recursive workspace_members policies. Only auth.uid() is considered.
create function public.is_workspace_member(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = (select auth.uid())
  );
$$;

create function public.is_workspace_owner(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_tasks enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_events enable row level security;
alter table public.approvals enable row level security;
alter table public.proposed_actions enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy workspaces_select_member on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update_owner on public.workspaces for update to authenticated
  using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));
create policy workspace_members_select_member on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workflows_select_member on public.workflows for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workflow_tasks_select_member on public.workflow_tasks for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy companies_select_member on public.companies for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy leads_select_member on public.leads for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy agent_runs_select_member on public.agent_runs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy agent_events_select_member on public.agent_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy approvals_select_member on public.approvals for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy proposed_actions_select_member on public.proposed_actions for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Restrict SQL privileges too: no direct writes can bypass transition/event RPCs.
revoke all on all tables in schema public from public, anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members,
  public.workflows, public.workflow_tasks, public.companies, public.leads,
  public.agent_runs, public.agent_events, public.approvals, public.proposed_actions
  to authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members,
  public.workflows, public.workflow_tasks, public.companies, public.leads,
  public.agent_runs, public.approvals, public.proposed_actions
  to service_role;
grant select, insert on public.agent_events to service_role;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant update (name, slug) on public.workspaces to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid), public.is_workspace_owner(uuid) to authenticated;

-- One personal workspace per user. The function is safe to repeat after every sign-in.
create function public.bootstrap_workspace() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(email, '@', 1), ''),
    'Operator'
  ) into v_display_name from auth.users where id = v_user_id;

  if v_display_name is null then
    raise exception 'Authenticated user not found' using errcode = '42501';
  end if;

  insert into public.profiles (id, full_name)
  values (v_user_id, left(v_display_name, 160))
  on conflict (id) do nothing;

  insert into public.workspaces (name, slug, created_by, is_personal)
  values (
    left(v_display_name || ' Workspace', 160),
    'user-' || replace(v_user_id::text, '-', ''),
    v_user_id,
    true
  )
  on conflict (created_by) where is_personal do nothing;

  select id into v_workspace_id from public.workspaces
  where created_by = v_user_id and is_personal;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';

  return v_workspace_id;
end;
$$;

-- Creation is atomic: one workflow, deterministic starter tasks, and its first audit event.
create function public.create_workflow(
  p_workspace_id uuid,
  p_title text,
  p_goal text,
  p_target_companies integer default 20
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow_id uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(trim(coalesce(p_goal, ''))) not between 1 and 4000
     or p_target_companies is null or p_target_companies not between 1 and 1000 then
    raise exception 'Invalid workflow input' using errcode = '22023';
  end if;

  insert into public.workflows (
    workspace_id, created_by, title, goal, status, progress, current_step, target_companies
  ) values (
    p_workspace_id, auth.uid(), trim(p_title), trim(p_goal), 'planning', 0,
    'Starter plan ready', p_target_companies
  ) returning id into v_workflow_id;

  insert into public.workflow_tasks (workspace_id, workflow_id, type, title, description, position)
  values
    (p_workspace_id, v_workflow_id, 'define_target_profile', 'Define target profile',
      'Confirm the target market and qualification criteria.', 1),
    (p_workspace_id, v_workflow_id, 'discover_companies', 'Discover companies',
      'Find candidate companies and record source links.', 2),
    (p_workspace_id, v_workflow_id, 'research_companies', 'Research companies',
      'Review products, operations signals and source evidence.', 3),
    (p_workspace_id, v_workflow_id, 'qualify_opportunities', 'Qualify opportunities',
      'Assess specific opportunities against the target profile.', 4),
    (p_workspace_id, v_workflow_id, 'score_leads', 'Score leads',
      'Record scores and concise evidence-based reasons.', 5),
    (p_workspace_id, v_workflow_id, 'prepare_outreach', 'Prepare outreach',
      'Draft personalized proposals grounded in research.', 6),
    (p_workspace_id, v_workflow_id, 'request_approval', 'Request approval',
      'Hold all proposed external actions for human review.', 7);

  insert into public.agent_events (workspace_id, workflow_id, event_type, summary, metadata)
  values (
    p_workspace_id, v_workflow_id, 'workflow_created',
    'Workflow created with a deterministic starter plan.',
    jsonb_build_object('source', 'user', 'starter_task_count', 7)
  );

  return v_workflow_id;
end;
$$;

create function public.transition_workflow(
  p_workflow_id uuid,
  p_next_status public.workflow_status,
  p_summary text default null
) returns public.workflows
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow public.workflows%rowtype;
  v_previous_status public.workflow_status;
  v_event_type public.agent_event_type;
  v_summary text;
  v_allowed boolean;
begin
  select * into v_workflow from public.workflows where id = p_workflow_id for update;
  if not found then
    raise exception 'Workflow not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.is_workspace_member(v_workflow.workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  v_previous_status := v_workflow.status;

  v_allowed := case v_workflow.status
    when 'draft' then p_next_status in ('planning', 'cancelled')
    when 'planning' then p_next_status in ('running', 'failed', 'cancelled')
    when 'running' then p_next_status in ('waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled')
    when 'waiting_for_approval' then p_next_status in ('running', 'ready_for_execution', 'needs_revision', 'cancelled')
    when 'ready_for_execution' then p_next_status in ('running', 'cancelled')
    when 'needs_revision' then p_next_status in ('running', 'cancelled')
    when 'paused' then p_next_status in ('running', 'cancelled')
    else false
  end;
  if not coalesce(v_allowed, false) then
    raise exception 'Invalid workflow transition from % to %', v_workflow.status, p_next_status
      using errcode = '22023';
  end if;
  if p_next_status = 'ready_for_execution' and exists (
    select 1 from public.approvals
    where workflow_id = p_workflow_id and status <> 'approved'
  ) then
    raise exception 'Unapproved actions remain' using errcode = '22023';
  end if;
  if p_next_status = 'needs_revision' and not exists (
    select 1 from public.approvals
    where workflow_id = p_workflow_id and status = 'rejected'
  ) then
    raise exception 'No rejected approval requires revision' using errcode = '22023';
  end if;
  if p_next_status = 'ready_for_execution' and not exists (
    select 1 from public.approvals where workflow_id = p_workflow_id
  ) then
    raise exception 'No approved action exists' using errcode = '22023';
  end if;
  if v_previous_status = 'waiting_for_approval' and p_next_status = 'running'
     and exists (select 1 from public.approvals
       where workflow_id = p_workflow_id and status = 'pending') then
    raise exception 'Pending approvals must be resolved before resuming' using errcode = '22023';
  end if;
  if p_next_status = 'completed' and exists (
    select 1 from public.proposed_actions
    where workflow_id = p_workflow_id and status in ('waiting_for_approval', 'approved')
  ) then
    raise exception 'Proposed actions have not been executed or cancelled' using errcode = '22023';
  end if;

  v_event_type := case p_next_status
    when 'running' then case when v_workflow.status = 'planning' then 'workflow_started'::public.agent_event_type
                        else 'workflow_resumed'::public.agent_event_type end
    when 'paused' then 'workflow_paused'::public.agent_event_type
    when 'completed' then 'workflow_completed'::public.agent_event_type
    when 'failed' then 'workflow_failed'::public.agent_event_type
    when 'cancelled' then 'workflow_cancelled'::public.agent_event_type
    when 'ready_for_execution' then 'workflow_ready_for_execution'::public.agent_event_type
    when 'needs_revision' then 'workflow_needs_revision'::public.agent_event_type
    else 'reasoning_summary'::public.agent_event_type
  end;
  v_summary := coalesce(nullif(trim(p_summary), ''),
    'Workflow moved from ' || v_workflow.status::text || ' to ' || p_next_status::text || '.');
  if char_length(v_summary) > 500 then
    raise exception 'Transition summary is too long' using errcode = '22023';
  end if;

  update public.workflows set
    status = p_next_status,
    current_step = case p_next_status
      when 'running' then 'Workflow in progress'
      when 'waiting_for_approval' then 'Waiting for human approval'
      when 'ready_for_execution' then 'Approved actions await execution'
      when 'needs_revision' then 'Approval rejected; revision needed'
      when 'paused' then 'Paused'
      when 'completed' then 'Workflow complete'
      when 'failed' then 'Workflow failed'
      when 'cancelled' then 'Cancelled'
      else 'Planning' end,
    progress = case when p_next_status = 'completed' then 100 else progress end,
    started_at = case when p_next_status = 'running' and started_at is null then now() else started_at end,
    completed_at = case when p_next_status = 'completed' then now() else completed_at end,
    failed_at = case when p_next_status = 'failed' then now() else failed_at end
  where id = p_workflow_id returning * into v_workflow;

  insert into public.agent_events (workspace_id, workflow_id, event_type, summary, metadata)
  values (v_workflow.workspace_id, v_workflow.id, v_event_type, v_summary,
    jsonb_build_object('from_status', v_previous_status::text, 'to_status', p_next_status::text));

  return v_workflow;
end;
$$;

-- Future privileged runtime uses this append-only entry point.
create function public.record_agent_event(
  p_workspace_id uuid,
  p_workflow_id uuid,
  p_event_type public.agent_event_type,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb,
  p_agent_run_id uuid default null,
  p_workflow_task_id uuid default null
) returns public.agent_events
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.agent_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Privileged event writer required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workflows where id = p_workflow_id and workspace_id = p_workspace_id) then
    raise exception 'Workflow not found' using errcode = 'P0002';
  end if;
  if p_event_type is null or char_length(trim(coalesce(p_summary, ''))) not between 1 and 500
     or jsonb_typeof(p_metadata) is distinct from 'object'
     or pg_column_size(p_metadata) > 16384 then
    raise exception 'Invalid event input' using errcode = '22023';
  end if;
  if p_agent_run_id is not null and not exists (
    select 1 from public.agent_runs
    where id = p_agent_run_id and workflow_id = p_workflow_id and workspace_id = p_workspace_id
  ) then
    raise exception 'Agent run does not belong to workflow' using errcode = '22023';
  end if;
  if p_workflow_task_id is not null and not exists (
    select 1 from public.workflow_tasks
    where id = p_workflow_task_id and workflow_id = p_workflow_id and workspace_id = p_workspace_id
  ) then
    raise exception 'Task does not belong to workflow' using errcode = '22023';
  end if;

  insert into public.agent_events (
    workspace_id, workflow_id, agent_run_id, workflow_task_id, event_type, summary, metadata
  ) values (
    p_workspace_id, p_workflow_id, p_agent_run_id, p_workflow_task_id,
    p_event_type, trim(p_summary), p_metadata
  ) returning * into v_event;
  return v_event;
end;
$$;

-- Approval authorizes proposed actions. This function never performs an external action.
create function public.request_approval(
  p_workspace_id uuid,
  p_workflow_id uuid,
  p_type text,
  p_title text,
  p_description text,
  p_risk_level public.risk_level,
  p_actions jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow public.workflows%rowtype;
  v_approval_id uuid;
  v_action jsonb;
  v_action_risk public.risk_level;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select * into v_workflow from public.workflows
  where id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then
    raise exception 'Workflow not found' using errcode = 'P0002';
  end if;
  if v_workflow.status not in ('running', 'waiting_for_approval') then
    raise exception 'Workflow is not ready for approval' using errcode = '22023';
  end if;
  if coalesce(p_type, '') !~ '^[a-z][a-z0-9_]{1,63}$'
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 240
     or char_length(coalesce(p_description, '')) > 4000
     or p_risk_level is null
     or jsonb_typeof(p_actions) is distinct from 'array'
     or pg_column_size(p_actions) > 131072 then
    raise exception 'Invalid approval input' using errcode = '22023';
  end if;
  if jsonb_array_length(p_actions) not between 1 and 100 then
    raise exception 'Approval must contain 1 to 100 proposed actions' using errcode = '22023';
  end if;

  -- Validate every item before any insert. Never accept a client-supplied status or execution time.
  for v_action in select value from jsonb_array_elements(p_actions) loop
    if jsonb_typeof(v_action) is distinct from 'object'
       or coalesce(v_action ->> 'action_type', '') !~ '^[a-z][a-z0-9_]{1,63}$'
       or jsonb_typeof(v_action -> 'target') is distinct from 'object'
       or jsonb_typeof(v_action -> 'payload') is distinct from 'object'
       or (v_action ? 'risk_level' and (v_action ->> 'risk_level') not in ('low', 'medium', 'high')) then
      raise exception 'Invalid proposed action input' using errcode = '22023';
    end if;
  end loop;

  insert into public.approvals (workspace_id, workflow_id, type, title, description, risk_level)
  values (p_workspace_id, p_workflow_id, p_type, trim(p_title), coalesce(p_description, ''), p_risk_level)
  returning id into v_approval_id;

  for v_action in select value from jsonb_array_elements(p_actions) loop
    v_action_risk := coalesce((v_action ->> 'risk_level')::public.risk_level, p_risk_level);
    insert into public.proposed_actions (
      workspace_id, workflow_id, approval_id, action_type, target, payload, risk_level
    ) values (
      p_workspace_id, p_workflow_id, v_approval_id, v_action ->> 'action_type',
      v_action -> 'target', v_action -> 'payload', v_action_risk
    );
  end loop;

  if v_workflow.status = 'running' then
    update public.workflows set status = 'waiting_for_approval',
      current_step = 'Waiting for human approval'
    where id = p_workflow_id;
  end if;
  insert into public.agent_events (workspace_id, workflow_id, event_type, summary, metadata)
  values (
    p_workspace_id, p_workflow_id, 'approval_requested',
    'Approval requested: ' || left(trim(p_title), 470),
    jsonb_build_object('approval_id', v_approval_id, 'action_count', jsonb_array_length(p_actions))
  );
  return v_approval_id;
end;
$$;

create function public.resolve_approval(
  p_approval_id uuid,
  p_decision public.approval_status,
  p_action_edits jsonb default '[]'::jsonb
) returns public.approvals
language plpgsql security definer set search_path = '' as $$
declare
  v_approval public.approvals%rowtype;
  v_workflow public.workflows%rowtype;
  v_action public.proposed_actions%rowtype;
  v_edit jsonb;
  v_action_id uuid;
  v_seen_action_ids uuid[] := '{}'::uuid[];
  v_edited_action_count integer := 0;
  v_has_pending boolean;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Approval decision must be approved or rejected' using errcode = '22023';
  end if;
  if jsonb_typeof(p_action_edits) is distinct from 'array'
     or pg_column_size(p_action_edits) > 1048576 then
    raise exception 'Invalid approval edits' using errcode = '22023';
  end if;
  if jsonb_array_length(p_action_edits) > 100 then
    raise exception 'Too many approval edits' using errcode = '22023';
  end if;
  select * into v_approval from public.approvals where id = p_approval_id;
  if not found then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.is_workspace_member(v_approval.workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  -- Lock workflow first to serialize decisions across multiple approvals for it.
  select * into v_workflow from public.workflows where id = v_approval.workflow_id for update;
  select * into v_approval from public.approvals where id = p_approval_id for update;
  if v_approval.status <> 'pending' then
    raise exception 'Approval has already been resolved' using errcode = '22023';
  end if;

  -- Save reviewed edits in the same transaction as the decision. Keep unrelated
  -- payload fields intact, and never include message content in audit metadata.
  for v_edit in select value from jsonb_array_elements(p_action_edits) loop
    if jsonb_typeof(v_edit) is distinct from 'object'
       or coalesce(v_edit ->> 'action_id', '') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or jsonb_typeof(v_edit -> 'subject') is distinct from 'string'
       or jsonb_typeof(v_edit -> 'body') is distinct from 'string'
       or char_length(trim(coalesce(v_edit ->> 'subject', ''))) not between 1 and 200
       or char_length(trim(coalesce(v_edit ->> 'body', ''))) not between 10 and 10000 then
      raise exception 'Invalid outreach draft edit' using errcode = '22023';
    end if;
    v_action_id := (v_edit ->> 'action_id')::uuid;
    if v_action_id = any(v_seen_action_ids) then
      raise exception 'Duplicate action edit' using errcode = '22023';
    end if;
    v_seen_action_ids := array_append(v_seen_action_ids, v_action_id);

    select * into v_action from public.proposed_actions
    where id = v_action_id and approval_id = v_approval.id
      and workspace_id = v_approval.workspace_id and workflow_id = v_approval.workflow_id
    for update;
    if not found or v_action.action_type <> 'send_email'
       or v_action.status <> 'waiting_for_approval' then
      raise exception 'Action is not editable for this approval' using errcode = '22023';
    end if;
    update public.proposed_actions
    set payload = jsonb_set(
      jsonb_set(v_action.payload, '{subject}', to_jsonb(trim(v_edit ->> 'subject')), true),
      '{body}', to_jsonb(trim(v_edit ->> 'body')), true
    )
    where id = v_action_id;
    v_edited_action_count := v_edited_action_count + 1;
  end loop;

  update public.approvals set status = p_decision, resolved_at = now(), resolved_by = auth.uid()
  where id = p_approval_id returning * into v_approval;
  update public.proposed_actions
  set status = case when p_decision = 'approved' then 'approved'::public.proposed_action_status
                    else 'rejected'::public.proposed_action_status end
  where approval_id = p_approval_id and status = 'waiting_for_approval';

  if v_workflow.status = 'waiting_for_approval' then
    if p_decision = 'rejected' then
      update public.workflows set status = 'needs_revision',
        current_step = 'Approval rejected; revision needed'
      where id = v_workflow.id;
    else
      select exists (
        select 1 from public.approvals
        where workflow_id = v_workflow.id and status = 'pending'
      ) into v_has_pending;
      if not v_has_pending then
        update public.workflows set status = 'ready_for_execution',
          current_step = 'Approved actions await execution'
        where id = v_workflow.id;
      end if;
    end if;
  end if;

  insert into public.agent_events (workspace_id, workflow_id, event_type, summary, metadata)
  values (
    v_approval.workspace_id, v_approval.workflow_id,
    case when p_decision = 'approved' then 'approval_approved'::public.agent_event_type
         else 'approval_rejected'::public.agent_event_type end,
    case when p_decision = 'approved' then 'Approved: ' else 'Rejected: ' end || left(v_approval.title, 470),
    jsonb_build_object('approval_id', v_approval.id, 'decision', p_decision::text,
      'resolved_by', auth.uid(), 'edited_action_count', v_edited_action_count)
  );
  return v_approval;
end;
$$;

create function public.transition_workflow_task(
  p_task_id uuid,
  p_next_status public.workflow_task_status,
  p_summary text default null
) returns public.workflow_tasks
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.workflow_tasks%rowtype;
  v_previous_status public.workflow_task_status;
  v_workflow_status public.workflow_status;
  v_event_type public.agent_event_type;
  v_summary text;
  v_allowed boolean;
  v_total_tasks integer;
  v_completed_tasks integer;
  v_next_task_title text;
begin
  select * into v_task from public.workflow_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.is_workspace_member(v_task.workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select status into v_workflow_status from public.workflows
  where id = v_task.workflow_id for update;
  v_previous_status := v_task.status;
  v_allowed := case v_task.status
    when 'pending' then p_next_status in ('running', 'blocked', 'cancelled')
    when 'running' then p_next_status in ('completed', 'failed', 'blocked', 'cancelled')
    when 'blocked' then p_next_status in ('pending', 'cancelled')
    when 'failed' then p_next_status in ('pending', 'cancelled')
    else false
  end;
  if not coalesce(v_allowed, false) then
    raise exception 'Invalid task transition from % to %', v_task.status, p_next_status
      using errcode = '22023';
  end if;
  if p_next_status = 'running' and v_workflow_status <> 'running' then
    raise exception 'Workflow must be running before a task starts' using errcode = '22023';
  end if;
  v_summary := coalesce(nullif(trim(p_summary), ''),
    v_task.title || ' moved to ' || p_next_status::text || '.');
  if char_length(v_summary) > 500 then
    raise exception 'Transition summary is too long' using errcode = '22023';
  end if;

  update public.workflow_tasks set
    status = p_next_status,
    started_at = case when p_next_status = 'running' then now() else started_at end,
    completed_at = case when p_next_status = 'completed' then now() else completed_at end
  where id = p_task_id returning * into v_task;

  select count(*), count(*) filter (where status = 'completed')
    into v_total_tasks, v_completed_tasks
  from public.workflow_tasks where workflow_id = v_task.workflow_id;
  select title into v_next_task_title from public.workflow_tasks
  where workflow_id = v_task.workflow_id and status in ('running', 'pending', 'blocked')
  order by case when status = 'running' then 0 else 1 end, position
  limit 1;
  update public.workflows set
    progress = case when status = 'completed' then 100
      else least(99, (100 * v_completed_tasks / greatest(v_total_tasks, 1))) end,
    current_step = case when status <> 'running' then current_step
      else case p_next_status
        when 'running' then v_task.title
        when 'failed' then left('Task failed: ' || v_task.title, 240)
        when 'blocked' then left('Task blocked: ' || v_task.title, 240)
        when 'completed' then coalesce(v_next_task_title, 'Tasks complete')
        else current_step end end
  where id = v_task.workflow_id;

  v_event_type := case p_next_status
    when 'running' then 'task_started'::public.agent_event_type
    when 'completed' then 'task_completed'::public.agent_event_type
    when 'failed' then 'task_failed'::public.agent_event_type
    else 'reasoning_summary'::public.agent_event_type
  end;
  insert into public.agent_events (
    workspace_id, workflow_id, workflow_task_id, event_type, summary, metadata
  ) values (
    v_task.workspace_id, v_task.workflow_id, v_task.id, v_event_type, v_summary,
    jsonb_build_object('from_status', v_previous_status::text, 'to_status', p_next_status::text)
  );
  return v_task;
end;
$$;

revoke all on function public.bootstrap_workspace() from public, anon;
revoke all on function public.create_workflow(uuid, text, text, integer) from public, anon;
revoke all on function public.transition_workflow(uuid, public.workflow_status, text) from public, anon;
revoke all on function public.transition_workflow_task(uuid, public.workflow_task_status, text) from public, anon;
revoke all on function public.record_agent_event(uuid, uuid, public.agent_event_type, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_approval(uuid, uuid, text, text, text, public.risk_level, jsonb) from public, anon;
revoke all on function public.resolve_approval(uuid, public.approval_status, jsonb) from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;
grant execute on function public.create_workflow(uuid, text, text, integer) to authenticated;
grant execute on function public.transition_workflow(uuid, public.workflow_status, text) to authenticated;
grant execute on function public.transition_workflow_task(uuid, public.workflow_task_status, text) to authenticated;
grant execute on function public.record_agent_event(uuid, uuid, public.agent_event_type, text, jsonb, uuid, uuid) to service_role;
grant execute on function public.request_approval(uuid, uuid, text, text, text, public.risk_level, jsonb) to authenticated;
grant execute on function public.resolve_approval(uuid, public.approval_status, jsonb) to authenticated;
