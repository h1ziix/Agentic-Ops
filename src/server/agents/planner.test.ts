import assert from "node:assert/strict";
import test from "node:test";
import { mapPlannerTasks, plannerOutputSchema, validatedPlannerOutputSchema } from "@/lib/validation/planner";
import { AgentRuntime } from "./agent-runtime";
import { PlannerAgent } from "./planner-agent";
import { PlannerError } from "./errors";
import { examplePlan, examplePlannerInput } from "./testing/planner-fixtures";
import type { AgentMetrics } from "@/lib/validation/agent";

test("Planner schema accepts a realistic structured sales plan", () => {
  assert.equal(validatedPlannerOutputSchema.safeParse(examplePlan).success, true);
});

test("Planner schema rejects unknown task types, executable fields, malformed and unbounded plans", () => {
  for (const plan of [null, {}, { ...examplePlan, tasks: [] }, { ...examplePlan, tasks: Array(11).fill(examplePlan.tasks[0]) },
    { ...examplePlan, tasks: [{ ...examplePlan.tasks[0], type: "send_email" }, ...examplePlan.tasks.slice(1)] },
    { ...examplePlan, code: "fetch(secret)" },
    { ...examplePlan, tasks: [{ ...examplePlan.tasks[0], command: "rm -rf /" }, ...examplePlan.tasks.slice(1)] }]) {
    assert.equal(plannerOutputSchema.safeParse(plan).success, false);
  }
});

test("domain validation rejects duplicates, missing dependencies, cycles, missing steps and incomplete approval gates", () => {
  const cases = [
    (plan: typeof examplePlan) => { plan.tasks[1].id = plan.tasks[0].id; },
    (plan: typeof examplePlan) => { plan.tasks[1].title = plan.tasks[0].title; },
    (plan: typeof examplePlan) => { plan.tasks[1].dependencies = ["missing_task"]; },
    (plan: typeof examplePlan) => { plan.tasks[0].dependencies = [plan.tasks.at(-1)!.id]; },
    (plan: typeof examplePlan) => { plan.tasks[1].dependencies = [plan.tasks[0].id, plan.tasks[0].id]; },
    (plan: typeof examplePlan) => { plan.tasks[2].type = "discover_companies"; },
    (plan: typeof examplePlan) => { plan.tasks.at(-1)!.dependencies = []; },
    (plan: typeof examplePlan) => { plan.tasks.at(-1)!.type = "generate_outreach"; },
    (plan: typeof examplePlan) => { plan.tasks[0].objective = "   "; },
  ];
  for (const mutate of cases) {
    const plan = structuredClone(examplePlan);
    mutate(plan);
    assert.equal(validatedPlannerOutputSchema.safeParse(plan).success, false);
  }
});

test("task mapping preserves order, dependencies and expected outputs without claiming execution", () => {
  const tasks = mapPlannerTasks(examplePlan);
  assert.equal(tasks.length, 7);
  assert.equal(tasks[0].position, 1);
  assert.equal(tasks[6].position, 7);
  assert.deepEqual(tasks[6].input.dependencies, ["generate_outreach"]);
  assert.equal(tasks[0].input.expectedOutput, examplePlan.tasks[0].expectedOutput);
  assert.equal("status" in tasks[0], false);
  assert.throws(() => mapPlannerTasks({ ...examplePlan, tasks: [] }));
});

function metrics(): AgentMetrics { return { durationMs: 0, retryCount: 0, taskCount: 0, inputTokens: null, outputTokens: null, totalTokens: null }; }

test("runtime retries invalid output once, records validation and retry events, then returns a validated plan", async () => {
  let calls = 0;
  const events: string[] = [];
  const measured = metrics();
  const agent = new PlannerAgent({ generate: async () => ({ output: ++calls === 1 ? { tasks: [] } : examplePlan, usage: { inputTokens: 20, outputTokens: 80, totalTokens: 100 } }) });
  const plan = await new AgentRuntime(agent, async () => {}).plan(examplePlannerInput, "test-model", async (type) => { events.push(type); }, measured);
  assert.deepEqual(plan, examplePlan);
  assert.equal(calls, 2);
  assert.deepEqual(events, ["model_request_started", "plan_validation_failed", "retry", "model_request_started"]);
  assert.equal(measured.retryCount, 1);
  assert.equal(measured.taskCount, 7);
  assert.equal(measured.totalTokens, 200);
});

test("runtime bounds failed validation and transient errors, and never retries configuration or audit failures", async () => {
  for (const error of [new PlannerError("ai_invalid_output", true), new PlannerError("ai_timeout", true), new PlannerError("ai_configuration", false)]) {
    let calls = 0;
    const agent = new PlannerAgent({ generate: async () => { calls++; throw error; } });
    await assert.rejects(() => new AgentRuntime(agent, async () => {}).plan(examplePlannerInput, "test-model", async () => {}, metrics()), PlannerError);
    assert.equal(calls, error.retryable ? 2 : 1);
  }
  let providerCalls = 0;
  const agent = new PlannerAgent({ generate: async () => { providerCalls++; return { output: examplePlan, usage: null }; } });
  await assert.rejects(() => new AgentRuntime(agent).plan(examplePlannerInput, "test-model", async () => { throw new Error("Database offline"); }, metrics()));
  assert.equal(providerCalls, 0);
});
