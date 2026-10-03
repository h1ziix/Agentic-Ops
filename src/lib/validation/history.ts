import { z } from "zod";
import type { AgentEvent } from "@/types/domain";

/** Client-safe presentation contract; excludes database metadata and raw run payloads. */
export const historyEventSchema = z.object({
  id: z.uuid(), workflowId: z.uuid().nullable(), companyId: z.uuid().optional(), leadId: z.uuid().optional(),
  category: z.enum(["agent", "tool", "workflow", "approval", "error"]),
  eventType: z.custom<AgentEvent["eventType"]>((value) => typeof value === "string" && /^[a-z_]{1,100}$/.test(value)),
  agent: z.enum(["Planner Agent", "Research Agent", "Reviewer Agent", "Outreach Agent", "Executor Agent", "Unassigned", "Workspace"]).optional(),
  title: z.string().max(1000), description: z.string().max(10000), timestamp: z.iso.datetime({ offset: true }),
  status: z.enum(["completed", "running", "failed", "waiting"]), toolName: z.string().max(500).optional(), durationMs: z.number().finite().nonnegative().optional(),
}).strict();
export const historyEventsPageSchema = z.object({
  kind: z.literal("events"), page: z.number().int().min(1).max(10000), pageSize: z.literal(100), hasMore: z.boolean(),
  items: z.array(historyEventSchema).max(100),
}).strict();
export type HistoryEventsPage = z.infer<typeof historyEventsPageSchema>;
