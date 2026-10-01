import { randomUUID } from "node:crypto";
import { z } from "zod";
import { plannerTaskContextSchema } from "@/lib/validation/planner";
import { researchOutputSchema } from "@/lib/validation/research";
import { reviewInputFromResearch, reviewerOutputSchema, validateReviewerOutput, outreachOutputSchema,
  proposedEmailActionSchema, outreachDedupeKey, reviewerInputSchema, type ProposedEmailAction, type ReviewerInput } from "@/lib/validation/outreach";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { LeadRow, WorkflowTaskRow } from "@/types/persistence";
import type { PlanWorkflowInput, PlanningReader } from "./orchestrator";
import type { AgentRuntime } from "./agent-runtime";
import type { AgentRunService } from "../services/agent-run-service";
import type { EventService } from "../services/event-service";
import { AppError } from "../errors";
import { getOutreachModel, getReviewerModel } from "./config";

export const supportsPreparationTask = (type: string) => ["review_qualified_leads", "generate_outreach", "request_approval"].includes(type);
export function nextPreparationTask(tasks: WorkflowTaskRow[]) {
  const keys = new Map(tasks.map((task) => [plannerTaskContextSchema.parse(task.input).planTaskId, task]));
  if (keys.size !== tasks.length) throw new AppError("validation");
  for (const task of tasks) {
    for (const key of plannerTaskContextSchema.parse(task.input).dependencies) {
      const predecessor = keys.get(key);
      if (!predecessor || predecessor.position >= task.position) throw new AppError("validation");
    }
  }
  return [...tasks].sort((a, b) => a.position - b.position).find((task) => supportsPreparationTask(task.type)
    && ["pending", "running"].includes(task.status)
    && plannerTaskContextSchema.parse(task.input).dependencies.every((key) => keys.get(key)?.status === "completed"));
}
export interface PreparationStore {
  listLeads(workspaceId: string, workflowId: string): Promise<LeadRow[]>;
  finishTask(request: PlanWorkflowInput, taskId: string): Promise<void>;
  publish(request: PlanWorkflowInput, taskId: string, actions: ProposedEmailAction[]): Promise<void>;
}
export type PreparationStepResult = { status: "more" | "in_progress" | "waiting_for_approval" | "preparation_complete"; runId?: string };

