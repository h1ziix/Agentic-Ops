import { plannerTaskContextSchema } from "@/lib/validation/planner";
import { researchOutputSchema, targetProfileSchema, workflowResearchInputSchema, type ResearchOutput } from "@/lib/validation/research";
import { publicWebsiteSchema } from "@/lib/company-identity";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { AgentRunRow, CompanyRow, WorkflowTaskRow } from "@/types/persistence";
import type { AgentRunService } from "../services/agent-run-service";
import type { EventService } from "../services/event-service";
import { AppError } from "../errors";
import type { AgentRuntime } from "./agent-runtime";
import type { PlanningReader, PlanWorkflowInput } from "./orchestrator";
import { getResearchModel } from "./config";
import { researchCompanyLimit, ResearchError } from "./research-budget";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { icpAgentContext } from "@/lib/validation/strategy";

export const researchTaskBehavior = {
  define_target_profile: "profile", discover_companies: "discovery", research_companies: "research",
  identify_opportunities: "opportunities", score_leads: "qualification",
} as const;
export function supportsResearchTask(type: string): type is keyof typeof researchTaskBehavior { return Object.hasOwn(researchTaskBehavior, type); }
export function nextResearchTask(tasks: WorkflowTaskRow[], retry = false) {
  const contexts = new Map(tasks.map((task) => [task.id, plannerTaskContextSchema.parse(task.input)]));
  const keys = new Map(tasks.map((task) => [contexts.get(task.id)!.planTaskId, task]));
  if (keys.size !== tasks.length) throw new AppError("validation", "Task dependency IDs must be unique.");
  for (const task of tasks) {
    for (const dependency of contexts.get(task.id)!.dependencies) {
      const predecessor = keys.get(dependency);
      if (!predecessor || predecessor.position >= task.position) throw new AppError("validation", "The plan contains invalid or cyclic dependencies.");
    }
  }
  return [...tasks].sort((a, b) => a.position - b.position).find((task) => supportsResearchTask(task.type)
    && ["pending", "running", ...(retry ? ["failed"] : [])].includes(task.status)
    && contexts.get(task.id)!.dependencies.every((key) => keys.get(key)?.status === "completed"));
}
export interface ResearchItem { company: CompanyRow; status: "queued" | "researching" | "researched" | "failed" }
export interface ResearchExecutionStore {
  listItems(workspaceId: string, workflowId: string): Promise<ResearchItem[]>;
  listCompanies(workspaceId: string): Promise<CompanyRow[]>;
  finishBoundary(workspaceId: string, workflowId: string, userId: string): Promise<void>;
}
export type ResearchStepResult = { status: "more" | "in_progress" | "research_complete" | "failed"; runId?: string };

