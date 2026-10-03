import "server-only";
import { z } from "zod";
import { buildWorkspaceObservability } from "@/lib/observability";
import { agentEventRowSchema, agentRunRowSchema } from "@/lib/validation/rows";
import type { ServerSupabase } from "../auth/context";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "../repositories/parse";

/** Caller supplies the cookie-bound client and its verified workspace, never client IDs. */
export async function loadWorkspaceObservability(supabase: ServerSupabase, workspaceId: string, workflowId?: string, timeZone = "UTC") {
  let runsQuery = supabase.from("agent_run_observations_07").select("*").eq("workspace_id", workspaceId);
  let eventsQuery = supabase.from("agent_events").select("*").eq("workspace_id", workspaceId)
    .in("event_type", ["tool_called", "tool_completed", "tool_failed", "retry"]);
  if (workflowId) { runsQuery = runsQuery.eq("workflow_id", workflowId); eventsQuery = eventsQuery.eq("workflow_id", workflowId); }
  const [runResult, eventResult] = await Promise.all([
    runsQuery.order("created_at", { ascending: false }).limit(1000),
    eventsQuery.order("created_at", { ascending: false }).limit(1000),
  ]);
  if (runResult.error) throw fromDatabaseError("list_observability_runs", runResult.error);
  if (eventResult.error) throw fromDatabaseError("list_observability_tools", eventResult.error);
  const rows = parseDatabaseResult(z.array(agentRunRowSchema), runResult.data, "list_observability_runs");
  const events = parseDatabaseResult(z.array(agentEventRowSchema), eventResult.data, "list_observability_tools");
  return buildWorkspaceObservability(rows, events, { timeZone, workflowIds: workflowId ? [workflowId] : undefined,
    truncated: rows.length === 1000 || events.length === 1000 });
}
