import { executeAction } from "@/server/services/execution-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json(await executeAction(id, await mutationBody(request, 1024)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return mutationError(error); }
}
