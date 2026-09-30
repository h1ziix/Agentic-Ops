import { safePublicUrl } from "@/lib/format";
import type { AgentName, AgentEvent, Approval, Company, Lead, StepStatus, WorkspaceViewData } from "@/types/domain";
import type { AgentRunRow, WorkflowTaskRow, WorkspaceSnapshot } from "@/types/persistence";
import { plannerTaskContextSchema, validatedPlannerOutputSchema } from "@/lib/validation/planner";

const stageDefinitions = [
  { label: "Planning", taskTypes: ["define_target_profile"] },
  { label: "Company Discovery", taskTypes: ["discover_companies"] },
  { label: "Research", taskTypes: ["research_companies"] },
  { label: "Qualification", taskTypes: ["qualify_opportunities", "identify_opportunities", "score_leads"] },
  { label: "Outreach", taskTypes: ["prepare_outreach", "generate_outreach"] },
  { label: "Approval", taskTypes: ["request_approval"] },
  { label: "Execution", taskTypes: [] },
] as const;

function agentName(type: AgentRunRow["agent_type"]): AgentName {
  return ({ planner: "Planner Agent", researcher: "Research Agent", reviewer: "Reviewer Agent", executor: "Executor Agent" })[type] as AgentName;
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
  if (tasks.some((task) => task.status === "failed")) return "failed";
  if (tasks.some((task) => task.status === "running")) return "running";
  if (tasks.every((task) => task.status === "completed")) return "completed";
  return "waiting";
}

const eventTitles: Record<string, string> = {
  workflow_planning_started: "Workflow planning started",
  agent_started: "Agent started",
  model_request_started: "Structured plan requested",
  plan_generated: "Plan generated",
  plan_validation_failed: "Plan validation failed",
  task_created: "Task created",
  agent_completed: "Agent completed",
  agent_failed: "Agent failed",
  retry: "Planner retry",
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
    return {
      id: row.id,
      workflowId: row.workflow_id,
      name: row.name,
      website: safePublicUrl(row.website),
      industry: row.industry ?? "Unclassified",
      location: row.location ?? "Location not recorded",
      description: row.description ?? "A company description is not available yet.",
      employeeEstimate: row.employee_estimate ?? "Not recorded",
      sourceUrls: row.source_urls.map(safePublicUrl).filter((url): url is string => url !== null),
      researchSummary: row.research_summary ?? "Research has not been completed.",
      researchStatus: row.research_status,
      opportunity: lead?.opportunity ?? "No qualified opportunity yet",
      score: lead?.score ?? null,
      lastResearchedAt: row.last_researched_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const leads: Lead[] = snapshot.leads.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    workflowId: row.workflow_id,
    status: row.status,
    score: row.score,
    scoreReason: row.score_reason ?? "This lead has not been scored.",
    opportunity: row.opportunity ?? "Opportunity assessment pending",
    confidence: row.confidence,
    outreachStatus: row.outreach_status,
    updatedAt: row.updated_at,
  }));

  const approvals: Approval[] = snapshot.approvals.map((row) => {
    const actions = snapshot.proposedActions.filter((action) => action.approval_id === row.id);
    const requestedRun = row.requested_by_agent_run_id ? runsById.get(row.requested_by_agent_run_id) : null;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      title: row.title,
      description: row.description,
      actionType: actions[0]?.action_type ?? row.type,
      status: row.status,
      requestedBy: requestedRun ? agentName(requestedRun.agent_type) : "Workspace",
      requestedAt: row.created_at,
      riskLabel: row.risk_level.charAt(0).toUpperCase() + row.risk_level.slice(1),
      recipientCount: actions.length,
      proposedActions: actions.map((action) => ({
        id: action.id,
        leadId: stringField(action.target, "lead_id", "leadId") ?? "",
        companyId: stringField(action.target, "company_id", "companyId") ?? "",
        actionType: action.action_type,
        recipientName: stringField(action.target, "recipient_name", "recipientName", "name") ?? "Recipient",
        recipientEmail: stringField(action.target, "recipient_email", "recipientEmail", "email") ?? "",
        subject: stringField(action.payload, "subject") ?? "Untitled proposal",
        body: stringField(action.payload, "body") ?? "No message body is available.",
        status: action.status,
      })),
    };
  });

  const activity: AgentEvent[] = snapshot.events.map((row) => {
    const run = row.agent_run_id ? runsById.get(row.agent_run_id) : null;
    const kind = row.event_type;
    const category = kind.includes("failed") || kind === "error" ? "error" as const
      : kind.startsWith("tool_") || kind === "model_request_started" ? "tool" as const
      : kind.startsWith("approval_") ? "approval" as const
      : kind.startsWith("workflow_") ? "workflow" as const
      : "agent" as const;
    const status = kind.includes("failed") || kind === "error" ? "failed" as const
      : kind.endsWith("_started") ? "running" as const
      : kind === "approval_requested" ? "waiting" as const
      : "completed" as const;
    const durationMs = row.metadata.duration_ms;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      eventType: kind,
      category,
      agent: run ? agentName(run.agent_type) : undefined,
      title: run && ["agent_started", "agent_completed", "agent_failed"].includes(kind)
        ? `${agentName(run.agent_type)} ${kind.slice(6)}`
        : eventTitles[kind] ?? kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
      description: row.summary,
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
      ...companies.filter((company) => company.workflowId === row.id).map((company) => company.id),
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
      targetCompanies: row.target_companies,
      companyCount: companyIds.size,
      qualifiedLeadCount: relatedLeads.filter((lead) => ["qualified", "outreach_ready", "waiting_approval", "contacted", "responded", "converted"].includes(lead.status)).length,
      pendingApprovalCount: pendingApprovals.reduce((total, approval) => total + approval.proposedActions.length, 0),
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
    agent: runsByTask.get(row.id) ? agentName(runsByTask.get(row.id)!.agent_type) : "Unassigned" as const,
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
      const decisions = approvals.filter((approval) => approval.workflowId === workflow.id);
      status = decisions.some((approval) => approval.status === "pending") ? "running"
        : decisions.some((approval) => approval.status === "rejected") ? "failed"
        : decisions.length > 0 && decisions.every((approval) => approval.status === "approved" || approval.status === "executed") ? "completed"
        : tasks.some((task) => task.status === "failed") ? "failed" : "waiting";
    }
    if (index === stageDefinitions.length - 1) status = workflow.status === "completed" ? "completed" : "waiting";
    return { id: `${workflow.id}-stage-${index + 1}`, workflowId: workflow.id, label: definition.label, order: index + 1, status };
  }));

  const initials = snapshot.workspace.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "AO";
  return {
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
  };
}
