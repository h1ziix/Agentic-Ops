-- Explicit task retry requeues failed items once; successful company results remain committed.
create or replace function public.start_research_task_run(
  p_run_id uuid, p_user_id uuid, p_workspace_id uuid, p_workflow_id uuid, p_task_id uuid, p_model text, p_input jsonb
) returns public.agent_runs language plpgsql security definer set search_path = '' as $$
declare
  v_workflow public.workflows%rowtype;
  v_task public.workflow_tasks%rowtype;
  v_run public.agent_runs%rowtype;
  v_company uuid;
  v_dependency text;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id
  ) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select * into v_workflow from public.workflows where id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Workflow not found' using errcode = 'P0002'; end if;
  select * into v_task from public.workflow_tasks where id = p_task_id and workflow_id = p_workflow_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if v_task.type not in ('define_target_profile','discover_companies','research_companies','identify_opportunities','score_leads')
    or jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input) > 16384
    or char_length(coalesce(p_input ->> 'workKey','')) not between 1 and 240
    or (p_input ->> 'requestedCompanyCount')::integer not between 1 and 20
    or char_length(trim(coalesce(p_model,''))) not between 1 and 200 then
    raise exception 'Invalid research task input' using errcode = '22023';
  end if;
  select * into v_run from public.agent_runs where workflow_task_id = p_task_id and agent_type = 'researcher'
    and status = 'completed' and input ->> 'workKey' = p_input ->> 'workKey' order by created_at desc limit 1;
  if found then return v_run; end if;
  if v_workflow.status <> 'running' or v_task.status not in ('pending','running','failed')
    or (v_task.status = 'failed' and coalesce(p_input ->> 'retry','false') <> 'true') then
    raise exception 'Workflow or task is not ready for research' using errcode = '22023';
  end if;
  if jsonb_typeof(v_task.input -> 'dependencies') is distinct from 'array' then raise exception 'Missing dependencies' using errcode = '22023'; end if;
  for v_dependency in select jsonb_array_elements_text(v_task.input -> 'dependencies') loop
    if not exists (select 1 from public.workflow_tasks where workflow_id = p_workflow_id
      and input ->> 'planTaskId' = v_dependency and position < v_task.position and status = 'completed') then
      raise exception 'Incomplete task dependency' using errcode = '22023';
    end if;
  end loop;
  select * into v_run from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'researcher'
    and status in ('queued','running') order by created_at desc limit 1;
  if found then
    if v_run.started_at > now() - interval '3 minutes' then return v_run; end if;
    update public.agent_runs set status = 'failed', completed_at = clock_timestamp(),
      error = '{"code":"ai_timeout","message":"Research was interrupted. Resume to recover the task."}' where id = v_run.id;
    update public.workflow_companies set research_status = 'queued' where workflow_id = p_workflow_id
      and company_id = (v_run.input ->> 'companyId')::uuid and research_status = 'researching';
    insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary)
      values(p_workspace_id,p_workflow_id,v_run.id,v_run.workflow_task_id,'agent_failed','Interrupted research claim expired.');
  end if;
  if (select count(*) from public.agent_runs where workflow_id = p_workflow_id and agent_type = 'researcher') >= 70
    or (select count(*) from public.agent_runs where workflow_task_id = p_task_id and input ->> 'workKey' = p_input ->> 'workKey' and status = 'failed') >= 3 then
    raise exception 'Research retry budget exhausted' using errcode = '22023';
  end if;
  if v_task.type = 'research_companies' and v_task.status = 'failed' and p_input ->> 'retry' = 'true' then
    update public.workflow_companies set research_status = 'queued', error = null where workflow_id = p_workflow_id and research_status = 'failed';
  end if;
  v_company := (p_input ->> 'companyId')::uuid;
  if v_company is not null then
    if v_task.type <> 'research_companies' or not exists (select 1 from public.workflow_companies where workspace_id = p_workspace_id
      and workflow_id = p_workflow_id and company_id = v_company and (research_status in ('queued','researching')
        or (research_status = 'failed' and p_input ->> 'retry' = 'true'))) then
      raise exception 'Invalid research company' using errcode = '22023'; end if;
    update public.workflow_companies set research_status = 'researching', error = null where workflow_id = p_workflow_id and company_id = v_company;
    update public.companies set research_status = 'researching' where id = v_company and last_researched_at is null;
  end if;
  if v_task.status <> 'running' then
    insert into public.agent_events(workspace_id,workflow_id,workflow_task_id,event_type,summary)
      values(p_workspace_id,p_workflow_id,p_task_id,'task_started',left(v_task.title,500));
  end if;
  update public.workflow_tasks set status = 'running', started_at = coalesce(started_at,clock_timestamp()), error = null where id = p_task_id;
  insert into public.agent_runs(id,workspace_id,workflow_id,workflow_task_id,agent_type,status,model,input,started_at)
    values(p_run_id,p_workspace_id,p_workflow_id,p_task_id,'researcher','running',p_model,p_input,clock_timestamp()) returning * into v_run;
  update public.workflows set current_step = v_task.title where id = p_workflow_id;
  insert into public.agent_events(workspace_id,workflow_id,agent_run_id,workflow_task_id,event_type,summary,metadata)
    values(p_workspace_id,p_workflow_id,v_run.id,p_task_id,'agent_started','Research Agent started',jsonb_build_object('model',p_model,'company_id',v_company));
  return v_run;
end;
$$;
