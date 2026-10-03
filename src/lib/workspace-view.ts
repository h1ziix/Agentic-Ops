import { safePublicUrl } from "@/lib/format";
import type { AgentName, AgentEvent, Approval, Company, Lead, StepStatus, WorkspaceViewData } from "@/types/domain";
import type { AgentRunRow, WorkflowTaskRow, WorkspaceSnapshot } from "@/types/persistence";
import { plannerTaskContextSchema, validatedPlannerOutputSchema } from "@/lib/validation/planner";
import { researchAnalysisSchema, researchOutputSchema } from "@/lib/validation/research";
import { emailActionPayloadSchema } from "@/lib/validation/outreach";
import { executableEnvelopeSchema } from "@/lib/validation/execution";
import { executionBlockers } from "@/server/execution/readiness";

const stageDefinitions = [
  { label: "Planning", taskTypes: ["define_target_profile"] },
  { label: "Company Discovery", taskTypes: ["discover_companies"] },
  { label: "Research", taskTypes: ["research_companies"] },
  { label: "Qualification", taskTypes: ["qualify_opportunities", "identify_opportunities", "score_leads"] },
  { label: "Lead Review", taskTypes: ["review_qualified_leads"] },
  { label: "Outreach", taskTypes: ["prepare_outreach", "generate_outreach"] },
  { label: "Approval", taskTypes: ["request_approval"] },
  { label: "Execution", taskTypes: ["execute_approved_actions"] },
] as const;

function agentName(type: AgentRunRow["agent_type"]): AgentName {
  return ({ planner: "Planner Agent", researcher: "Research Agent", reviewer: "Reviewer Agent", outreach: "Outreach Agent", executor: "Executor Agent" })[type] as AgentName;
}

function stringField(value: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return null;
}

function stageStatus(tasks: WorkflowTaskRow[]): StepStatus {
  if (!tasks.length) return "waiting";
  if (tasks.every((task) => task.status === "cancelled")) return "cancelled";
  if (tasks.some((task) => task.status === "failed")) return "failed";
  if (tasks.some((task) => task.status === "running")) return "running";
  if (tasks.every((task) => task.status === "completed")) return "completed";
  return "waiting";
}

const eventTitles: Record<string, string> = {
  workflow_planning_started: "Workflow planning started",
  agent_started: "Agent started",
  model_request_started: "Model request started",
  plan_generated: "Plan generated",
  plan_validation_failed: "Plan validation failed",
  task_created: "Task created",
  agent_completed: "Agent completed",
  agent_failed: "Agent failed",
  retry: "Agent retry",
  workflow_created: "Workflow created",
  workflow_started: "Workflow started",
  workflow_paused: "Workflow paused",
  workflow_resumed: "Workflow resumed",
  workflow_completed: "Workflow completed",
  workflow_failed: "Workflow failed",
  workflow_cancelled: "Workflow cancelled",
  workflow_ready_for_execution: "Approval recorded",
  workflow_needs_revision: "Revision requested",
  approval_requested: "Approval requested",
  approval_approved: "Approval approved",
  approval_rejected: "Approval rejected",
  task_started: "Task started",
  task_completed: "Task completed",
  task_failed: "Task failed",
  automation_scheduled: "Background job scheduled",
  automation_started: "Background job started",
  automation_completed: "Background job completed",
  automation_failed: "Background job failed",
  automation_cancelled: "Future background job cancelled",
  retry_scheduled: "Bounded retry scheduled",
  retry_exhausted: "Retry limit reached",
  manual_retry_requested: "Manual retry requested",
  followup_due: "Follow-up draft preparation due",
  followup_draft_created: "Follow-up draft ready for approval",
  reply_check_started: "Reply monitoring started",
  reply_detected: "Reply detected; future follow-up cancelled",
  run_recovered: "Stale workflow run recovered",
  run_marked_stale: "Workflow run marked stale",
  icp_created: "ICP created", icp_updated: "ICP updated", icp_duplicated: "ICP duplicated", icp_archived: "ICP archived",
  template_created: "Template created", template_updated: "Template updated", template_duplicated: "Template duplicated", template_archived: "Template archived",
  workflow_created_from_icp: "Workflow started from ICP", workflow_created_from_template: "Workflow started from template",
};

