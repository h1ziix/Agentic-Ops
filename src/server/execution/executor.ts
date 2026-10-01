import "server-only";
import { randomUUID } from "node:crypto";
import { executableEnvelopeSchema, type ApprovalSnapshot, type ExecutionAttempt, type ExecutionResult, type IntegrationConnection } from "@/lib/validation/execution";
import type { ProposedActionRow, WorkflowRow } from "@/types/persistence";
import { AppError } from "../errors";
import { IntegrationError } from "../integrations/http";
import { GmailAdapter } from "../integrations/gmail";
import { HubSpotAdapter } from "../integrations/hubspot";
import { executionBlockers } from "./readiness";
export interface ExecuteContext { workspaceId: string; workflowId: string; userId: string; actionId: string; expectedSnapshotId: string; retry?: boolean }
export interface ExecutionBundle { action: ProposedActionRow; snapshot: ApprovalSnapshot | null; workflow: WorkflowRow; connection: IntegrationConnection | null; attempts: ExecutionAttempt[] }
export interface CompletionInput { attemptId: string; claimToken: string; status: "succeeded" | "failed_retryable" | "failed_terminal" | "outcome_unknown" | "cancelled_before_dispatch";
  result?: ExecutionResult; error?: string; retryAfter?: number; verification?: "provider_response" | "provider_read" | "internal_transaction" }
export interface ExecutionStore {
  load(request: ExecuteContext): Promise<ExecutionBundle>;
  claim(request: ExecuteContext, attemptId: string, token: string): Promise<ExecutionAttempt>;
  dispatch(request: ExecuteContext, attemptId: string, token: string): Promise<ExecutionAttempt>;
  finish(request: ExecuteContext, input: CompletionInput): Promise<ExecutionAttempt>;
  recover(request: Pick<ExecuteContext, "workspaceId" | "workflowId" | "userId">): Promise<void>;
}
export interface ExecutionCredentials { accessToken(connection: IntegrationConnection, actor: string): Promise<string> }
/** Deterministic executor. No LLM input, regeneration or implicit provider mutation retry. */
export class Executor {
  constructor(private readonly store: ExecutionStore, private readonly credentials: ExecutionCredentials, private readonly gmail = new GmailAdapter(), private readonly hubspot = new HubSpotAdapter()) {}
  async execute(request: ExecuteContext) {
    await this.store.recover(request);
    const bundle = await this.store.load(request);
    const success = bundle.attempts.find((t) => t.action_id === request.actionId && t.snapshot_id === request.expectedSnapshotId && t.status === "succeeded");
    if (success) return success;
    const blockers = executionBlockers(bundle.action, bundle.snapshot, bundle.connection, bundle.workflow, bundle.attempts.filter((t) => t.action_id === bundle.action.id));
    if (blockers.length) throw new AppError("execution_blocked", blockers[0]);
    const envelope = executableEnvelopeSchema.parse(bundle.snapshot!.envelope);
    const id = randomUUID(); const claim = randomUUID();
    const attempt = await this.store.claim(request, id, claim);
    if (attempt.id !== id) return attempt; // Concurrent caller owns no dispatch rights.
    let dispatched = false;
    try {
      let token = "";
      if (envelope.actionType !== "schedule_follow_up") token = await this.credentials.accessToken(bundle.connection!, request.userId);
      if (envelope.actionType === "upsert_crm_contact") {
        const current = await this.hubspot.lookup(envelope.recipient.email, token);
        if ((envelope.contactId === null && current) || (envelope.contactId !== null && !this.hubspot.matches(envelope, current, false))) throw new IntegrationError("crm_preview_conflict", "blocked");
      }
      // DB state and audit must commit before any external mutation.
      await this.store.dispatch(request, id, claim); dispatched = true;
      const result = envelope.actionType === "send_email" ? await this.gmail.send(envelope, token, attempt.rfc_message_id!, new Date(attempt.claimed_at))
        : envelope.actionType === "upsert_crm_contact" ? await this.hubspot.upsert(envelope, token) : {};
      const completion: CompletionInput = { attemptId: id, claimToken: claim, status: "succeeded", result,
        verification: envelope.actionType === "schedule_follow_up" ? "internal_transaction" : "provider_response" };
      // Retry persistence of the SAME response only. Never invoke the provider again here.
      for (let i = 0; i < 3; i++) { try { return await this.store.finish(request, completion); } catch { /* bounded persistence recovery */ } }
      try { return await this.store.finish(request, { attemptId: id, claimToken: claim, status: "outcome_unknown", error: "result_persistence_unknown" }); }
      catch { throw new AppError("database", "Provider response could not be saved. Do not resend. Recover the persisted dispatch after its lease expires."); }
    } catch (cause) {
      if (cause instanceof AppError && cause.code === "database" && dispatched) throw cause;
      const error = cause instanceof IntegrationError ? cause : new IntegrationError(dispatched ? "execution_outcome_unknown" : "execution_pre_dispatch_blocked", dispatched ? "unknown" : "blocked");
      const status = !dispatched ? "cancelled_before_dispatch" : error.disposition === "unknown" ? "outcome_unknown" : error.disposition === "terminal" ? "failed_terminal" : "failed_retryable";
      try { return await this.store.finish(request, { attemptId: id, claimToken: claim, status, error: error.code, retryAfter: error.retryAfterSeconds }); }
      catch { throw new AppError("database", "Execution status could not be saved. Refresh and recover the saved attempt; do not resend."); }
    }
  }
}
