import { toWorkspaceView } from "@/lib/workspace-view";
import { requireWorkspace } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { getWorkflowDetailSnapshot } from "@/server/services/workflow-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const context = await requireWorkspace();
    const { workspace } = context;
    const snapshot = await getWorkflowDetailSnapshot(id, context);
    const view = toWorkspaceView({ ...snapshot, workspace, workflows: [snapshot.workflow] });
    return Response.json(view, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.code === "unauthenticated" ? 401 : error.code === "unauthorized" ? 403 : error.code === "not_found" ? 404 : error.code === "validation" ? 400 : 503 });
    return Response.json({ error: "Workflow status could not be loaded." }, { status: 503 });
  }
}
