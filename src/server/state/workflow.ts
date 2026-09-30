import type { TaskStatus, WorkflowStatus } from "@/types/persistence";
import { AppError } from "../errors";

const workflowTransitions: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["running", "failed", "cancelled"],
  running: ["waiting_for_approval", "paused", "completed", "failed", "cancelled"],
  waiting_for_approval: ["running", "ready_for_execution", "needs_revision", "cancelled"],
  ready_for_execution: ["running", "cancelled"],
  needs_revision: ["running", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["running", "blocked", "cancelled"],
  running: ["completed", "failed", "blocked", "cancelled"],
  blocked: ["pending", "cancelled"],
  failed: ["pending", "cancelled"],
  completed: [],
  cancelled: [],
};

export function assertWorkflowTransition(current: WorkflowStatus, next: WorkflowStatus): void {
  if (!workflowTransitions[current].includes(next)) throw new AppError("invalid_transition");
}

export function assertTaskTransition(current: TaskStatus, next: TaskStatus, workflowStatus: WorkflowStatus): void {
  if (!taskTransitions[current].includes(next) || (next === "running" && workflowStatus !== "running")) {
    throw new AppError("invalid_transition");
  }
}

export function assertApprovalDecision(current: string, decision: "approved" | "rejected"): void {
  if (current !== "pending" || !["approved", "rejected"].includes(decision)) {
    throw new AppError("invalid_transition");
  }
}
