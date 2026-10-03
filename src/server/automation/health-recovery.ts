import type { AutomationContext, AutomationJob, ScheduleAutomationInput } from "@/types/automation";

/** Existing Planner, Research and Preparation claims all expire after three minutes. */
export const SAFE_AGENT_STALE_MS = 180_000;
export type RecoveryCandidate = AutomationJob & { lease_until: string | null };
export interface RecoveryRun { id: string; agent_type: string; status: string; started_at: string | null }
export interface RecoveryWorkflow { id: string; status: string }
export interface HealthRecoveryStore {
  listJobs(): Promise<RecoveryCandidate[]>;
  listRuns(): Promise<RecoveryRun[]>;
  recover(context: AutomationContext, workflowId: string, jobId: string): Promise<number>;
  reconcileProvider(context: AutomationContext, jobId: string, providerJobId: string, providerStatus: string): Promise<AutomationJob>;
  get(jobId: string): Promise<AutomationJob>;
  schedule(input: ScheduleAutomationInput): Promise<AutomationJob>;
}
const ongoing = new Set(["scheduled", "queued", "running", "retry_scheduled"]);
const providerTerminal = new Set(["COMPLETED", "CANCELED", "FAILED", "CRASHED", "INTERRUPTED", "SYSTEM_FAILURE", "EXPIRED", "TIMED_OUT"]);
/** Unknown states and provider outages never establish that an existing worker stopped. */
export function providerAllowsRecovery(status: string) { return providerTerminal.has(status); }
/** The row is fenced again in Postgres after the provider lookup can race a claim. */
export async function reconcileAutomationCandidate(job: RecoveryCandidate, store: Pick<HealthRecoveryStore, "recover" | "get" | "reconcileProvider">,
  getProviderStatus: (id: string) => Promise<string>, now = Date.now()) {
  const actor = { workspaceId: job.workspace_id, userId: job.actor_id };
  if (job.status === "running" && (!job.lease_until || !Number.isFinite(Date.parse(job.lease_until)) || Date.parse(job.lease_until) > now))
    return { job, recovered: 0, protectedWorker: true };
  let providerStatus: string | null = null;
  if (job.provider_job_id) {
    if (job.status !== "running" && (Date.parse(job.scheduled_for) > now || (job.next_retry_at && Date.parse(job.next_retry_at) > now)))
      return { job, recovered: 0, protectedWorker: true };
    try { providerStatus = await getProviderStatus(job.provider_job_id); }
    catch { return { job, recovered: 0, protectedWorker: true }; }
    if (!providerAllowsRecovery(providerStatus)) return { job, recovered: 0, protectedWorker: true };
  }
  if (job.status === "running") {
    const recovered = await store.recover(actor, job.workflow_id, job.id);
    return { job: await store.get(job.id), recovered, protectedWorker: false };
  }
  if (providerStatus && job.provider_job_id && ["scheduled", "queued", "retry_scheduled"].includes(job.status))
    return { job: await store.reconcileProvider(actor, job.id, job.provider_job_id, providerStatus), recovered: 0, protectedWorker: false };
  return { job: await store.get(job.id), recovered: 0, protectedWorker: false };
}
export function staleContinuation(workflow: RecoveryWorkflow, runs: RecoveryRun[], jobs: AutomationJob[], now = Date.now()) {
  if (!["planning", "running"].includes(workflow.status) || jobs.some((job) => ongoing.has(job.status) && ["workflow_continue", "research_retry"].includes(job.job_type))) return null;
  return runs.filter((run) => run.agent_type !== "executor" && run.status === "running" && run.started_at !== null
    && Number.isFinite(Date.parse(run.started_at)) && now - Date.parse(run.started_at) >= SAFE_AGENT_STALE_MS)
    .sort((a, b) => Date.parse(b.started_at!) - Date.parse(a.started_at!))[0] ?? null;
}
export async function recoverWorkflowHealth(context: AutomationContext, workflow: RecoveryWorkflow, currentJobId: string, store: HealthRecoveryStore,
  getProviderStatus: (id: string) => Promise<string>, authorize: (actor: AutomationContext) => Promise<void>, dispatch: (job: AutomationJob) => Promise<AutomationJob>, now = Date.now()) {
  let recovered = 0; let dispatched = 0; let protectedWorkers = 0;
  for (const job of (await store.listJobs()).filter((candidate) => candidate.id !== currentJobId)) {
    const actor = { workspaceId: job.workspace_id, userId: job.actor_id };
    try { await authorize(actor); } catch { continue; }
    const result = await reconcileAutomationCandidate(job, store, getProviderStatus, now);
    if (result.protectedWorker) { protectedWorkers++; continue; }
    recovered += result.recovered;
    const saved = result.job;
    if (["scheduled", "queued", "retry_scheduled"].includes(saved.status) && !saved.provider_job_id) { await dispatch(saved); dispatched++; }
  }
  const jobs = (await store.listJobs()).filter((job) => job.id !== currentJobId);
  const stale = staleContinuation(workflow, await store.listRuns(), jobs, now);
  if (stale) {
    await dispatch(await store.schedule({ ...context, workflowId: workflow.id, jobType: "workflow_continue", scheduledFor: new Date(now).toISOString(),
      idempotencyKey: `stale:${workflow.id}:${stale.id}`, input: { scope: workflow.status === "planning" ? "planning" : "research", retry: true, iteration: 0 } }));
    dispatched++;
  }
  return { recovered, dispatched, protectedWorkers, continuationScheduled: Boolean(stale), workflowStatus: workflow.status, externalResend: false };
}
