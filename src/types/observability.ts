import type { AgentStatus, AgentType } from "@/lib/validation/agent";

export type UsageStatus = "complete" | "partial" | "unknown" | "not_applicable";
export type CostStatus = "estimated" | "unknown" | "not_applicable";
export type ErrorCategory = "validation" | "authorization" | "provider_auth" | "rate_limit" | "network" | "timeout" | "provider_error" | "invalid_state" | "duplicate" | "unknown_execution_state" | "internal";

export interface ToolCallObservation {
  id: string;
  tool: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  inputSummary: string;
  outputSummary: string | null;
  errorCategory: ErrorCategory | null;
  cached: boolean;
}

export interface AgentRunObservation {
  id: string;
  workflowId: string;
  taskId: string | null;
  agent: AgentType;
  model: string | null;
  provider: "openai" | "gemini" | null;
  modelCalls: number;
  status: AgentStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  usageStatus: UsageStatus;
  estimatedCostUsd: number | null;
  costStatus: CostStatus;
  pricingVersion: string | null;
  retryCount: number;
  errorCategory: ErrorCategory | null;
  errorSummary: string | null;
  inputSummary: string;
  outputSummary: string;
  toolCalls: ToolCallObservation[];
}

export interface UsageAggregate {
  runCount: number;
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  knownEstimatedCostUsd: number | null;
  unknownCostCount: number;
  unknownUsageCount: number;
  retryCount: number;
  durationMs: number | null;
  toolCalls: number;
  failedToolCalls: number;
  toolDurationMs: number | null;
}

export interface WorkflowObservability extends UsageAggregate {
  workflowId: string;
  agents: AgentType[];
}

export interface WorkspaceObservability {
  runs: AgentRunObservation[];
  workflowMetrics: WorkflowObservability[];
  usageToday: UsageAggregate;
  usage: UsageAggregate;
  byModel: { key: string; usage: UsageAggregate }[];
  byAgent: { key: string; usage: UsageAggregate }[];
  byWorkflow: { key: string; usage: UsageAggregate }[];
  byDay: { key: string; usage: UsageAggregate }[];
  truncated: boolean;
}
