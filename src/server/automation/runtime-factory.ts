import "server-only";
import { getAIProvider } from "../config/env";
import type { ServerSupabase } from "../auth/context";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { ResearchRepository, SupabaseResearchCache } from "../repositories/research-repository";
import { OutreachRepository } from "../repositories/outreach-repository";
import { AgentRunRepository, AgentEventRepository } from "../repositories/agent-repositories";
import { AgentRunService } from "../services/agent-run-service";
import { EventService } from "../services/event-service";
import { AgentRuntime } from "../agents/agent-runtime";
import { Orchestrator } from "../agents/orchestrator";
import { ResearchAgent } from "../agents/research-agent";
import { TavilyProvider } from "../agents/tavily-provider";
import { GeminiProvider, GeminiPlannerProvider } from "../agents/gemini-provider";
import { OpenAIPlannerProvider } from "../agents/openai-planner-provider";
import { PlannerAgent } from "../agents/planner-agent";
import { ReviewerAgent, OutreachAgent } from "../agents/outreach-agents";
import { Executor } from "../execution/executor";
import { ExecutionRepository } from "../repositories/execution-repository";
import { IntegrationRepository } from "../repositories/integration-repository";
import { IntegrationService } from "../services/integration-service";

/** Same orchestrator and checked repositories as HTTP; background callers supply a verified actor. */
export function automationRuntime(db: ServerSupabase, workspaceId: string, stage: "planning" | "research" = "research") {
  const workflows = new WorkflowRepository(db); const runs = new AgentRunRepository(db);
  const research = new ResearchRepository(db); const outreach = new OutreachRepository(db);
  const analysis = new GeminiProvider();
  const researcher = new ResearchAgent(new TavilyProvider(), analysis, new SupabaseResearchCache(db, workspaceId), undefined, analysis);
  return new Orchestrator({ getWorkflowById: workflows.getWorkflowById.bind(workflows), listWorkflowTasks: workflows.listWorkflowTasks.bind(workflows),
    listWorkspaceRuns: runs.listWorkspaceRuns.bind(runs) }, new AgentRunService(stage === "planning" ? runs : research), new EventService(new AgentEventRepository(db)),
    new AgentRuntime(new PlannerAgent(getAIProvider() === "gemini" ? new GeminiPlannerProvider() : new OpenAIPlannerProvider()), undefined,
      researcher, new ReviewerAgent(analysis), new OutreachAgent(analysis)), research, outreach, new AgentRunService(outreach),
    new Executor(new ExecutionRepository(db), new IntegrationService(new IntegrationRepository(db))));
}
