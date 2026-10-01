import { z } from "zod";

export const approvalMessageSchema = z.object({
  subject: z.string().trim().min(1, "Add a subject before saving.").max(200, "Keep the subject under 200 characters.").refine((value) => !/[\r\n]/.test(value), "Keep the subject on one line."),
  body: z.string().trim().min(10, "Add a message of at least 10 characters.").max(10_000, "Keep the message under 10,000 characters."),
});

export const actionContentEditSchema = approvalMessageSchema.extend({ actionId: z.uuid() });

export const actionContentEditsSchema = z.array(actionContentEditSchema).max(100).superRefine((edits, context) => {
  if (new TextEncoder().encode(JSON.stringify(edits)).byteLength > 900_000) {
    context.addIssue({ code: "custom", message: "This batch of edited messages is too large to save at once." });
  }
  const ids = new Set<string>();
  for (const [index, edit] of edits.entries()) {
    if (ids.has(edit.actionId)) {
      context.addIssue({ code: "custom", path: [index, "actionId"], message: "A proposed action was edited more than once." });
    }
    ids.add(edit.actionId);
  }
});

export type ActionContentEdit = z.infer<typeof actionContentEditSchema>;

export const saveActionEditSchema = actionContentEditSchema.extend({ revision: z.number().int().nonnegative() }).strict();
export const actionSelectionSchema = z.array(z.uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Select each action once.");
