-- Workspace-owned reusable strategy. No template can authorize an external action.
alter table public.agent_events drop constraint workspace_event_linkage;
alter table public.agent_events add constraint workspace_event_linkage check(workflow_id is not null or
  (agent_run_id is null and workflow_task_id is null and event_type in ('integration_connected','integration_disconnected','integration_reconnect_required',
    'icp_created','icp_updated','icp_duplicated','icp_archived','template_created','template_updated','template_duplicated','template_archived')));
create function public.strategy_text_array_valid(p_values text[]) returns boolean
language sql immutable set search_path='' as $$
  select p_values is not null and cardinality(p_values)<=10
    and not exists(select 1 from unnest(p_values) v where v is null or char_length(trim(v)) not between 1 and 120);
$$;

create table public.ideal_customer_profiles (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 120), description text not null default '' check(char_length(description)<=2000),
  industries text[] not null default '{}' check(public.strategy_text_array_valid(industries)),
  locations text[] not null default '{}' check(public.strategy_text_array_valid(locations)),
  company_size_min integer check(company_size_min between 1 and 1000000), company_size_max integer check(company_size_max between 1 and 1000000),
  business_models text[] not null default '{}' check(public.strategy_text_array_valid(business_models)),
  required_signals text[] not null default '{}' check(public.strategy_text_array_valid(required_signals)),
  preferred_signals text[] not null default '{}' check(public.strategy_text_array_valid(preferred_signals)),
  excluded_signals text[] not null default '{}' check(public.strategy_text_array_valid(excluded_signals)),
  automation_focus text[] not null default '{}' check(public.strategy_text_array_valid(automation_focus)),
  minimum_lead_score integer not null default 60 check(minimum_lead_score between 0 and 100),
  default_company_count integer not null default 10 check(default_company_count between 1 and 20),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), archived_at timestamptz,
  check(company_size_min is null or company_size_max is null or company_size_max>=company_size_min), unique(workspace_id,id)
);
create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 120), description text not null default '' check(char_length(description)<=2000),
  category text not null default 'Sales research' check(char_length(category)<=120),
  default_goal text not null check(char_length(trim(default_goal)) between 24 and 1000),
  task_strategy text not null default '' check(char_length(task_strategy)<=2000), default_icp_id uuid,
  default_company_count integer not null default 10 check(default_company_count between 1 and 20),
  approval_required boolean not null default true check(approval_required),
  -- Guidance only. Approved internal follow-up plans continue to use the existing approval/Executor path.
  followup_enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(workspace_id,id), foreign key(workspace_id,default_icp_id) references public.ideal_customer_profiles(workspace_id,id)
);
create index icps_workspace_active on public.ideal_customer_profiles(workspace_id,updated_at desc) where archived_at is null;
create index templates_workspace_active on public.workflow_templates(workspace_id,updated_at desc) where archived_at is null;
create trigger icps_updated before update on public.ideal_customer_profiles for each row execute function public.set_updated_at();
create trigger templates_updated before update on public.workflow_templates for each row execute function public.set_updated_at();
alter table public.ideal_customer_profiles enable row level security;
alter table public.workflow_templates enable row level security;
create policy icps_member_read on public.ideal_customer_profiles for select to authenticated using(public.is_workspace_member(workspace_id));
create policy templates_member_read on public.workflow_templates for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.ideal_customer_profiles,public.workflow_templates from public,anon,authenticated;
grant select on public.ideal_customer_profiles,public.workflow_templates to authenticated,service_role;

