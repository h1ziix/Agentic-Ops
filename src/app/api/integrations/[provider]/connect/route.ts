import { providerSchema } from "@/lib/validation/execution";
import { beginConnection } from "@/server/services/integration-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  try { z.object({}).strict().parse(await mutationBody(request, 1024)); const { provider } = await context.params; return Response.json(await beginConnection(providerSchema.parse(provider))); }
  catch (e) { return mutationError(e); }
}