/** Keeps the Stage 1 presentation components independent from database row shape. */
export function toWorkspaceView(snapshot: WorkspaceSnapshot): WorkspaceViewData {
  const runsById = new Map(snapshot.agentRuns.map((run) => [run.id, run]));
  const runsByTask = new Map(snapshot.agentRuns.filter((run) => run.workflow_task_id).map((run) => [run.workflow_task_id, run]));
  const leadsByCompany = new Map<string, typeof snapshot.leads[number]>();
  for (const lead of snapshot.leads) {
    const current = leadsByCompany.get(lead.company_id);
    if (!current || (lead.score ?? -1) > (current.score ?? -1)) leadsByCompany.set(lead.company_id, lead);
  }

  const companies: Company[] = snapshot.companies.map((row) => {
    const lead = leadsByCompany.get(row.id);
    const qualification = researchAnalysisSchema.shape.lead.safeParse(row.qualification);
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowResearchStatuses: Object.fromEntries(snapshot.workflowCompanies
        ? snapshot.workflowCompanies.filter((link) => link.company_id === row.id).map((link) => [link.workflow_id, link.research_status])
        : row.workflow_id ? [[row.workflow_id, row.research_status]] : []),
      name: row.name,
      website: safePublicUrl(row.website),
      industry: row.industry ?? "Unclassified",
      location: row.location ?? "Location not recorded",
      description: row.description ?? "A company description is not available yet.",
      employeeEstimate: row.employee_estimate ?? "Not recorded",
      sourceUrls: row.source_urls.map(safePublicUrl).filter((url): url is string => url !== null),
      sources: row.sources ?? [],
      automationOpportunities: row.automation_opportunities?.map((opportunity) => ({ category: opportunity.category, title: opportunity.title,
        explanation: opportunity.explanation, evidence: (opportunity.evidence ?? []).filter((url) => safePublicUrl(url)) })) ?? [],
      scoreComponents: qualification.success ? qualification.data.components : undefined,
      scoreReason: qualification.success ? qualification.data.scoreReason : lead?.score_reason ?? undefined,
      qualificationConfidence: qualification.success ? qualification.data.confidence : lead?.confidence ?? undefined,
      researchSummary: row.research_summary ?? "Research has not been completed.",
      researchStatus: row.research_status,
      opportunity: qualification.success ? qualification.data.opportunity : lead?.opportunity ?? "No qualified opportunity yet",
      score: qualification.success ? qualification.data.score : lead?.score ?? null,
      lastResearchedAt: row.last_researched_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const leads: Lead[] = snapshot.leads.map((row) => {
    const researchRun = snapshot.agentRuns.find((run) => run.workflow_id === row.workflow_id && run.agent_type === "researcher"
      && run.status === "completed" && typeof run.output === "object" && run.output !== null && "companyId" in run.output && run.output.companyId === row.company_id);
    const research = researchOutputSchema.safeParse(row.research_snapshot ?? (researchRun?.output && typeof researchRun.output === "object" && "result" in researchRun.output ? researchRun.output.result : undefined));
    return ({
    id: row.id,
    companyId: row.company_id,
    workflowId: row.workflow_id,
    status: row.status,
    score: row.score,
    scoreReason: row.score_reason ?? "This lead has not been scored.",
    opportunity: row.opportunity ?? "Opportunity assessment pending",
    confidence: row.confidence,
    outreachStatus: row.outreach_status,
    replyStatus: snapshot.repliedLeadIds?.includes(row.id) ? "detected" : "unavailable",
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    scoreComponents: row.score_components ?? undefined,
    review: row.review_metadata ?? undefined,
    researchContext: research.success ? { ...research.data.analysis.company,
      industry: research.data.analysis.company.industry ?? "Unclassified",
      location: research.data.analysis.company.location ?? "Location not recorded",
      employeeEstimate: research.data.analysis.company.employeeEstimate ?? "Not recorded",
      sourceUrls: research.data.sources.map((source) => source.url),
      sources: research.data.sources.map((source) => ({ url: source.url, title: source.title, type: "search_result" as const, accessedAt: source.retrievedAt })) } : undefined,
  }); });

  const approvals: Approval[] = snapshot.approvals.map((row) => {
    const actions = snapshot.proposedActions.filter((action) => action.approval_id === row.id);
    const requestedRun = row.requested_by_agent_run_id ? runsById.get(row.requested_by_agent_run_id) : null;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      title: row.type === "stage5_outreach" ? `Review ${actions.length} outreach draft${actions.length === 1 ? "" : "s"}` : row.title,
      description: row.description,
      actionType: actions[0]?.action_type ?? row.type,
      status: row.status,
      requestedBy: requestedRun ? agentName(requestedRun.agent_type) : "Workspace",
      requestedAt: row.created_at,
      riskLabel: row.risk_level.charAt(0).toUpperCase() + row.risk_level.slice(1),
      recipientCount: actions.length,
      proposedActions: actions.map((action) => {
        const payload = emailActionPayloadSchema.safeParse(action.payload);
        const executable = executableEnvelopeSchema.safeParse(action.executable_envelope);
        const envelope = executable.success ? executable.data : undefined;
        const savedSnapshot = snapshot.actionSnapshots?.find((s) => s.action_id === action.id && s.revision === action.revision);
        const attempts = snapshot.executionAttempts?.filter((t) => t.action_id === action.id) ?? [];
        const workflow = snapshot.workflows.find((w) => w.id === action.workflow_id)!;
        const blockers = workflow ? executionBlockers(action, savedSnapshot ?? null, snapshot.integrationConnections?.find((c) => c.id === savedSnapshot?.connection_id) ?? null, workflow, attempts) : ["Workflow unavailable"];
        if (!action.is_auxiliary && snapshot.proposedActions.some((a) => a.workflow_id === action.workflow_id && !a.is_auxiliary && !a.superseded_by_id && ["pending_approval", "waiting_for_approval"].includes(a.status))) blockers.push("Resolve every primary batch decision before executing emails.");
        if (snapshot.executionAttempts?.some((a) => a.workflow_id === action.workflow_id && a.action_id !== action.id && a.status === "outcome_unknown" && a.verification_method !== "closed_for_replacement")) blockers.push("Another action has an unresolved unknown outcome; reconcile it first.");
        if (snapshot.executionAttempts?.some((a) => a.workflow_id === action.workflow_id && a.action_id !== action.id && ["claimed", "dispatching"].includes(a.status))) blockers.push("Another action is active on this workflow. Inspect its saved status first.");
        return ({
        envelope, snapshot: savedSnapshot, attempts, auxiliary: action.is_auxiliary,
        supersededById: action.superseded_by_id ?? undefined,
        replacesActionId: action.replaces_action_id ?? undefined,
        blockers,
        id: action.id,
        leadId: stringField(action.target, "lead_id", "leadId") ?? "",
        companyId: stringField(action.target, "company_id", "companyId") ?? "",
        actionType: action.action_type,
        recipientName: stringField(action.target, "recipient_name", "recipientName", "name") ?? "Recipient",
        recipientEmail: envelope && "recipient" in envelope ? envelope.recipient.email : stringField(action.target, "recipient_email", "recipientEmail", "email") ?? "",
        subject: envelope?.actionType === "send_email" ? envelope.subject : envelope?.actionType === "upsert_crm_contact" ? "Exact HubSpot contact changes" : envelope?.actionType === "schedule_follow_up" ? "Internal follow-up plan" : stringField(action.payload, "subject") ?? "Untitled proposal",
        body: envelope?.actionType === "send_email" ? envelope.body : stringField(action.payload, "body") ?? "No message body is available.",
        status: action.status,
        revision: action.revision ?? 0,
        evidenceReferences: payload.success ? payload.data.evidenceReferences : [],
        metadata: payload.success ? payload.data.generationMetadata : undefined,
        warnings: envelope ? [] : payload.success ? payload.data.warnings : [],
        executionReadiness: payload.success ? payload.data.executionReadiness : stringField(action.target, "recipientEmail", "recipient_email", "email") ? "ready" as const : "blocked_missing_recipient" as const,
        dedupeKey: action.dedupe_key ?? undefined,
        riskLevel: action.risk_level,
      }); }),
    };
  });

  const activity: AgentEvent[] = snapshot.events.map((row) => {
    const run = row.agent_run_id ? runsById.get(row.agent_run_id) : null;
    const kind = row.event_type;
    const isError = kind.includes("failed") || ["error", "retry_exhausted", "run_marked_stale"].includes(kind);
    const category = isError ? "error" as const
      : kind.startsWith("tool_") || ["model_request_started", "reply_check_started", "reply_detected"].includes(kind) ? "tool" as const
      : kind.startsWith("approval_") || kind.startsWith("proposed_action_") || kind === "followup_draft_created" ? "approval" as const
      : kind.startsWith("workflow_") || kind.startsWith("automation_") || kind.startsWith("run_") || kind.startsWith("icp_") || kind.startsWith("template_")
        || ["retry_scheduled", "manual_retry_requested", "followup_due"].includes(kind) ? "workflow" as const
      : "agent" as const;
    const status = isError ? "failed" as const
      : ["execution_outcome_unknown", "integration_reconnect_required", "automation_scheduled", "retry_scheduled", "manual_retry_requested", "followup_due", "followup_draft_created"].includes(kind) ? "waiting" as const
      : kind.endsWith("_started") ? "running" as const
      : kind === "approval_requested" ? "waiting" as const
      : "completed" as const;
    const durationMs = row.metadata.duration_ms;
    const companyName = snapshot.companies.find((company) => company.id === row.metadata.company_id)?.name;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      eventType: kind,
      category,
      agent: run ? agentName(run.agent_type) : undefined,
      title: run && ["agent_started", "agent_completed", "agent_failed"].includes(kind)
        ? `${agentName(run.agent_type)} ${kind.slice(6)}`
        : kind === "outreach_draft_failed" && run?.agent_type === "reviewer" ? "Evidence review failed"
        : eventTitles[kind] ?? kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
      description: companyName && ["lead_qualified", "lead_rejected"].includes(kind) && row.summary.startsWith("Company ")
        ? `${companyName} ${row.summary.slice(8)}` : row.summary,
      timestamp: row.created_at,
      status,
      companyId: stringField(row.metadata, "company_id") ?? undefined,
      leadId: stringField(row.metadata, "lead_id") ?? undefined,
      toolName: stringField(row.metadata, "tool_name") ?? undefined,
      durationMs: typeof durationMs === "number" && Number.isFinite(durationMs) ? durationMs : undefined,
    };
  });

  const workflows = snapshot.workflows.map((row) => {
    const relatedLeads = leads.filter((lead) => lead.workflowId === row.id);
    const companyIds = new Set([
      ...companies.filter((company) => company.workflowResearchStatuses?.[row.id] || company.workflowId === row.id).map((company) => company.id),
      ...relatedLeads.map((lead) => lead.companyId),
    ]);
    const pendingApprovals = approvals.filter((approval) => approval.workflowId === row.id && approval.status === "pending");
    const failure = activity.find((event) => event.workflowId === row.id && event.status === "failed");
    return {
      id: row.id,
      title: row.title,
      goal: row.goal,
      status: row.status,
      progress: row.progress,
      currentStep: row.current_step,
      icpId: row.icp_id ?? undefined, templateId: row.template_id ?? undefined,
      icpName: row.icp_snapshot?.name, templateName: row.template_snapshot?.name,
      icpSnapshot: row.icp_snapshot ?? undefined, templateSnapshot: row.template_snapshot ?? undefined,
      targetCompanies: row.target_companies,
      companyCount: companyIds.size,
      qualifiedLeadCount: relatedLeads.filter((lead) => ["qualified", "outreach_ready", "waiting_approval", "contacted", "responded", "converted"].includes(lead.status)).length,
      pendingApprovalCount: pendingApprovals.reduce((total, approval) => total + approval.proposedActions.filter((action) => ["pending_approval", "waiting_for_approval"].includes(action.status)).length, 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      errorSummary: row.status === "failed" ? failure?.description : undefined,
    };
  });

  const workflowTasks = snapshot.tasks.map((row) => {
    const context = plannerTaskContextSchema.safeParse(row.input);
    return ({
    id: row.id,
    workflowId: row.workflow_id,
    title: row.title,
    description: row.description,
    order: row.position,
    status: row.status,
    type: row.type,
    error: typeof row.error === "object" && row.error !== null && "message" in row.error && typeof row.error.message === "string" ? row.error.message : undefined,
    agent: runsByTask.get(row.id) ? agentName(runsByTask.get(row.id)!.agent_type)
      : row.type === "review_qualified_leads" ? "Reviewer Agent" as const
      : row.type === "generate_outreach" ? "Outreach Agent" as const
      : row.type === "execute_approved_actions" ? "Executor Agent" as const : "Unassigned" as const,
    completedAt: row.completed_at ?? undefined,
    ...(context.success ? context.data : {}),
  }); });

  const workflowStages = snapshot.workflows.flatMap((workflow) => stageDefinitions.map((definition, index) => {
    const tasks = snapshot.tasks.filter((task) => task.workflow_id === workflow.id && definition.taskTypes.some((type) => type === task.type));
    let status: StepStatus = stageStatus(tasks);
    if (definition.label === "Planning") {
      const planner = snapshot.agentRuns.find((run) => run.workflow_id === workflow.id && run.agent_type === "planner");
      if (planner) status = planner.status === "completed" ? "completed" : planner.status === "failed" ? "failed" : planner.status === "running" || planner.status === "queued" ? "running" : "waiting";
      else if (workflow.status === "planning" && !tasks.length) status = "running";
    }
    if (definition.label === "Approval") {
      const decisions = approvals.filter((approval) => approval.workflowId === workflow.id && !approval.proposedActions.every((action) => action.auxiliary));
      status = decisions.some((approval) => approval.status === "pending") ? "running"
        : decisions.some((approval) => approval.status === "rejected") ? "completed"
        : decisions.length > 0 && decisions.every((approval) => approval.status === "approved" || approval.status === "executed") ? "completed"
        : stageStatus(tasks);
    }
    if (index === stageDefinitions.length - 1) status = stageStatus(tasks);
    return { id: `${workflow.id}-stage-${index + 1}`, workflowId: workflow.id, label: definition.label, order: index + 1, status };
  }));

  const initials = snapshot.workspace.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "AO";
  return {
    historyWindows: snapshot.historyWindows,
    integrationConnections: snapshot.integrationConnections ?? [],
    followUpPlans: snapshot.followUpPlans ?? [],
    workspace: { id: snapshot.workspace.id, name: snapshot.workspace.name, initials, plan: "Workspace", mode: "live" },
    workflows,
    workflowStages,
    workflowTasks,
    companies,
    leads,
    approvals,
    activity,
    plannerRuns: snapshot.agentRuns.filter((run) => run.agent_type === "planner").map((run) => {
      const plan = validatedPlannerOutputSchema.safeParse(run.output);
      const error = typeof run.error === "object" && run.error !== null && "message" in run.error && typeof run.error.message === "string" ? run.error.message : undefined;
      return { id: run.id, workflowId: run.workflow_id, status: run.status, model: run.model,
        summary: plan.success ? plan.data.summary : undefined, assumptions: plan.success ? plan.data.assumptions : [],
        startedAt: run.started_at, completedAt: run.completed_at, durationMs: run.duration_ms ?? null,
        retryCount: run.retry_count ?? 0, taskCount: run.task_count ?? (plan.success ? plan.data.tasks.length : 0),
        totalTokens: run.total_tokens ?? null, error };
    }),
    researchRuns: snapshot.agentRuns.filter((run) => run.agent_type === "researcher").map((run) => {
      const error = typeof run.error === "object" && run.error !== null && "message" in run.error && typeof run.error.message === "string" ? run.error.message : undefined;
      const summary = typeof run.output === "object" && run.output !== null && "summary" in run.output && typeof run.output.summary === "string" ? run.output.summary : undefined;
      return { id: run.id, workflowId: run.workflow_id, taskId: run.workflow_task_id, status: run.status, model: run.model, summary,
        startedAt: run.started_at, completedAt: run.completed_at, durationMs: run.duration_ms ?? null, retryCount: run.retry_count ?? 0,
        taskCount: run.task_count ?? 0, totalTokens: run.total_tokens ?? null, error };
    }),
    preparationRuns: snapshot.agentRuns.filter((run) => run.agent_type === "reviewer" || run.agent_type === "outreach").map((run) => {
      const error = typeof run.error === "object" && run.error !== null && "message" in run.error && typeof run.error.message === "string" ? run.error.message : undefined;
      return { id: run.id, workflowId: run.workflow_id, taskId: run.workflow_task_id, status: run.status, model: run.model,
        agent: run.agent_type === "reviewer" ? "Reviewer Agent" as const : "Outreach Agent" as const,
        startedAt: run.started_at, completedAt: run.completed_at, durationMs: run.duration_ms ?? null,
        retryCount: run.retry_count ?? 0, taskCount: run.task_count ?? 0, totalTokens: run.total_tokens ?? null, error };
    }),
  };
}
