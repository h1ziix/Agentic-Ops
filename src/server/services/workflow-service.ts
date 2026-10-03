import { z } from "zod";
import { newWorkflowSchema, recordIdSchema, taskStatusSchema, workflowStatusSchema, type NewWorkflowInput } from "@/lib/validation/workflow";
import type { WorkflowDetailSnapshot, WorkflowRow, WorkflowTaskRow } from "@/types/persistence";
import { requireWorkspace, type WorkspaceContext } from "../auth/context";
import { AgentEventRepository, AgentRunRepository } from "../repositories/agent-repositories";
import { ApprovalRepository } from "../repositories/approval-repository";
import { CompanyRepository, LeadRepository } from "../repositories/entity-repositories";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { assertTaskTransition, assertWorkflowTransition } from "../state/workflow";
import { AppError } from "../errors";
import { ExecutionRepository } from "../repositories/execution-repository";
import { IntegrationRepository } from "../repositories/integration-repository";

const transitionSummarySchema = z.string().trim().min(1).max(500).optional();

export function titleFromGoal(goal: string): string {
  const firstClause = goal.trim().split(/[!?\n]|\.(?:\s|$)/)[0].trim();
  const concise = firstClause.split(/\s+(?:that|where|which|and prepare|and draft|and generate)\b/i)[0];
  if (concise.length <= 76) return concise;
  return `${concise.slice(0, 72).replace(/\s+\S*$/, "").trimEnd()}…`;
}

export async function createWorkflow(input: NewWorkflowInput): Promise<WorkflowRow> {
  const parsed = newWorkflowSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message);
  const { supabase, workspace } = await requireWorkspace();
  const repository = new WorkflowRepository(supabase);
  const id = await repository.createWorkflow({
    workspaceId: workspace.id,
    title: titleFromGoal(parsed.data.goal),
    goal: parsed.data.goal,
    targetCompanies: parsed.data.targetCompanies,
    icpId: parsed.data.icpId,
    templateId: parsed.data.templateId,
  });
  const workflow = await repository.getWorkflowById(workspace.id, id);
  if (!workflow) throw new AppError("database");
  const { automationConfiguration } = await import("../automation/config");
  if (automationConfiguration().enabled) {
    // Persist the first job during creation; page visibility is never its trigger.
    const { scheduleWorkflowAutomation } = await import("./automation-service");
    try { await scheduleWorkflowAutomation(workflow.id); }
    catch {
      // Creation succeeded. A transient dispatch failure must not invite a duplicate goal.
      const { createRuntimeClient } = await import("@/lib/supabase/admin");
      const { EventService } = await import("./event-service");
      await new EventService(new AgentEventRepository(createRuntimeClient())).record({ workspaceId: workspace.id, workflowId: workflow.id,
        eventType: "automation_failed", summary: "The goal was saved, but background scheduling needs attention. Resume this workflow to retry scheduling.",
        metadata: { operation: "initial_schedule" } }).catch(() => undefined);
    }
  }
  return workflow;
}

export async function getWorkflowById(workflowId: string): Promise<WorkflowRow> {
  const id = recordIdSchema.safeParse(workflowId);
  if (!id.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const workflow = await new WorkflowRepository(supabase).getWorkflowById(workspace.id, id.data);
  if (!workflow) throw new AppError("not_found");
  return workflow;
}

export async function getWorkflowDetailSnapshot(workflowId: string, context?: WorkspaceContext): Promise<WorkflowDetailSnapshot> {
  const id = recordIdSchema.safeParse(workflowId);
  if (!id.success) throw new AppError("validation");
  const { supabase, workspace } = context ?? await requireWorkspace();
  const workflowRepository = new WorkflowRepository(supabase);
  const workflow = await workflowRepository.getWorkflowById(workspace.id, id.data);
  if (!workflow) throw new AppError("not_found");

  const [tasks, companies, leads, agentRuns, events, approvals, proposedActions, repliedLeadIds] = await Promise.all([
    workflowRepository.listWorkflowTasks(workspace.id, workflow.id),
    new CompanyRepository(supabase).listWorkspaceCompanies(workspace.id, workflow.id),
    new LeadRepository(supabase).listWorkspaceLeads(workspace.id, workflow.id),
    new AgentRunRepository(supabase).listWorkspaceRuns(workspace.id, workflow.id),
    new AgentEventRepository(supabase).listWorkspaceEvents(workspace.id, workflow.id),
    new ApprovalRepository(supabase).listWorkspaceApprovals(workspace.id, workflow.id),
    new ApprovalRepository(supabase).listWorkspaceProposedActions(workspace.id, workflow.id),
    new LeadRepository(supabase).listDetectedReplyLeadIds(workspace.id, workflow.id),
  ]);

  const [execution, integrationConnections] = await Promise.all([new ExecutionRepository(supabase).list(workspace.id, workflow.id), new IntegrationRepository(supabase).list(workspace.id)]);
  return { workflow, tasks, companies, leads, agentRuns, events, approvals, proposedActions, repliedLeadIds, ...execution, integrationConnections };
}

export async function transitionWorkflow(workflowId: string, nextStatus: unknown, summary?: string): Promise<WorkflowRow> {
  const id = recordIdSchema.safeParse(workflowId);
  const next = workflowStatusSchema.safeParse(nextStatus);
  const parsedSummary = transitionSummarySchema.safeParse(summary);
  if (!id.success || !next.success || !parsedSummary.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const repository = new WorkflowRepository(supabase);
  const current = await repository.getWorkflowById(workspace.id, id.data);
  if (!current) throw new AppError("not_found");
  if (current.status === "cancelled" && next.data === "cancelled") return current;
  assertWorkflowTransition(current.status, next.data);
  return repository.updateWorkflowStatus(id.data, next.data, parsedSummary.data);
}

export async function startWorkflow(workflowId: string): Promise<WorkflowRow> {
  return transitionWorkflow(workflowId, "running");
}

export async function transitionTask(taskId: string, nextStatus: unknown, summary?: string): Promise<WorkflowTaskRow> {
  const id = recordIdSchema.safeParse(taskId);
  const next = taskStatusSchema.safeParse(nextStatus);
  const parsedSummary = transitionSummarySchema.safeParse(summary);
  if (!id.success || !next.success || !parsedSummary.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const repository = new WorkflowRepository(supabase);
  const task = await repository.getWorkflowTaskById(workspace.id, id.data);
  if (!task) throw new AppError("not_found");
  const workflow = await repository.getWorkflowById(workspace.id, task.workflow_id);
  if (!workflow) throw new AppError("not_found");
  assertTaskTransition(task.status, next.data, workflow.status);
  return repository.updateTaskStatus(id.data, next.data, parsedSummary.data);
}
