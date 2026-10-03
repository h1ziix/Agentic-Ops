import { actionContentEditsSchema, actionSelectionSchema, saveActionEditSchema } from "@/lib/validation/approval";
import { approvalDecisionSchema } from "@/lib/validation/rows";
import { recordIdSchema } from "@/lib/validation/workflow";
import type { ApprovalRow } from "@/types/persistence";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { ApprovalRepository } from "../repositories/approval-repository";
import { assertApprovalDecision } from "../state/workflow";
import { executableEmailEditSchema, revisionSelectionSchema, executableEnvelopeSchema } from "@/lib/validation/execution";
import { emailActionPayloadSchema } from "@/lib/validation/outreach";

/** Approval never invokes an integration transport. */
export async function resolveApproval(approvalId: string, decision: unknown, edits: unknown = [], actionIds?: unknown, expectedRevisions?: unknown): Promise<ApprovalRow> {
  const id = recordIdSchema.safeParse(approvalId);
  const parsedDecision = approvalDecisionSchema.safeParse(decision);
  const parsedEdits = actionContentEditsSchema.safeParse(edits);
  const selection = actionIds === undefined ? undefined : actionSelectionSchema.safeParse(actionIds);
  if (!id.success || !parsedDecision.success || !parsedEdits.success || selection?.success === false) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const repository = new ApprovalRepository(supabase);
  const current = await repository.getApprovalById(workspace.id, id.data);
  if (!current) throw new AppError("not_found");
  assertApprovalDecision(current.status, parsedDecision.data);
  if (expectedRevisions !== undefined) {
    const revisions = revisionSelectionSchema.parse(expectedRevisions);
    const actions = await repository.listWorkspaceProposedActions(workspace.id, current.workflow_id);
    for (const item of revisions) {
      const action = actions.find((a) => a.id === item.actionId && a.approval_id === current.id);
      if (!action || action.revision !== item.revision) throw new AppError("conflict");
      if (parsedDecision.data === "approved" && action.schema_version === 2) executableEnvelopeSchema.parse(action.executable_envelope);
    }
    return repository.decideRevisions(current.id, parsedDecision.data, revisions);
  }
  return repository.resolveApproval(id.data, parsedDecision.data, parsedEdits.data, selection?.data);
}

export async function saveExecutableEmail(input: unknown) {
  const edit = executableEmailEditSchema.parse(input);
  const { supabase, workspace } = await requireWorkspace(); const repository = new ApprovalRepository(supabase);
  const original = await repository.getProposedActionById(workspace.id, edit.actionId);
  if (!original) throw new AppError("not_found");
  // Historical loose JSON remains readable but cannot acquire execution rights.
  if (!emailActionPayloadSchema.safeParse(original.payload).success) throw new AppError("execution_blocked", "This historical proposal has no valid grounded provenance. Prepare a new draft.");
  return repository.saveExecutableEmail(edit);
}

export async function saveApprovalDraft(input: unknown) {
  const parsed = saveActionEditSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation");
  const { supabase } = await requireWorkspace();
  return new ApprovalRepository(supabase).editAction(parsed.data.actionId, parsed.data.subject, parsed.data.body, parsed.data.revision);
}
