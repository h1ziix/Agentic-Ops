import "server-only";
import { z } from "zod";
import { attemptRowSchema, snapshotRowSchema, followUpRowSchema } from "@/lib/validation/execution";
import { proposedActionRowSchema, workflowRowSchema } from "@/lib/validation/rows";
import type { ServerSupabase } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";
import { IntegrationRepository } from "./integration-repository";
import type { ExecutionStore, CompletionInput, ExecuteContext } from "../execution/executor";
export const ATTEMPT_COLUMNS = "id,workspace_id,workflow_id,action_id,snapshot_id,connection_id,attempt_number,operation_key,executor_run_id,status,claimed_at,dispatched_at,completed_at,lease_until,rfc_message_id,result,safe_error_code,retry_eligible,next_retry_at,duration_ms,verification_method,reconciled_by,reconciled_at,reconciliation_note";
export class ExecutionRepository implements ExecutionStore {
  constructor(private readonly db: ServerSupabase) {}
  async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw fromDatabaseError(name, error);
    return data as unknown;
  }
  async list(workspace: string, workflow?: string) {
    const read = async (table: string, columns = "*") => {
      let query = this.db.from(table).select(columns).eq("workspace_id", workspace);
      if (workflow) query = query.eq("workflow_id", workflow);
      const { data, error } = await query;
      if (error) throw fromDatabaseError(`execution_${table}`, error);
      return data as unknown;
    };
    const [snapshots, attempts, plans] = await Promise.all([read("action_approval_snapshots"), read("execution_attempts", ATTEMPT_COLUMNS), read("follow_up_plans")]);
    return { actionSnapshots: parseDatabaseResult(z.array(snapshotRowSchema), snapshots, "snapshots"), executionAttempts: parseDatabaseResult(z.array(attemptRowSchema), attempts, "attempts"),
      followUpPlans: parseDatabaseResult(z.array(followUpRowSchema), plans, "follow_ups") };
  }
  async load(request: ExecuteContext) {
    const [a, w, data, connections] = await Promise.all([
      this.db.from("proposed_actions").select("*").eq("id", request.actionId).eq("workspace_id", request.workspaceId).eq("workflow_id", request.workflowId).maybeSingle(),
      this.db.from("workflows").select("*").eq("id", request.workflowId).eq("workspace_id", request.workspaceId).maybeSingle(),
      this.list(request.workspaceId, request.workflowId), new IntegrationRepository(this.db).list(request.workspaceId),
    ]);
    if (a.error || w.error) throw new AppError("database");
    if (!a.data || !w.data) throw new AppError("not_found");
    const action = proposedActionRowSchema.parse(a.data); const snapshot = data.actionSnapshots.find((s) => s.id === request.expectedSnapshotId && s.action_id === action.id) ?? null;
    return { action, snapshot, workflow: workflowRowSchema.parse(w.data), connection: connections.find((c) => c.id === snapshot?.connection_id) ?? null, attempts: data.executionAttempts };
  }
  async claim(request: ExecuteContext, attemptId: string, claimToken: string) {
    return attemptRowSchema.parse(await this.rpc("claim_execution", { p_workspace: request.workspaceId, p_actor: request.userId, p_workflow: request.workflowId,
      p_action: request.actionId, p_snapshot: request.expectedSnapshotId, p_attempt: attemptId, p_claim: claimToken, p_retry: request.retry ?? false }));
  }
  async dispatch(request: ExecuteContext, attemptId: string, claimToken: string) {
    return attemptRowSchema.parse(await this.rpc("dispatch_execution", { p_workspace: request.workspaceId, p_actor: request.userId, p_attempt: attemptId, p_claim: claimToken }));
  }
  async finish(request: ExecuteContext, input: CompletionInput) {
    return attemptRowSchema.parse(await this.rpc("finish_execution", { p_workspace: request.workspaceId, p_actor: request.userId, p_attempt: input.attemptId, p_claim: input.claimToken,
      p_status: input.status, p_result: input.result ?? null, p_error: input.error ?? null, p_retry_seconds: input.retryAfter ?? 0, p_verification: input.verification ?? "provider_response" }));
  }
  async recover(request: Pick<ExecuteContext, "workspaceId" | "workflowId" | "userId">) {
    await this.rpc("recover_execution_claims", { p_workspace: request.workspaceId, p_actor: request.userId, p_workflow: request.workflowId });
  }
}
