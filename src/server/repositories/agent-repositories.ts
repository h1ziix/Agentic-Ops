import { z } from "zod";
import { agentEventRowSchema, agentRunRowSchema } from "@/lib/validation/rows";
import type { AgentEventRow, AgentRunRow } from "@/types/persistence";
import type { ServerSupabase } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";
import type { AgentRunWriter, StartRunInput, CompleteRunInput } from "../services/agent-run-service";
import type { EventWriter, RecordEventInput } from "../services/event-service";
import { mapPlannerTasks, validatedPlannerOutputSchema } from "@/lib/validation/planner";

export class AgentRunRepository implements AgentRunWriter {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkspaceRuns(workspaceId: string, workflowId?: string): Promise<AgentRunRow[]> {
    let query = this.supabase.from("agent_runs").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw fromDatabaseError("list_agent_runs", error);
    return parseDatabaseResult(z.array(agentRunRowSchema), data, "list_agent_runs");
  }

  async start(input: StartRunInput): Promise<AgentRunRow> {
    if (input.agentType !== "planner" || input.workflowTaskId) throw new AppError("validation");
    const { data, error } = await this.supabase.rpc("start_planner_run", {
      p_run_id: input.runId, p_user_id: input.userId, p_workspace_id: input.workspaceId,
      p_workflow_id: input.workflowId, p_model: input.model, p_input: input.input,
    });
    if (error) throw fromDatabaseError("start_planner_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "start_planner_run");
  }

  async complete(input: CompleteRunInput): Promise<AgentRunRow> {
    const plan = input.status === "completed" ? validatedPlannerOutputSchema.parse(input.output) : null;
    const { data, error } = await this.supabase.rpc("complete_planner_run", {
      p_run_id: input.runId, p_status: input.status, p_plan: plan,
      p_tasks: plan ? mapPlannerTasks(plan) : [], p_error: input.error ?? null,
      p_metrics: input.metrics,
    });
    if (error) throw fromDatabaseError("complete_planner_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "complete_planner_run");
  }
}

export class AgentEventRepository implements EventWriter {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkspaceEvents(workspaceId: string, workflowId?: string): Promise<AgentEventRow[]> {
    let query = this.supabase.from("agent_events").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw fromDatabaseError("list_agent_events", error);
    return parseDatabaseResult(z.array(agentEventRowSchema), data, "list_agent_events");
  }

  async record(input: RecordEventInput): Promise<AgentEventRow> {
    const { data, error } = await this.supabase.rpc("record_agent_event", {
      p_workspace_id: input.workspaceId, p_workflow_id: input.workflowId,
      p_event_type: input.eventType, p_summary: input.summary, p_metadata: input.metadata,
      p_agent_run_id: input.agentRunId ?? null, p_workflow_task_id: input.workflowTaskId ?? null,
    });
    if (error) throw fromDatabaseError("record_agent_event", error);
    return parseDatabaseResult(agentEventRowSchema, data, "record_agent_event");
  }

}
