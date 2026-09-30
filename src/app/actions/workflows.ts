"use server";

import { revalidatePath } from "next/cache";
import { newWorkflowSchema } from "@/lib/validation/workflow";
import { createWorkflow } from "@/server/services/workflow-service";
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
