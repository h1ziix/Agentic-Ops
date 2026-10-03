import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationClaim, AutomationCompletion, AutomationJob, AutomationContext } from "@/types/automation";
import { dispatchPayloadSchema, signJobBody, verifyJobBody } from "./job-auth";
import { jobFailure, isStaleRun } from "./retry-policy";
import { runClaimedJob } from "./job-runner";
import { AppError } from "../errors";
import { IntegrationError } from "../integrations/http";

function fixture() {
  const now = new Date().toISOString();
  let saved: AutomationClaim = { id: randomUUID(), workspace_id: randomUUID(), workflow_id: randomUUID(), actor_id: randomUUID(),
    workflow_task_id: null, lead_id: null, proposed_action_id: null, follow_up_plan_id: null, job_type: "workflow_continue", status: "scheduled",
    provider: "trigger", provider_job_id: null, scheduled_for: now, started_at: null, completed_at: null, cancelled_at: null,
    attempt_count: 0, max_attempts: 3, idempotency_key: "test", input: {}, result: null, error_category: null, error_code: null,
    error_summary: null, retryable: false, next_retry_at: null, created_at: now, updated_at: now, claim_token: null, lease_until: null };
  const store = {
    async get() { return structuredClone(saved); },
    async claim(context: AutomationContext, _id: string, token: string) {
      assert.equal(context.workspaceId, saved.workspace_id); assert.equal(context.userId, saved.actor_id);
      if (saved.status !== "scheduled" && saved.status !== "retry_scheduled") return structuredClone(saved);
      saved = { ...saved, status: "running", claim_token: token, attempt_count: saved.attempt_count + 1 }; return structuredClone(saved);
    },
    async finish(_context: AutomationContext, _id: string, token: string, completion: AutomationCompletion): Promise<AutomationJob> {
      assert.equal(saved.claim_token, token); assert.equal(saved.status, "running");
      saved = { ...saved, status: completion.status === "failed" && completion.retryable && saved.attempt_count < saved.max_attempts ? "retry_scheduled" : completion.status,
        result: completion.result ?? null, error_category: completion.errorCategory ?? null, retryable: completion.retryable ?? false };
      return structuredClone(saved);
    },
  };
  return { store, change: (patch: Partial<AutomationClaim>) => { saved = { ...saved, ...patch }; }, read: () => saved };
}
test("signed callbacks bind exact bytes and expire without exposing keys", () => {
  const secret = "s".repeat(32); const body = JSON.stringify({ operation: "dispatch", jobId: randomUUID(), providerRunId: "run_1" }); const now = 1_800_000_000_000;
  const signature = signJobBody(body, String(now), secret);
  assert.equal(verifyJobBody(body, String(now), signature, secret, now), true);
  assert.equal(verifyJobBody(body + " ", String(now), signature, secret, now), false);
  assert.equal(verifyJobBody(body, String(now), signature, secret, now + 60_001), false);
  assert.equal(verifyJobBody(body, String(now), signature, undefined, now), false);
  assert.equal(verifyJobBody(body, String(now), "0", secret, now), false);
});
test("callback schemas cannot accept actor/workspace, content or arbitrary code", () => {
  assert.throws(() => dispatchPayloadSchema.parse({ operation: "dispatch", jobId: randomUUID(), providerRunId: "run_1", workspaceId: randomUUID() }));
  assert.throws(() => dispatchPayloadSchema.parse({ operation: "send", recipient: "test@example.com" }));
});
test("duplicate and concurrent delivery executes one claimed internal operation", async () => {
  const f = fixture(); let calls = 0;
  const execute = async () => { calls++; return { tasks: 1 }; };
  await Promise.all([runClaimedJob(f.read().id, f.store, async () => {}, execute), runClaimedJob(f.read().id, f.store, async () => {}, execute)]);
  await runClaimedJob(f.read().id, f.store, async () => {}, execute);
  assert.equal(calls, 1); assert.equal(f.read().attempt_count, 1); assert.equal(f.read().status, "completed");
});
test("cancelled future jobs cannot execute on replay", async () => {
  const f = fixture(); f.change({ status: "cancelled" }); let called = false;
  await runClaimedJob(f.read().id, f.store, async () => {}, async () => { called = true; return {}; }); assert.equal(called, false);
});
test("worker verifies stored workspace membership before claiming work", async () => {
  const f = fixture(); let called = false;
  await assert.rejects(runClaimedJob(f.read().id, f.store, async () => { throw new AppError("unauthorized"); }, async () => { called = true; return {}; }));
  assert.equal(called, false); assert.equal(f.read().attempt_count, 0);
});
test("transient retries are bounded and exhausted operations need attention", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) await runClaimedJob(f.read().id, f.store, async () => {}, async () => { throw new AppError("ai_timeout"); });
  assert.equal(f.read().attempt_count, 3); assert.equal(f.read().status, "failed");
  await runClaimedJob(f.read().id, f.store, async () => {}, async () => { throw new Error("Must not execute"); });
  assert.equal(f.read().attempt_count, 3);
});
test("permanent failures do not automatically retry", async () => {
  const f = fixture(); await runClaimedJob(f.read().id, f.store, async () => {}, async () => { throw new AppError("validation"); });
  assert.equal(f.read().status, "failed"); assert.equal(f.read().retryable, false); assert.equal(f.read().error_category, "validation");
});
test("unknown external execution never gets resend permission from scheduler", async () => {
  const f = fixture(); f.change({ job_type: "external_action_retry" });
  await runClaimedJob(f.read().id, f.store, async () => {}, async () => { throw new Error("Bearer secret raw provider body"); });
  assert.equal(f.read().status, "failed"); assert.equal(f.read().error_category, "unknown_execution_state"); assert.equal(f.read().retryable, false);
});
test("known provider rejections can retry while unknown outcomes cannot", () => {
  assert.equal(jobFailure(new IntegrationError("gmail_rate_limited", "retryable"), 1, true).retryable, true);
  assert.equal(jobFailure(new IntegrationError("gmail_acceptance_unknown", "unknown"), 1, true).retryable, false);
  assert.equal(jobFailure(new IntegrationError("invalid_recipient", "terminal"), 1).retryable, false);
  assert.equal(jobFailure(new AppError("ai_configuration"), 1).retryable, false);
  assert.equal(jobFailure(new AppError("ai_quota_exhausted"), 1).retryable, false);
});
test("backoff increases with a sensible ceiling and stale detection requires valid running time", () => {
  assert.equal(jobFailure(new AppError("ai_timeout"), 1).delayMs, 60_000);
  assert.equal(jobFailure(new AppError("ai_timeout"), 2).delayMs, 120_000);
  assert.equal(jobFailure(new AppError("ai_timeout"), 100).delayMs, 3_600_000);
  const now = Date.now(); assert.equal(isStaleRun("running", new Date(now - 240_001).toISOString(), now), true);
  assert.equal(isStaleRun("running", new Date(now).toISOString(), now), false);
  assert.equal(isStaleRun("completed", new Date(now - 240_001).toISOString(), now), false);
  assert.equal(isStaleRun("running", "invalid", now), false); assert.equal(isStaleRun("running", null, now), false);
});