create function public.mutate_sales_strategy(p_workspace uuid,p_kind text,p_operation text,p_id uuid,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.ideal_customer_profiles%rowtype;t public.workflow_templates%rowtype;v_result jsonb;v_event public.agent_event_type;v_source uuid:=p_id;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace) then raise exception 'Workspace access denied' using errcode='42501';end if;
  if p_kind is null or p_kind not in ('icp','template') or p_operation is null or p_operation not in ('create','update','duplicate','archive')
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>16384
    or (p_operation='create' and p_id is not null) or (p_operation<>'create' and p_id is null) then raise exception 'Invalid strategy mutation' using errcode='22023';end if;
  if p_kind='icp' then
    if p_operation<>'create' then
      select * into i from public.ideal_customer_profiles where id=p_id and workspace_id=p_workspace for update;
      if not found then raise exception 'ICP not found' using errcode='P0002';end if;
      if i.archived_at is not null then
        if p_operation='archive' then return to_jsonb(i);end if;
        raise exception 'Archived ICP cannot be changed' using errcode='22023';
      end if;
    end if;
    if p_operation='archive' then
      update public.ideal_customer_profiles set archived_at=clock_timestamp() where id=p_id returning * into i;
    else
      if p_operation='duplicate' then
        i.name:=left(i.name,113)||' (copy)';
      else
        if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('name','description','industries','locations','company_size_min','company_size_max',
          'business_models','required_signals','preferred_signals','excluded_signals','automation_focus','minimum_lead_score','default_company_count')) then raise exception 'Invalid ICP field' using errcode='22023';end if;
        i:=jsonb_populate_record(null::public.ideal_customer_profiles,p_input);
      end if;
      if exists(select 1 from unnest(i.required_signals) r join unnest(i.excluded_signals) x on lower(trim(r))=lower(trim(x))) then
        raise exception 'Required signal is excluded' using errcode='22023';end if;
      if p_operation='update' then
        update public.ideal_customer_profiles set name=trim(i.name),description=i.description,industries=i.industries,locations=i.locations,
          company_size_min=i.company_size_min,company_size_max=i.company_size_max,business_models=i.business_models,required_signals=i.required_signals,
          preferred_signals=i.preferred_signals,excluded_signals=i.excluded_signals,automation_focus=i.automation_focus,
          minimum_lead_score=i.minimum_lead_score,default_company_count=i.default_company_count where id=p_id returning * into i;
      else
        insert into public.ideal_customer_profiles(workspace_id,created_by,name,description,industries,locations,company_size_min,company_size_max,business_models,
          required_signals,preferred_signals,excluded_signals,automation_focus,minimum_lead_score,default_company_count)
          values(p_workspace,auth.uid(),trim(i.name),i.description,i.industries,i.locations,i.company_size_min,i.company_size_max,i.business_models,
            i.required_signals,i.preferred_signals,i.excluded_signals,i.automation_focus,i.minimum_lead_score,i.default_company_count) returning * into i;
      end if;
    end if;
    v_result:=to_jsonb(i);
  else
    if p_operation<>'create' then
      select * into t from public.workflow_templates where id=p_id and workspace_id=p_workspace for update;
      if not found then raise exception 'Template not found' using errcode='P0002';end if;
      if t.archived_at is not null then
        if p_operation='archive' then return to_jsonb(t);end if;
        raise exception 'Archived template cannot be changed' using errcode='22023';
      end if;
    end if;
    if p_operation='archive' then
      update public.workflow_templates set archived_at=clock_timestamp() where id=p_id returning * into t;
    else
      if p_operation='duplicate' then t.name:=left(t.name,113)||' (copy)';
      else
        if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('name','description','category','default_goal','task_strategy','default_icp_id',
          'default_company_count','approval_required','followup_enabled')) then raise exception 'Invalid template field' using errcode='22023';end if;
        t:=jsonb_populate_record(null::public.workflow_templates,p_input);
      end if;
      if t.default_icp_id is not null then
        perform 1 from public.ideal_customer_profiles where id=t.default_icp_id and workspace_id=p_workspace and archived_at is null for share;
        if not found then raise exception 'An active workspace ICP is required' using errcode='22023';end if;
      end if;
      if p_operation='update' then
        update public.workflow_templates set name=trim(t.name),description=t.description,category=t.category,default_goal=t.default_goal,
          task_strategy=t.task_strategy,default_icp_id=t.default_icp_id,default_company_count=t.default_company_count,
          approval_required=t.approval_required,followup_enabled=t.followup_enabled where id=p_id returning * into t;
      else
        insert into public.workflow_templates(workspace_id,created_by,name,description,category,default_goal,task_strategy,default_icp_id,
          default_company_count,approval_required,followup_enabled) values(p_workspace,auth.uid(),trim(t.name),t.description,t.category,t.default_goal,t.task_strategy,t.default_icp_id,
            t.default_company_count,t.approval_required,t.followup_enabled) returning * into t;
      end if;
    end if;
    v_result:=to_jsonb(t);
  end if;
  v_event:=(p_kind||'_'||case p_operation when 'create' then 'created' when 'update' then 'updated' when 'duplicate' then 'duplicated' else 'archived' end)::public.agent_event_type;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace,null,v_event,
    left(case when p_kind='icp' then 'ICP ' else 'Workflow template ' end||p_operation||': '||(v_result->>'name'),500),
    jsonb_build_object('strategy_id',v_result->>'id','source_id',case when p_operation='duplicate' then v_source else null end,'actor',auth.uid()));
  return v_result;
end;
$$;

alter table public.workflows add column icp_id uuid,add column template_id uuid,add column icp_snapshot jsonb,add column template_snapshot jsonb;
alter table public.workflows add foreign key(workspace_id,icp_id) references public.ideal_customer_profiles(workspace_id,id),
  add foreign key(workspace_id,template_id) references public.workflow_templates(workspace_id,id),
  add constraint workflow_icp_snapshot_pair check((icp_id is null)=(icp_snapshot is null)),
  add constraint workflow_template_snapshot_pair check((template_id is null)=(template_snapshot is null));
