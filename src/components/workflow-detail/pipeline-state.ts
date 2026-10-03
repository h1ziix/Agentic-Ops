import type { Approval, WorkflowStage, WorkflowTask } from "@/types/domain";

export type PipelineStatus = WorkflowStage["status"] | "blocked";
export interface PipelineRun {
  id: string;
  taskId?: string | null;
  agent: string;
  model: string | null;
  status: string;
  startedAt: string | null;
  durationMs: number | null;
  totalTokens: number | null;
  summary?: string;
  error?: string;
  toolCalls?: number;
  estimatedCostUsd?: number | null;
}

const taskTypes: Record<string, readonly string[]> = {
  Planning: ["define_target_profile"],
  "Company Discovery": ["discover_companies"],
  Research: ["research_companies"],
  Qualification: ["qualify_opportunities", "identify_opportunities", "score_leads"],
  "Lead Review": ["review_qualified_leads"],
  Outreach: ["prepare_outreach", "generate_outreach"],
  Approval: ["request_approval"],
  Execution: ["execute_approved_actions"],
};
const legacyTitles: Record<string, RegExp> = {
  Planning: /define.*(?:profile|target)/i,
  "Company Discovery": /discover/i,
  Research: /^research/i,
  Qualification: /(?:qualify|score|evaluate.*opportunit)/i,
  "Lead Review": /review.*lead/i,
  Outreach: /(?:prepare|generate).*outreach/i,
  Approval: /request.*approval/i,
  Execution: /execute/i,
};

export function tasksForStage(stage: WorkflowStage, tasks: readonly WorkflowTask[]) {
  return tasks.filter((task) => task.workflowId === stage.workflowId && (task.type
    ? taskTypes[stage.label]?.includes(task.type)
    : legacyTitles[stage.label]?.test(task.title)));
}

/** Presentation only: unknown execution outcomes and unresolved decisions must stay visible. */
export function pipelineStatus(stage: WorkflowStage, tasks: readonly WorkflowTask[], approvals: readonly Approval[]): PipelineStatus {
  const actions = approvals.filter((approval) => approval.workflowId === stage.workflowId)
    .flatMap((approval) => approval.proposedActions).filter((action) => !action.auxiliary && !action.supersededById);
  if (stage.label === "Approval" && actions.some((action) => ["pending_approval", "waiting_for_approval"].includes(action.status))) return "waiting";
  if (stage.label === "Execution") {
    const attempts = actions.flatMap((action) => action.attempts ?? []);
    if (attempts.some((attempt) => attempt.status === "outcome_unknown" && attempt.verification_method !== "closed_for_replacement")) return "blocked";
    if (attempts.some((attempt) => ["claimed", "dispatching"].includes(attempt.status))) return "running";
    if (actions.some((action) => action.status === "approved" && action.blockers?.length)) return "blocked";
    if (actions.some((action) => ["pending_approval", "waiting_for_approval", "approved"].includes(action.status))) return "waiting";
  }
  const related = tasksForStage(stage, tasks);
  if (related.some((task) => task.status === "failed")) return "failed";
  if (related.some((task) => task.status === "running")) return "running";
  if (related.some((task) => task.status === "blocked")) return "blocked";
  return stage.status;
}

export function runsForStage(stage: WorkflowStage, tasks: readonly WorkflowTask[], runs: readonly PipelineRun[]) {
  if (stage.label === "Planning") return runs.filter((run) => run.agent === "Planner Agent");
  const ids = new Set(tasksForStage(stage, tasks).map((task) => task.id));
  return runs.filter((run) => run.taskId && ids.has(run.taskId));
}

/** A partial sum must never turn absent telemetry into a measured zero. */
export function recordedTotal(values: readonly (number | null | undefined)[]) {
  return values.length > 0 && values.every((value): value is number => value != null)
    ? values.reduce((sum, value) => sum + value, 0) : null;
}
