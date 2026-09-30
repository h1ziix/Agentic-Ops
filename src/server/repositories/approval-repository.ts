import { z } from "zod";
import { approvalRowSchema, proposedActionRowSchema } from "@/lib/validation/rows";
import type { ApprovalDecision, ApprovalRow, ProposedActionRow } from "@/types/persistence";
import type { ActionContentEdit } from "@/lib/validation/approval";
import type { ServerSupabase } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export interface RequestApprovalParameters {
  workspaceId: string;
  workflowId: string;
  type: string;
  title: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  actions: Array<{
    action_type: string;
    target: Record<string, unknown>;
    payload: Record<string, unknown>;
    risk_level?: "low" | "medium" | "high";
  }>;
}

export class ApprovalRepository {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkspaceApprovals(workspaceId: string, workflowId?: string): Promise<ApprovalRow[]> {
    let query = this.supabase.from("approvals").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw fromDatabaseError("list_approvals", error);
    return parseDatabaseResult(z.array(approvalRowSchema), data, "list_approvals");
  }

  async listWorkspaceProposedActions(workspaceId: string, workflowId?: string): Promise<ProposedActionRow[]> {
    let query = this.supabase.from("proposed_actions").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw fromDatabaseError("list_proposed_actions", error);
    return parseDatabaseResult(z.array(proposedActionRowSchema), data, "list_proposed_actions");
  }

  async getApprovalById(workspaceId: string, approvalId: string): Promise<ApprovalRow | null> {
    const { data, error } = await this.supabase.from("approvals").select("*")
      .eq("workspace_id", workspaceId).eq("id", approvalId).maybeSingle();
    if (error) throw fromDatabaseError("get_approval", error);
    return data ? parseDatabaseResult(approvalRowSchema, data, "get_approval") : null;
  }

  /** SQL creates the approval, proposed actions, and audit event atomically. */
  async requestApproval(input: RequestApprovalParameters): Promise<string> {
    const { data, error } = await this.supabase.rpc("request_approval", {
      p_workspace_id: input.workspaceId,
      p_workflow_id: input.workflowId,
      p_type: input.type,
      p_title: input.title,
      p_description: input.description,
      p_risk_level: input.riskLevel,
      p_actions: input.actions,
    });
    if (error) throw fromDatabaseError("request_approval", error);
    const result = z.uuid().safeParse(data);
    if (!result.success) throw new AppError("database");
    return result.data;
  }

  /** Decision only: this RPC never executes proposed actions. */
  async resolveApproval(approvalId: string, decision: ApprovalDecision, edits: ActionContentEdit[] = []): Promise<ApprovalRow> {
    const { data, error } = await this.supabase.rpc("resolve_approval", {
      p_approval_id: approvalId,
      p_decision: decision,
      p_action_edits: edits.map(({ actionId, subject, body }) => ({ action_id: actionId, subject, body })),
    });
    if (error) throw fromDatabaseError("resolve_approval", error);
    return parseDatabaseResult(approvalRowSchema, data, "resolve_approval");
  }
}
