import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentMetrics } from "@/lib/validation/agent";
import { mapPlannerTasks, validatedPlannerOutputSchema, type PlannerInput } from "@/lib/validation/planner";
import type { AgentRunRow, WorkflowRow, WorkflowTaskRow } from "@/types/persistence";
import { AppError } from "../errors";
import { AgentRunService } from "../services/agent-run-service";
import { EventService } from "../services/event-service";
import { assertWorkflowTransition } from "../state/workflow";
import { AgentRuntime } from "./agent-runtime";
import { getPlannerModel } from "./config";
import { safePlanningError } from "./errors";
import { PLANNER_PROMPT_VERSION } from "./planner-prompt";
import { executeResearchStep, type ResearchExecutionStore } from "./research-orchestrator";
import { executePreparationStep, type PreparationStore } from "./outreach-orchestrator";
import type { Executor, ExecuteContext } from "../execution/executor";
import { icpAgentContext } from "@/lib/validation/strategy";

export interface PlanningReader {
  getWorkflowById(workspaceId: string, workflowId: string): Promise<WorkflowRow | null>;
  listWorkflowTasks(workspaceId: string, workflowId: string): Promise<WorkflowTaskRow[]>;
  listWorkspaceRuns(workspaceId: string, workflowId: string): Promise<AgentRunRow[]>;
}

const requestSchema = z.object({ workflowId: z.uuid(), workspaceId: z.uuid(), userId: z.uuid() }).strict();
export type PlanWorkflowInput = z.infer<typeof requestSchema>;
export type PlanningResult = { status: "completed" | "in_progress"; runId: string };

/** Owns execution state. Database writers repeat guards under the existing row lock. */
export class Orchestrator {
  constructor(
    private readonly reader: PlanningReader,
    private readonly runs: AgentRunService,
    private readonly events: EventService,
    private readonly runtime: AgentRuntime,
    private readonly researchStore?: ResearchExecutionStore,
    private readonly preparationStore?: PreparationStore,
    private readonly preparationRuns?: AgentRunService,
    private readonly executor?: Executor,
  ) {}

  async executeAction(request: ExecuteContext) {
    requestSchema.parse({ workflowId: request.workflowId, workspaceId: request.workspaceId, userId: request.userId });
    if (!this.executor) throw new AppError("execution_blocked");
    return this.executor.execute(request);
  }

  async researchWorkflow(request: PlanWorkflowInput & { retry?: boolean }) {
    if (!requestSchema.safeParse({ workflowId: request.workflowId, workspaceId: request.workspaceId, userId: request.userId }).success) throw new AppError("validation");
    if (!this.researchStore) throw new AppError("ai_configuration");
    const result = await executeResearchStep(request, this.reader, this.runs, this.events, this.runtime, this.researchStore);
    if (result.status === "research_complete" && this.preparationStore && this.preparationRuns) {
      return executePreparationStep(request, this.reader, this.preparationRuns, this.events, this.runtime, this.preparationStore);
    }
    return result;
  }

  async planWorkflow(request: PlanWorkflowInput): Promise<PlanningResult> {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) throw new AppError("validation");
    const { workflowId, workspaceId, userId } = parsed.data;
    const workflow = await this.reader.getWorkflowById(workspaceId, workflowId);
    if (!workflow) throw new AppError("not_found");
    const [tasks, history] = await Promise.all([
      this.reader.listWorkflowTasks(workspaceId, workflowId), this.reader.listWorkspaceRuns(workspaceId, workflowId),
    ]);
    const successful = history.find((run) => run.agent_type === "planner" && run.status === "completed");
    if (successful) {
      const plan = validatedPlannerOutputSchema.safeParse(successful.output);
      const plannedTasks = tasks.filter((task) => !(typeof task.input === "object" && task.input !== null && "runtimeAdded" in task.input && task.input.runtimeAdded === true));
      if (!plan.success || plannedTasks.length !== plan.data.tasks.length || mapPlannerTasks(plan.data).some((planned) => !plannedTasks.some((task) => {
        const input = task.input;
        return task.type === planned.type && typeof input === "object" && input !== null
          && "planTaskId" in input && input.planTaskId === planned.input.planTaskId;
      }))) throw new AppError("database", "The saved plan is incomplete. Please contact your workspace administrator.");
      return { status: "completed", runId: successful.id };
    }
    if (tasks.length) throw new AppError("invalid_transition", "This workflow already has tasks. Create a new workflow to generate an AI plan.");
    // Failed -> planning is allowed only for a failed Planner with no persisted tasks.
    if (workflow.status === "failed") {
      if (!history.some((run) => run.agent_type === "planner" && run.status === "failed")) throw new AppError("invalid_transition");
    } else if (workflow.status !== "planning") {
      assertWorkflowTransition(workflow.status, "planning");
    }

    const savedIcp = icpAgentContext(workflow.icp_snapshot);
    const input: PlannerInput = {
      goal: workflow.goal,
      targetMarket: null,
      location: null,
      requestedLeadCount: workflow.target_companies,
      context: { title: workflow.title, approvalRequired: true,
        ...(savedIcp ? { icp: savedIcp } : {}),
        ...(workflow.template_snapshot ? { template: { name: workflow.template_snapshot.name, category: workflow.template_snapshot.category,
          taskStrategy: workflow.template_snapshot.task_strategy, followupEnabled: workflow.template_snapshot.followup_enabled } } : {}),
      },
    };
    const model = getPlannerModel();
    const runId = randomUUID();
    const run = await this.runs.start({ runId, userId, workspaceId, workflowId, agentType: "planner", model, input: { ...input, promptVersion: PLANNER_PROMPT_VERSION } });
    // The RPC returns the winner's run on concurrent calls and successful replays.
    if (run.id !== runId) return { status: run.status === "completed" ? "completed" : "in_progress", runId: run.id };

    const started = Date.now();
    const metrics: AgentMetrics = { durationMs: 0, retryCount: 0, taskCount: 0, inputTokens: null, outputTokens: null, totalTokens: null };
    try {
      const plan = await this.runtime.plan(input, model, async (eventType, summary, metadata) => {
        await this.events.record({ workspaceId, workflowId, agentRunId: run.id, eventType, summary, metadata });
      }, metrics);
      metrics.durationMs = Date.now() - started;
      // One transaction saves all tasks, plan events, completed run and running workflow.
      const completed = await this.runs.complete({ runId: run.id, status: "completed", output: plan, metrics });
      if (completed.status !== "completed") throw new AppError("invalid_transition", "Planning was interrupted by a workflow status change. Refresh to view its current state.");
      return { status: "completed", runId: run.id };
    } catch (error) {
      metrics.durationMs = Date.now() - started;
      const safe = safePlanningError(error);
      try {
        await this.runs.complete({ runId: run.id, status: "failed", error: safe, metrics });
      } catch {
        // Never return provider output or credentials. A stale claim is recoverable by RPC.
        console.error("Planner failure could not be persisted", { operation: "complete_planner_run", runId: run.id, code: "database" });
        throw new AppError("database", "Planning could not be saved. Refresh to check its status, then retry if needed.");
      }
      if (error instanceof AppError) throw error;
      throw new AppError("ai_unavailable", safe.message);
    }
  }
}
