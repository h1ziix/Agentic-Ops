"use server";
import { revalidatePath } from "next/cache";
import { previewCrm, proposeCrm, proposeFollowUp, cancelFollowUp } from "@/server/services/execution-service";
import { AppError } from "@/server/errors";
import { z } from "zod";
const safeError = (e: unknown) => e instanceof AppError ? e.message : e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the supplied fields." : "Integration could not be checked. Refresh and try again.";
export async function previewCrmAction(input: unknown) {
  try { return { ok: true as const, preview: await previewCrm(input) }; } catch (e) { return { ok: false as const, error: safeError(e) }; }
}
export async function proposeCrmAction(input: unknown) {
  try { await proposeCrm(input); revalidatePath("/", "layout"); return { ok: true as const }; } catch (e) { return { ok: false as const, error: safeError(e) }; }
}
export async function proposeFollowUpAction(input: unknown) {
  try { await proposeFollowUp(input); revalidatePath("/", "layout"); return { ok: true as const }; } catch (e) { return { ok: false as const, error: safeError(e) }; }
}
export async function cancelFollowUpAction(input: unknown) {
  try { await cancelFollowUp(input); revalidatePath("/", "layout"); return { ok: true as const }; } catch (e) { return { ok: false as const, error: safeError(e) }; }
}
