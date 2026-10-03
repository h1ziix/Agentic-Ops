-- Release 0.8: read-only, RLS-respecting database aggregation. No analytics event writes.
-- Business counts use workflow-created cohorts and distinct company/workflow units.
-- Agent/model summaries use run-created activity dates; workflow costs use retained lifetime usage.
create function public.intelligence_normalize_08(p_dimension text,p_value text) returns text
language sql immutable set search_path='' as $$
  select case
    when v='' or lower(v) in ('unknown','unavailable','not known','n/a','na','not specified','unspecified') then 'Unknown'
    when p_dimension='industry' and v~*'fin[ -]?tech|payments?|digital banking' then 'Fintech'
    when p_dimension='industry' and v~*'saas|software as a service' then 'SaaS'
    when p_dimension='industry' and v~*'e[ -]?commerce|online retail' then 'Ecommerce'
    when p_dimension='location' and v~*'kazakhstan|казахстан|^kz$' then 'Kazakhstan'
    when p_dimension='location' and v~*'uzbekistan|узбекистан|^uz$' then 'Uzbekistan'
    when p_dimension='location' and v~*'kyrgyzstan|киргизстан|кыргызстан|^kg$' then 'Kyrgyzstan'
    when p_dimension='location' and v~*'united states|^usa?$|^u\.s\.a?\.?$' then 'United States'
    when p_dimension='opportunity' and replace(v,'_',' ')~*'customer support|support ticket|helpdesk|help desk|customer service' then 'Customer support'
    when p_dimension='opportunity' and replace(v,'_',' ')~*'lead qualif|lead scor' then 'Lead qualification'
    when p_dimension='opportunity' and replace(v,'_',' ')~*'knowledge|retrieval|\mrag\M' then 'Knowledge automation'
    when p_dimension='opportunity' and v~*'document|invoice|ocr' then 'Document processing'
    when p_dimension='opportunity' and v~*'sales|outreach|crm' then 'Sales operations'
    when p_dimension='opportunity' and v~*'internal|back office|back-office|operational' then 'Internal operations'
    when p_dimension='opportunity' and v~*'workflow|process automat' then 'Workflow automation'
    when p_dimension='opportunity' then 'Other'
    else initcap(lower(v)) end
  from (select case when p_dimension='opportunity' then replace(trim(regexp_replace(coalesce(p_value,''),'\s+',' ','g')),'_',' ')
    else trim(regexp_replace(coalesce(p_value,''),'\s+',' ','g')) end v) cleaned;
$$;

create function public.intelligence_cost_08(p_ai_runs numeric,p_unknown_cost numeric,p_unknown_usage numeric,p_known numeric,p_tokens numeric) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('estimatedCostUsd',case when p_ai_runs>0 and p_unknown_cost=0 then p_known else null end,
    'knownEstimatedCostUsd',p_known,'unknownCostRuns',p_unknown_cost,'totalTokens',p_tokens,'unknownUsageRuns',p_unknown_usage);
$$;

create index agent_runs_workspace_created_08 on public.agent_runs(workspace_id,created_at);
create index agent_runs_company_research_08 on public.agent_runs(workspace_id,workflow_id,(input->>'companyId'),created_at desc)
  where agent_type='researcher' and status='completed' and output->>'kind'='research_companies';
create index proposed_actions_company_08 on public.proposed_actions(workspace_id,workflow_id,(target->>'companyId')) where action_type='send_email';
create index agent_events_tool_calls_08 on public.agent_events(workspace_id,agent_run_id) where event_type='tool_called';

