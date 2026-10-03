import "server-only";
import { z } from "zod";
import { observeAgentRun } from "@/lib/observability";
import { agentRunRowSchema } from "@/lib/validation/rows";
import { toWorkspaceView } from "@/lib/workspace-view";
import { requireWorkspace, type WorkspaceContext } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { AgentEventRepository } from "../repositories/agent-repositories";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { parseDatabaseResult } from "../repositories/parse";

export const HISTORY_PAGE_SIZE = 100;
export const historyQuerySchema = z.object({
  kind: z.enum(["events", "runs"]),
  page: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).refine((page) => page <= 10000).default(1),
  workflowId: z.uuid().optional(),
}).strict();
export type HistoryQuery = z.output<typeof historyQuerySchema>;

export function parseHistoryParams(params: URLSearchParams): HistoryQuery {
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new AppError("validation");
  return historyQuerySchema.parse(Object.fromEntries(entries));
}

/** Authorization is server-resolved; paging reads never create audit or runtime events. */
export async function getHistoryPage(query: HistoryQuery) {
  return loadHistoryPage(await requireWorkspace(), query);
}

export async function loadHistoryPage(context: WorkspaceContext, query: HistoryQuery) {
  const { supabase, workspace } = context;
  if (query.workflowId && !await new WorkflowRepository(supabase).getWorkflowById(workspace.id, query.workflowId)) throw new AppError("not_found");
  const offset = (query.page - 1) * HISTORY_PAGE_SIZE;
  if (query.kind === "runs") {
    let read = supabase.from("agent_run_observations_07").select("*").eq("workspace_id", workspace.id);
    if (query.workflowId) read = read.eq("workflow_id", query.workflowId);
    const { data, error } = await read.order("created_at", { ascending: false }).order("id").range(offset, offset + HISTORY_PAGE_SIZE);
    if (error) throw fromDatabaseError("history_runs", error);
    const rows = parseDatabaseResult(z.array(agentRunRowSchema), data, "history_runs");
    return { kind: query.kind, page: query.page, pageSize: HISTORY_PAGE_SIZE, hasMore: rows.length > HISTORY_PAGE_SIZE,
      toolActivityIncluded: false, items: rows.slice(0, HISTORY_PAGE_SIZE).map((row) => observeAgentRun(row)) };
  }
  const rows = await new AgentEventRepository(supabase).listWorkspaceEvents(workspace.id, query.workflowId, { offset, limit: HISTORY_PAGE_SIZE + 1 });
  const events = rows.slice(0, HISTORY_PAGE_SIZE);
  const runIds = [...new Set(events.flatMap((row) => row.agent_run_id ? [row.agent_run_id] : []))];
  let agentRuns: z.infer<typeof agentRunRowSchema>[] = [];
  if (runIds.length) {
    const { data, error } = await supabase.from("agent_run_observations_07").select("*").eq("workspace_id", workspace.id).in("id", runIds).limit(HISTORY_PAGE_SIZE);
    if (error) throw fromDatabaseError("history_event_agents", error);
    agentRuns = parseDatabaseResult(z.array(agentRunRowSchema), data, "history_event_agents");
  }
  const view = toWorkspaceView({ workspace, workflows: [], tasks: [], companies: [], leads: [], approvals: [], proposedActions: [], agentRuns, events });
  return { kind: query.kind, page: query.page, pageSize: HISTORY_PAGE_SIZE, hasMore: rows.length > HISTORY_PAGE_SIZE, items: view.activity };
}
