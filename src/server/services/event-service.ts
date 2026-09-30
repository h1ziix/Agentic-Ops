import { z } from "zod";
import { agentEventTypeSchema } from "@/lib/validation/rows";
import type { AgentEventRow } from "@/types/persistence";
import { AppError } from "../errors";
import { requireWorkspace } from "../auth/context";
import { AgentEventRepository } from "../repositories/agent-repositories";

const eventInputSchema = z.object({
  workspaceId: z.uuid(),
  workflowId: z.uuid(),
  eventType: agentEventTypeSchema,
  summary: z.string().trim().min(1).max(500),
  metadata: z.record(z.string(), z.json()).default({}),
  agentRunId: z.uuid().optional(),
  workflowTaskId: z.uuid().optional(),
});

export type RecordEventInput = z.infer<typeof eventInputSchema>;

/** Stage 3 supplies a privileged writer; Stage 2 mutations emit events in SQL. */
export interface EventWriter {
  record(input: RecordEventInput): Promise<AgentEventRow>;
}

export class EventService {
  constructor(private readonly writer: EventWriter) {}

  async record(input: RecordEventInput): Promise<AgentEventRow> {
    const parsed = eventInputSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation");
    if (Buffer.byteLength(JSON.stringify(parsed.data.metadata), "utf8") > 16_384) throw new AppError("validation");
    return this.writer.record(parsed.data);
  }
}

export async function listWorkflowEvents(workflowId: string): Promise<AgentEventRow[]> {
  const parsed = z.uuid().safeParse(workflowId);
  if (!parsed.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  return new AgentEventRepository(supabase).listWorkspaceEvents(workspace.id, parsed.data);
}
