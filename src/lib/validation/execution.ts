import { z } from "zod";
import { emailActionPayloadSchema } from "./outreach";
import { approvalMessageSchema } from "./approval";

export const singleEmailSchema = z.string().refine((v) => !/[\r\n\x00]/.test(v), "Email must not contain line breaks.").trim().max(254)
  .refine((v) => !/[,;<>\s]/.test(v), "Enter one email address without headers.").pipe(z.email());
const label = z.string().refine((v) => !/[\r\n\x00]/.test(v)).trim().min(1).max(240);
export const contactInputSchema = z.object({ email: singleEmailSchema, name: label.nullable(), role: label.nullable() }).strict();
export const confirmedContactSchema = contactInputSchema.extend({ provenance: z.literal("user_supplied"), confirmedBy: z.uuid(), confirmedAt: z.iso.datetime({ offset: true }) }).strict();
export const providerSchema = z.enum(["gmail", "hubspot"]);
export const connectionRowSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), provider: providerSchema,
  status: z.enum(["connected", "disconnected", "reconnect_required", "blocked"]), generation: z.number().int().positive(),
  provider_identity: z.string().min(1), display_name: z.string(), scopes: z.array(z.string()), connected_by: z.uuid(),
  connected_at: z.string(), disconnected_at: z.string().nullable(), updated_at: z.string() });
export type IntegrationConnection = z.infer<typeof connectionRowSchema>;
const connection = z.object({ id: z.uuid(), generation: z.number().int().positive(), identity: z.string().min(1).max(320) }).strict();
const common = { schemaVersion: z.literal(2), workspaceId: z.uuid(), workflowId: z.uuid(), actionId: z.uuid(),
  snapshotId: z.uuid(), revision: z.number().int().positive(), lineageId: z.uuid() };
export const emailEnvelopeSchema = approvalMessageSchema.extend({ ...common, actionType: z.literal("send_email"), companyId: z.uuid(), leadId: z.uuid(),
  subject: z.string().refine((v) => !/[\r\n\x00]/.test(v), "Keep the subject on one line.").trim().min(1).max(200),
  recipient: confirmedContactSchema, connection: connection.extend({ provider: z.literal("gmail"), identity: singleEmailSchema }).strict(),
  provenance: emailActionPayloadSchema.pick({ generationMetadata: true, evidenceReferences: true, personalization: true }).strict() }).strict();
const property = z.string().trim().min(1).max(240);
export const crmPatchSchema = z.object({ firstname: property.optional(), lastname: property.optional(), jobtitle: property.optional(),
  company: property.optional(), website: z.url({ protocol: /^https?$/ }).max(2048).optional() }).strict().refine((v) => Object.keys(v).length > 0, "Select at least one field change.");
export const crmCurrentSchema = z.object({ firstname: z.string().nullable().optional(), lastname: z.string().nullable().optional(), jobtitle: z.string().nullable().optional(),
  company: z.string().nullable().optional(), website: z.string().nullable().optional() }).strict();
export const crmEnvelopeSchema = z.object({ ...common, actionType: z.literal("upsert_crm_contact"), companyId: z.uuid(), leadId: z.uuid(),
  recipient: confirmedContactSchema, connection: connection.extend({ provider: z.literal("hubspot") }).strict(),
  contactId: z.string().regex(/^\d+$/).nullable(), patch: crmPatchSchema, expected: crmCurrentSchema,
  previewedAt: z.iso.datetime({ offset: true }), sourceActionId: z.uuid() }).strict().superRefine((v, c) => {
  if (Object.keys(v.patch).sort().join() !== Object.keys(v.expected).sort().join()) c.addIssue({ code: "custom", message: "Expected values must cover precisely the changed fields." });
});
export const timezoneSchema = z.string().min(1).max(80).refine((v) => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Choose an IANA timezone.");
export const followUpEnvelopeSchema = z.object({ ...common, actionType: z.literal("schedule_follow_up"), parentAttemptId: z.uuid(), parentActionId: z.uuid(),
  dueAt: z.iso.datetime(), timezone: timezoneSchema, note: z.string().trim().max(2000).nullable() }).strict();
export const executableEnvelopeSchema = z.discriminatedUnion("actionType", [emailEnvelopeSchema, crmEnvelopeSchema, followUpEnvelopeSchema]);
export type ExecutableEnvelope = z.infer<typeof executableEnvelopeSchema>;
export type EmailEnvelope = z.infer<typeof emailEnvelopeSchema>;
export type CrmEnvelope = z.infer<typeof crmEnvelopeSchema>;
export const snapshotRowSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), workflow_id: z.uuid(), action_id: z.uuid(),
  revision: z.number().int(), action_type: z.string(), schema_version: z.literal(2), connection_id: z.uuid().nullable(), authorization_generation: z.number().int().nullable(),
  envelope: executableEnvelopeSchema, digest: z.string().regex(/^[0-9a-f]{64}$/), approved_by: z.uuid(), approved_at: z.string() });
