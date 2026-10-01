import { z } from "zod";
import { recoverExecution, reconcileExecution } from "@/server/services/execution-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const body = await mutationBody(request, 4096);
    const recovery = z.object({ recover: z.literal(true) }).strict().safeParse(body);
    return Response.json(recovery.success ? await recoverExecution(id) : await reconcileExecution(id, body), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return mutationError(error); }
}
