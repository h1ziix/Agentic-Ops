import "server-only";
import { z } from "zod";
import { agentRunRowSchema } from "@/lib/validation/rows";
import { reviewerInputSchema, reviewerOutputSchema, validateReviewerOutput, validateOutreachOutput,
  outreachOutputSchema, proposedEmailActionSchema, type ProposedEmailAction } from "@/lib/validation/outreach";
import type { ServerSupabase } from "../auth/context";
import type { StartRunInput, CompleteRunInput, AgentRunWriter } from "../services/agent-run-service";
import type { PlanWorkflowInput } from "../agents/orchestrator";
import type { PreparationStore } from "../agents/outreach-orchestrator";
import { LeadRepository } from "./entity-repositories";
import { parseDatabaseResult } from "./parse";
import { AppError, fromDatabaseError } from "../errors";

export class OutreachRepository implements AgentRunWriter, PreparationStore {
  constructor(private readonly supabase: ServerSupabase) {}
  listLeads(workspaceId: string, workflowId: string) { return new LeadRepository(this.supabase).listWorkspaceLeads(workspaceId, workflowId); }
  async start(input: StartRunInput) {
    if (!["reviewer", "outreach"].includes(input.agentType) || !input.workflowTaskId) throw new AppError("validation");
    const { data, error } = await this.supabase.rpc("start_preparation_run", { p_run_id: input.runId, p_user_id: input.userId,
      p_workspace_id: input.workspaceId, p_workflow_id: input.workflowId, p_task_id: input.workflowTaskId,
      p_agent_type: input.agentType, p_model: input.model, p_input: input.input });
    if (error) throw fromDatabaseError("start_preparation_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "start_preparation_run");
  }
  async complete(input: CompleteRunInput) {
    if (input.status === "completed") {
      const output = z.object({ reviewInput: reviewerInputSchema, review: reviewerOutputSchema, draft: outreachOutputSchema.optional() }).parse(input.output);
      validateReviewerOutput(output.review, output.reviewInput);
      if (output.draft) validateOutreachOutput(output.draft, output.reviewInput, output.review,
        { name: null, email: null, role: null, companyName: output.reviewInput.company.name });
    }
    const { data, error } = await this.supabase.rpc("complete_preparation_run", { p_run_id: input.runId, p_status: input.status,
      p_output: input.output ?? null, p_error: input.error ?? null, p_metrics: input.metrics });
    if (error) throw fromDatabaseError("complete_preparation_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "complete_preparation_run");
  }
  async finishTask(request: PlanWorkflowInput, taskId: string) {
    const { error } = await this.supabase.rpc("finish_preparation_task", { p_workspace_id: request.workspaceId,
      p_workflow_id: request.workflowId, p_user_id: request.userId, p_task_id: taskId });
    if (error) throw fromDatabaseError("finish_preparation_task", error);
  }
  async publish(request: PlanWorkflowInput, taskId: string, actions: ProposedEmailAction[]) {
    const validated = z.array(proposedEmailActionSchema).max(20).parse(actions);
    const { error } = await this.supabase.rpc("publish_outreach_approval", { p_workspace_id: request.workspaceId,
      p_workflow_id: request.workflowId, p_user_id: request.userId, p_task_id: taskId, p_actions: validated });
    if (error) throw fromDatabaseError("publish_outreach_approval", error);
  }
}
