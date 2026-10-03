import "server-only";
import { tasks, runs } from "@trigger.dev/sdk";
import type { AutomationJob } from "@/types/automation";

export interface JobScheduler {
  scheduleJob(job: AutomationJob): Promise<string>;
  cancelJob(providerJobId: string): Promise<void>;
  getJobStatus(providerJobId: string): Promise<string>;
}
/** Provider receives references only; durable Postgres state owns authorization and retries. */
export class TriggerJobScheduler implements JobScheduler {
  async scheduleJob(job: AutomationJob) {
    const handle = await tasks.trigger("agentic-ops-job", { jobId: job.id }, {
      idempotencyKey: `automation:${job.id}:${job.attempt_count}:${job.next_retry_at ?? job.scheduled_for}`, idempotencyKeyTTL: "30d",
      delay: new Date(job.next_retry_at ?? job.scheduled_for),
    });
    return handle.id;
  }
  async cancelJob(id: string) { await runs.cancel(id); }
  async getJobStatus(id: string) { return (await runs.retrieve(id)).status; }
}
