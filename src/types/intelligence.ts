import { z } from "zod";

export const intelligenceFilterSchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d", "all"]).default("30d"),
  workflowId: z.uuid().optional(), icpId: z.uuid().optional(), templateId: z.uuid().optional(),
  industry: z.string().trim().min(1).max(240).optional(), location: z.string().trim().min(1).max(240).optional(),
  leadStatus: z.enum(["new", "qualified", "outreach_ready", "waiting_approval", "contacted", "responded", "converted", "rejected"]).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(), maxScore: z.coerce.number().int().min(0).max(100).optional(),
}).strict().refine((value) => value.minScore === undefined || value.maxScore === undefined || value.minScore <= value.maxScore,
  { message: "Minimum score must not exceed maximum score", path: ["minScore"] });
export type IntelligenceFilters = z.infer<typeof intelligenceFilterSchema>;

const count = z.number().int().nonnegative();
const nullableNumber = z.number().finite().nonnegative().nullable();
export const intelligenceCostSchema = z.object({
  estimatedCostUsd: nullableNumber, knownEstimatedCostUsd: nullableNumber, unknownCostRuns: count,
  totalTokens: nullableNumber, unknownUsageRuns: count,
});
export type IntelligenceCost = z.infer<typeof intelligenceCostSchema>;
export const intelligenceCountsSchema = z.object({
  discovered: count, researched: count, qualified: count, reviewerApproved: count, drafts: count,
  approvalRequested: count, approved: count, sent: count, replies: count,
});
export type IntelligenceCounts = z.infer<typeof intelligenceCountsSchema>;
const metricsSchema = intelligenceCountsSchema.extend({
  averageScore: nullableNumber, highConfidence: count, agentRuns: count, toolCalls: count, retries: count,
  ...intelligenceCostSchema.shape, costPerQualifiedLead: nullableNumber,
});
export const workflowIntelligenceSchema = metricsSchema.extend({
  id: z.uuid(), title: z.string(), status: z.string(), createdAt: z.string(), icpName: z.string().nullable(), templateName: z.string().nullable(),
  durationMs: nullableNumber, medianScore: nullableNumber, costPerCompany: nullableNumber, costPerSent: nullableNumber,
});
export type WorkflowIntelligence = z.infer<typeof workflowIntelligenceSchema>;
export const usageIntelligenceSchema = intelligenceCostSchema.extend({
  key: z.string(), label: z.string(), runs: count, completed: count, failed: count, successRate: nullableNumber,
  averageDurationMs: nullableNumber, retries: count, toolCalls: count,
});
export type UsageIntelligence = z.infer<typeof usageIntelligenceSchema>;
export const intelligenceSegmentSchema = z.object({
  key: z.string(), label: z.string(), companies: count, qualified: count, averageScore: nullableNumber,
  highConfidence: count, sent: count, replies: count,
});
export type IntelligenceSegment = z.infer<typeof intelligenceSegmentSchema>;
export const intelligenceDatabaseSchema = z.object({
  summary: metricsSchema.extend({ pendingApprovals: count, needsAttention: count, failedJobs: count,
    followupsScheduled: count, followupsCompleted: count, executionsAttempted: count, messagesSent: count, repliesDetected: count }),
  workflows: z.array(workflowIntelligenceSchema), agents: z.array(usageIntelligenceSchema), models: z.array(usageIntelligenceSchema),
  workflowStatuses: z.array(z.object({ key: z.string(), count })),
  workflowFunnel: z.array(z.object({ key: z.string(), label: z.string(), count })),
  trends: z.array(intelligenceCostSchema.extend({ date: z.string(), researched: count, qualified: count, sent: count, replies: count })),
  industries: z.array(intelligenceSegmentSchema), locations: z.array(intelligenceSegmentSchema),
  opportunities: z.array(intelligenceSegmentSchema), sources: z.array(intelligenceSegmentSchema),
  icps: z.array(intelligenceSegmentSchema), templates: z.array(intelligenceSegmentSchema),
  researchQuality: z.object({ averageSources: nullableNumber, withoutEvidence: count, highConfidence: count, failures: count,
    partialFailureWorkflows: count, insufficientEvidence: count, unknownSnapshots: count }),
  filterOptions: z.object({ industries: z.array(z.string()), locations: z.array(z.string()),
    workflows: z.array(z.object({ id: z.uuid(), title: z.string() })), icps: z.array(z.object({ id: z.uuid(), name: z.string() })),
    templates: z.array(z.object({ id: z.uuid(), name: z.string() })) }),
  costPeriods: z.object({ today: intelligenceCostSchema, last7Days: intelligenceCostSchema, last30Days: intelligenceCostSchema }),
  workflowTableTruncated: z.boolean(),
});
export type IntelligenceDatabase = z.infer<typeof intelligenceDatabaseSchema>;
export interface IntelligenceData extends IntelligenceDatabase {
  filters: IntelligenceFilters;
  period: { from: string | null; to: string; timeZone: string; cohortLabel: string };
  funnel: { key: keyof IntelligenceCounts; label: string; count: number; conversionRate: number | null }[];
  insights: { key: string; text: string }[];
}
