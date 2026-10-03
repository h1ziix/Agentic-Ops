import { z } from "zod";
import { automationMutationSchema } from "@/lib/validation/automation";
import { mutateAutomationJob } from "@/server/services/automation-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const input = automationMutationSchema.parse(await mutationBody(request));
    return Response.json({ ok: true, job: await mutateAutomationJob(z.uuid().parse(id), input.operation) });
  } catch (error) { return mutationError(error); }
}
