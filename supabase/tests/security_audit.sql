-- Read-only schema/privilege audit. No provider calls or persistent fixture writes.
begin;
do $$
declare unsafe_count integer;
begin
  select count(*) into unsafe_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  if unsafe_count>0 then raise exception 'Public tables without RLS: %',unsafe_count;end if;

  select count(*) into unsafe_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and not coalesce('search_path=""'=any(p.proconfig),false);
  if unsafe_count>0 then raise exception 'Security definer functions without fixed empty search_path: %',unsafe_count;end if;

  if has_table_privilege('authenticated','public.integration_credentials','SELECT')
    or has_table_privilege('anon','public.integration_credentials','SELECT')
    or has_table_privilege('authenticated','public.integration_oauth_states','SELECT')
    or has_table_privilege('anon','public.integration_oauth_states','SELECT') then
    raise exception 'OAuth credential/state records readable by browser roles';
  end if;
  if has_column_privilege('authenticated','public.execution_attempts','claim_token','SELECT')
    or has_column_privilege('authenticated','public.automation_jobs','claim_token','SELECT') then
    raise exception 'Execution/job capabilities readable by browser roles';
  end if;
  if has_table_privilege('authenticated','public.workspaces','DELETE')
    or has_table_privilege('authenticated','public.workflows','DELETE')
    or has_table_privilege('authenticated','public.agent_events','DELETE')
    or has_table_privilege('authenticated','public.action_approval_snapshots','DELETE') then
    raise exception 'Browser role can directly delete workflow/approval/audit history';
  end if;

  select count(*) into unsafe_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('claim_execution','dispatch_execution','finish_execution','recover_execution_claims',
      'start_planner_run','complete_planner_run','start_research_task_run','complete_research_task_run',
      'connect_integration','disconnect_integration','consume_integration_oauth','claim_integration_refresh','finish_integration_refresh',
      'claim_automation_job','finish_automation_job','publish_followup_draft','record_automation_reply')
      and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'));
  if unsafe_count>0 then raise exception 'Protected runtime/provider mutation functions callable by browser roles: %',unsafe_count;end if;

  if not has_function_privilege('authenticated','public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb)','EXECUTE')
    or (select prosecdef from pg_proc where oid='public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb)'::regprocedure) then
    raise exception 'Analytics must remain authenticated, read-only security invoker';
  end if;
end $$;
rollback;
