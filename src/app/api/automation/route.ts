import { z } from "zod";
import { listAutomation, activateApprovedFollowups } from "@/server/services/automation-service";
import { mutationBody, mutationError } from "@/server/http/mutations";
import { requireWorkspace } from "@/server/auth/context";
import { loadWorkspaceObservability } from "@/server/observability/service";

export async function GET(request: Request) {
  try {
    const workflowId = new URL(request.url).searchParams.get("workflowId") ?? undefined;
    const context = await requireWorkspace();
    const [snapshot, observability] = await Promise.all([listAutomation(workflowId), loadWorkspaceObservability(context.supabase, context.workspace.id, workflowId, process.env.WORKSPACE_TIMEZONE ?? "Asia/Qyzylorda")]);
    return Response.json({ ok: true, ...snapshot, observability }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return mutationError(error); }
}
export async function POST(request: Request) {
  try {
    const input = z.object({ operation: z.literal("activate_followups"), workflowId: z.uuid().optional() }).strict().parse(await mutationBody(request));
    return Response.json({ ok: true, jobs: await activateApprovedFollowups(input.workflowId) });
  } catch (error) { return mutationError(error); }
}
