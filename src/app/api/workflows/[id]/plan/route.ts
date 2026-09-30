import { planWorkflow } from "@/server/services/planning-service";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Synchronous request for Stage 3. Polling is independent; replace dispatch with a job later. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "This planning request is not allowed." }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    return Response.json(await planWorkflow(id));
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.code === "unauthenticated" ? 401 : error.code === "unauthorized" ? 403
        : error.code === "not_found" ? 404 : error.code === "invalid_transition" ? 409
        : error.code === "validation" ? 400 : 503;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    console.error("Planning endpoint failed", { operation: "plan_workflow" });
    return Response.json({ error: "Planning could not be started. Please try again." }, { status: 503 });
  }
}
