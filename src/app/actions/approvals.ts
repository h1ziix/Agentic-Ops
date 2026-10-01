"use server";

import { revalidatePath } from "next/cache";
import { approvalDecisionSchema } from "@/lib/validation/rows";
import { actionContentEditsSchema } from "@/lib/validation/approval";
import { recordIdSchema } from "@/lib/validation/workflow";
import { resolveApproval, saveApprovalDraft, saveExecutableEmail } from "@/server/services/approval-service";
import { AppError } from "@/server/errors";

export type ResolveApprovalResult = { ok: true; error?: never } | { ok: false; error: string };

export async function resolveApprovalAction(id: unknown, decision: unknown, edits: unknown = [], actionIds?: unknown, expectedRevisions?: unknown): Promise<ResolveApprovalResult> {
  const approvalId = recordIdSchema.safeParse(id);
  const next = approvalDecisionSchema.safeParse(decision);
  const contentEdits = actionContentEditsSchema.safeParse(edits);
  if (!approvalId.success || !next.success || !contentEdits.success) {
    return { ok: false, error: contentEdits.success ? "The approval request is invalid." : contentEdits.error.issues[0]?.message ?? "Check edited messages." };
  }
  try {
    await resolveApproval(approvalId.data, next.data, contentEdits.data, actionIds, expectedRevisions);
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
    revalidatePath("/activity");
    revalidatePath("/workflows");
    revalidatePath("/leads");
    revalidatePath("/workflows/[id]", "page");
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    console.error("Approval action failed", { operation: "resolve_approval" });
    return { ok: false, error: "The decision could not be saved. Please try again." };
  }
}

export async function saveExecutableEmailAction(input: unknown): Promise<{ ok: true; actionId: string; approvalId: string } | { ok: false; error: string }> {
  try {
    const action = await saveExecutableEmail(input);
    revalidatePath("/", "layout");
    return { ok: true, actionId: action.id, approvalId: action.approval_id };
  } catch (e) { return { ok: false, error: e instanceof AppError ? e.message : "Check recipient, sender and content. Refresh before saving again." }; }
}

export async function saveApprovalDraftAction(input: unknown): Promise<ResolveApprovalResult> {
  try {
    await saveApprovalDraft(input);
    revalidatePath("/approvals"); revalidatePath("/activity"); revalidatePath("/leads");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof AppError ? error.message : "The draft could not be saved. Refresh and try again." };
  }
}