export async function executePreparationStep(request: PlanWorkflowInput, reader: PlanningReader, runs: AgentRunService,
  events: EventService, runtime: AgentRuntime, store: PreparationStore): Promise<PreparationStepResult> {
  const { workflowId, workspaceId, userId } = request;
  const workflow = await reader.getWorkflowById(workspaceId, workflowId);
  if (!workflow) throw new AppError("not_found");
  if (workflow.status === "waiting_for_approval") return { status: "waiting_for_approval" };
  if (["ready_for_execution", "needs_revision", "completed"].includes(workflow.status)) return { status: "preparation_complete" };
  if (workflow.status !== "running") throw new AppError("invalid_transition", "Resume the workflow before preparing outreach.");
  const tasks = await reader.listWorkflowTasks(workspaceId, workflowId);
  const task = nextPreparationTask(tasks);
  if (!task) {
    if (tasks.some((entry) => supportsPreparationTask(entry.type) && !["completed", "cancelled"].includes(entry.status)))
      throw new AppError("invalid_transition", "Preparation is blocked by an incomplete dependency.");
    return { status: "preparation_complete" };
  }
  const [leads, history] = await Promise.all([store.listLeads(workspaceId, workflowId), reader.listWorkspaceRuns(workspaceId, workflowId)]);
  if (task.type === "request_approval") {
    const drafts = history.filter((run) => run.agent_type === "outreach" && run.status === "completed"
      && typeof run.output === "object" && run.output !== null && "draft" in run.output);
    const actions = drafts.map((run) => {
      const output = z.object({ leadId: z.uuid(), reviewInput: z.unknown(), review: reviewerOutputSchema,
        reviewerRunId: z.uuid(), draft: outreachOutputSchema }).parse(run.output);
      const reviewInput = reviewInputFromHistory(output.reviewInput);
      const draft = output.draft;
      return proposedEmailActionSchema.parse({ action_type: "send_email", risk_level: "medium",
        dedupe_key: outreachDedupeKey(workflowId, output.leadId, run.workflow_task_id!),
        target: { companyId: reviewInput.companyId, leadId: output.leadId, recipientName: draft.recipient.name, recipientEmail: draft.recipient.email },
        payload: { subject: draft.subject, body: draft.body, personalization: draft.personalization,
          evidenceReferences: draft.personalization.claimsUsed, warnings: draft.warnings, executionReadiness: draft.executionReadiness,
          generationMetadata: { researchRunId: reviewInput.researchRunId, reviewerRunId: output.reviewerRunId, outreachRunId: run.id,
            taskId: run.workflow_task_id, version: 1, model: run.model, review: output.review, company: reviewInput.company,
            leadScore: reviewInput.score, scoreBreakdown: reviewInput.scoreBreakdown, researchUncertainties: reviewInput.uncertainties,
            generationSummary: draft.generationSummary } } });
    });
    await store.publish(request, task.id, actions);
    return { status: actions.length ? "waiting_for_approval" : "preparation_complete" };
  }
  const agentType = task.type === "review_qualified_leads" ? "reviewer" : "outreach";
  const completedIds = new Set(history.filter((run) => run.workflow_task_id === task.id
    && ["completed", "failed"].includes(run.status) && typeof run.input === "object" && run.input !== null && "leadId" in run.input)
    .map((run) => (run.input as { leadId: unknown }).leadId));
  const lead = leads.find((entry) => !completedIds.has(entry.id) && (agentType === "reviewer" ? entry.score !== null && entry.score >= 60
    && ["not_started", "reviewing"].includes(entry.outreach_status) : entry.review_metadata?.decision === "approve_for_outreach"
    && ["not_started", "drafting"].includes(entry.outreach_status)));
  if (!lead) { await store.finishTask(request, task.id); return { status: "more" }; }
  const model = agentType === "reviewer" ? getReviewerModel() : getOutreachModel();
  const runId = randomUUID();
  const run = await runs.start({ runId, userId, workspaceId, workflowId, workflowTaskId: task.id, agentType, model,
    input: { leadId: lead.id, companyId: lead.company_id, version: 1 } });
  if (run.id !== runId) return { status: run.status === "running" ? "in_progress" : "more", runId: run.id };
  const started = Date.now();
  const metrics: AgentMetrics = { durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null, outputTokens: null, totalTokens: null };
  const record = (eventType: Parameters<EventService["record"]>[0]["eventType"], summary: string, metadata: Record<string, string | number>) =>
    events.record({ workspaceId, workflowId, workflowTaskId: task.id, agentRunId: run.id, eventType, summary,
      metadata: { ...metadata, lead_id: lead.id, company_id: lead.company_id } }).then(() => {});
  try {
    const researchRun = history.find((entry) => entry.agent_type === "researcher" && entry.status === "completed"
      && typeof entry.output === "object" && entry.output !== null && "companyId" in entry.output
      && entry.output.companyId === lead.company_id && "result" in entry.output);
    if (!researchRun) throw new AppError("validation", "This lead has no workflow-specific research evidence.");
    const research = researchOutputSchema.parse((researchRun.output as { result: unknown }).result);
    const reviewInput = reviewInputFromResearch({ workflowId, leadId: lead.id, companyId: lead.company_id,
      researchRunId: researchRun.id, goal: workflow.goal }, research);
    let output: z.infer<ReturnType<typeof z.json>>;
    if (agentType === "reviewer") {
      output = { leadId: lead.id, reviewInput, review: await runtime.review(reviewInput, model, record, metrics) };
    } else {
      const reviewerRun = history.find((entry) => entry.agent_type === "reviewer" && entry.status === "completed"
        && typeof entry.output === "object" && entry.output !== null && "leadId" in entry.output && entry.output.leadId === lead.id);
      if (!reviewerRun || !lead.review_metadata) throw new AppError("validation", "An accepted review is required.");
      const review = validateReviewerOutput(lead.review_metadata, reviewInput);
      // Stage 4 does not establish verified contacts; null remains null.
      const recipient = { name: null, email: null, role: null, companyName: reviewInput.company.name };
      output = { leadId: lead.id, reviewInput, review, reviewerRunId: reviewerRun.id,
        draft: await runtime.draft(reviewInput, review, recipient, model, record, metrics) };
    }
    metrics.durationMs = Date.now() - started;
    const saved = await runs.complete({ runId, status: "completed", output, metrics });
    if (saved.status !== "completed") throw new AppError("invalid_transition", "Preparation was interrupted; refresh to view the saved state.");
    return { status: "more", runId };
  } catch (error) {
    metrics.durationMs = Date.now() - started;
    const message = error instanceof AppError ? error.message : "Preparation failed evidence validation. Other successful drafts are retained.";
    await runs.complete({ runId, status: "failed", error: { code: error instanceof AppError ? error.code : "ai_invalid_output", message }, metrics });
    if (error instanceof AppError && ["ai_configuration", "ai_quota_exhausted", "database", "invalid_transition"].includes(error.code)) throw error;
    return { status: "more", runId };
  }
}

function reviewInputFromHistory(input: unknown): ReviewerInput { return reviewerInputSchema.parse(input); }
