import { z } from "zod";
import { approvalRowSchema, proposedActionRowSchema } from "@/lib/validation/rows";
import type { ApprovalDecision, ApprovalRow, ProposedActionRow } from "@/types/persistence";
import type { ActionContentEdit } from "@/lib/validation/approval";
import type { ServerSupabase } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

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

  /** Decision only: this RPC never executes proposed actions. */
  async editAction(actionId: string, subject: string, body: string, revision: number): Promise<ProposedActionRow> {
    const { data, error } = await this.supabase.rpc("edit_proposed_email", {
      p_action_id: actionId, p_subject: subject, p_body: body, p_revision: revision,
    });
    if (error) throw fromDatabaseError("edit_proposed_email", error);
    return parseDatabaseResult(proposedActionRowSchema, data, "edit_proposed_email");
  }

  async resolveApproval(approvalId: string, decision: ApprovalDecision, edits: ActionContentEdit[] = [], actionIds?: string[]): Promise<ApprovalRow> {
    // Live drafts must be saved independently before a decision; retain the old input contract for demo callers.
    if (edits.length) throw new AppError("validation", "Save draft edits before making a decision.");
    const { data, error } = await this.supabase.rpc("resolve_outreach_actions", {
      p_approval_id: approvalId,
      p_decision: decision,
      p_action_ids: actionIds ?? null,
    });
    if (error) throw fromDatabaseError("resolve_approval", error);
    return parseDatabaseResult(approvalRowSchema, data, "resolve_approval");
  }
}
