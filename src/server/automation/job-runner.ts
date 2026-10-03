import { randomUUID } from "node:crypto";
import type { AutomationJob, AutomationClaim, AutomationCompletion, AutomationContext } from "@/types/automation";
import { jobFailure } from "./retry-policy";
import { AppError } from "../errors";

export interface JobRunStore {
  get(id: string): Promise<AutomationJob>;
  claim(context: AutomationContext, id: string, token: string): Promise<AutomationClaim>;
  finish(context: AutomationContext, id: string, token: string, completion: AutomationCompletion): Promise<AutomationJob>;
}
export async function runClaimedJob(id: string, store: JobRunStore, authorize: (context: AutomationContext) => Promise<void>,
  execute: (job: AutomationClaim, context: AutomationContext) => Promise<NonNullable<AutomationJob["result"]>>) {
  const job = await store.get(id); const context = { workspaceId: job.workspace_id, userId: job.actor_id };
  await authorize(context);
  const token = randomUUID(); const claimed = await store.claim(context, job.id, token);
  if (claimed.status !== "running" || claimed.claim_token !== token) return claimed;
  try {
    const result = await execute(claimed, context);
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await store.finish(context, job.id, token, { status: "completed", result }); }
      catch {
        try {
          const saved = await store.get(job.id);
          if (saved.status === "completed" || saved.status === "cancelled") return saved;
        } catch {
          // Keep the successful result in memory when persistence and readback both fail.
        }
      }
    }
    throw new AppError("database");
  } catch (error) {
    const failure = jobFailure(error, claimed.attempt_count, claimed.job_type === "external_action_retry");
    return store.finish(context, job.id, token, { status: "failed", errorCategory: failure.category, errorCode: failure.code,
      errorSummary: failure.summary, retryable: failure.retryable,
      retryAt: failure.retryable ? new Date(Date.now() + failure.delayMs).toISOString() : undefined });
  }
}