create function public.intelligence_analytics_08(p_workspace uuid,p_from timestamptz default null,p_to timestamptz default now(),p_timezone text default 'Asia/Qyzylorda',p_filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; filter_key text;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace) then raise exception 'Workspace access denied' using errcode='42501';end if;
  if p_to is null or (p_from is not null and p_from>=p_to) or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
    or jsonb_typeof(p_filters) is distinct from 'object' or pg_column_size(p_filters)>4096 then raise exception 'Invalid analytics filters' using errcode='22023';end if;
  for filter_key in select jsonb_object_keys(p_filters) loop
    if filter_key not in ('range','workflowId','icpId','templateId','industry','location','leadStatus','confidence','minScore','maxScore') then raise exception 'Unsupported analytics filter' using errcode='22023';end if;
  end loop;
  if (p_filters?'minScore' and (p_filters->>'minScore')::numeric not between 0 and 100)
    or (p_filters?'maxScore' and (p_filters->>'maxScore')::numeric not between 0 and 100)
    or (p_filters?'minScore' and p_filters?'maxScore' and (p_filters->>'minScore')::numeric>(p_filters->>'maxScore')::numeric)
    then raise exception 'Invalid score interval' using errcode='22023';end if;

  with all_workflows as materialized (
    select w.id,w.title,w.status,w.created_at,w.started_at,w.completed_at,w.icp_id,w.template_id,w.icp_snapshot,w.template_snapshot
    from public.workflows w where w.workspace_id=p_workspace and w.created_at<=p_to
      and (not p_filters?'workflowId' or w.id=(p_filters->>'workflowId')::uuid)
      and (not p_filters?'icpId' or w.icp_id=(p_filters->>'icpId')::uuid)
      and (not p_filters?'templateId' or w.template_id=(p_filters->>'templateId')::uuid)
  ), historical_pairs as materialized (
    select wc.workflow_id,wc.company_id,wc.research_status,wc.error,l.id lead_id,l.status lead_status,l.score,l.confidence,l.review_metadata,
      coalesce((l.qualification_snapshot->>'qualified')::boolean,
        l.id is not null and (l.status in ('qualified','outreach_ready','waiting_approval','contacted','responded','converted')
          or exists(select 1 from public.agent_events e where e.workspace_id=p_workspace and e.workflow_id=wc.workflow_id
            and e.event_type='lead_qualified' and e.metadata->>'lead_id'=l.id::text))) qualified,
      coalesce(l.research_snapshot,rr.output->'result') snapshot,
      w.icp_id,w.template_id,w.icp_snapshot->>'name' icp_name,w.template_snapshot->>'name' template_name
    from public.workflow_companies wc join all_workflows w on w.id=wc.workflow_id
    left join public.leads l on l.workspace_id=p_workspace and l.workflow_id=wc.workflow_id and l.company_id=wc.company_id
    left join lateral (select r.output from public.agent_runs r where r.workspace_id=p_workspace and r.workflow_id=wc.workflow_id
      and r.agent_type='researcher' and r.status='completed' and r.output->>'kind'='research_companies'
      and r.input->>'companyId'=wc.company_id::text and r.output->'result' is not null
      order by (r.id=l.research_run_id) desc nulls last,r.created_at desc,r.id desc limit 1) rr on l.research_snapshot is null
    where wc.workspace_id=p_workspace
  ), normalized_pairs as materialized (
    select h.*,public.intelligence_normalize_08('industry',snapshot#>>'{analysis,company,industry}') industry,
      public.intelligence_normalize_08('location',snapshot#>>'{analysis,company,location}') location,
      coalesce((snapshot#>>'{analysis,lead,score}')::numeric,score) research_score,
      coalesce(snapshot#>>'{analysis,lead,confidence}',confidence::text) research_confidence,
      case when snapshot is not null then (select count(distinct s.value->>'url') from jsonb_array_elements(
        case when jsonb_typeof(snapshot->'sources')='array' then snapshot->'sources' else '[]' end) s
        where public.public_research_url(s.value->>'url')) else null end source_count,
      case when snapshot is not null then (select count(*) from jsonb_array_elements(
        case when jsonb_typeof(snapshot#>'{analysis,facts}')='array' then snapshot#>'{analysis,facts}' else '[]' end) fact
        where char_length(trim(coalesce(fact.value->>'claim','')))>0 and char_length(trim(coalesce(fact.value->>'quote','')))>0
          and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(snapshot->'sources')='array' then snapshot->'sources' else '[]' end) s
            where s.value->>'id'=fact.value->>'sourceId' and public.public_research_url(s.value->>'url')
              and position(lower(regexp_replace(fact.value->>'quote','\s+',' ','g')) in lower(regexp_replace(s.value->>'content','\s+',' ','g')))>0))
        else null end usable_evidence_count
    from historical_pairs h
  ), selected_pairs as materialized (
    select * from normalized_pairs n where (not p_filters?'industry' or n.industry=public.intelligence_normalize_08('industry',p_filters->>'industry'))
      and (not p_filters?'location' or n.location=public.intelligence_normalize_08('location',p_filters->>'location'))
      and (not p_filters?'leadStatus' or n.lead_status::text=p_filters->>'leadStatus')
      and (not p_filters?'confidence' or coalesce(n.confidence::text,n.research_confidence)=p_filters->>'confidence')
      and (not p_filters?'minScore' or coalesce(n.score,n.research_score)>=(p_filters->>'minScore')::numeric)
      and (not p_filters?'maxScore' or coalesce(n.score,n.research_score)<=(p_filters->>'maxScore')::numeric)
  ), selected_workflows as materialized (
    select w.* from all_workflows w where not(p_filters ?| array['industry','location','leadStatus','confidence','minScore','maxScore'])
      or exists(select 1 from selected_pairs p where p.workflow_id=w.id)
  ), cohort as materialized (
    select * from selected_workflows where p_from is null or created_at>=p_from
  ), email_actions as materialized (
    select a.id,a.workflow_id,a.approval_id,a.target,a.status,a.is_auxiliary from public.proposed_actions a join selected_workflows w on w.id=a.workflow_id
      where a.workspace_id=p_workspace and a.action_type='send_email'
      and (not(p_filters ?| array['industry','location','leadStatus','confidence','minScore','maxScore'])
        or exists(select 1 from selected_pairs p where p.workflow_id=a.workflow_id and p.company_id::text=a.target->>'companyId'))
  ), pair_states as materialized (
    select p.*,p.research_status='researched' researched,
      p.review_metadata->>'decision'='approve_for_outreach' reviewed,
      exists(select 1 from email_actions a where a.workflow_id=p.workflow_id and a.target->>'companyId'=p.company_id::text) drafted,
      exists(select 1 from email_actions a join public.approvals g on g.id=a.approval_id and g.workspace_id=p_workspace
        where a.workflow_id=p.workflow_id and a.target->>'companyId'=p.company_id::text) requested,
      exists(select 1 from email_actions a join public.action_approval_snapshots s on s.action_id=a.id and s.workspace_id=p_workspace
        where a.workflow_id=p.workflow_id and a.target->>'companyId'=p.company_id::text) approved,
      exists(select 1 from email_actions a join public.execution_attempts t on t.action_id=a.id and t.workspace_id=p_workspace and t.status='succeeded'
        where a.workflow_id=p.workflow_id and a.target->>'companyId'=p.company_id::text) sent,
      exists(select 1 from public.reply_observations r where r.workspace_id=p_workspace and r.workflow_id=p.workflow_id and r.lead_id=p.lead_id) replied
    from selected_pairs p
  ), cohort_pairs as materialized (
    select p.* from pair_states p join cohort w on w.id=p.workflow_id
  ), pair_counts as (
    select workflow_id,count(*) discovered,count(*) filter(where researched) researched,count(*) filter(where researched and qualified) qualified,
      count(*) filter(where researched and qualified and reviewed) reviewed,
      count(*) filter(where researched and qualified and reviewed and drafted) drafts,
      count(*) filter(where researched and qualified and reviewed and drafted and requested) requested,
      count(*) filter(where researched and qualified and reviewed and drafted and requested and approved) approved,
      count(*) filter(where researched and qualified and reviewed and drafted and requested and approved and sent) sent,
      count(*) filter(where researched and qualified and reviewed and drafted and requested and approved and sent and replied) replies,
      avg(score) average_score,percentile_cont(0.5) within group(order by score) median_score,count(*) filter(where qualified and confidence='high') high_confidence
    from cohort_pairs group by workflow_id
  ), tool_counts as materialized (
    select e.agent_run_id,count(distinct coalesce(nullif(trim(e.metadata->>'tool_call_id'),''),e.id::text)) tool_calls
    from public.agent_events e where e.workspace_id=p_workspace and e.event_type='tool_called'
      and exists(select 1 from public.agent_runs r join selected_workflows w on w.id=r.workflow_id where r.id=e.agent_run_id and r.workspace_id=p_workspace
        and r.created_at<=p_to and (p_from is null or r.created_at>=p_from or exists(select 1 from cohort c where c.id=r.workflow_id)))
    group by e.agent_run_id
  ), run_facts as materialized (
    select r.id,r.workflow_id,r.created_at,r.agent_type,r.status,coalesce(nullif(trim(r.model),''),'Unknown') model,
      r.agent_type<>'executor' ai,r.estimated_cost_usd,r.cost_status,r.total_tokens,r.usage_status,r.retry_count,
      coalesce(r.duration_ms,case when r.started_at is not null and r.completed_at is not null then greatest(0,extract(epoch from(r.completed_at-r.started_at))*1000) end) duration_ms,
      coalesce(t.tool_calls,0) tool_calls
    from public.agent_runs r left join tool_counts t on t.agent_run_id=r.id where r.workspace_id=p_workspace and r.created_at<=p_to
  ), cohort_usage as (
    select r.workflow_id,count(*) runs,sum(r.retry_count) retries,sum(r.tool_calls) tools,
      public.intelligence_cost_08(count(*) filter(where ai),count(*) filter(where ai and cost_status<>'estimated'),
        count(*) filter(where ai and usage_status<>'complete'),sum(estimated_cost_usd) filter(where ai and cost_status='estimated'),sum(total_tokens) filter(where ai)) cost
    from run_facts r join cohort w on w.id=r.workflow_id group by r.workflow_id
  ), workflow_rows as materialized (
    select jsonb_build_object('id',w.id,'title',w.title,'status',w.status,'createdAt',w.created_at,'icpName',w.icp_snapshot->>'name','templateName',w.template_snapshot->>'name',
      'discovered',coalesce(p.discovered,0),'researched',coalesce(p.researched,0),'qualified',coalesce(p.qualified,0),
      'reviewerApproved',coalesce(p.reviewed,0),'drafts',coalesce(p.drafts,0),'approvalRequested',coalesce(p.requested,0),'approved',coalesce(p.approved,0),
      'sent',coalesce(p.sent,0),'replies',coalesce(p.replies,0),'averageScore',p.average_score,'medianScore',p.median_score,'highConfidence',coalesce(p.high_confidence,0),
      'agentRuns',coalesce(u.runs,0),'toolCalls',coalesce(u.tools,0),'retries',coalesce(u.retries,0),
      'durationMs',case when w.started_at is not null and w.completed_at is not null then greatest(0,extract(epoch from(w.completed_at-w.started_at))*1000) end,
      'costPerCompany',case when not(p_filters ?| array['industry','location','leadStatus','confidence','minScore','maxScore']) then (u.cost->>'estimatedCostUsd')::numeric/nullif(p.researched,0) end,
      'costPerQualifiedLead',case when not(p_filters ?| array['industry','location','leadStatus','confidence','minScore','maxScore']) then (u.cost->>'estimatedCostUsd')::numeric/nullif(p.qualified,0) end,
      'costPerSent',case when not(p_filters ?| array['industry','location','leadStatus','confidence','minScore','maxScore']) then (u.cost->>'estimatedCostUsd')::numeric/nullif(p.sent,0) end)||coalesce(u.cost,public.intelligence_cost_08(0,0,0,null,null)) value,w.created_at
    from cohort w left join pair_counts p on p.workflow_id=w.id left join cohort_usage u on u.workflow_id=w.id
  ), period_runs as materialized (
    select r.* from run_facts r join selected_workflows w on w.id=r.workflow_id where p_from is null or r.created_at>=p_from
  ), usage_groups as (
    select 'agent' dimension,r.agent_type::text key,count(*) runs,count(*) filter(where status='completed') completed,count(*) filter(where status='failed') failed,
      100.0*count(*) filter(where status='completed')/nullif(count(*) filter(where status in ('completed','failed')),0) success_rate,
      avg(duration_ms) average_duration,sum(retry_count) retries,sum(tool_calls) tools,
      public.intelligence_cost_08(count(*) filter(where ai),count(*) filter(where ai and cost_status<>'estimated'),count(*) filter(where ai and usage_status<>'complete'),
        sum(estimated_cost_usd) filter(where ai and cost_status='estimated'),sum(total_tokens) filter(where ai)) cost
    from period_runs r group by r.agent_type
    union all
    select 'model',r.model,count(*),count(*) filter(where status='completed'),count(*) filter(where status='failed'),
      100.0*count(*) filter(where status='completed')/nullif(count(*) filter(where status in ('completed','failed')),0),avg(duration_ms),sum(retry_count),sum(tool_calls),
      public.intelligence_cost_08(count(*) filter(where ai),count(*) filter(where ai and cost_status<>'estimated'),count(*) filter(where ai and usage_status<>'complete'),
        sum(estimated_cost_usd) filter(where ai and cost_status='estimated'),sum(total_tokens) filter(where ai))
    from period_runs r where ai group by r.model
  ), usage_rows as (
    select dimension,jsonb_build_object('key',key,'label',case when dimension='agent' then case key when 'planner' then 'Planner' when 'researcher' then 'Researcher'
      when 'reviewer' then 'Reviewer' when 'outreach' then 'Outreach' when 'executor' then 'Executor' else 'Unknown' end else key end,
      'runs',runs,'completed',completed,'failed',failed,'successRate',success_rate,'averageDurationMs',average_duration,'retries',retries,'toolCalls',tools)||cost value from usage_groups
  ), segment_members as materialized (
    select 'industry' dimension,industry key,industry label,workflow_id,company_id from cohort_pairs
    union all select 'location',location,location,workflow_id,company_id from cohort_pairs
    union all select 'icp',coalesce(icp_id::text,'Unassigned'),coalesce(icp_name,'Unassigned'),workflow_id,company_id from cohort_pairs
    union all select 'template',coalesce(template_id::text,'Unassigned'),coalesce(template_name,'Unassigned'),workflow_id,company_id from cohort_pairs
    union all
    select distinct 'opportunity',public.intelligence_normalize_08('opportunity',o.value->>'category'),public.intelligence_normalize_08('opportunity',o.value->>'category'),p.workflow_id,p.company_id
      from cohort_pairs p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.snapshot#>'{analysis,automationOpportunities}')='array' then p.snapshot#>'{analysis,automationOpportunities}' else '[]' end) o
    union all
    select distinct 'source',case when s.value->>'type' in ('company_website','directory','news','search_result','other') then s.value->>'type'
      when public.research_domain(s.value->>'url')=public.research_domain(p.snapshot#>>'{company,website}') then 'company_website' else 'other' end,
      case when s.value->>'type' in ('company_website','directory','news','search_result','other') then s.value->>'type'
      when public.research_domain(s.value->>'url')=public.research_domain(p.snapshot#>>'{company,website}') then 'company_website' else 'other' end,p.workflow_id,p.company_id
      from cohort_pairs p cross join lateral jsonb_array_elements(case when jsonb_typeof(p.snapshot->'sources')='array' then p.snapshot->'sources' else '[]' end) s
      where public.public_research_url(s.value->>'url')
  ), segment_rows as (
    select m.dimension,m.key,jsonb_build_object('key',m.key,'label',case m.key when 'company_website' then 'Company websites' when 'search_result' then 'Search results'
      when 'directory' then 'Directories' when 'news' then 'News' when 'other' then 'Other' else min(m.label) end,
      'companies',count(*),'qualified',count(*) filter(where p.researched and p.qualified),'averageScore',avg(p.score),
      'highConfidence',count(*) filter(where p.qualified and p.confidence='high'),'sent',count(*) filter(where p.sent),'replies',count(*) filter(where p.replied)) value
    from (select distinct dimension,key,label,workflow_id,company_id from segment_members) m join cohort_pairs p on p.workflow_id=m.workflow_id and p.company_id=m.company_id
    group by m.dimension,m.key
  ), daily_rows as (
    select (w.created_at at time zone p_timezone)::date cohort_day,
      jsonb_build_object('date',(w.created_at at time zone p_timezone)::date,'researched',coalesce(sum(p.researched),0),'qualified',coalesce(sum(p.qualified),0),
        'sent',coalesce(sum(p.sent),0),'replies',coalesce(sum(p.replies),0))||
        public.intelligence_cost_08(sum(coalesce((u.cost->>'unknownCostRuns')::bigint,0))+count(u.cost->>'estimatedCostUsd'),sum(coalesce((u.cost->>'unknownCostRuns')::bigint,0)),
          sum(coalesce((u.cost->>'unknownUsageRuns')::bigint,0)),sum((u.cost->>'knownEstimatedCostUsd')::numeric),sum((u.cost->>'totalTokens')::numeric)) value
    from cohort w left join pair_counts p on p.workflow_id=w.id left join cohort_usage u on u.workflow_id=w.id group by (w.created_at at time zone p_timezone)::date
  ), total_counts as (
    select jsonb_build_object('discovered',count(*),'researched',count(*) filter(where researched),'qualified',count(*) filter(where researched and qualified),
      'reviewerApproved',count(*) filter(where researched and qualified and reviewed),'drafts',count(*) filter(where researched and qualified and reviewed and drafted),
      'approvalRequested',count(*) filter(where researched and qualified and reviewed and drafted and requested),'approved',count(*) filter(where researched and qualified and reviewed and drafted and requested and approved),
      'sent',count(*) filter(where researched and qualified and reviewed and drafted and requested and approved and sent),
      'replies',count(*) filter(where researched and qualified and reviewed and drafted and requested and approved and sent and replied),
      'averageScore',avg(score),'highConfidence',count(*) filter(where qualified and confidence='high')) value from cohort_pairs
  ), total_usage as (
    select jsonb_build_object('agentRuns',count(*),'retries',coalesce(sum(retry_count),0),'toolCalls',coalesce(sum(tool_calls),0))||
      public.intelligence_cost_08(count(*) filter(where ai),count(*) filter(where ai and cost_status<>'estimated'),count(*) filter(where ai and usage_status<>'complete'),
        sum(estimated_cost_usd) filter(where ai and cost_status='estimated'),sum(total_tokens) filter(where ai)) value from run_facts r join cohort w on w.id=r.workflow_id
  ), cost_period_rows as (
    select d.key,public.intelligence_cost_08(count(r.id) filter(where ai),count(r.id) filter(where ai and cost_status<>'estimated'),count(r.id) filter(where ai and usage_status<>'complete'),
      sum(estimated_cost_usd) filter(where ai and cost_status='estimated'),sum(total_tokens) filter(where ai)) value
    from (values('today',1),('last7Days',7),('last30Days',30)) d(key,days)
      left join run_facts r on r.created_at>=(((p_to at time zone p_timezone)::date-(d.days-1))::timestamp at time zone p_timezone) group by d.key
  )
  select jsonb_build_object(
    'summary',(select c.value||u.value||jsonb_build_object('costPerQualifiedLead',case when not(p_filters ?| array['industry','location','leadStatus','confidence','minScore','maxScore']) then (u.value->>'estimatedCostUsd')::numeric/nullif((c.value->>'qualified')::integer,0) end,
      'pendingApprovals',(select count(*) from email_actions a join cohort w on w.id=a.workflow_id where a.status in ('pending_approval','waiting_for_approval')),
      'failedJobs',(select count(*) from public.automation_jobs j join cohort w on w.id=j.workflow_id where j.workspace_id=p_workspace and j.status='failed'),
      'needsAttention',(select count(*) from cohort w where w.status in ('failed','paused','needs_revision')),
      'executionsAttempted',(select count(*) from public.execution_attempts t join cohort w on w.id=t.workflow_id where t.workspace_id=p_workspace and t.dispatched_at is not null),
      'messagesSent',(select count(distinct a.id) from email_actions a join cohort w on w.id=a.workflow_id join public.execution_attempts t on t.action_id=a.id and t.workspace_id=p_workspace and t.status='succeeded'),
      'repliesDetected',(select count(*) from public.reply_observations r join cohort w on w.id=r.workflow_id where r.workspace_id=p_workspace and exists(select 1 from cohort_pairs p where p.lead_id=r.lead_id)),
      'followupsScheduled',(select count(*) from public.follow_up_plans f join cohort w on w.id=f.workflow_id where f.workspace_id=p_workspace),
      'followupsCompleted',(select count(*) from public.follow_up_plans f join cohort w on w.id=f.workflow_id where f.workspace_id=p_workspace and f.automation_status='completed')) from total_counts c cross join total_usage u),
    'workflows',coalesce((select jsonb_agg(value order by created_at desc) from(select * from workflow_rows order by created_at desc limit 200) bounded),'[]'::jsonb),
    'workflowTableTruncated',(select count(*)>200 from cohort),
    'workflowStatuses',coalesce((select jsonb_agg(jsonb_build_object('key',status,'count',n)) from(select status,count(*) n from cohort group by status) statuses),'[]'::jsonb),
    'workflowFunnel',jsonb_build_array(
      jsonb_build_object('key','created','label','Created','count',(select count(*) from cohort)),
      jsonb_build_object('key','planned','label','Plan completed','count',(select count(*) from cohort w where exists(select 1 from public.agent_runs r
        where r.workspace_id=p_workspace and r.workflow_id=w.id and r.agent_type='planner' and r.status='completed'))),
      jsonb_build_object('key','researchProgressed','label','Research recorded','count',(select count(*) from cohort w where exists(select 1 from cohort_pairs p where p.workflow_id=w.id and p.researched))),
      jsonb_build_object('key','qualified','label','Qualified leads','count',(select count(*) from pair_counts where qualified>0)),
      jsonb_build_object('key','approvalRequested','label','Approval requested','count',(select count(*) from cohort w where exists(select 1 from public.proposed_actions a
        where a.workspace_id=p_workspace and a.workflow_id=w.id))),
      jsonb_build_object('key','approved','label','Approval recorded','count',(select count(*) from cohort w where exists(select 1 from public.action_approval_snapshots s
        where s.workspace_id=p_workspace and s.workflow_id=w.id))),
      jsonb_build_object('key','sent','label','Email sent','count',(select count(*) from cohort w where exists(select 1 from email_actions a
        join public.execution_attempts t on t.action_id=a.id and t.workspace_id=p_workspace and t.status='succeeded' where a.workflow_id=w.id))),
      jsonb_build_object('key','completed','label','Completed','count',(select count(*) from cohort where status='completed'))
    ),
    'agents',coalesce((select jsonb_agg(value order by value->>'label') from usage_rows where dimension='agent'),'[]'::jsonb),
    'models',coalesce((select jsonb_agg(value order by value->>'label') from usage_rows where dimension='model'),'[]'::jsonb),
    'trends',coalesce((select jsonb_agg(value order by cohort_day) from daily_rows),'[]'::jsonb),
    'industries',coalesce((select jsonb_agg(value order by (value->>'qualified')::integer desc,key) from segment_rows where dimension='industry'),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(value order by (value->>'qualified')::integer desc,key) from segment_rows where dimension='location'),'[]'::jsonb),
    'opportunities',coalesce((select jsonb_agg(value order by (value->>'qualified')::integer desc,key) from segment_rows where dimension='opportunity'),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(value order by key) from segment_rows where dimension='source'),'[]'::jsonb),
    'icps',coalesce((select jsonb_agg(value order by key) from segment_rows where dimension='icp'),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(value order by key) from segment_rows where dimension='template'),'[]'::jsonb),
    'costPeriods',(select jsonb_object_agg(key,value) from cost_period_rows),
    'researchQuality',(select jsonb_build_object('averageSources',avg(source_count) filter(where researched),'withoutEvidence',count(*) filter(where researched and usable_evidence_count=0),
      'highConfidence',count(*) filter(where researched and research_confidence='high'),
      'failures',(select count(*) from public.agent_runs r join cohort_pairs p on p.workflow_id=r.workflow_id and p.company_id::text=r.input->>'companyId'
        where r.workspace_id=p_workspace and r.agent_type='researcher' and r.status='failed'),
      'partialFailureWorkflows',(select count(distinct r.workflow_id) from public.agent_runs r join cohort_pairs p on p.workflow_id=r.workflow_id and p.company_id::text=r.input->>'companyId'
        where r.workspace_id=p_workspace and r.agent_type='researcher' and r.status='failed' and exists(select 1 from cohort_pairs success where success.workflow_id=r.workflow_id and success.researched)),
      'insufficientEvidence',count(*) filter(where researched and (snapshot#>>'{analysis,lead,components,evidenceQuality}')::numeric<7),
      'unknownSnapshots',count(*) filter(where snapshot is null)) from cohort_pairs),
    'filterOptions',jsonb_build_object(
      'industries',coalesce((select jsonb_agg(industry order by industry) from(select distinct industry from normalized_pairs) values_),'[]'::jsonb),
      'locations',coalesce((select jsonb_agg(location order by location) from(select distinct location from normalized_pairs) values_),'[]'::jsonb),
      'workflows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title) order by created_at desc) from(select id,title,created_at from public.workflows where workspace_id=p_workspace order by created_at desc limit 200) values_),'[]'::jsonb),
      'icps',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.ideal_customer_profiles where workspace_id=p_workspace),'[]'::jsonb),
      'templates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.workflow_templates where workspace_id=p_workspace),'[]'::jsonb)
    )
  ) into result;
  return result;
end; $$;
revoke all on function public.intelligence_normalize_08(text,text),public.intelligence_cost_08(numeric,numeric,numeric,numeric,numeric),public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb) from public,anon,service_role;
grant execute on function public.intelligence_normalize_08(text,text),public.intelligence_cost_08(numeric,numeric,numeric,numeric,numeric),public.intelligence_analytics_08(uuid,timestamptz,timestamptz,text,jsonb) to authenticated;
