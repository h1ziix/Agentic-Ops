-- Loaded by local `supabase db reset` only. Do not deploy with `db push --include-seed`.
-- No Auth user or sample data is created automatically. After local sign-in, call
-- seed_demo_workspace(bootstrap_workspace()) as that authenticated user.
-- Every seeded company and outreach draft is fictional and marked as demo content.

create function public.seed_demo_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_fintech uuid := md5(p_workspace_id::text || ':workflow:fintech')::uuid;
  v_saas uuid := md5(p_workspace_id::text || ':workflow:saas')::uuid;
  v_manufacturing uuid := md5(p_workspace_id::text || ':workflow:manufacturing')::uuid;
  v_approval uuid := md5(p_workspace_id::text || ':approval:saas')::uuid;
  v_company record;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;

  insert into public.workflows (
    id, workspace_id, created_by, title, goal, status, progress, current_step,
    target_companies, created_at, started_at
  ) values
    (v_fintech, p_workspace_id, auth.uid(),
      'Explore Kazakhstan fintech automation',
      'Demo goal: identify fictional fintech companies in Kazakhstan, describe support operations opportunities and prepare proposals for human review.',
      'running', 57, 'Qualifying companies', 20, now() - interval '3 days', now() - interval '3 days'),
    (v_saas, p_workspace_id, auth.uid(),
      'Research Central Asia SaaS opportunities',
      'Demo goal: assess fictional B2B SaaS companies in Central Asia and prepare sample outreach drafts without sending them.',
      'waiting_for_approval', 86, 'Review sample outreach proposals', 15,
      now() - interval '5 days', now() - interval '5 days'),
    (v_manufacturing, p_workspace_id, auth.uid(),
      'Map Almaty manufacturing exporters',
      'Demo goal: assess fictional export-focused manufacturers for sales operations automation.',
      'failed', 38, 'Demo source verification stopped', 12,
      now() - interval '8 days', now() - interval '8 days')
  on conflict (id) do nothing;

  insert into public.workflow_tasks (
    id, workspace_id, workflow_id, type, title, description, position, status,
    created_at, started_at, completed_at
  )
  select
    md5(p_workspace_id::text || ':task:' || wf.slug || ':' || task.position::text)::uuid,
    p_workspace_id, wf.id, task.type, task.title, task.description, task.position,
    case
      when wf.slug = 'fintech' and task.position <= 3 then 'completed'::public.workflow_task_status
      when wf.slug = 'fintech' and task.position = 4 then 'running'::public.workflow_task_status
      when wf.slug = 'saas' and task.position <= 7 then 'completed'::public.workflow_task_status
      when wf.slug = 'manufacturing' and task.position <= 2 then 'completed'::public.workflow_task_status
      when wf.slug = 'manufacturing' and task.position = 3 then 'failed'::public.workflow_task_status
      else 'pending'::public.workflow_task_status
    end,
    now() - interval '2 days',
    case when (wf.slug = 'fintech' and task.position <= 4)
                or (wf.slug = 'saas' and task.position <= 7)
                or (wf.slug = 'manufacturing' and task.position <= 3)
      then now() - interval '2 days' else null end,
    case when (wf.slug = 'fintech' and task.position <= 3)
                or (wf.slug = 'saas' and task.position <= 7)
                or (wf.slug = 'manufacturing' and task.position <= 2)
      then now() - interval '1 day' else null end
  from (values
    ('fintech', v_fintech), ('saas', v_saas), ('manufacturing', v_manufacturing)
  ) as wf(slug, id)
  cross join (values
    (1, 'define_target_profile', 'Define target profile', 'Set market and qualification criteria for this demo workflow.'),
    (2, 'discover_companies', 'Discover companies', 'Review fictional candidate companies and sample source notes.'),
    (3, 'research_companies', 'Research companies', 'Summarize sample products and operations signals.'),
    (4, 'qualify_opportunities', 'Qualify opportunities', 'Identify specific automation opportunities from demo profiles.'),
    (5, 'score_leads', 'Score leads', 'Record sample scores and concise reasons.'),
    (6, 'prepare_outreach', 'Prepare outreach', 'Prepare sample drafts for review; nothing is sent.'),
    (7, 'request_approval', 'Request approval', 'Hold proposed actions until a human decision.')
  ) as task(position, type, title, description)
  on conflict (workflow_id, position) do nothing;

  for v_company in
    select * from (values
      ('orda-finance', v_fintech, 'Orda Finance', 'Digital lending', 'Almaty, Kazakhstan',
        'Fictional mobile lending provider with self-service applications and borrower support.',
        '51-200', 'Application-status support automation', 86, 'high'),
      ('aqsha-pay', v_fintech, 'Aqsha Pay', 'Payments', 'Astana, Kazakhstan',
        'Fictional merchant payment platform with checkout and settlement products.',
        '51-200', 'Merchant support triage', 82, 'high'),
      ('turan-ledger', v_fintech, 'Turan Ledger', 'Accounting software', 'Almaty, Kazakhstan',
        'Fictional cloud accounting tool for small businesses.',
        '11-50', 'Invoice reconciliation assistance', 79, 'medium'),
      ('atlas-remit', v_fintech, 'Atlas Remit', 'Cross-border payments', 'Almaty, Kazakhstan',
        'Fictional cross-border payment product with multilingual onboarding.',
        '11-50', 'Onboarding document checks', 88, 'high'),
      ('qadam-cloud', v_saas, 'Qadam Cloud', 'Workflow SaaS', 'Almaty, Kazakhstan',
        'Fictional workflow platform for distributed commercial teams.',
        '51-200', 'Customer onboarding guidance', 90, 'high'),
      ('beket-analytics', v_saas, 'Beket Analytics', 'Analytics SaaS', 'Astana, Kazakhstan',
        'Fictional reporting platform for retail operations teams.',
        '11-50', 'First-line analytics support', 88, 'high'),
      ('silkroute-crm', v_saas, 'Silkroute CRM', 'Sales software', 'Tashkent, Uzbekistan',
        'Fictional CRM with multilingual sales workflows.',
        '51-200', 'Implementation support assistance', 87, 'medium'),
      ('aral-desk', v_saas, 'Aral Desk', 'Customer support SaaS', 'Almaty, Kazakhstan',
        'Fictional shared inbox and help center platform.',
        '11-50', 'Complex ticket summarization', 86, 'high'),
      ('alatau-exports', v_manufacturing, 'Alatau Exports', 'Manufacturing', 'Almaty, Kazakhstan',
        'Fictional exporter of industrial components; demo source review was stopped.',
        '201-500', 'Sales document routing', 72, 'low')
    ) as c(slug, workflow_id, name, industry, location, description, employees, opportunity, score, confidence)
  loop
    insert into public.companies (
      id, workspace_id, workflow_id, name, industry, location, description,
      employee_estimate, research_summary, research_status, source_urls,
      last_researched_at, created_at
    ) values (
      md5(p_workspace_id::text || ':company:' || v_company.slug)::uuid,
      p_workspace_id, v_company.workflow_id, v_company.name, v_company.industry,
      v_company.location, v_company.description, v_company.employees,
      'Demo research summary based on a fictional company profile. No external website was analyzed.',
      case when v_company.slug = 'alatau-exports' then 'failed'::public.company_research_status
           else 'researched'::public.company_research_status end,
      '[]'::jsonb,
      now() - interval '1 day', now() - interval '2 days'
    ) on conflict (id) do nothing;

    insert into public.leads (
      id, workspace_id, company_id, workflow_id, status, score, score_reason,
      opportunity, confidence, outreach_status, created_at
    ) values (
      md5(p_workspace_id::text || ':lead:' || v_company.slug)::uuid,
      p_workspace_id, md5(p_workspace_id::text || ':company:' || v_company.slug)::uuid,
      v_company.workflow_id,
      case when v_company.slug = 'alatau-exports' then 'new'::public.lead_status
           else 'qualified'::public.lead_status end,
      v_company.score,
      'Illustrative demo score from fictional profile; no model or real research was used.',
      v_company.opportunity,
      v_company.confidence::public.lead_confidence,
      case when v_company.workflow_id = v_saas then 'waiting_approval'::public.outreach_status
           else 'not_started'::public.outreach_status end,
      now() - interval '1 day'
    ) on conflict (id) do nothing;
  end loop;

  insert into public.approvals (
    id, workspace_id, workflow_id, type, title, description, status, risk_level, created_at
  ) values (
    v_approval, p_workspace_id, v_saas, 'send_email', 'Review sample SaaS outreach',
    'Two fictional outreach drafts are proposed for review. Approval changes internal state only.',
    'pending', 'high', now() - interval '4 hours'
  ) on conflict (id) do nothing;

  insert into public.proposed_actions (
    id, workspace_id, workflow_id, approval_id, action_type, target, payload,
    status, risk_level, created_at
  ) values
    (md5(p_workspace_id::text || ':action:qadam')::uuid, p_workspace_id, v_saas, v_approval,
      'send_email', jsonb_build_object(
        'company_id', md5(p_workspace_id::text || ':company:qadam-cloud')::uuid,
        'lead_id', md5(p_workspace_id::text || ':lead:qadam-cloud')::uuid,
        'company_name', 'Qadam Cloud', 'recipient_name', 'Qadam Cloud team',
        'recipient_email', 'contact@qadam.example.invalid'),
      '{"recipient_name":"Qadam Cloud team","subject":"Improving onboarding support","body":"Hello Qadam Cloud team,\n\nYour fictional workflow platform suggests a useful opportunity to make onboarding guidance easier to find. This is a sample draft for product demonstration only; it has not been sent.\n\nBest,\nAgentic Ops"}'::jsonb,
      'waiting_for_approval', 'high', now() - interval '4 hours'),
    (md5(p_workspace_id::text || ':action:beket')::uuid, p_workspace_id, v_saas, v_approval,
      'send_email', jsonb_build_object(
        'company_id', md5(p_workspace_id::text || ':company:beket-analytics')::uuid,
        'lead_id', md5(p_workspace_id::text || ':lead:beket-analytics')::uuid,
        'company_name', 'Beket Analytics', 'recipient_name', 'Beket Analytics team',
        'recipient_email', 'contact@beket.example.invalid'),
      '{"recipient_name":"Beket Analytics team","subject":"Supporting analytics users","body":"Hello Beket Analytics team,\n\nYour fictional reporting product suggests an opportunity to help users resolve common dashboard questions. This is a sample draft for product demonstration only; it has not been sent.\n\nBest,\nAgentic Ops"}'::jsonb,
      'waiting_for_approval', 'high', now() - interval '4 hours')
  on conflict (id) do nothing;

  insert into public.agent_events (
    id, workspace_id, workflow_id, event_type, summary, metadata, created_at
  ) values
    (md5(p_workspace_id::text || ':event:fintech-created')::uuid, p_workspace_id, v_fintech,
      'workflow_created', 'Demo workflow created from a sample goal.', '{"demo":true}'::jsonb,
      now() - interval '3 days'),
    (md5(p_workspace_id::text || ':event:fintech-started')::uuid, p_workspace_id, v_fintech,
      'workflow_started', 'Demo workflow snapshot started; no live agent ran.', '{"demo":true}'::jsonb,
      now() - interval '2 days'),
    (md5(p_workspace_id::text || ':event:fintech-company')::uuid, p_workspace_id, v_fintech,
      'company_researched', 'Sample profile recorded for Orda Finance.', '{"demo":true}'::jsonb,
      now() - interval '1 day'),
    (md5(p_workspace_id::text || ':event:fintech-task')::uuid, p_workspace_id, v_fintech,
      'task_started', 'Demo qualification task marked in progress.', '{"demo":true}'::jsonb,
      now() - interval '5 hours'),
    (md5(p_workspace_id::text || ':event:saas-created')::uuid, p_workspace_id, v_saas,
      'workflow_created', 'Demo SaaS workflow created.', '{"demo":true}'::jsonb,
      now() - interval '5 days'),
    (md5(p_workspace_id::text || ':event:saas-approval')::uuid, p_workspace_id, v_saas,
      'approval_requested', 'Two sample outreach drafts are waiting for review.',
      jsonb_build_object('demo', true, 'approval_id', v_approval), now() - interval '4 hours'),
    (md5(p_workspace_id::text || ':event:manufacturing-error')::uuid, p_workspace_id, v_manufacturing,
      'workflow_failed', 'Demo source verification stopped before outreach.', '{"demo":true}'::jsonb,
      now() - interval '2 days')
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.seed_demo_workspace(uuid) from public, anon;
grant execute on function public.seed_demo_workspace(uuid) to authenticated;
