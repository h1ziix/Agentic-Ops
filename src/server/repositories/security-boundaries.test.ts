import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ServerSupabase, WorkspaceContext } from "../auth/context";
import { ApprovalRepository } from "./approval-repository";
import { ExecutionRepository } from "./execution-repository";
import { readWindowRange, displayHistoryWindow } from "./read-window";
import { loadHistoryPage, parseHistoryParams } from "../services/history-service";
import { executionFixture, attemptFixture } from "../execution/testing/execution-fixtures";
import { loadWorkspaceObservability } from "../observability/service";
import { historyEventsPageSchema } from "@/lib/validation/history";
import { followupContext } from "../automation/followup-handler";

type Row = Record<string, unknown>;
interface RecordedRead { table: string; columns: string; filters: [string, unknown][]; maximum?: number; range?: [number, number]; orders: string[] }
function fakeDatabase(tables: Record<string, Row[]>) {
  const reads: RecordedRead[] = [];
  const db = { from(table: string) {
    const read: RecordedRead = { table, columns: "*", filters: [], orders: [] };
    reads.push(read);
    const rows = () => {
      const filtered = (tables[table] ?? []).filter((row) => read.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      const range = read.range ?? [0, Math.min(read.maximum ?? 1000, 1000) - 1];
      return filtered.slice(range[0], range[1] + 1);
    };
    const builder = {
      select(columns: string) { read.columns = columns; return builder; },
      eq(column: string, value: unknown) { read.filters.push([column, value]); return builder; },
      in(column: string, values: unknown[]) { read.filters.push([column, values]); return builder; },
      order(column: string) { read.orders.push(column); return builder; },
      limit(maximum: number) { read.maximum = maximum; return builder; },
      range(start: number, end: number) { read.range = [start, end]; return builder; },
      async maybeSingle() { return { data: rows()[0] ?? null, error: null }; },
      then<T, U>(fulfilled: (value: { data: Row[]; error: null }) => T | PromiseLike<T>, rejected?: (reason: unknown) => U | PromiseLike<U>) {
        return Promise.resolve({ data: rows(), error: null }).then(fulfilled, rejected);
      },
    };
    return builder;
  } };
  return { db: db as unknown as ServerSupabase, reads };
}
const row = (value: object): Row => value as Row;

test("Exact approval sources remain addressable beyond a capped workspace list and reject foreign workspace IDs", async () => {
  const fixture = executionFixture();
  const fillers = Array.from({ length: 1000 }, () => row({ ...fixture.action, id: randomUUID() }));
  const { db, reads } = fakeDatabase({ proposed_actions: [...fillers, row(fixture.action)] });
  const repository = new ApprovalRepository(db);
  assert.equal((await repository.getProposedActionById(fixture.request.workspaceId, fixture.action.id))?.id, fixture.action.id);
  assert.equal(await repository.getProposedActionById(randomUUID(), fixture.action.id), null);
  assert.deepEqual(reads[0].filters, [["workspace_id", fixture.request.workspaceId], ["id", fixture.action.id]]);
});

test("Executor loads only the exact approved snapshot and this action's three attempts beyond display windows", async () => {
  const fixture = executionFixture();
  const successful = { ...attemptFixture(fixture), status: "succeeded" };
  const other = randomUUID();
  const { db, reads } = fakeDatabase({
    proposed_actions: [row(fixture.action)], workflows: [row(fixture.workflow)], integration_connections: [row(fixture.connection)],
    action_approval_snapshots: [...Array.from({ length: 1000 }, () => row({ ...fixture.snapshot, id: randomUUID(), action_id: other })), row(fixture.snapshot)],
    execution_attempts: [...Array.from({ length: 1000 }, () => row({ ...successful, id: randomUUID(), action_id: other })), row(successful)],
  });
  const loaded = await new ExecutionRepository(db).load(fixture.request);
  assert.equal(loaded.snapshot?.id, fixture.snapshot.id);
  assert.deepEqual(loaded.attempts.map((attempt) => attempt.id), [successful.id]);
  const attempts = reads.find((read) => read.table === "execution_attempts")!;
  assert.equal(attempts.maximum, 3);
  assert.equal(attempts.columns.includes("claim_token"), false);
  assert.ok(attempts.filters.some(([key, value]) => key === "action_id" && value === fixture.action.id));
});

test("Exact reconciliation reads reject cross-workspace/workflow snapshots and attempts", async () => {
  const fixture = executionFixture(); const attempt = attemptFixture(fixture);
  const { db } = fakeDatabase({ action_approval_snapshots: [row(fixture.snapshot)], execution_attempts: [row(attempt)] });
  const repository = new ExecutionRepository(db);
  assert.equal(await repository.getSnapshot(randomUUID(), fixture.workflow.id, fixture.snapshot.id), null);
  assert.equal(await repository.getSnapshot(fixture.request.workspaceId, randomUUID(), fixture.snapshot.id), null);
  assert.equal(await repository.getSnapshot(fixture.request.workspaceId, fixture.workflow.id, fixture.snapshot.id, randomUUID()), null);
  assert.equal(await repository.getAttempt(randomUUID(), fixture.workflow.id, attempt.id), null);
  assert.equal(await repository.getAttempt(fixture.request.workspaceId, randomUUID(), attempt.id), null);
});

function followupFixture() {
  const fixture = executionFixture();
  const parent = { ...attemptFixture(fixture), status: "succeeded", result: { messageId: "saved-message", threadId: "saved-thread" } };
  const plan = { id: randomUUID(), workspace_id: fixture.request.workspaceId, workflow_id: fixture.workflow.id,
    action_id: randomUUID(), snapshot_id: randomUUID(), parent_attempt_id: parent.id, due_at: new Date().toISOString(), timezone: "UTC", note: null,
    status: "planned", created_at: new Date().toISOString(), cancelled_at: null, automation_status: "scheduled", lead_id: fixture.envelope.leadId,
    company_id: fixture.envelope.companyId, draft_action_id: null, last_reply_at: null, last_checked_at: null, completed_at: null, updated_at: new Date().toISOString() };
  return { fixture, parent, plan };
}

test("Follow-up preparation and monitoring retain exact old parent evidence beyond execution display windows", async () => {
  const { fixture, parent, plan } = followupFixture();
  const unrelated = randomUUID();
  const { db, reads } = fakeDatabase({ follow_up_plans: [row(plan)], integration_connections: [row(fixture.connection)],
    execution_attempts: [...Array.from({ length: 250 }, () => row({ ...parent, id: randomUUID(), action_id: unrelated })), row(parent)],
    action_approval_snapshots: [...Array.from({ length: 250 }, () => row({ ...fixture.snapshot, id: randomUUID(), action_id: unrelated })), row(fixture.snapshot)],
  });
  const execution = new ExecutionRepository(db);
  assert.equal((await execution.list(fixture.request.workspaceId, fixture.workflow.id)).executionAttempts.some((attempt) => attempt.id === parent.id), false);
  assert.equal((await execution.list(fixture.request.workspaceId, fixture.workflow.id)).actionSnapshots.some((snapshot) => snapshot.id === fixture.snapshot.id), false);
  reads.length = 0;
  const loaded = await followupContext(db, fixture.request, plan.id);
  assert.equal(loaded.attempt.id, parent.id);
  assert.equal(loaded.email.snapshotId, fixture.snapshot.id);
  for (const table of ["execution_attempts", "action_approval_snapshots"]) {
    const read = reads.find((read) => read.table === table)!;
    assert.equal(read.maximum, undefined);
    assert.ok(read.filters.some(([key, value]) => key === "workspace_id" && value === plan.workspace_id));
    assert.ok(read.filters.some(([key, value]) => key === "workflow_id" && value === plan.workflow_id));
  }
});

test("Follow-up exact parent reads still reject foreign, incomplete and changed authorizations", async () => {
  const { fixture, parent, plan } = followupFixture();
  const scenarios = [
    { parent: { ...parent, workspace_id: randomUUID() }, code: "invalid_transition" },
    { parent: { ...parent, workflow_id: randomUUID() }, code: "invalid_transition" },
    { parent: { ...parent, status: "outcome_unknown" }, code: "invalid_transition" },
    { snapshot: { ...fixture.snapshot, action_id: randomUUID() }, code: "invalid_transition" },
    { snapshot: { ...fixture.snapshot, workflow_id: randomUUID() }, code: "invalid_transition" },
    { connection: { ...fixture.connection, generation: fixture.connection.generation + 1 }, code: "execution_blocked" },
  ];
  for (const scenario of scenarios) {
    const { db } = fakeDatabase({ follow_up_plans: [row(plan)], execution_attempts: [row(scenario.parent ?? parent)],
      action_approval_snapshots: [row(scenario.snapshot ?? fixture.snapshot)], integration_connections: [row(scenario.connection ?? fixture.connection)] });
    await assert.rejects(followupContext(db, fixture.request, plan.id), { code: scenario.code });
  }
});

test("Execution retry selects the latest exact action/snapshot attempt beyond display history and isolates all IDs", async () => {
  const fixture = executionFixture(); const unrelated = randomUUID();
  const older = { ...attemptFixture(fixture), status: "failed_retryable", retry_eligible: true };
  const newest = { ...older, id: randomUUID(), attempt_number: 2, status: "succeeded", retry_eligible: false };
  const { db, reads } = fakeDatabase({ execution_attempts: [
    ...Array.from({ length: 250 }, () => row({ ...newest, id: randomUUID(), action_id: unrelated })), row(newest), row(older),
  ] });
  const repository = new ExecutionRepository(db);
  const loaded = await repository.getLatestAttempt(fixture.request.workspaceId, fixture.workflow.id, fixture.action.id, fixture.snapshot.id);
  assert.equal(loaded?.id, newest.id);
  assert.equal(loaded?.retry_eligible, false);
  assert.equal(reads[0].maximum, 1);
  assert.deepEqual(reads[0].orders, ["attempt_number"]);
  assert.equal(reads[0].columns.includes("claim_token"), false);
  for (const ids of [
    [randomUUID(), fixture.workflow.id, fixture.action.id, fixture.snapshot.id],
    [fixture.request.workspaceId, randomUUID(), fixture.action.id, fixture.snapshot.id],
    [fixture.request.workspaceId, fixture.workflow.id, randomUUID(), fixture.snapshot.id],
    [fixture.request.workspaceId, fixture.workflow.id, fixture.action.id, randomUUID()],
  ]) assert.equal(await repository.getLatestAttempt(ids[0], ids[1], ids[2], ids[3]), null);
});

test("Display history bounds are explicit and stable; invalid page windows fail closed", () => {
  assert.deepEqual(readWindowRange({ offset: 100, limit: 101 }), [100, 200]);
  assert.deepEqual(displayHistoryWindow({ offset: 0, limit: 1000 }), { offset: 0, limit: 999 });
  for (const window of [{ offset: -1, limit: 100 }, { offset: 0, limit: 0 }, { offset: 0, limit: 1001 }, { offset: 0.5, limit: 100 }, { offset: Infinity, limit: 100 }]) {
    assert.throws(() => readWindowRange(window));
  }
});

test("History query permits only bounded pages, supported kinds and exact workflow IDs", () => {
  assert.deepEqual(parseHistoryParams(new URLSearchParams("kind=events")), { kind: "events", page: 1 });
  for (const params of ["kind=events&page=0", "kind=events&page=-1", "kind=events&page=10001", "kind=events&page=1.5", "kind=events&page=1&page=2",
    "kind=events&workspaceId=forged", "kind=secrets", "kind=runs&workflowId=invalid"]) assert.throws(() => parseHistoryParams(new URLSearchParams(params)));
});

test("History pages isolate workspace records, retain one page and return safe event DTOs", async () => {
  const fixture = executionFixture();
  const makeEvent = (index: number, workspace = fixture.request.workspaceId) => ({ id: randomUUID(), workspace_id: workspace, workflow_id: fixture.workflow.id,
    agent_run_id: null, workflow_task_id: null, event_type: "workflow_created", summary: `Event ${index}`, metadata: { unsafe_raw_field: "not-in-dto" }, created_at: new Date().toISOString() });
  const events = [...Array.from({ length: 202 }, (_, index) => makeEvent(index)), makeEvent(203, randomUUID())];
  const { db, reads } = fakeDatabase({ agent_events: events });
  const context = { supabase: db, workspace: { id: fixture.request.workspaceId, name: "Test Workspace" } } as WorkspaceContext;
  const page = await loadHistoryPage(context, parseHistoryParams(new URLSearchParams("kind=events&page=2")));
  assert.equal(historyEventsPageSchema.safeParse(page).success, true);
  assert.equal(page.items.length, 100); assert.equal(page.hasMore, true);
  assert.equal("description" in page.items[0] && page.items[0].description, "Event 100");
  assert.equal(JSON.stringify(page.items).includes("not-in-dto"), false);
  assert.deepEqual(reads[0].range, [100, 200]); assert.deepEqual(reads[0].orders, ["created_at", "id"]);
  const last = await loadHistoryPage(context, { kind: "events", page: 3 });
  assert.equal(last.items.length, 2); assert.equal(last.hasMore, false);
  await assert.rejects(loadHistoryPage(context, { kind: "events", page: 1, workflowId: randomUUID() }), { code: "not_found" });
});

test("Observability marks the configured 1000-event window as truncated instead of claiming complete history", async () => {
  const workspaceId = randomUUID();
  const events = Array.from({ length: 1000 }, () => ({ id: randomUUID(), workspace_id: workspaceId, workflow_id: randomUUID(), agent_run_id: null,
    workflow_task_id: null, event_type: "tool_completed", summary: "Search completed", metadata: { tool_name: "search_web" }, created_at: new Date().toISOString() }));
  const { db, reads } = fakeDatabase({ agent_events: events, agent_run_observations_07: [] });
  const view = await loadWorkspaceObservability(db, workspaceId);
  assert.equal(view.truncated, true);
  assert.equal(reads.find((read) => read.table === "agent_events")?.maximum, 1000);
});
