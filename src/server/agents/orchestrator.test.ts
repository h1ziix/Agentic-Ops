import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mapPlannerTasks } from "@/lib/validation/planner";
import type { AgentEventRow, AgentRunRow, WorkflowRow, WorkflowTaskRow } from "@/types/persistence";
import { AgentRunService, type AgentRunWriter } from "../services/agent-run-service";
import { EventService, type EventWriter } from "../services/event-service";
import { AppError } from "../errors";
import { AgentRuntime } from "./agent-runtime";
import { Orchestrator } from "./orchestrator";
import { PlannerAgent, type PlannerProvider } from "./planner-agent";
import { PlannerError } from "./errors";
import { examplePlan, examplePlannerInput } from "./testing/planner-fixtures";
import { icpSnapshotSchema, icpAgentContext } from "@/lib/validation/strategy";
import type { PlannerInput } from "@/lib/validation/planner";

function fixture(provider: PlannerProvider = { generate: async () => ({ output: examplePlan, usage: null }) }) {
  const request = { workflowId: randomUUID(), workspaceId: randomUUID(), userId: randomUUID() };
  const now = new Date().toISOString();
  const workflow: WorkflowRow = { id: request.workflowId, workspace_id: request.workspaceId, created_by: request.userId,
    title: "Find target SaaS companies", goal: examplePlannerInput.goal, target_companies: 20, status: "planning", progress: 0,
    current_step: "Waiting for Planner Agent", created_at: now, updated_at: now, started_at: null, completed_at: null, failed_at: null };
  const runs: AgentRunRow[] = [];
  const tasks: WorkflowTaskRow[] = [];
  const events: AgentEventRow[] = [];
  let writeFailure = false;
  const runWriter: AgentRunWriter = {
    start: async (input) => {
      const existing = runs.find((run) => ["running", "completed"].includes(run.status));
      if (existing) return existing;
      workflow.status = "planning";
      const run: AgentRunRow = { id: input.runId, workflow_id: workflow.id, workspace_id: request.workspaceId, workflow_task_id: null,
        agent_type: "planner", status: "running", model: input.model ?? null, input: input.input, output: null, error: null,
        started_at: now, completed_at: null, created_at: now };
      runs.unshift(run);
      return run;
    },
    complete: async (input) => {
      const run = runs.find((item) => item.id === input.runId)!;
      if (run.status !== "running") return run;
      if (writeFailure && input.status === "completed") throw new AppError("database");
      if (input.status === "completed") {
        const mapped = mapPlannerTasks(examplePlan);
        for (const task of mapped) tasks.push({ ...task, id: randomUUID(), workflow_id: workflow.id, workspace_id: request.workspaceId,
          status: "pending", output: null, error: null, started_at: null, completed_at: null, created_at: now, updated_at: now });
      }
      Object.assign(run, { status: input.status, output: input.output ?? null, error: input.error ?? null, completed_at: now, retry_count: input.metrics.retryCount });
      workflow.status = input.status === "completed" ? "running" : "failed";
      return run;
    },
  };
  const writer: EventWriter = { record: async (input) => {
    const event: AgentEventRow = { id: randomUUID(), workspace_id: input.workspaceId, workflow_id: input.workflowId, agent_run_id: input.agentRunId ?? null,
      workflow_task_id: null, event_type: input.eventType, summary: input.summary, metadata: input.metadata, created_at: now };
    events.push(event); return event;
  } };
  const orchestrator = new Orchestrator({ getWorkflowById: async () => workflow, listWorkflowTasks: async () => tasks, listWorkspaceRuns: async () => runs },
    new AgentRunService(runWriter), new EventService(writer), new AgentRuntime(new PlannerAgent(provider), async () => {}));
  return { request, workflow, runs, tasks, events, orchestrator, failWrites: () => { writeFailure = true; } };
}

test("orchestrator persists a real plan and advances planning to running with pending tasks", async () => {
  const state = fixture();
  const result = await state.orchestrator.planWorkflow(state.request);
  assert.equal(result.status, "completed");
  assert.equal(state.workflow.status, "running");
  assert.equal(state.runs[0].status, "completed");
  assert.deepEqual(state.runs[0].output, examplePlan);
  assert.equal(state.tasks.length, 7);
  assert.ok(state.tasks.every((task) => task.status === "pending"));
  assert.equal(state.events[0].event_type, "model_request_started");
});

