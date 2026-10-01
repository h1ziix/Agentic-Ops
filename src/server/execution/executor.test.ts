import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Executor, type ExecutionStore, type CompletionInput } from "./executor";
import { executionFixture, attemptFixture } from "./testing/execution-fixtures";
import type { ExecutionAttempt } from "@/lib/validation/execution";
import { GmailAdapter } from "../integrations/gmail";
import { AppError } from "../errors";
import { envelopeDigest } from "./digest";

function harness(options: { auditFailure?: boolean; timeout?: boolean; persistenceFailures?: number; cancelledDuringSend?: boolean; rejection?: number } = {}) {
  const f = executionFixture(); const attempts: ExecutionAttempt[] = []; let calls = 0; let finishCalls = 0; let writeFailures = options.persistenceFailures ?? 0;
  const claims = new Map<string,string>();
  const store: ExecutionStore = {
    recover: async () => {}, load: async () => ({ ...f, attempts }),
    claim: async (_request, id, token) => {
      const active = attempts.find((a) => ["claimed", "dispatching", "succeeded"].includes(a.status)); if (active) return { ...active };
      const attempt = attemptFixture(f,id); attempts.push(attempt); claims.set(id,token); return { ...attempt };
    },
    dispatch: async (_request, id, token) => {
      if (options.auditFailure) throw new AppError("database");
      assert.equal(claims.get(id),token); const a = attempts.find((a) => a.id === id)!; a.status = "dispatching"; a.dispatched_at = new Date().toISOString(); return { ...a };
    },
    finish: async (_request, input: CompletionInput) => {
      finishCalls++; if (input.status === "succeeded" && writeFailures-- > 0) throw new AppError("database");
      assert.equal(claims.get(input.attemptId),input.claimToken); const a = attempts.find((a) => a.id === input.attemptId)!;
      a.status = input.status; a.result = input.result ?? null; a.safe_error_code = input.error ?? null; a.verification_method = input.status === "succeeded" ? input.verification ?? "provider_response" : "unresolved";
      if (a.status === "succeeded") f.action.status = "executed"; return { ...a };
    },
  };
  const gmail = new GmailAdapter(async () => {
    calls++; if (options.cancelledDuringSend) f.workflow.status = "cancelled";
    if (options.timeout) throw new Error("socket reset contains private provider data");
    return Response.json(options.rejection ? { error: "private provider response" } : { id: "gmail-accepted-id", threadId: "thread-1" }, { status: options.rejection ?? 200 });
  });
  const executor = new Executor(store,{ accessToken: async () => "mock-token" },gmail);
  return { ...f, executor, attempts, store, calls: () => calls, finishCalls: () => finishCalls };
}
test("Repeated Execute/reopen loads saved success and calls Gmail once", async () => {
  const h = harness(); const first = await h.executor.execute(h.request); const replay = await h.executor.execute(h.request);
  assert.equal(first.id,replay.id); assert.equal(h.calls(),1); assert.equal(replay.result?.messageId,"gmail-accepted-id");
});
test("Concurrent Execute has a single persistent claim and a single provider request", async () => {
  const h = harness(); const results = await Promise.all([h.executor.execute(h.request),h.executor.execute(h.request)]);
  assert.equal(h.calls(),1); assert.equal(h.attempts.length,1); assert.equal(results[0].id,results[1].id);
});
test("Dispatch/audit transaction failure prevents any provider mutation", async () => {
  const h = harness({ auditFailure: true }); const result = await h.executor.execute(h.request);
  assert.equal(h.calls(),0); assert.equal(result.status,"cancelled_before_dispatch"); assert.equal(result.dispatched_at,null);
});
test("Timeout after dispatch becomes unknown and explicit retry never resends", async () => {
  const h = harness({ timeout: true }); const result = await h.executor.execute(h.request);
  assert.equal(result.status,"outcome_unknown"); assert.equal(result.safe_error_code,"transport_uncertain");
  await assert.rejects(h.executor.execute({ ...h.request, retry: true }),/Outcome unknown/); assert.equal(h.calls(),1);
  assert.equal(JSON.stringify(result).includes("private"),false);
});
test("Ambiguous 5xx becomes unknown rather than a safe email retry", async () => {
  const h = harness({ rejection: 503 }); assert.equal((await h.executor.execute(h.request)).status,"outcome_unknown");
  await assert.rejects(h.executor.execute(h.request)); assert.equal(h.calls(),1);
});
test("Successful provider result persistence is retried with the same response without another send", async () => {
  const h = harness({ persistenceFailures: 2 }); assert.equal((await h.executor.execute(h.request)).status,"succeeded");
  assert.equal(h.finishCalls(),3); assert.equal(h.calls(),1); await h.executor.execute(h.request); assert.equal(h.calls(),1);
});
test("Persistent DB save failure records uncertainty and blocks resend", async () => {
  const h = harness({ persistenceFailures: 3 }); assert.equal((await h.executor.execute(h.request)).status,"outcome_unknown");
  assert.equal(h.finishCalls(),4); await assert.rejects(h.executor.execute(h.request)); assert.equal(h.calls(),1);
});
test("A confirmed external success after cancellation is retained; future dispatch is stopped", async () => {
  const h = harness({ cancelledDuringSend: true }); const result = await h.executor.execute(h.request);
  assert.equal(result.status,"succeeded"); assert.equal(h.workflow.status,"cancelled");
  h.action = { ...h.action, id: randomUUID() }; // A fresh operation must have its own approval.
  const cancelled = executionFixture(); cancelled.workflow.status = "cancelled";
  const blockers = new Executor({ ...h.store, load: async () => ({ ...cancelled, attempts: [] }) },{ accessToken: async () => "mock" },new GmailAdapter(async () => { throw new Error("must not dispatch"); }));
  await assert.rejects(blockers.execute(cancelled.request),/Workflow does not permit execution/); assert.equal(h.calls(),1);
});
test("Legacy approval is rejected before claims or credentials", async () => {
  const h = harness(); h.action.schema_version = 1; h.action.executable_envelope = null;
  await assert.rejects(h.executor.execute(h.request),/Legacy/); assert.equal(h.attempts.length,0); assert.equal(h.calls(),0);
});
test("Token/permission failure before dispatch leaves a recoverable unsent attempt", async () => {
  const h = harness(); const executor = new Executor(h.store,{ accessToken: async () => { throw new AppError("integration_configuration"); } });
  const result = await executor.execute(h.request); assert.equal(result.status,"cancelled_before_dispatch"); assert.equal(h.calls(),0);
});
test("Internal follow-up executor persists an approved plan without credentials or any provider call", async () => {
  const h = harness(); const envelope = { schemaVersion: 2 as const, actionType: "schedule_follow_up" as const, workspaceId: h.action.workspace_id, workflowId: h.workflow.id,
    actionId: h.action.id, snapshotId: h.snapshot.id, lineageId: h.envelope.lineageId, revision: h.envelope.revision, parentAttemptId: randomUUID(), parentActionId: randomUUID(),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(), timezone: "Asia/Qyzylorda", note: "Plan only; no scheduled email permission." };
  h.action.action_type = "schedule_follow_up"; h.action.is_auxiliary = true; h.action.executable_envelope = envelope;
  h.snapshot.action_type = "schedule_follow_up"; h.snapshot.envelope = envelope; h.snapshot.digest = envelopeDigest(envelope); h.snapshot.connection_id = null; h.snapshot.authorization_generation = null;
  const executor = new Executor(h.store, { accessToken: async () => { throw new Error("Internal plan must not load tokens"); } }, new GmailAdapter(async () => { throw new Error("No transport"); }));
  const result = await executor.execute(h.request); assert.equal(result.status, "succeeded"); assert.equal(result.verification_method, "internal_transaction");
  assert.deepEqual(result.result, {}); assert.equal(h.calls(), 0); assert.equal((await executor.execute(h.request)).id, result.id);
});
