import { z } from "zod";
import { mutateFollowup } from "@/server/services/automation-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const input = z.object({ operation: z.enum(["cancel", "test_due"]) }).strict().parse(await mutationBody(request));
    return Response.json({ ok: true, result: await mutateFollowup(z.uuid().parse(id), input.operation) });
  } catch (error) { return mutationError(error); }
}
