import "server-only";
import { researchRequestSchema, type ResearchRequest } from "@/lib/validation/research";
import { recordIdSchema } from "@/lib/validation/workflow";
import { createRuntimeClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { ResearchRepository, SupabaseResearchCache } from "../repositories/research-repository";
import { AgentEventRepository } from "../repositories/agent-repositories";
import { AgentRunService } from "./agent-run-service";
import { EventService } from "./event-service";
import { AgentRuntime } from "../agents/agent-runtime";
import { ResearchAgent } from "../agents/research-agent";
import { ResearchOrchestrator } from "../agents/research-orchestrator";
import { GeminiProvider } from "../agents/gemini-provider";
import { TavilyProvider } from "../agents/tavily-provider";
import { getResearchModel } from "../agents/config";

export async function researchCompany(workflowId: string, request: ResearchRequest) {
  const id = recordIdSchema.safeParse(workflowId);
  const parsed = researchRequestSchema.safeParse(request);
  if (!id.success || !parsed.success) throw new AppError("validation");
  const { supabase, workspace, user } = await requireWorkspace();
  const workflow = await new WorkflowRepository(supabase).getWorkflowById(workspace.id, id.data);
  if (!workflow) throw new AppError("not_found");
  const company = parsed.data.companyId ? await new ResearchRepository(supabase).getCompany(workspace.id, parsed.data.companyId) : null;
  if (parsed.data.companyId && !company) throw new AppError("not_found");
  if (company?.workflow_id && company.workflow_id !== workflow.id) throw new AppError("validation", "The company belongs to another workflow.");
  const website = company?.website ?? parsed.data.website;
  const name = company?.name ?? parsed.data.name;
  if (!website || !name) throw new AppError("validation", "The company needs a public website before research.");
  const admin = createRuntimeClient();
  const agent = new ResearchAgent(new TavilyProvider(), new GeminiProvider(), new SupabaseResearchCache(admin, workspace.id));
  const orchestrator = new ResearchOrchestrator(new AgentRunService(new ResearchRepository(admin)),
    new EventService(new AgentEventRepository(admin)), new AgentRuntime(null, undefined, agent));
  return orchestrator.researchCompany({ userId: user.id, workspaceId: workspace.id, workflowId: workflow.id, companyId: company?.id },
    { name, website, goal: workflow.goal, icp: parsed.data.icp ?? { description: workflow.goal,
      offering: "Agentic Ops: evidence-based AI sales research and personalized outreach with human approval." } }, getResearchModel());
}