export type ApprovalSnapshot = z.infer<typeof snapshotRowSchema>;
export const attemptStatusSchema = z.enum(["claimed", "dispatching", "succeeded", "failed_retryable", "failed_terminal", "outcome_unknown", "cancelled_before_dispatch"]);
export const verificationSchema = z.enum(["provider_response", "provider_read", "user_confirmed", "internal_transaction", "unresolved", "closed_for_replacement"]);
export const executionResultSchema = z.object({ messageId: z.string().max(240).nullable().optional(), threadId: z.string().max(240).nullable().optional(),
  contactId: z.string().regex(/^\d+$/).nullable().optional(), acceptedAt: z.string().optional() }).strict();
export type ExecutionResult = z.infer<typeof executionResultSchema>;
export const attemptRowSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), workflow_id: z.uuid(), action_id: z.uuid(), snapshot_id: z.uuid(), connection_id: z.uuid().nullable(),
  attempt_number: z.number().int().positive(), operation_key: z.string(), executor_run_id: z.uuid(), status: attemptStatusSchema,
  claimed_at: z.string(), dispatched_at: z.string().nullable(), completed_at: z.string().nullable(), lease_until: z.string(),
  rfc_message_id: z.string().nullable(), result: executionResultSchema.nullable(), safe_error_code: z.string().nullable(), retry_eligible: z.boolean(),
  next_retry_at: z.string().nullable(), duration_ms: z.number().nullable(), verification_method: verificationSchema,
  reconciled_by: z.uuid().nullable(), reconciled_at: z.string().nullable(), reconciliation_note: z.string().nullable() });
export type ExecutionAttempt = z.infer<typeof attemptRowSchema>;
export const followUpRowSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), workflow_id: z.uuid(), action_id: z.uuid(), snapshot_id: z.uuid(), parent_attempt_id: z.uuid(),
  due_at: z.string(), timezone: timezoneSchema, note: z.string().nullable(), status: z.enum(["planned", "cancelled"]), created_at: z.string(), cancelled_at: z.string().nullable() });
export type FollowUpPlan = z.infer<typeof followUpRowSchema>;
export const executeRequestSchema = z.object({ actionId: z.uuid(), expectedSnapshotId: z.uuid(), retry: z.boolean().optional() }).strict();
export const executableEmailEditSchema = contactInputSchema.extend({ actionId: z.uuid(), revision: z.number().int().nonnegative(), connectionId: z.uuid(),
  confirmRecipient: z.literal(true), subject: emailEnvelopeSchema.shape.subject, body: approvalMessageSchema.shape.body }).strict();
export const revisionSelectionSchema = z.array(z.object({ actionId: z.uuid(), revision: z.number().int().nonnegative() }).strict()).min(1).max(20)
  .refine((v) => new Set(v.map((a) => a.actionId)).size === v.length);
export const crmProposalRequestSchema = z.object({ sourceActionId: z.uuid(), connectionId: z.uuid(), patch: crmPatchSchema, expected: crmCurrentSchema,
  connectionGeneration: z.number().int().positive(), connectionIdentity: z.string().min(1),
  contactId: z.string().regex(/^\d+$/).nullable(), previewedAt: z.iso.datetime({ offset: true }), requestId: z.uuid(), revision: z.number().int().nonnegative(), replacesActionId: z.uuid().optional() }).strict();
export const followUpRequestSchema = z.object({ parentAttemptId: z.uuid(), dueAt: z.iso.datetime(), timezone: timezoneSchema, note: z.string().trim().max(2000).nullable(), requestId: z.uuid(), replacesActionId: z.uuid().optional() }).strict();
export const reconciliationRequestSchema = z.object({ attemptId: z.uuid(), resolution: z.enum(["user_confirmed", "not_found", "close_for_replacement", "crm_read"]), note: z.string().trim().min(10).max(2000) }).strict();
export const REQUIRED_SCOPES = { gmail: ["https://www.googleapis.com/auth/gmail.send", "openid", "https://www.googleapis.com/auth/userinfo.email"],
  hubspot: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write"] } as const;
export function hasRequiredScopes(provider: "gmail" | "hubspot", scopes: readonly string[]) {
  const normalized = scopes.map((s) => s === "email" ? "https://www.googleapis.com/auth/userinfo.email" : s);
  return REQUIRED_SCOPES[provider].every((s) => normalized.includes(s));
}
