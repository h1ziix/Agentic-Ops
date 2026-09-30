import { z } from "zod";
import { actionContentEditsSchema } from "@/lib/validation/approval";
import { approvalDecisionSchema } from "@/lib/validation/rows";
import { recordIdSchema } from "@/lib/validation/workflow";
import type { ApprovalRow } from "@/types/persistence";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { ApprovalRepository } from "../repositories/approval-repository";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { assertApprovalDecision } from "../state/workflow";

const actionSchema = z.object({
  action_type: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  target: z.record(z.string(), z.json()),
  payload: z.record(z.string(), z.json()),
  risk_level: z.enum(["low", "medium", "high"]).optional(),
});

const requestApprovalSchema = z.object({
  workflowId: recordIdSchema,
  type: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000),
  riskLevel: z.enum(["low", "medium", "high"]),
  actions: z.array(actionSchema).min(1).max(100),
});

export type RequestApprovalInput = z.infer<typeof requestApprovalSchema>;

/** Creates a review request and proposed actions; no external execution occurs. */
export async function requestApproval(input: RequestApprovalInput): Promise<ApprovalRow> {
  const parsed = requestApprovalSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const workflow = await new WorkflowRepository(supabase).getWorkflowById(workspace.id, parsed.data.workflowId);
  if (!workflow) throw new AppError("not_found");
  const repository = new ApprovalRepository(supabase);
  const id = await repository.requestApproval({
    workspaceId: workspace.id,
    workflowId: workflow.id,
    type: parsed.data.type,
    title: parsed.data.title,
    description: parsed.data.description,
    riskLevel: parsed.data.riskLevel,
    actions: parsed.data.actions,
  });
  const approval = await repository.getApprovalById(workspace.id, id);
  if (!approval) throw new AppError("database");
  return approval;
}

/** Approval is an authorization decision; executor work remains a later stage. */
export async function resolveApproval(approvalId: string, decision: unknown, edits: unknown = []): Promise<ApprovalRow> {
  const id = recordIdSchema.safeParse(approvalId);
  const parsedDecision = approvalDecisionSchema.safeParse(decision);
  const parsedEdits = actionContentEditsSchema.safeParse(edits);
  if (!id.success || !parsedDecision.success || !parsedEdits.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const repository = new ApprovalRepository(supabase);
  const current = await repository.getApprovalById(workspace.id, id.data);
  if (!current) throw new AppError("not_found");
  assertApprovalDecision(current.status, parsedDecision.data);
  return repository.resolveApproval(id.data, parsedDecision.data, parsedEdits.data);
}
