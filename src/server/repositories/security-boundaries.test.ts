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
