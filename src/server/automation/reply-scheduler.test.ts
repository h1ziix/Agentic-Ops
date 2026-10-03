import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { AutomationContext, AutomationJob, ScheduleAutomationInput } from "@/types/automation";
import { discoverReplyContexts, eligibleReplyCandidate, scheduleReplyChecks, REPLY_CHECK_BUCKET_MS, REPLY_CHECK_LIMIT, type ReplyCheckCandidate, type ReplyScheduleStore } from "./reply-scheduler";
import { AppError } from "../errors";
import type { ServerSupabase } from "../auth/context";

const now = Date.parse("2026-10-02T07:05:00.000Z");
function fixture(): { context: AutomationContext; candidate: ReplyCheckCandidate } {
  const context = { workspaceId: randomUUID(), userId: randomUUID() };
  const workflow = randomUUID(); const lead = randomUUID(); const connection = randomUUID(); const parent = randomUUID(); const snapshot = randomUUID();
  return { context, candidate: {
    plan: { id: randomUUID(), workspace_id: context.workspaceId, workflow_id: workflow, parent_attempt_id: parent, lead_id: lead,
      status: "planned", automation_status: "waiting_for_approval", last_reply_at: null },
    parent: { id: parent, workspace_id: context.workspaceId, workflow_id: workflow, snapshot_id: snapshot, connection_id: connection,
      status: "succeeded", result: { threadId: "known-thread", messageId: "sent-message" } },
    snapshot: { id: snapshot, workspace_id: context.workspaceId, workflow_id: workflow, approved_by: context.userId,
      envelope: { actionType: "send_email", workspaceId: context.workspaceId, workflowId: workflow, leadId: lead,
        connection: { id: connection, provider: "gmail", identity: "owner@example.com", generation: 2 } } },
    connection: { id: connection, workspace_id: context.workspaceId, provider: "gmail", status: "connected", generation: 2,
      provider_identity: "owner@example.com", scopes: ["https://www.googleapis.com/auth/gmail.metadata"] },
  } };
}
function job(input: ScheduleAutomationInput): AutomationJob {
  return { id: randomUUID(), workspace_id: input.workspaceId, workflow_id: input.workflowId, actor_id: input.userId,
    workflow_task_id: null, lead_id: input.leadId ?? null, proposed_action_id: null, follow_up_plan_id: input.followUpPlanId ?? null,
    job_type: input.jobType, status: "scheduled", provider: "trigger", provider_job_id: null, scheduled_for: input.scheduledFor,
    started_at: null, completed_at: null, cancelled_at: null, attempt_count: 0, max_attempts: input.maxAttempts ?? 3,
    idempotency_key: input.idempotencyKey, input: input.input ?? {}, result: null, error_category: null, error_code: null, error_summary: null,
    retryable: false, next_retry_at: null, created_at: input.scheduledFor, updated_at: input.scheduledFor };
}
function harness(candidates: ReplyCheckCandidate[], owner = true) {
  const saved = new Map<string, AutomationJob>(); const scheduled: ScheduleAutomationInput[] = []; const dispatched: AutomationJob[] = [];
  let reads = 0; const ongoing: string[] = [];
  const store: ReplyScheduleStore = {
    async isOwner() { return owner; },
    async candidates(_context, limit) { reads++; assert.equal(limit, REPLY_CHECK_LIMIT); return candidates; },
    async ongoingPlanIds() { return ongoing; },
    async schedule(input) { scheduled.push(input); const existing = saved.get(input.idempotencyKey); if (existing) return existing;
      const created = job(input); saved.set(input.idempotencyKey, created); return created; },
  };
  return { store, scheduled, dispatched, saved, ongoing, reads: () => reads,
    dispatch: async (entry: AutomationJob) => { dispatched.push(entry); return entry; } };
}

