import { randomUUID } from "node:crypto";
import { outreachFixture } from "../../agents/testing/outreach-fixtures";
import { composeOutreach } from "@/lib/validation/outreach";
import { emailEnvelopeSchema, type ApprovalSnapshot, type IntegrationConnection, type ExecutionAttempt, type CrmEnvelope } from "@/lib/validation/execution";
import type { ProposedActionRow, WorkflowRow } from "@/types/persistence";
import { envelopeDigest } from "../digest";

export function executionFixture() {
  const { input, review, recipient } = outreachFixture(); const actionId = randomUUID(); const workspaceId = randomUUID(); const userId = randomUUID(); const now = new Date().toISOString();
  const draft = composeOutreach({ evidenceIndexes: [0], callToAction: "share_example", generationSummary: "Accepted evidence selected" }, input, review, recipient);
  const provenance = { personalization: draft.personalization, evidenceReferences: draft.personalization.claimsUsed, generationMetadata: {
    researchRunId: input.researchRunId, reviewerRunId: randomUUID(), outreachRunId: randomUUID(), taskId: randomUUID(), version: 1 as const, model: "mock",
    review, company: input.company, leadScore: input.score, scoreBreakdown: input.scoreBreakdown, researchUncertainties: input.uncertainties, generationSummary: draft.generationSummary } };
  const connection: IntegrationConnection = { id: randomUUID(), workspace_id: workspaceId, provider: "gmail", status: "connected", generation: 1,
    provider_identity: "sender@example.com", display_name: "sender@example.com", scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/gmail.send"],
    connected_by: userId, connected_at: now, disconnected_at: null, updated_at: now };
  const envelope = emailEnvelopeSchema.parse({ schemaVersion: 2, actionType: "send_email", workspaceId, workflowId: input.workflowId, actionId, snapshotId: randomUUID(), revision: 1, lineageId: actionId,
    companyId: input.companyId, leadId: input.leadId, recipient: { email: "test@example.com", name: "Иван Тест", role: null, provenance: "user_supplied", confirmedBy: userId, confirmedAt: now },
    connection: { provider: "gmail", id: connection.id, generation: 1, identity: connection.provider_identity }, subject: "Проверка — Agentic Ops", body: "Тестовое письмо. Только согласованный текст.\n\nСпасибо!", provenance });
  const action: ProposedActionRow = { id: actionId, workspace_id: workspaceId, workflow_id: input.workflowId, approval_id: randomUUID(), action_type: "send_email", risk_level: "medium", status: "approved",
    target: { leadId: input.leadId, companyId: input.companyId, recipientEmail: null, recipientName: null }, payload: { ...provenance, subject: draft.subject, body: draft.body, warnings: [], executionReadiness: "blocked_missing_recipient" },
    dedupe_key: `fixture:${actionId}`, revision: 1, schema_version: 2, executable_envelope: envelope, lineage_id: actionId, replaces_action_id: null, superseded_by_id: null, is_auxiliary: false,
    created_at: now, executed_at: null, error: null };
  const workflow: WorkflowRow = { id: input.workflowId, workspace_id: workspaceId, created_by: userId, title: "Execution fixture", goal: input.goal, status: "ready_for_execution", progress: 80,
    current_step: "Exact approval saved", target_companies: 1, created_at: now, updated_at: now, started_at: now, completed_at: null, failed_at: null };
  const snapshot: ApprovalSnapshot = { id: envelope.snapshotId, workspace_id: workspaceId, workflow_id: input.workflowId, action_id: actionId, revision: 1, schema_version: 2,
    action_type: "send_email", connection_id: connection.id, authorization_generation: 1, envelope, digest: envelopeDigest(envelope), approved_by: userId, approved_at: now };
  return { envelope, action, workflow, snapshot, connection, request: { workspaceId, workflowId: input.workflowId, userId, actionId, expectedSnapshotId: snapshot.id } };
}
export function attemptFixture(fixture: ReturnType<typeof executionFixture>, id: string = randomUUID()): ExecutionAttempt {
  return { id, workspace_id: fixture.action.workspace_id, workflow_id: fixture.workflow.id, action_id: fixture.action.id, snapshot_id: fixture.snapshot.id, connection_id: fixture.connection.id,
    attempt_number: 1, operation_key: id, executor_run_id: randomUUID(), status: "claimed", claimed_at: new Date().toISOString(), dispatched_at: null, completed_at: null,
    lease_until: new Date(Date.now() + 120_000).toISOString(), rfc_message_id: `<${fixture.snapshot.id}@execution.agentic-ops.local>`, result: null, safe_error_code: null,
    retry_eligible: false, next_retry_at: null, duration_ms: null, verification_method: "unresolved", reconciled_by: null, reconciled_at: null, reconciliation_note: null };
}
export function crmFixture(): CrmEnvelope {
  const f = executionFixture();
  return { schemaVersion: 2, actionType: "upsert_crm_contact", workspaceId: f.action.workspace_id, workflowId: f.workflow.id, actionId: randomUUID(), snapshotId: randomUUID(), revision: 1, lineageId: randomUUID(),
    companyId: f.envelope.companyId, leadId: f.envelope.leadId, recipient: f.envelope.recipient, connection: { provider: "hubspot", id: randomUUID(), generation: 1, identity: "1234" },
    contactId: null, patch: { firstname: "Иван", jobtitle: "Operations" }, expected: { firstname: null, jobtitle: null }, previewedAt: new Date().toISOString(), sourceActionId: f.action.id };
}