test("Planner receives workflow snapshots and explicit goal without reading mutable source strategy", async () => {
  let received: PlannerInput | undefined;
  const state = fixture({ generate: async (input) => { received = input; return { output: examplePlan, usage: null }; } });
  const snapshot = icpSnapshotSchema.parse({ id: randomUUID(), name: "Kazakhstan Fintech", description: "Saved profile", industries: ["Payments"],
    locations: ["Kazakhstan"], company_size_min: null, company_size_max: null, business_models: ["B2B"], required_signals: [], preferred_signals: ["digital products"],
    excluded_signals: ["gambling"], automation_focus: ["customer support"], minimum_lead_score: 75, default_company_count: 5, updated_at: state.workflow.updated_at });
  state.workflow.icp_id = snapshot.id; state.workflow.icp_snapshot = snapshot;
  state.workflow.template_id = randomUUID(); state.workflow.template_snapshot = { id: state.workflow.template_id, name: "Fintech Research", description: "Template",
    category: "Fintech", default_goal: "Template default must not replace the user goal.", task_strategy: "Prioritize first-party evidence.", default_icp_id: snapshot.id,
    default_company_count: 5, approval_required: true, followup_enabled: true, updated_at: state.workflow.updated_at };
  await state.orchestrator.planWorkflow(state.request);
  assert.equal(received?.goal, examplePlannerInput.goal);
  assert.deepEqual(received?.context.icp, icpAgentContext(snapshot));
  assert.equal(received?.context.template?.taskStrategy, "Prioritize first-party evidence.");
  assert.equal(received?.context.approvalRequired, true);
  assert.equal(received?.context.template?.followupEnabled, true);
  assert.equal("default_goal" in (received?.context.template ?? {}), false);
  assert.equal(state.tasks.length, examplePlan.tasks.length);
});

test("sequential and concurrent retries reuse one Planner run and one set of tasks", async () => {
  let calls = 0;
  let finish: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => { finish = resolve; });
  const state = fixture({ generate: async () => { calls++; await wait; return { output: examplePlan, usage: null }; } });
  const first = state.orchestrator.planWorkflow(state.request);
  await new Promise((resolve) => setImmediate(resolve));
  const second = await state.orchestrator.planWorkflow(state.request);
  assert.equal(second.status, "in_progress");
  finish!();
  await first;
  const third = await state.orchestrator.planWorkflow(state.request);
  assert.equal(third.status, "completed");
  assert.equal(calls, 1);
  assert.equal(state.runs.length, 1);
  assert.equal(state.tasks.length, 7);
});

test("invalid Planner output fails the run and workflow without persisting tasks", async () => {
  const state = fixture({ generate: async () => ({ output: { tasks: [] }, usage: null }) });
  await assert.rejects(() => state.orchestrator.planWorkflow(state.request), PlannerError);
  assert.equal(state.workflow.status, "failed");
  assert.equal(state.runs[0].status, "failed");
  assert.equal(state.runs[0].retry_count, 1);
  assert.equal(state.tasks.length, 0);
  assert.ok(state.events.some((event) => event.event_type === "plan_validation_failed"));
});

test("provider errors are sanitized, and missing keys are not retried", async () => {
  for (const failure of [new Error("provider raw error sk-secret"), new PlannerError("ai_configuration", false), new PlannerError("ai_quota_exhausted", false)]) {
    let calls = 0;
    const state = fixture({ generate: async () => { calls++; throw failure; } });
    await assert.rejects(() => state.orchestrator.planWorkflow(state.request), AppError);
    assert.equal(calls, 1);
    assert.equal(state.workflow.status, "failed");
    assert.ok(!JSON.stringify(state.runs[0].error).includes("sk-secret"));
    assert.equal(state.tasks.length, 0);
  }
});

test("a failed Planner can be retried explicitly without reusing its failed run", async () => {
  let calls = 0;
  const state = fixture({ generate: async () => { if (++calls === 1) throw new PlannerError("ai_configuration", false); return { output: examplePlan, usage: null }; } });
  await assert.rejects(() => state.orchestrator.planWorkflow(state.request));
  assert.equal((await state.orchestrator.planWorkflow(state.request)).status, "completed");
  assert.equal(state.runs.length, 2);
  assert.equal(state.tasks.length, 7);
});

test("database write failure does not leave partial tasks or a successful run", async () => {
  const state = fixture(); state.failWrites();
  await assert.rejects(() => state.orchestrator.planWorkflow(state.request), AppError);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.runs[0].status, "failed");
  assert.equal(state.workflow.status, "failed");
});

test("invalid state, existing legacy tasks and malformed saved plans are rejected before a paid call", async () => {
  const state = fixture({ generate: async () => { assert.fail("Provider must not run"); } });
  state.workflow.status = "completed";
  await assert.rejects(() => state.orchestrator.planWorkflow(state.request), AppError);
  state.workflow.status = "planning";
  state.tasks.push({ id: randomUUID() } as WorkflowTaskRow);
  await assert.rejects(() => state.orchestrator.planWorkflow(state.request), AppError);
  state.tasks.length = 0;
  state.runs.push({ agent_type: "planner", status: "completed", output: {} } as AgentRunRow);
  await assert.rejects(() => state.orchestrator.planWorkflow(state.request), AppError);
});
