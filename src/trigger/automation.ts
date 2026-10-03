import { task, schedules } from "@trigger.dev/sdk";
import { z } from "zod";
import { signJobBody } from "../server/automation/job-auth";
import { getAutomationAppOrigin, serverEnvironment } from "../server/config/env";

async function invoke(payload: { operation: "dispatch"; jobId: string; providerRunId: string } | { operation: "sweep"; providerRunId: string }) {
  const secret = serverEnvironment().AUTOMATION_JOB_SIGNING_SECRET ?? "";
  const origin = new URL(getAutomationAppOrigin());
  const body = JSON.stringify(payload); const timestamp = String(Date.now());
  const response = await fetch(new URL("/api/automation/dispatch", origin), { method: "POST", redirect: "error", signal: AbortSignal.timeout(300_000),
    headers: { "Content-Type": "application/json", "X-Job-Timestamp": timestamp, "X-Job-Signature": signJobBody(body, timestamp, secret) }, body });
  if (!response.ok) throw new Error(`Job callback failed with HTTP ${response.status}. Inspect saved automation state.`);
  return { accepted: true };
}
export const automationJob = task({ id: "agentic-ops-job", retry: { maxAttempts: 1 }, maxDuration: 360,
  run: async (payload: unknown, { ctx }) => invoke({ operation: "dispatch", jobId: z.object({ jobId: z.uuid() }).strict().parse(payload).jobId, providerRunId: ctx.run.id }) });
/** Outbox dispatch and expired-lease recovery, bounded per tick. No mailbox or send scan. */
export const automationMaintenance = schedules.task({ id: "agentic-ops-maintenance", cron: "*/5 * * * *", retry: { maxAttempts: 1 },
  run: async (_payload, { ctx }) => invoke({ operation: "sweep", providerRunId: ctx.run.id }) });
