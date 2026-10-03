import { dispatchPayloadSchema, verifyJobBody } from "@/server/automation/job-auth";
import { runAutomationJob, sweepAutomation } from "@/server/automation/worker";
import { mutationError } from "@/server/http/mutations";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096) return Response.json({ error: "Invalid job request." }, { status: 400 });
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); return Response.json({ error: "Invalid job request." }, { status: 400 }); } chunks.push(chunk.value); }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!verifyJobBody(body, request.headers.get("x-job-timestamp"), request.headers.get("x-job-signature"), process.env.AUTOMATION_JOB_SIGNING_SECRET))
    return Response.json({ error: "Job authentication failed." }, { status: 401 });
  try {
    const input = dispatchPayloadSchema.parse(JSON.parse(body));
    return Response.json({ ok: true, result: input.operation === "sweep" ? await sweepAutomation() : await runAutomationJob(input.jobId, input.providerRunId) });
  } catch (error) { return mutationError(error); }
}
