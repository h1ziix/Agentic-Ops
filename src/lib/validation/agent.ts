import { z } from "zod";

export const agentTypeSchema = z.enum(["planner", "researcher", "reviewer", "outreach", "executor"]);
export const agentStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export const agentMetricsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  retryCount: z.number().int().min(0).max(1),
  taskCount: z.number().int().min(0).max(10),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
}).strict();

export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentType = z.infer<typeof agentTypeSchema>;
export type AgentMetrics = z.infer<typeof agentMetricsSchema>;
