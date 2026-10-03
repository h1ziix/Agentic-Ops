import { z } from "zod";
import { workflowRowSchema, workflowTaskRowSchema } from "@/lib/validation/rows";
import type { TaskStatus, WorkflowRow, WorkflowStatus, WorkflowTaskRow } from "@/types/persistence";
import type { ServerSupabase } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export class WorkflowRepository {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkspaceWorkflows(workspaceId: string): Promise<WorkflowRow[]> {
    const { data, error } = await this.supabase.from("workflows").select("*")
      .eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_workspace_workflows", error);
    return parseDatabaseResult(z.array(workflowRowSchema), data, "list_workspace_workflows");
  }

  async getWorkflowById(workspaceId: string, workflowId: string): Promise<WorkflowRow | null> {
    const { data, error } = await this.supabase.from("workflows").select("*")
      .eq("workspace_id", workspaceId).eq("id", workflowId).maybeSingle();
    if (error) throw fromDatabaseError("get_workflow", error);
    return data ? parseDatabaseResult(workflowRowSchema, data, "get_workflow") : null;
  }

  /** SQL creates the planning workflow and creation event atomically, without placeholder tasks. */
  async createWorkflow(input: { workspaceId: string; title: string; goal: string; targetCompanies: number; icpId?: string; templateId?: string }): Promise<string> {
    const usesStrategy = Boolean(input.icpId || input.templateId);
    const { data, error } = await this.supabase.rpc(usesStrategy ? "create_workflow_from_strategy" : "create_workflow", {
      p_workspace_id: input.workspaceId,
      p_title: input.title,
      p_goal: input.goal,
      p_target_companies: input.targetCompanies,
      ...(usesStrategy ? { p_icp_id: input.icpId ?? null, p_template_id: input.templateId ?? null } : {}),
    });
    if (error) throw fromDatabaseError("create_workflow", error);
    const result = z.uuid().safeParse(data);
    if (!result.success) throw new AppError("database");
    return result.data;
  }

  /** SQL rechecks the transition under row lock and appends its event. */
  async updateWorkflowStatus(workflowId: string, nextStatus: WorkflowStatus, summary?: string): Promise<WorkflowRow> {
    const { data, error } = await this.supabase.rpc("transition_workflow", {
      p_workflow_id: workflowId,
      p_next_status: nextStatus,
      p_summary: summary ?? null,
    });
    if (error) throw fromDatabaseError("transition_workflow", error);
    return parseDatabaseResult(workflowRowSchema, data, "transition_workflow");
  }

  async listWorkflowTasks(workspaceId: string, workflowId?: string): Promise<WorkflowTaskRow[]> {
    let query = this.supabase.from("workflow_tasks").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("position", { ascending: true });
    if (error) throw fromDatabaseError("list_workflow_tasks", error);
    return parseDatabaseResult(z.array(workflowTaskRowSchema), data, "list_workflow_tasks");
  }

  async getWorkflowTaskById(workspaceId: string, taskId: string): Promise<WorkflowTaskRow | null> {
    const { data, error } = await this.supabase.from("workflow_tasks").select("*")
      .eq("workspace_id", workspaceId).eq("id", taskId).maybeSingle();
    if (error) throw fromDatabaseError("get_workflow_task", error);
    return data ? parseDatabaseResult(workflowTaskRowSchema, data, "get_workflow_task") : null;
  }

  async updateTaskStatus(taskId: string, nextStatus: TaskStatus, summary?: string): Promise<WorkflowTaskRow> {
    const { data, error } = await this.supabase.rpc("transition_workflow_task", {
      p_task_id: taskId,
      p_next_status: nextStatus,
      p_summary: summary ?? null,
    });
    if (error) throw fromDatabaseError("transition_workflow_task", error);
    return parseDatabaseResult(workflowTaskRowSchema, data, "transition_workflow_task");
  }
}
