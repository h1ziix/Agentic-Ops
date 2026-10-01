import { actionContentEditsSchema, actionSelectionSchema, saveActionEditSchema } from "@/lib/validation/approval";
import { approvalDecisionSchema } from "@/lib/validation/rows";
import { recordIdSchema } from "@/lib/validation/workflow";
import type { ApprovalRow } from "@/types/persistence";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { ApprovalRepository } from "../repositories/approval-repository";
import { assertApprovalDecision } from "../state/workflow";

/** Approval is an authorization decision; executor work remains a later stage. */
export async function resolveApproval(approvalId: string, decision: unknown, edits: unknown = [], actionIds?: unknown): Promise<ApprovalRow> {
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
  return repository.resolveApproval(id.data, parsedDecision.data, parsedEdits.data, selection?.data);
}

export async function saveApprovalDraft(input: unknown) {
  const parsed = saveActionEditSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation");
  const { supabase } = await requireWorkspace();
  return new ApprovalRepository(supabase).editAction(parsed.data.actionId, parsed.data.subject, parsed.data.body, parsed.data.revision);
}