create index workflows_strategy_icp on public.workflows(workspace_id,icp_id,created_at desc) where icp_id is not null;
create index workflows_strategy_template on public.workflows(workspace_id,template_id,created_at desc) where template_id is not null;

create function public.immutable_workflow_strategy() returns trigger language plpgsql set search_path='' as $$
begin
  if new.icp_id is distinct from old.icp_id or new.template_id is distinct from old.template_id
    or new.icp_snapshot is distinct from old.icp_snapshot or new.template_snapshot is distinct from old.template_snapshot then
    raise exception 'Workflow strategy snapshots are immutable' using errcode='22023';end if;
  return new;
end;$$;
create trigger workflows_immutable_strategy before update on public.workflows for each row execute function public.immutable_workflow_strategy();

create function public.create_workflow_from_strategy(p_workspace_id uuid,p_title text,p_goal text,p_target_companies integer,p_icp_id uuid default null,p_template_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.ideal_customer_profiles%rowtype;t public.workflow_templates%rowtype;wf uuid;v_icp uuid:=p_icp_id;v_is jsonb;v_ts jsonb;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501';end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 240 or char_length(trim(coalesce(p_goal,''))) not between 24 and 1000
    or p_target_companies is null or p_target_companies not between 1 and 20 or (p_icp_id is null and p_template_id is null) then
    raise exception 'Invalid workflow input' using errcode='22023';end if;
  if p_template_id is not null then
    select * into t from public.workflow_templates where id=p_template_id and workspace_id=p_workspace_id and archived_at is null for share;
    if not found then raise exception 'Active workspace template required' using errcode='22023';end if;
    v_icp:=coalesce(p_icp_id,t.default_icp_id);
    v_ts:=to_jsonb(t)-array['workspace_id','created_by','created_at','archived_at'];
  end if;
  if v_icp is not null then
    select * into i from public.ideal_customer_profiles where id=v_icp and workspace_id=p_workspace_id and archived_at is null for share;
    if not found then raise exception 'Active workspace ICP required' using errcode='22023';end if;
    v_is:=to_jsonb(i)-array['workspace_id','created_by','created_at','archived_at'];
  end if;
  -- Capture in the insert itself; the immutability guard also prevents a privileged later rewrite.
  insert into public.workflows(workspace_id,created_by,title,goal,status,current_step,target_companies,icp_id,template_id,icp_snapshot,template_snapshot)
    values(p_workspace_id,auth.uid(),trim(p_title),trim(p_goal),'planning','Waiting for Planner Agent',p_target_companies,v_icp,p_template_id,v_is,v_ts) returning id into wf;
  insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace_id,wf,'workflow_created',
    'Workflow created with saved strategy. Planner execution is queued.',jsonb_build_object('source','user','icp_id',v_icp,'template_id',p_template_id));
  if v_icp is not null then insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace_id,wf,
    'workflow_created_from_icp','Saved ICP captured for this workflow',jsonb_build_object('icp_id',v_icp,'name',i.name));end if;
  if p_template_id is not null then insert into public.agent_events(workspace_id,workflow_id,event_type,summary,metadata) values(p_workspace_id,wf,
    'workflow_created_from_template','Saved template guidance captured for Planner',jsonb_build_object('template_id',p_template_id,'name',t.name));end if;
  return wf;
end;$$;

