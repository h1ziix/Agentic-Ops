import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationClaim, AutomationCompletion, AutomationContext, AutomationJobType } from "@/types/automation";
import { runClaimedJob, type JobRunStore } from "./job-runner";
import { AppError } from "../errors";

function fixture(jobType: AutomationJobType = "workflow_continue") {
  const now = new Date().toISOString();
  let saved: AutomationClaim = {
    id: randomUUID(), workspace_id: randomUUID(), workflow_id: randomUUID(), actor_id: randomUUID(),
    workflow_task_id: null, lead_id: null, proposed_action_id: null, follow_up_plan_id: null,
    job_type: jobType, status: "scheduled", provider: "trigger", provider_job_id: null,
    scheduled_for: now, started_at: null, completed_at: null, cancelled_at: null,
    attempt_count: 0, max_attempts: 3, idempotency_key: "completion-recovery", input: {}, result: null,
    error_category: null, error_code: null, error_summary: null, retryable: false, next_retry_at: null,
    created_at: now, updated_at: now, claim_token: null, lease_until: null,
  };
  const writes: { context: AutomationContext; id: string; token: string; completion: AutomationCompletion }[] = [];
  const persist: JobRunStore["finish"] = async (context, id, token, completion) => {
    assert.equal(context.workspaceId, saved.workspace_id);
    assert.equal(context.userId, saved.actor_id);
    assert.equal(id, saved.id);
    assert.equal(token, saved.claim_token);
    assert.equal(saved.status, "running");
    const retry = completion.status === "failed" && completion.retryable && saved.attempt_count < saved.max_attempts;
    saved = {
      ...saved, status: retry ? "retry_scheduled" : completion.status,
      result: completion.result ?? null, error_category: completion.errorCategory ?? null,
      error_code: completion.errorCode ?? null, error_summary: completion.errorSummary ?? null,
      retryable: completion.retryable ?? false, next_retry_at: completion.retryAt ?? null,
      completed_at: retry ? null : now, claim_token: null, lease_until: null,
    };
    return structuredClone(saved);
  };
  let save = persist;
  const store: JobRunStore = {
    async get(id) { assert.equal(id, saved.id); return structuredClone(saved); },
    async claim(context, id, token) {
      assert.equal(context.workspaceId, saved.workspace_id);
      assert.equal(context.userId, saved.actor_id);
      assert.equal(id, saved.id);
      if (saved.status !== "scheduled" && saved.status !== "retry_scheduled") return structuredClone(saved);
      saved = { ...saved, status: "running", claim_token: token, attempt_count: saved.attempt_count + 1, started_at: now };
      return structuredClone(saved);
    },
    async finish(context, id, token, completion) {
      writes.push({ context, id, token, completion });
      return save(context, id, token, completion);
    },
  };
  return {
    store, writes, persist, read: () => structuredClone(saved),
    setFinish: (finish: JobRunStore["finish"]) => { save = finish; },
    change: (patch: Partial<AutomationClaim>) => { saved = { ...saved, ...patch }; },
  };
}

test("completion write retries preserve one successful execution and its result", async () => {
  const f = fixture();
  const result = { tasks: 2, outputId: randomUUID() };
  let executionCount = 0;
  let saveCount = 0;
  f.setFinish(async (...args) => {
    if (++saveCount < 3) throw new AppError("database");
    return f.persist(...args);
  });

  const completed = await runClaimedJob(f.read().id, f.store, async () => {}, async () => { executionCount++; return result; });

  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.result, result);
  assert.equal(executionCount, 1);
  assert.equal(f.read().attempt_count, 1);
  assert.equal(f.writes.length, 3);
  for (const write of f.writes) {
    assert.equal(write.completion.status, "completed");
    assert.equal(write.completion.result, result);
    assert.equal(write.token, f.writes[0].token);
  }
});

test("completion retries survive failed writes and failed readbacks without rerunning the operation", async () => {
  const f = fixture();
  const result = { approvalRequired: true, actionId: randomUUID() };
  let executionCount = 0;
  let saveCount = 0;
  let readCount = 0;
  const get = f.store.get;
  f.store.get = async (id) => {
    if (++readCount > 1) throw new AppError("database");
    return get(id);
  };
  f.setFinish(async (...args) => {
    if (++saveCount < 3) throw new AppError("database");
    return f.persist(...args);
  });

  const completed = await runClaimedJob(f.read().id, f.store, async () => {}, async () => { executionCount++; return result; });

  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.result, result);
  assert.equal(executionCount, 1);
  assert.equal(readCount, 3);
  assert.equal(f.writes.length, 3);
  assert.ok(f.writes.every((write) => write.completion.status === "completed" && write.completion.result === result));
});

test("a committed completion with a lost response is recovered and replay does not execute again", async () => {
  const f = fixture("external_action_retry");
  const result = { attemptId: randomUUID(), status: "succeeded" };
  let executionCount = 0;
  f.setFinish(async (...args) => {
    await f.persist(...args);
    throw new AppError("database");
  });
  const execute = async () => { executionCount++; return result; };

  const completed = await runClaimedJob(f.read().id, f.store, async () => {}, execute);
  const replayed = await runClaimedJob(f.read().id, f.store, async () => {}, execute);

  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.result, result);
  assert.equal(replayed.status, "completed");
  assert.deepEqual(replayed.result, result);
  assert.equal(executionCount, 1);
  assert.equal(f.read().attempt_count, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.read().error_category, null);
});

test("readback respects cancellation while completion persistence fails", async () => {
  const f = fixture();
  let executionCount = 0;
  f.setFinish(async () => {
    f.change({ status: "cancelled", cancelled_at: new Date().toISOString(), claim_token: null });
    throw new AppError("database");
  });
  const execute = async () => { executionCount++; return { tasks: 1 }; };

  const cancelled = await runClaimedJob(f.read().id, f.store, async () => {}, execute);
  await runClaimedJob(f.read().id, f.store, async () => {}, execute);

  assert.equal(cancelled.status, "cancelled");
  assert.equal(executionCount, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.read().error_category, null);
});

test("exhausted completion writes after external success require reconciliation and cannot resend", async () => {
  const f = fixture("external_action_retry");
  const result = { attemptId: randomUUID(), status: "succeeded" };
  let executionCount = 0;
  f.setFinish(async (...args) => {
    if (args[3].status === "completed") throw new AppError("database");
    return f.persist(...args);
  });
  const execute = async () => { executionCount++; return result; };

  const failed = await runClaimedJob(f.read().id, f.store, async () => {}, execute);
  const replayed = await runClaimedJob(f.read().id, f.store, async () => {}, execute);

  assert.equal(failed.status, "failed");
  assert.equal(failed.error_category, "unknown_execution_state");
  assert.equal(failed.retryable, false);
  assert.equal(failed.next_retry_at, null);
  assert.equal(replayed.status, "failed");
  assert.equal(executionCount, 1);
  assert.equal(f.read().attempt_count, 1);
  assert.equal(f.writes.length, 4);
  assert.ok(f.writes.slice(0, 3).every((write) => write.completion.status === "completed" && write.completion.result === result));
  assert.equal(f.writes[3].completion.errorCategory, "unknown_execution_state");
  assert.equal(f.writes[3].completion.retryAt, undefined);
});
