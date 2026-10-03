import { z } from "zod";
import { scheduleWorkflowAutomation, scheduleExecutionRetry } from "@/server/services/automation-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const input = z.discriminatedUnion("operation", [
      z.object({ operation: z.enum(["continue", "health_check", "recover"]), retry: z.boolean().optional() }).strict(),
      z.object({ operation: z.literal("retry_execution"), actionId: z.uuid(), expectedSnapshotId: z.uuid() }).strict(),
    ]).parse(await mutationBody(request));
    return Response.json({ ok: true, job: input.operation === "retry_execution"
      ? await scheduleExecutionRetry(z.uuid().parse(id), input.actionId, input.expectedSnapshotId)
      : await scheduleWorkflowAutomation(z.uuid().parse(id), input.operation, input.retry) });
  } catch (error) { return mutationError(error); }
}