-- Lead research and qualification history is frozen at scoring, not taken from the mutable company profile.
alter table public.leads add column research_snapshot jsonb,add column qualification_snapshot jsonb;
create function public.strategy_exclusion_matches(p_icp jsonb,p_research jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(signal), '[]'::jsonb) from jsonb_array_elements_text(coalesce(p_icp->'excluded_signals','[]')) signal
  where exists(select 1 from jsonb_array_elements(coalesce(p_research#>'{analysis,facts}','[]')) fact
    cross join lateral (select lower(regexp_replace(coalesce(fact->>'claim',''),'[^[:alnum:]]+',' ','g')) claim,
      lower(regexp_replace(coalesce(fact->>'quote',''),'[^[:alnum:]]+',' ','g')) quote,
      lower(trim(regexp_replace(signal,'[^[:alnum:]]+',' ','g'))) phrase) n
    where ((' '||n.claim||' ') like '% '||n.phrase||' %' and n.claim !~ '(^| )(no|not|never|without|unknown|unclear|unverified|may|might|possibly|не|нет|без|неизвестно|возможно|жоқ|емес)( |$)')
      or ((' '||n.quote||' ') like '% '||n.phrase||' %' and n.quote !~ '(^| )(no|not|never|without|unknown|unclear|unverified|may|might|possibly|не|нет|без|неизвестно|возможно|жоқ|емес)( |$)'));
$$;
create function public.capture_lead_strategy() returns trigger language plpgsql security definer set search_path='' as $$
declare wf public.workflows%rowtype;r public.agent_runs%rowtype;threshold integer;matches jsonb;
begin
  if tg_op='UPDATE' and old.research_snapshot is not null then
    if new.research_snapshot is distinct from old.research_snapshot or new.qualification_snapshot is distinct from old.qualification_snapshot
      or new.score is distinct from old.score or new.score_components is distinct from old.score_components
      or new.research_run_id is distinct from old.research_run_id or new.confidence is distinct from old.confidence
      or new.opportunity is distinct from old.opportunity or new.score_reason is distinct from old.score_reason then
      raise exception 'Historical lead qualification is immutable' using errcode='22023';end if;
    return new;
  end if;
  select * into wf from public.workflows where id=new.workflow_id and workspace_id=new.workspace_id;
  select * into r from public.agent_runs where workflow_id=new.workflow_id and workspace_id=new.workspace_id and agent_type='researcher' and status='completed'
    and output->>'companyId'=new.company_id::text and output->'result' is not null and (new.research_run_id is null or id=new.research_run_id)
    order by created_at desc,id desc limit 1;
  if not found then return new;end if;
  new.research_run_id:=r.id;new.research_snapshot:=r.output->'result';
  threshold:=greatest(60,coalesce((wf.icp_snapshot->>'minimum_lead_score')::integer,60));
  matches:=public.strategy_exclusion_matches(wf.icp_snapshot,new.research_snapshot);
  new.qualification_snapshot:=jsonb_build_object('minimumLeadScore',case when tg_op='UPDATE' and wf.icp_snapshot is null then 60 else threshold end,
    'score',new.score,'components',new.score_components,
    'qualified',case when tg_op='UPDATE' then exists(select 1 from public.agent_events e where e.workflow_id=new.workflow_id and e.event_type='lead_qualified' and e.metadata->>'lead_id'=new.id::text)
      or coalesce(old.score>=60 and (old.score_components->>'icpFit')::integer>=15 and (old.score_components->>'evidenceQuality')::integer>=7,false)
      else coalesce(new.score>=threshold and jsonb_array_length(matches)=0,false) end,
    'icpId',wf.icp_id,'icpName',wf.icp_snapshot->>'name','exclusionMatches',matches);
  if tg_op='UPDATE' and old.score is null and not exists(select 1 from public.agent_events e where e.workflow_id=new.workflow_id
    and e.event_type='lead_qualified' and e.metadata->>'lead_id'=new.id::text) then new.qualification_snapshot:=null;end if;
  -- Historical enrichment must not rescore or change an existing outcome.
  if tg_op='INSERT' and new.status='qualified' and (new.score<threshold or jsonb_array_length(matches)>0) then new.status:='rejected';new.outreach_status:='rejected';end if;
  return new;
end;$$;
create trigger leads_capture_strategy before insert or update on public.leads for each row execute function public.capture_lead_strategy();

-- Existing scoring RPC remains authoritative; make its audit accurately reflect the additional saved strategy gate.
create function public.strategy_qualification_event() returns trigger language plpgsql set search_path='' as $$
begin
  if new.event_type='lead_qualified' and exists(select 1 from public.leads where id=(new.metadata->>'lead_id')::uuid
    and workflow_id=new.workflow_id and qualification_snapshot->>'qualified'='false') then
    new.event_type:='lead_rejected';new.summary:='Company did not meet the saved ICP threshold or matched a cited exclusion';
  end if;return new;
end;$$;
create trigger events_strategy_qualification before insert on public.agent_events for each row execute function public.strategy_qualification_event();

-- Reliable historical enrichment only: saved research has priority, absent history stays unavailable.
update public.leads set research_run_id=research_run_id where research_snapshot is null and exists(select 1 from public.agent_runs r
  where r.workspace_id=leads.workspace_id and r.workflow_id=leads.workflow_id and r.agent_type='researcher' and r.status='completed'
    and r.output->>'companyId'=leads.company_id::text and r.output->'result' is not null);

revoke all on function public.strategy_text_array_valid(text[]),public.immutable_workflow_strategy(),public.strategy_exclusion_matches(jsonb,jsonb),
  public.capture_lead_strategy(),public.strategy_qualification_event(),public.mutate_sales_strategy(uuid,text,text,uuid,jsonb),
  public.create_workflow_from_strategy(uuid,text,text,integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mutate_sales_strategy(uuid,text,text,uuid,jsonb),public.create_workflow_from_strategy(uuid,text,text,integer,uuid,uuid) to authenticated;
grant execute on function public.strategy_text_array_valid(text[]) to authenticated,service_role;
