import "server-only";
import { researchRequestSchema, type ResearchRequest } from "@/lib/validation/research";
import { recordIdSchema } from "@/lib/validation/workflow";
import { createRuntimeClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { ResearchRepository, SupabaseResearchCache } from "../repositories/research-repository";
import { AgentEventRepository, AgentRunRepository } from "../repositories/agent-repositories";
import { AgentRunService } from "./agent-run-service";
import { EventService } from "./event-service";
import { AgentRuntime } from "../agents/agent-runtime";
import { ResearchAgent } from "../agents/research-agent";
import { Orchestrator } from "../agents/orchestrator";
import { GeminiProvider } from "../agents/gemini-provider";
import { TavilyProvider } from "../agents/tavily-provider";
import { OutreachRepository } from "../repositories/outreach-repository";
import { ReviewerAgent, OutreachAgent } from "../agents/outreach-agents";

export async function researchWorkflow(workflowId: string, request: ResearchRequest) {
  const id = recordIdSchema.safeParse(workflowId);
  const parsed = researchRequestSchema.safeParse(request);
  if (!id.success || !parsed.success) throw new AppError("validation");
  const { supabase, workspace, user } = await requireWorkspace();
  const workflows = new WorkflowRepository(supabase);
  if (!await workflows.getWorkflowById(workspace.id, id.data)) throw new AppError("not_found");
  const reads = new AgentRunRepository(supabase);
  const admin = createRuntimeClient();
  const repository = new ResearchRepository(admin);
  const analysis = new GeminiProvider();
  const agent = new ResearchAgent(new TavilyProvider(), analysis, new SupabaseResearchCache(admin, workspace.id), undefined, analysis);
  const orchestrator = new Orchestrator({ getWorkflowById: workflows.getWorkflowById.bind(workflows),
    listWorkflowTasks: workflows.listWorkflowTasks.bind(workflows), listWorkspaceRuns: reads.listWorkspaceRuns.bind(reads) },
    new AgentRunService(repository), new EventService(new AgentEventRepository(admin)),
    new AgentRuntime(null, undefined, agent, new ReviewerAgent(analysis), new OutreachAgent(analysis)), repository,
    new OutreachRepository(admin), new AgentRunService(new OutreachRepository(admin)));
  return orchestrator.researchWorkflow({ userId: user.id, workspaceId: workspace.id, workflowId: id.data, retry: parsed.data.retry });
}
