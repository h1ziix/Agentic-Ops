"use server";

import { revalidatePath } from "next/cache";
import { approvalDecisionSchema } from "@/lib/validation/rows";
import { actionContentEditsSchema } from "@/lib/validation/approval";
import { recordIdSchema } from "@/lib/validation/workflow";
import { resolveApproval } from "@/server/services/approval-service";
import { AppError } from "@/server/errors";

export type ResolveApprovalResult = { ok: true; error?: never } | { ok: false; error: string };

export async function resolveApprovalAction(id: unknown, decision: unknown, edits: unknown = []): Promise<ResolveApprovalResult> {
  const approvalId = recordIdSchema.safeParse(id);
  const next = approvalDecisionSchema.safeParse(decision);
  const contentEdits = actionContentEditsSchema.safeParse(edits);
  if (!approvalId.success || !next.success || !contentEdits.success) {
    return { ok: false, error: contentEdits.success ? "The approval request is invalid." : contentEdits.error.issues[0]?.message ?? "Check edited messages." };
  }
  try {
    await resolveApproval(approvalId.data, next.data, contentEdits.data);
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
    revalidatePath("/activity");
    revalidatePath("/workflows");
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    console.error("Approval action failed", { operation: "resolve_approval" });
    return { ok: false, error: "The decision could not be saved. Please try again." };
  }
}
