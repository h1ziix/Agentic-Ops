import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agentRunRowSchema, leadRowSchema, workflowRowSchema, workflowTaskRowSchema } from "@/lib/validation/rows";
import { reviewerOutputSchema, type ProposedEmailAction } from "@/lib/validation/outreach";
import type { AgentRunRow } from "@/types/persistence";
import { AgentRunService, type AgentRunWriter } from "../services/agent-run-service";
import { EventService } from "../services/event-service";
import { AgentRuntime } from "./agent-runtime";
import { Orchestrator } from "./orchestrator";
import { ReviewerAgent, OutreachAgent, type StructuredPreparationProvider } from "./outreach-agents";
import { nextPreparationTask, supportsPreparationTask, type PreparationStore } from "./outreach-orchestrator";
import { outreachFixture } from "./testing/outreach-fixtures";

function fixture(mode: "mixed_reviews" | "partial_draft_failure" = "mixed_reviews") {
  const source = outreachFixture(); const now = new Date().toISOString();
  const request = { workflowId: source.input.workflowId, workspaceId: randomUUID(), userId: randomUUID() };
  const workflow = workflowRowSchema.parse({ id: request.workflowId, workspace_id: request.workspaceId, created_by: request.userId,
    goal: source.input.goal, title: "Stage 5 integration", status: "running", progress: 0, current_step: "Qualification completed", target_companies: 2,
    started_at: now, completed_at: null, failed_at: null, created_at: now, updated_at: now });
  const tasks = ["score_leads", "review_qualified_leads", "generate_outreach", "request_approval", "execute_approved_actions"].map((type, index) =>
    workflowTaskRowSchema.parse({ id: randomUUID(), workspace_id: request.workspaceId, workflow_id: request.workflowId, type,
      title: type, description: type, position: index + 1, status: index === 0 ? "completed" : "pending",
      input: { planTaskId: type, objective: type, expectedOutput: type, dependencies: index ? [["score_leads", "review_qualified_leads", "generate_outreach", "request_approval"][index - 1]] : [] },
      output: null, error: null, started_at: null, completed_at: null, created_at: now, updated_at: now }));
  const leads = [0, 1].map(() => leadRowSchema.parse({ id: randomUUID(), workspace_id: request.workspaceId, workflow_id: request.workflowId,
    company_id: randomUUID(), status: "qualified", outreach_status: "not_started", score: 68, score_reason: "Evidence-backed qualification", opportunity: "Explore intake triage",
    confidence: "medium", score_components: source.input.scoreBreakdown, created_at: now, updated_at: now }));
  const runs: AgentRunRow[] = leads.map((lead) => agentRunRowSchema.parse({ id: randomUUID(), workspace_id: request.workspaceId,
    workflow_id: request.workflowId, workflow_task_id: null, agent_type: "researcher", status: "completed", model: "mock-research",
    input: { companyId: lead.company_id }, output: { kind: "research_companies", companyId: lead.company_id, result: source.research },
    error: null, started_at: now, completed_at: now, created_at: now }));
  const calls: string[] = []; let boundaries = 0; let actions: ProposedEmailAction[] = [];
  const provider: StructuredPreparationProvider = { generateStructured: async (schema, _system, payload) => {
    const data = z.object({ leadId: z.string().optional(), reviewer: reviewerOutputSchema.optional() }).passthrough().parse(payload);
    if (schema === reviewerOutputSchema) {
      calls.push(`review:${data.leadId}`);
      return { output: { ...source.review, decision: mode === "mixed_reviews" && data.leadId === leads[1].id ? "reject_for_outreach" : "approve_for_outreach" }, usage: null };
    }
    calls.push("outreach");
    if (mode === "partial_draft_failure" && calls.filter((call) => call === "outreach").length === 2) return { output: { evidenceIndexes: [9], callToAction: "share_example", generationSummary: "Invalid evidence" }, usage: null };
    return { output: { evidenceIndexes: [0], callToAction: "share_example", generationSummary: "Accepted evidence selected" }, usage: null };
  } };
  const writer: AgentRunWriter = {
    start: async (input) => {
      const run = agentRunRowSchema.parse({ id: input.runId, workspace_id: request.workspaceId, workflow_id: request.workflowId,
        workflow_task_id: input.workflowTaskId, agent_type: input.agentType, status: "running", model: input.model, input: input.input,
        output: null, error: null, started_at: now, completed_at: null, created_at: now });
      runs.unshift(run); tasks.find((task) => task.id === input.workflowTaskId)!.status = "running";
      return run;
    },
    complete: async (input) => {
      const run = runs.find((item) => item.id === input.runId)!;
      const leadId = z.object({ leadId: z.uuid() }).parse(run.input).leadId;
      const lead = leads.find((item) => item.id === leadId)!;
      if (input.status === "completed") {
        const output = z.object({ review: reviewerOutputSchema }).passthrough().parse(input.output);
        if (run.agent_type === "reviewer") { lead.review_metadata = output.review; lead.outreach_status = output.review.decision === "approve_for_outreach" ? "not_started" : "rejected"; }
        else lead.outreach_status = "draft_ready";
      } else lead.outreach_status = "failed";
      Object.assign(run, { status: input.status, output: input.output ?? null, error: input.error ?? null }); return run;
    },
  };
  const store: PreparationStore = { listLeads: async () => leads,
    finishTask: async (_request, taskId) => { tasks.find((task) => task.id === taskId)!.status = "completed"; },
    publish: async (_request, _taskId, proposals) => { actions = proposals; workflow.status = proposals.length ? "waiting_for_approval" : "completed"; },
  };
  const reader = { getWorkflowById: async () => workflow, listWorkflowTasks: async () => tasks, listWorkspaceRuns: async () => runs };
  const runtime = new AgentRuntime(null, async () => {}, undefined, new ReviewerAgent(provider), new OutreachAgent(provider));
  const orchestrator = new Orchestrator(reader, new AgentRunService(writer), new EventService({ record: async (input) => ({ id: randomUUID(), workspace_id: request.workspaceId,
    workflow_id: request.workflowId, agent_run_id: input.agentRunId ?? null, workflow_task_id: input.workflowTaskId ?? null, event_type: input.eventType,
    summary: input.summary, metadata: input.metadata, created_at: now }) }), runtime,
    { listItems: async () => [], listCompanies: async () => [], finishBoundary: async () => { boundaries++; } }, store, new AgentRunService(writer));
  return { orchestrator, request, tasks, leads, runs, workflow, calls, actions: () => actions, boundaries: () => boundaries };
}
test("Stage 4 continuation reaches Reviewer then Outreach then waiting_for_approval without external execution", async () => {
  const state = fixture();
  for (let index = 0; index < 10 && state.workflow.status === "running"; index++) await state.orchestrator.researchWorkflow(state.request);
  assert.equal(state.workflow.status, "waiting_for_approval"); assert.ok(state.boundaries());
  assert.equal(state.calls.filter((call) => call.startsWith("review:")).length, 2);
  assert.equal(state.calls.filter((call) => call === "outreach").length, 1);
  assert.equal(state.leads[1].outreach_status, "rejected"); assert.equal(state.actions().length, 1);
  assert.equal(state.tasks.at(-1)?.status, "pending");
  assert.ok(state.runs.every((run) => run.agent_type !== "executor"));
  assert.equal(state.actions()[0].target.recipientEmail, null);
});
test("Replayed continuation never regenerates an accepted draft or duplicates its proposed action", async () => {
  const state = fixture();
  for (let index = 0; index < 10 && state.workflow.status === "running"; index++) await state.orchestrator.researchWorkflow(state.request);
  const calls = state.calls.length; const key = state.actions()[0].dedupe_key;
  await state.orchestrator.researchWorkflow(state.request); await state.orchestrator.researchWorkflow(state.request);
  assert.equal(state.calls.length, calls); assert.equal(state.actions().length, 1); assert.equal(state.actions()[0].dedupe_key, key);
});
test("A malformed outreach output retains the good draft and never creates a malformed action", async () => {
  const state = fixture("partial_draft_failure");
  for (let index = 0; index < 12 && state.workflow.status === "running"; index++) await state.orchestrator.researchWorkflow(state.request);
  assert.equal(state.workflow.status, "waiting_for_approval"); assert.equal(state.actions().length, 1);
  assert.equal(state.runs.filter((run) => run.agent_type === "outreach" && run.status === "failed").length, 1);
  assert.equal(state.leads.filter((lead) => lead.outreach_status === "failed").length, 1);
});
test("Preparation respects dependencies and never selects Stage 6 or prototype properties", () => {
  const state = fixture(); const review = state.tasks[1];
  assert.equal(nextPreparationTask(state.tasks)?.id, review.id);
  state.tasks[0].status = "pending"; assert.equal(nextPreparationTask(state.tasks), undefined);
  for (const type of ["send_email", "execute_approved_actions", "constructor", "toString"]) assert.equal(supportsPreparationTask(type), false);
  review.input = { planTaskId: "review_qualified_leads", objective: "Review", expectedOutput: "Review", dependencies: ["missing"] };
  assert.throws(() => nextPreparationTask(state.tasks));
});
