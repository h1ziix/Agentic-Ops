import { loadIntelligence } from "@/server/analytics/analytics-service";
import { mutationError } from "@/server/http/mutations";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await loadIntelligence({ range: "all", workflowId: id });
    return Response.json({ metrics: data.workflows.find((workflow) => workflow.id === id) ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return mutationError(error); }
}