test("reply scheduling requires an existing owner before reading plans", async () => {
  const f = fixture(); const h = harness([f.candidate], false);
  assert.deepEqual(await scheduleReplyChecks(f.context, h.store, h.dispatch, now), { scheduled: 0, skipped: 0, failed: 0 });
  assert.equal(h.reads(), 0); assert.equal(h.scheduled.length, 0); assert.equal(h.dispatched.length, 0);
});
test("existing read permission schedules only a known thread reference with bounded attempts", async () => {
  const f = fixture(); const h = harness([f.candidate]);
  assert.deepEqual(await scheduleReplyChecks(f.context, h.store, h.dispatch, now), { scheduled: 1, skipped: 0, failed: 0 });
  const input = h.scheduled[0];
  assert.equal(input.jobType, "reply_check"); assert.equal(input.maxAttempts, 3); assert.equal(input.userId, f.context.userId);
  assert.deepEqual(input.input, { planId: f.candidate.plan.id });
  assert.equal(input.scheduledFor, "2026-10-02T07:00:00.000Z");
  assert.match(input.idempotencyKey, /^reply-check:/); assert.equal(h.dispatched.length, 1);
  assert.equal(JSON.stringify(input).includes("owner@example.com"), false);
  assert.equal(JSON.stringify(input).includes("known-thread"), false);
});
test("send-only OAuth, changed authorization, unavailable parents, and cross-workspace rows never schedule reads", () => {
  const variants: ((candidate: ReplyCheckCandidate) => void)[] = [
    (c) => { c.connection!.scopes = ["https://www.googleapis.com/auth/gmail.send"]; },
    (c) => { c.connection!.generation++; }, (c) => { c.connection!.provider_identity = "another@example.com"; },
    (c) => { c.connection!.status = "reconnect_required"; }, (c) => { c.connection!.workspace_id = randomUUID(); },
    (c) => { c.parent!.status = "outcome_unknown"; }, (c) => { c.parent!.result = { messageId: "sent-message" }; },
    (c) => { c.parent!.connection_id = randomUUID(); }, (c) => { c.parent!.workflow_id = randomUUID(); },
    (c) => { c.snapshot!.approved_by = randomUUID(); }, (c) => { c.snapshot!.envelope.workspaceId = randomUUID(); },
  ];
  for (const change of variants) { const f = fixture(); change(f.candidate); assert.equal(eligibleReplyCandidate(f.candidate, f.context), false); }
  const readonly = fixture(); readonly.candidate.connection!.scopes = ["https://www.googleapis.com/auth/gmail.readonly"];
  assert.equal(eligibleReplyCandidate(readonly.candidate, readonly.context), true);
});
test("cancelled, replied, completed, and inactive plans cannot create future reply checks", async () => {
  for (const change of [
    (c: ReplyCheckCandidate) => { c.plan.status = "cancelled"; },
    (c: ReplyCheckCandidate) => { c.plan.last_reply_at = new Date(now).toISOString(); },
    (c: ReplyCheckCandidate) => { c.plan.automation_status = "completed"; },
    (c: ReplyCheckCandidate) => { c.plan.automation_status = "inactive"; },
  ]) {
    const f = fixture(); change(f.candidate); const h = harness([f.candidate]);
    assert.equal((await scheduleReplyChecks(f.context, h.store, h.dispatch, now)).scheduled, 0);
    assert.equal(h.scheduled.length, 0); assert.equal(h.dispatched.length, 0);
  }
});
test("an ongoing check is not duplicated and completed checks are reused within the same ten-minute bucket", async () => {
  const f = fixture(); const h = harness([f.candidate]); h.ongoing.push(f.candidate.plan.id);
  assert.equal((await scheduleReplyChecks(f.context, h.store, h.dispatch, now)).scheduled, 0); assert.equal(h.scheduled.length, 0);
  h.ongoing.length = 0;
  await scheduleReplyChecks(f.context, h.store, h.dispatch, now);
  h.saved.values().next().value!.status = "completed";
  const result = await scheduleReplyChecks(f.context, h.store, h.dispatch, now + 60_000);
  assert.equal(result.skipped, 1); assert.equal(h.saved.size, 1); assert.equal(h.dispatched.length, 1);
  await scheduleReplyChecks(f.context, h.store, h.dispatch, now + REPLY_CHECK_BUCKET_MS);
  assert.equal(h.saved.size, 2); assert.equal(h.dispatched.length, 2);
});
test("one authorized maintenance context schedules at most twenty checks", async () => {
  const f = fixture(); const candidates = Array.from({ length: 25 }, () => ({ ...structuredClone(f.candidate), plan: { ...f.candidate.plan, id: randomUUID() } }));
  const h = harness(candidates);
  assert.equal((await scheduleReplyChecks(f.context, h.store, h.dispatch, now)).scheduled, 20);
  assert.equal(h.scheduled.length, 20); assert.equal(h.dispatched.length, 20);
});
test("a plan cancelled during scheduling cannot prevent other eligible checks", async () => {
  const f = fixture(); const other = structuredClone(f.candidate); other.plan.id = randomUUID(); const h = harness([f.candidate, other]);
  const original = h.store.schedule;
  h.store.schedule = async (input) => { if (input.followUpPlanId === f.candidate.plan.id) throw new AppError("validation"); return original(input); };
  assert.deepEqual(await scheduleReplyChecks(f.context, h.store, h.dispatch, now), { scheduled: 1, skipped: 0, failed: 1 });
  assert.equal(h.dispatched[0].follow_up_plan_id, other.plan.id);
});