/** One bounded unit of the existing Orchestrator; HTTP continuation needs no new queue. */
export async function executeResearchStep(
  request: PlanWorkflowInput & { retry?: boolean }, reader: PlanningReader, runs: AgentRunService,
  events: EventService, runtime: AgentRuntime, store: ResearchExecutionStore,
): Promise<ResearchStepResult> {
  const { workflowId, workspaceId, userId } = request;
  const workflow = await reader.getWorkflowById(workspaceId, workflowId);
  if (!workflow) throw new AppError("not_found");
  const tasks = await reader.listWorkflowTasks(workspaceId, workflowId);
  if (!tasks.length) throw new AppError("invalid_transition", "Planning must complete before research starts.");
  const task = nextResearchTask(tasks, request.retry);
  if (!task) {
    if (tasks.some((item) => supportsResearchTask(item.type) && item.status !== "completed")) {
      if (tasks.some((item) => item.status === "failed")) return { status: "failed" };
      throw new AppError("invalid_transition", "Research is blocked by an incomplete dependency.");
    }
    await store.finishBoundary(workspaceId, workflowId, userId);
    return { status: "research_complete" };
  }
  if (workflow.status !== "running") throw new AppError("invalid_transition", "The workflow must be running to execute research.");
  const [items, existing] = await Promise.all([store.listItems(workspaceId, workflowId), store.listCompanies(workspaceId)]);
  const profileTask = tasks.find((entry) => entry.type === "define_target_profile" && entry.status === "completed");
  const profile = profileTask ? targetProfileSchema.parse(profileTask.output && typeof profileTask.output === "object" && "profile" in profileTask.output ? profileTask.output.profile : null) : null;
  const context = plannerTaskContextSchema.parse(task.input);
  const input = workflowResearchInputSchema.parse({ workflowId, taskId: task.id, goal: workflow.goal,
    icpContext: icpAgentContext(workflow.icp_snapshot),
    requestedCompanyCount: researchCompanyLimit(workflow.target_companies),
    plannerContext: { objective: context.objective, expectedOutput: context.expectedOutput },
    existingCompanies: existing.filter((company) => !company.website || publicWebsiteSchema.safeParse(company.website).success)
      .slice(0, 1000).map((company) => ({ name: company.name, website: company.website })),
  });
  const candidate = task.type === "research_companies" ? items.find((item) => item.status === "queued" || item.status === "researching" || (request.retry && item.status === "failed")) : undefined;
  const workKey = candidate ? candidate.company.id : task.type;
  const runId = randomUUID();
  const model = getResearchModel();
  const run = await runs.start({ userId, workspaceId, workflowId, workflowTaskId: task.id, runId, agentType: "researcher", model,
    input: { goal: input.goal, requestedCompanyCount: input.requestedCompanyCount, workKey, retry: request.retry ?? false,
      companyId: candidate?.company.id ?? null, version: 4 } });
  if (run.id !== runId) return { status: run.status === "completed" ? "more" : "in_progress", runId: run.id };
  const started = Date.now();
  const metrics: AgentMetrics = { durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null, outputTokens: null, totalTokens: null };
  const record = async (eventType: Parameters<EventService["record"]>[0]["eventType"], summary: string, metadata: Record<string, string | number>) => {
    await events.record({ workspaceId, workflowId, workflowTaskId: task.id, agentRunId: run.id, eventType, summary, metadata });
  };
  try {
    let output: z.infer<ReturnType<typeof z.json>>;
    switch (task.type) {
      case "define_target_profile": output = { kind: task.type, profile: await runtime.researchProfile(input, model, record, metrics) }; break;
      case "discover_companies": {
        if (!profile) throw new AppError("validation", "The target profile is missing.");
        output = { kind: task.type, ...await runtime.discoverCompanies(input, profile, model, record, metrics) }; break;
      }
      case "research_companies": {
        if (!profile) throw new AppError("validation", "The target profile is missing.");
        if (!candidate) { output = { kind: task.type, exhausted: true }; break; }
        await record("company_research_started", `Analyzing ${candidate.company.name}`, { company_id: candidate.company.id });
        const result = await runtime.research({ name: candidate.company.name, website: candidate.company.website, goal: workflow.goal,
          icp: profile.icp, location: profile.location, icpContext: input.icpContext }, model, record, metrics);
        output = { kind: task.type, companyId: candidate.company.id, result }; break;
      }
      case "identify_opportunities":
      case "score_leads": {
        // Company analysis was validated before saving; scoring consolidates actual persisted evidence.
        const history = await reader.listWorkspaceRuns(workspaceId, workflowId);
        const researched = new Map<string, ResearchOutput>();
        for (const completed of [...history].reverse()) {
          if (completed.status !== "completed" || completed.agent_type !== "researcher") continue;
          const saved = completed.output as { result?: unknown; companyId?: unknown } | null;
          const result = researchOutputSchema.safeParse(saved?.result);
          if (result.success && typeof saved?.companyId === "string") researched.set(saved.companyId, result.data);
        }
        output = { kind: task.type, companyIds: [...researched.keys()], summary: `${researched.size} evidence-backed company assessments ready for qualification.` };
        if (!researched.size) throw new AppError("ai_invalid_output", "No company produced sufficient research evidence. Retry the failed research items.");
        break;
      }
      default: throw new AppError("validation", "This task is outside Stage 4.");
    }
    metrics.durationMs = Date.now() - started;
    const completed = await runs.complete({ runId: run.id, status: "completed", output, metrics });
    if (completed.status !== "completed") throw new AppError("invalid_transition", "Research was interrupted. Refresh to view its saved state.");
    return { status: "more", runId: run.id };
  } catch (error) {
    metrics.durationMs = Date.now() - started;
    const safe = error instanceof AppError ? { code: error.code, message: error.message } : { code: "ai_invalid_output", message: "Research output did not pass validation. Retry after reviewing the trace." };
    const isolated = Boolean(candidate && error instanceof ResearchError && ["ai_invalid_output", "ai_unavailable", "ai_timeout", "validation"].includes(error.code));
    const completed: AgentRunRow = await runs.complete({ runId: run.id, status: "failed", error: { ...safe, isolated }, metrics });
    if (completed.status === "cancelled") throw new AppError("invalid_transition", "Research was interrupted by a workflow status change.");
    if (isolated) return { status: "more", runId: run.id };
    throw new AppError(error instanceof AppError ? error.code : "ai_invalid_output", safe.message);
  }
}
