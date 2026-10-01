import "server-only";
import { z } from "zod";
import { createRuntimeClient } from "@/lib/supabase/admin";
import { crmProposalRequestSchema, executeRequestSchema, followUpRequestSchema, reconciliationRequestSchema, emailEnvelopeSchema, crmEnvelopeSchema } from "@/lib/validation/execution";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { ExecutionRepository } from "../repositories/execution-repository";
import { IntegrationRepository } from "../repositories/integration-repository";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { AgentRunRepository, AgentEventRepository } from "../repositories/agent-repositories";
import { ApprovalRepository } from "../repositories/approval-repository";
import { AgentRunService } from "./agent-run-service";
import { EventService } from "./event-service";
import { IntegrationService } from "./integration-service";
import { Executor } from "../execution/executor";
import { Orchestrator } from "../agents/orchestrator";
import { AgentRuntime } from "../agents/agent-runtime";
import { HubSpotAdapter } from "../integrations/hubspot";
import { envelopeDigest } from "../execution/digest";
export async function executeAction(workflowId: string, input: unknown) {
  const request = executeRequestSchema.parse(input); const id = z.uuid().parse(workflowId);
  const context = await requireWorkspace();
  const workflows = new WorkflowRepository(context.supabase);
  if (!await workflows.getWorkflowById(context.workspace.id, id)) throw new AppError("not_found");
  const admin = createRuntimeClient(); const runs = new AgentRunRepository(admin); const repository = new ExecutionRepository(admin);
  const executor = new Executor(repository, new IntegrationService(new IntegrationRepository(admin)));
  const orchestrator = new Orchestrator({ getWorkflowById: workflows.getWorkflowById.bind(workflows), listWorkflowTasks: workflows.listWorkflowTasks.bind(workflows),
    listWorkspaceRuns: runs.listWorkspaceRuns.bind(runs) }, new AgentRunService(runs), new EventService(new AgentEventRepository(admin)), new AgentRuntime(null), undefined, undefined, undefined, executor);
  return orchestrator.executeAction({ ...request, workspaceId: context.workspace.id, userId: context.user.id, workflowId: id });
}
export async function recoverExecution(workflowId: string) {
  const id = z.uuid().parse(workflowId); const context = await requireWorkspace();
  if (!await new WorkflowRepository(context.supabase).getWorkflowById(context.workspace.id, id)) throw new AppError("not_found");
  await new ExecutionRepository(createRuntimeClient()).recover({ workspaceId: context.workspace.id, userId: context.user.id, workflowId: id });
  return { recovered: true };
}
async function crmSource(actionId: string, connectionId: string) {
  const context = await requireWorkspace();
  const action = (await new ApprovalRepository(context.supabase).listWorkspaceProposedActions(context.workspace.id)).find((a) => a.id === actionId);
  if (!action || action.superseded_by_id || ["rejected", "cancelled"].includes(action.status)) throw new AppError("not_found");
  const envelope = emailEnvelopeSchema.parse(action.executable_envelope);
  const connection = (await new IntegrationRepository(context.supabase).list(context.workspace.id)).find((c) => c.id === connectionId && c.provider === "hubspot" && c.status === "connected");
  if (!connection) throw new AppError("execution_blocked", "Connect HubSpot before previewing contact changes.");
  const admin = createRuntimeClient(); const credentials = new IntegrationService(new IntegrationRepository(admin));
  const token = await credentials.accessToken(connection, context.user.id);
  const current = await new HubSpotAdapter().lookup(envelope.recipient.email, token);
  return { context, action, envelope, connection, current };
}
export async function previewCrm(input: unknown) {
  const parsed = z.object({ actionId: z.uuid(), connectionId: z.uuid() }).strict().parse(input);
  const { action, envelope, connection, current } = await crmSource(parsed.actionId, parsed.connectionId);
  return { actionId: action.id, revision: action.revision, recipient: envelope.recipient.email, contactId: current?.id ?? null,
    properties: current?.properties ?? {}, previewedAt: new Date().toISOString(), connection: { id: connection.id, identity: connection.provider_identity, generation: connection.generation, displayName: connection.display_name },
    supportedCompany: envelope.provenance.generationMetadata.company.name, supportedWebsite: envelope.provenance.generationMetadata.company.website };
}
export async function proposeCrm(input: unknown) {
  const request = crmProposalRequestSchema.parse(input); const { context, action, connection, current } = await crmSource(request.sourceActionId, request.connectionId);
  if (action.revision !== request.revision || connection.generation !== request.connectionGeneration || connection.provider_identity !== request.connectionIdentity || (current?.id ?? null) !== request.contactId
    || Object.entries(request.expected).some(([k, v]) => (current?.properties[k] || null) !== (v || null))) throw new AppError("conflict", "CRM preview changed. Load a fresh preview before proposing changes.");
  return new ExecutionRepository(context.supabase).rpc("propose_crm_contact", { p_source: request.sourceActionId, p_revision: request.revision, p_connection: request.connectionId,
    p_patch: request.patch, p_expected: request.expected, p_contact_id: request.contactId, p_previewed_at: request.previewedAt, p_request: request.requestId, p_replaces: request.replacesActionId ?? null });
}
export async function proposeFollowUp(input: unknown) {
  const request = followUpRequestSchema.parse(input); const context = await requireWorkspace();
  return new ExecutionRepository(context.supabase).rpc("propose_follow_up", { p_parent: request.parentAttemptId, p_due: request.dueAt, p_timezone: request.timezone,
    p_note: request.note, p_request: request.requestId, p_replaces: request.replacesActionId ?? null });
}
export async function cancelFollowUp(input: unknown) {
  const id = z.uuid().parse(input); const context = await requireWorkspace();
  await new ExecutionRepository(context.supabase).rpc("cancel_follow_up", { p_plan: id });
}
export async function reconcileExecution(workflowId: string, input: unknown) {
  const request = reconciliationRequestSchema.parse(input); const context = await requireWorkspace(); const workflow = z.uuid().parse(workflowId);
  const data = await new ExecutionRepository(context.supabase).list(context.workspace.id, workflow);
  const attempt = data.executionAttempts.find((t) => t.id === request.attemptId);
  if (!attempt || attempt.status !== "outcome_unknown") throw new AppError("execution_blocked");
  if (request.resolution !== "crm_read") return new ExecutionRepository(context.supabase).rpc("reconcile_email_outcome", { p_attempt: request.attemptId, p_resolution: request.resolution, p_note: request.note });
  const snapshot = data.actionSnapshots.find((s) => s.id === attempt.snapshot_id);
  const envelope = crmEnvelopeSchema.parse(snapshot?.envelope);
  if (snapshot?.digest !== envelopeDigest(envelope)) throw new AppError("conflict");
  const connection = (await new IntegrationRepository(context.supabase).list(context.workspace.id)).find((c) => c.id === envelope.connection.id && c.generation === envelope.connection.generation && c.provider_identity === envelope.connection.identity);
  if (!connection || connection.status !== "connected") throw new AppError("execution_blocked");
  const admin = createRuntimeClient(); const token = await new IntegrationService(new IntegrationRepository(admin)).accessToken(connection, context.user.id);
  const result = await new HubSpotAdapter().reconcile(envelope, token);
  if (!result) throw new AppError("execution_blocked", "Read-only CRM reconciliation did not establish the exact approved result. Uncertainty remains; no write was performed.");
  const claim = await admin.from("execution_attempts").select("claim_token").eq("id", attempt.id).eq("workspace_id", context.workspace.id).single();
  if (claim.error) throw new AppError("database");
  return new ExecutionRepository(admin).rpc("reconcile_crm_outcome", { p_workspace: context.workspace.id, p_actor: context.user.id, p_attempt: attempt.id,
    p_claim: z.uuid().parse(claim.data.claim_token), p_result: result, p_note: request.note });
}