type QueryResult = { data: Record<string, unknown>[]; error: null };
class ReadQuery implements PromiseLike<QueryResult> {
  constructor(private rows: Record<string, unknown>[]) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.rows = this.rows.filter((row) => row[column] === value); return this; }
  in(column: string, values: unknown[]) { this.rows = this.rows.filter((row) => values.includes(row[column])); return this; }
  is(column: string, value: unknown) { return this.eq(column, value); }
  order() { return this; }
  limit(limit: number) { this.rows = this.rows.slice(0, limit); return this; }
  then<TResult1 = QueryResult, TResult2 = never>(onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}
function discoveryDatabase(fixtures: ReturnType<typeof fixture>[], members: { workspace_id: string; user_id: string; role: string }[]) {
  const rows: Record<string, Record<string, unknown>[]> = {
    follow_up_plans: fixtures.map(({ candidate }) => ({ ...candidate.plan })),
    execution_attempts: fixtures.map(({ candidate }) => ({ ...candidate.parent })),
    action_approval_snapshots: fixtures.map(({ candidate }) => ({ ...candidate.snapshot, action_type: "send_email" })),
    integration_connections: fixtures.map(({ candidate }) => ({ ...candidate.connection })),
    workspace_members: members,
  };
  return { from(table: string) { assert.ok(table in rows, `Unexpected table ${table}`); return new ReadQuery([...rows[table]]); } } as unknown as ServerSupabase;
}
test("discovery retains an owner context after preparation, without ongoing jobs or credential access", async () => {
  const fixtures = [fixture(), fixture(), fixture(), fixture()];
  fixtures[2].candidate.connection!.generation++;
  fixtures[3].candidate.connection!.scopes = ["https://www.googleapis.com/auth/gmail.send"];
  const db = discoveryDatabase(fixtures, fixtures.map(({ context }, index) => ({ workspace_id: context.workspaceId, user_id: context.userId,
    role: index === 1 ? "member" : "owner" })));
  assert.deepEqual(await discoverReplyContexts(db), [fixtures[0].context]);
});
test("discovery bounds inspected plans and authorized owner contexts", async () => {
  const fixtures = Array.from({ length: 45 }, () => fixture());
  const db = discoveryDatabase(fixtures, fixtures.map(({ context }) => ({ workspace_id: context.workspaceId, user_id: context.userId, role: "owner" })));
  assert.equal((await discoverReplyContexts(db)).length, 20);
});
