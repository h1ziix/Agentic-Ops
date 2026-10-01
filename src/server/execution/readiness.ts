import { executableEnvelopeSchema, hasRequiredScopes, type ApprovalSnapshot, type ExecutionAttempt, type IntegrationConnection } from "@/lib/validation/execution";
import type { ProposedActionRow, WorkflowRow } from "@/types/persistence";
import { envelopeDigest } from "./digest";
export function executionBlockers(action: ProposedActionRow, snapshot: ApprovalSnapshot | null, connection: IntegrationConnection | null, workflow: WorkflowRow, attempts: ExecutionAttempt[]) {
  const reasons: string[] = []; const envelope = executableEnvelopeSchema.safeParse(action.executable_envelope);
  if (!envelope.success || action.schema_version !== 2) return ["Legacy or invalid proposal: create an executable revision and approve it again."];
  if (envelope.data.actionId !== action.id || envelope.data.workspaceId !== action.workspace_id || envelope.data.workflowId !== action.workflow_id
    || workflow.id !== action.workflow_id || workflow.workspace_id !== action.workspace_id || envelope.data.revision !== action.revision
    || action.action_type !== envelope.data.actionType || action.lineage_id !== envelope.data.lineageId) reasons.push("Action references do not match this workspace, type, lineage and revision.");
  if (action.status !== "approved") reasons.push(action.status === "executed" ? "Already completed. Replay cannot send again." : "This action requires its own approval.");
  if (action.superseded_by_id) reasons.push("This proposal was superseded.");
  if (!snapshot || snapshot.action_id !== action.id || snapshot.workspace_id !== action.workspace_id || snapshot.workflow_id !== action.workflow_id
    || snapshot.revision !== action.revision || snapshot.id !== envelope.data.snapshotId || snapshot.envelope.snapshotId !== envelope.data.snapshotId
    || snapshot.action_type !== envelope.data.actionType || snapshot.digest !== envelopeDigest(envelope.data) || snapshot.digest !== envelopeDigest(snapshot.envelope)) reasons.push("Exact approval snapshot is missing or changed.");
  if (!(action.is_auxiliary ? ["ready_for_execution", "running", "paused", "completed"] : ["ready_for_execution", "running", "paused", "failed"]).includes(workflow.status)) reasons.push("Workflow does not permit execution.");
  if (envelope.data.actionType !== "schedule_follow_up") {
    const approved = envelope.data.connection;
    if (snapshot && (snapshot.connection_id !== approved.id || snapshot.authorization_generation !== approved.generation)) reasons.push("Approval connection identity does not match the proposal.");
    if (!connection || connection.workspace_id !== action.workspace_id || connection.id !== approved.id || connection.provider !== approved.provider
      || connection.provider_identity !== approved.identity || connection.generation !== approved.generation || connection.status !== "connected") reasons.push("Reconnect or account change invalidated this approval. Select the connection and review a replacement.");
    else if (!hasRequiredScopes(connection.provider, connection.scopes)) reasons.push("Required provider permissions are missing.");
  } else if (new Date(envelope.data.dueAt).getTime() <= Date.now()) reasons.push("Follow-up date is no longer in the future. Create a replacement plan.");
  if (attempts.some((t) => t.status === "succeeded")) reasons.push("The approved operation has already succeeded.");
  if (attempts.some((t) => t.status === "outcome_unknown" && t.verification_method !== "closed_for_replacement")) reasons.push("Outcome unknown. Reconcile before any further dispatch.");
  return reasons;
}
