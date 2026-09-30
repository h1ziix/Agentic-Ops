import { z } from "zod";
import type { AgentRunRow } from "@/types/persistence";
import { AppError } from "../errors";
import { requireWorkspace } from "../auth/context";
import { AgentRunRepository } from "../repositories/agent-repositories";
import { agentMetricsSchema, agentTypeSchema } from "@/lib/validation/agent";

const startRunSchema = z.object({
  runId: z.uuid(),
  userId: z.uuid(),
  workspaceId: z.uuid(),
  workflowId: z.uuid(),
  workflowTaskId: z.uuid().optional(),
  agentType: agentTypeSchema,
  model: z.string().trim().max(200).optional(),
  input: z.json().optional(),
});

const completeRunSchema = z.object({
  runId: z.uuid(),
  status: z.enum(["completed", "failed", "cancelled"]),
  output: z.json().optional(),
  error: z.json().optional(),
  metrics: agentMetricsSchema,
});

export type StartRunInput = z.infer<typeof startRunSchema>;
export type CompleteRunInput = z.infer<typeof completeRunSchema>;

/** Privileged persistence port; the Planner never receives it. */
export interface AgentRunWriter {
  start(input: StartRunInput): Promise<AgentRunRow>;
  complete(input: CompleteRunInput): Promise<AgentRunRow>;
}

export class AgentRunService {
  constructor(private readonly writer: AgentRunWriter) {}

  async start(input: StartRunInput): Promise<AgentRunRow> {
    const parsed = startRunSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation");
    return this.writer.start(parsed.data);
  }

  async complete(input: CompleteRunInput): Promise<AgentRunRow> {
    const parsed = completeRunSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation");
    return this.writer.complete(parsed.data);
  }
}

export async function listWorkflowAgentRuns(workflowId: string): Promise<AgentRunRow[]> {
  const parsed = z.uuid().safeParse(workflowId);
  if (!parsed.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  return new AgentRunRepository(supabase).listWorkspaceRuns(workspace.id, parsed.data);
}
