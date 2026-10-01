"use server";

import { revalidatePath } from "next/cache";
import { newWorkflowSchema } from "@/lib/validation/workflow";
import { createWorkflow, transitionWorkflow } from "@/server/services/workflow-service";
import { AppError } from "@/server/errors";

export type CreateWorkflowResult = { id: string; error?: never } | { id?: never; error: string };

export async function createWorkflowAction(input: unknown): Promise<CreateWorkflowResult> {
  const parsed = newWorkflowSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the workflow details." };
  try {
    const workflow = await createWorkflow(parsed.data);
    revalidatePath("/workflows");
    revalidatePath("/dashboard");
    revalidatePath("/activity");
    return { id: workflow.id };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    console.error("Create workflow action failed", { operation: "create_workflow" });
    return { error: "The workflow could not be saved. Please try again." };
  }
}

export async function resumeWorkflowAction(id: string) {
  try {
    await transitionWorkflow(id, "running", "User resumed workflow for supported preparation tasks.");
    revalidatePath("/workflows/[id]", "page"); revalidatePath("/workflows"); revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: error instanceof AppError ? error.message : "The workflow could not be resumed." }; }
}
