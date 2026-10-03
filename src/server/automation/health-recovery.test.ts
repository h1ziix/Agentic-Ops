import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationJob, ScheduleAutomationInput } from "@/types/automation";
import { providerAllowsRecovery, staleContinuation, recoverWorkflowHealth, reconcileAutomationCandidate, type RecoveryCandidate, type RecoveryRun, type HealthRecoveryStore } from "./health-recovery";

const now = 1_800_000_000_000;
function fixture(jobPatch: Partial<RecoveryCandidate> = {}) {
  const context = { workspaceId: randomUUID(), userId: randomUUID() }; const workflow = { id: randomUUID(), status: "running" };
  let jobs: RecoveryCandidate[] = [{ id: randomUUID(), workspace_id: context.workspaceId, actor_id: context.userId, workflow_id: workflow.id, workflow_task_id: null,
    lead_id: null, proposed_action_id: null, follow_up_plan_id: null, job_type: "workflow_continue", status: "running", provider: "trigger", provider_job_id: "provider_run",
    scheduled_for: new Date(now - 400_000).toISOString(), lease_until: new Date(now - 1000).toISOString(), started_at: new Date(now - 400_000).toISOString(), completed_at: null,
    cancelled_at: null, attempt_count: 1, max_attempts: 3, idempotency_key: "fixture", input: {}, result: null, error_category: null, error_code: null, error_summary: null,
    retryable: false, next_retry_at: null, created_at: new Date(now - 400_000).toISOString(), updated_at: new Date(now - 400_000).toISOString(), ...jobPatch }];
  const runs: RecoveryRun[] = [{ id: randomUUID(), agent_type: "researcher", status: "running", started_at: new Date(now - 200_000).toISOString() }];
  const scheduled: ScheduleAutomationInput[] = []; let recoveries = 0; let dispatched = 0; let reconciled = 0;
  const store: HealthRecoveryStore = {
    async listJobs() { return structuredClone(jobs); }, async listRuns() { return structuredClone(runs); },
    async recover(actor, workflowId, jobId) {
      assert.deepEqual(actor, context); assert.equal(workflowId, workflow.id); assert.equal(jobId, jobs[0].id); recoveries++;
      jobs[0] = { ...jobs[0], status: "retry_scheduled", provider_job_id: null, lease_until: null }; return 1;
    },
    async get(id) { return structuredClone(jobs.find((job) => job.id === id)!); },
    async reconcileProvider(actor, jobId, providerId, providerStatus) {
      assert.deepEqual(actor, context); assert.equal(jobId, jobs[0].id); assert.equal(providerId, jobs[0].provider_job_id);
      assert.equal(providerAllowsRecovery(providerStatus), true); reconciled++;
      jobs[0] = { ...jobs[0], status: "retry_scheduled", provider_job_id: null, lease_until: null, scheduled_for: new Date(now + 30_000).toISOString() };
      return structuredClone(jobs[0]);
    },
    async schedule(input) { scheduled.push(input); return { ...jobs[0], id: randomUUID(), status: "scheduled", provider_job_id: null, job_type: input.jobType } as AutomationJob; },
  };
  return { context, workflow, store, jobs: () => jobs, clearJobs: () => { jobs = []; }, runs, scheduled, recoveries: () => recoveries, dispatched: () => dispatched, reconciled: () => reconciled,
    dispatch: async (job: AutomationJob) => { dispatched++; return job; } };
}
test("only terminal provider states prove that a worker stopped", () => {
  for (const status of ["COMPLETED", "FAILED", "CANCELED", "CRASHED", "TIMED_OUT"]) assert.equal(providerAllowsRecovery(status), true);
  for (const status of ["EXECUTING", "QUEUED", "WAITING", "REATTEMPTING", "PENDING_VERSION", "NEW_UNKNOWN_STATUS"]) assert.equal(providerAllowsRecovery(status), false);
});
test("expired DB leases do not interrupt active or unobservable provider workers", async () => {
  for (const status of ["EXECUTING", "QUEUED", "NEW_UNKNOWN_STATUS", null]) {
    const f = fixture();
    const result = await recoverWorkflowHealth(f.context, f.workflow, randomUUID(), f.store, async () => { if (status === null) throw new Error("Provider outage"); return status; },
      async () => {}, f.dispatch, now);
    assert.equal(f.recoveries(), 0); assert.equal(f.dispatched(), 0); assert.equal(result.protectedWorkers, 1); assert.equal(result.continuationScheduled, false);
  }
});
test("unexpired leases remain protected even after a terminal provider result", async () => {
  const f = fixture({ lease_until: new Date(now + 60_000).toISOString() }); let checked = false;
  await recoverWorkflowHealth(f.context, f.workflow, randomUUID(), f.store, async () => { checked = true; return "COMPLETED"; }, async () => {}, f.dispatch, now);
  assert.equal(checked, false); assert.equal(f.recoveries(), 0);
});
test("stopped expired workers recover their same job before dispatch without orphan duplicates", async () => {
  const f = fixture();
  const result = await recoverWorkflowHealth(f.context, f.workflow, randomUUID(), f.store, async () => "CRASHED", async () => {}, f.dispatch, now);
  assert.equal(f.recoveries(), 1); assert.equal(f.dispatched(), 1); assert.equal(result.continuationScheduled, false); assert.equal(f.scheduled.length, 0);
});
test("due queued jobs with terminal providers reconcile the same job before redispatch", async () => {
  const f = fixture({ status: "queued", attempt_count: 0, started_at: null, lease_until: null });
  await recoverWorkflowHealth(f.context, f.workflow, randomUUID(), f.store, async () => "FAILED", async () => {}, f.dispatch, now);
  assert.equal(f.reconciled(), 1); assert.equal(f.recoveries(), 0); assert.equal(f.dispatched(), 1); assert.equal(f.jobs()[0].attempt_count, 0);
});
test("future bound jobs and queued provider outages never release their binding", async () => {
  const future = fixture({ status: "scheduled", attempt_count: 0, lease_until: null, scheduled_for: new Date(now + 60_000).toISOString() }); let checked = false;
  const pending = await reconcileAutomationCandidate(future.jobs()[0], future.store, async () => { checked = true; return "CANCELED"; }, now);
  assert.equal(checked, false); assert.equal(pending.protectedWorker, true); assert.equal(future.reconciled(), 0);
  const outage = fixture({ status: "queued", attempt_count: 0, lease_until: null });
  const protectedJob = await reconcileAutomationCandidate(outage.jobs()[0], outage.store, async () => { throw new Error("No provider evidence"); }, now);
  assert.equal(protectedJob.protectedWorker, true); assert.equal(outage.reconciled(), 0);
});
test("orphan safe runs enqueue deterministic continuation through existing runtime", async () => {
  const f = fixture(); f.clearJobs();
  const result = await recoverWorkflowHealth(f.context, f.workflow, randomUUID(), f.store, async () => "CRASHED", async () => {}, f.dispatch, now);
  assert.equal(result.continuationScheduled, true); assert.equal(f.scheduled[0].idempotencyKey, `stale:${f.workflow.id}:${f.runs[0].id}`);
  assert.deepEqual(f.scheduled[0].input, { scope: "research", retry: true, iteration: 0 });
});
test("cancelled, paused, failed and completed workflows never automatically restart", () => {
  const f = fixture();
  for (const status of ["cancelled", "paused", "failed", "completed", "waiting_for_approval", "ready_for_execution"])
    assert.equal(staleContinuation({ ...f.workflow, status }, f.runs, [], now), null);
  assert.equal(staleContinuation(f.workflow, [{ ...f.runs[0], agent_type: "executor" }], [], now), null);
  assert.equal(staleContinuation(f.workflow, [{ ...f.runs[0], started_at: new Date(now - 179_999).toISOString() }], [], now), null);
});
test("manual health recovery excludes its own job and rechecks stored actor membership", async () => {
  const f = fixture(); const id = f.jobs()[0].id;
  await recoverWorkflowHealth(f.context, f.workflow, id, f.store, async () => "CRASHED", async () => { throw new Error("Membership removed"); }, f.dispatch, now);
  assert.equal(f.recoveries(), 0);
  const other = fixture();
  await recoverWorkflowHealth(other.context, other.workflow, randomUUID(), other.store, async () => "CRASHED", async () => { throw new Error("Membership removed"); }, other.dispatch, now);
  assert.equal(other.recoveries(), 0); assert.equal(other.dispatched(), 0);
});
