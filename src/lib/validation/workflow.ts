import { z } from "zod";

export const newWorkflowSchema = z.object({
  goal: z.string().trim().min(24, "Describe the outcome in at least 24 characters.").max(1000, "Keep the goal under 1,000 characters."),
  targetCompanies: z.number().int().min(1).max(20),
  icpId: z.uuid().optional(),
  templateId: z.uuid().optional(),
}).strict();

export type NewWorkflowInput = z.infer<typeof newWorkflowSchema>;

export const workflowStatusSchema = z.enum([
  "draft", "planning", "running", "waiting_for_approval", "paused",
  "ready_for_execution", "needs_revision", "completed", "failed", "cancelled",
]);

export const taskStatusSchema = z.enum(["pending", "running", "blocked", "completed", "failed", "cancelled"]);
export const recordIdSchema = z.uuid();
