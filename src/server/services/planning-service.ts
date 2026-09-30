import "server-only";
import { recordIdSchema } from "@/lib/validation/workflow";
import { createRuntimeClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { AgentEventRepository, AgentRunRepository } from "../repositories/agent-repositories";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { AgentRunService } from "./agent-run-service";
import { EventService } from "./event-service";
import { AgentRuntime } from "../agents/agent-runtime";
import { Orchestrator } from "../agents/orchestrator";
import { PlannerAgent } from "../agents/planner-agent";
import { OpenAIPlannerProvider } from "../agents/openai-planner-provider";
import { GeminiPlannerProvider } from "../agents/gemini-provider";

/** Request boundary. A future job runner can invoke the same orchestrator with verified context. */
export async function planWorkflow(workflowId: string) {
  const id = recordIdSchema.safeParse(workflowId);
  if (!id.success) throw new AppError("validation");
  const { supabase, workspace, user } = await requireWorkspace();
  const workflows = new WorkflowRepository(supabase);
  if (!await workflows.getWorkflowById(workspace.id, id.data)) throw new AppError("not_found");
  const reads = new AgentRunRepository(supabase);
  const admin = createRuntimeClient();
  const orchestrator = new Orchestrator({
    getWorkflowById: workflows.getWorkflowById.bind(workflows),
    listWorkflowTasks: workflows.listWorkflowTasks.bind(workflows),
    listWorkspaceRuns: reads.listWorkspaceRuns.bind(reads),
  }, new AgentRunService(new AgentRunRepository(admin)), new EventService(new AgentEventRepository(admin)),
  new AgentRuntime(new PlannerAgent(process.env.AI_PROVIDER?.trim() === "gemini" ? new GeminiPlannerProvider() : new OpenAIPlannerProvider())));
  return orchestrator.planWorkflow({ workflowId: id.data, workspaceId: workspace.id, userId: user.id });
}
