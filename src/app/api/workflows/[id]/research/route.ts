import { researchWorkflow } from "@/server/services/research-service";
import { researchRequestSchema } from "@/lib/validation/research";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "This research request is not allowed." }, { status: 403 });
  const { id } = await context.params;
  try {
    if (Number(request.headers.get("content-length")) > 16_384) throw new AppError("validation");
    const body = await request.text();
    if (body.length > 16_384) throw new AppError("validation");
    const parsed = researchRequestSchema.safeParse(body ? JSON.parse(body) : {});
    if (!parsed.success) throw new AppError("validation");
    return Response.json(await researchWorkflow(id, parsed.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid research request." }, { status: 400 });
    if (error instanceof AppError) {
      const status = error.code === "unauthenticated" ? 401 : error.code === "unauthorized" ? 403 : error.code === "not_found" ? 404
        : error.code === "validation" ? 400 : error.code === "invalid_transition" ? 409 : 503;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    return Response.json({ error: "Research could not be completed. Please retry later." }, { status: 503 });
  }
}
