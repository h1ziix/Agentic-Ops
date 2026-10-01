import { z } from "zod";
import { disconnectConnection, integrationSettings } from "@/server/services/integration-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
export const runtime = "nodejs";
export async function GET() {
  try { return Response.json(await integrationSettings(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (e) { return mutationError(e); }
}
export async function DELETE(request: Request) {
  try { const input = z.object({ connectionId: z.uuid() }).strict().parse(await mutationBody(request, 1024)); return Response.json(await disconnectConnection(input.connectionId)); }
  catch (e) { return mutationError(e); }
}
