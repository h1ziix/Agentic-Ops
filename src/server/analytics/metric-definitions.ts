import type { IntelligenceCounts, IntelligenceData } from "@/types/intelligence";

/** Business stages share a company-workflow cohort; never divide attempt counts by company counts. */
export const FUNNEL_STAGES = [
  ["researched", "Companies researched"], ["qualified", "Qualified leads"], ["reviewerApproved", "Reviewer approved"],
  ["drafts", "Draft created"], ["approvalRequested", "Approval requested"], ["approved", "Approved"],
  ["sent", "Sent"], ["replies", "Reply detected"],
] as const satisfies readonly (readonly [keyof IntelligenceCounts, string])[];

export function conversionRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator * 100 : null;
}
export function costPerUnit(cost: number | null, units: number): number | null {
  return cost !== null && units > 0 ? cost / units : null;
}
export function buildLeadFunnel(counts: IntelligenceCounts): IntelligenceData["funnel"] {
  return FUNNEL_STAGES.map(([key, label], index) => ({ key, label, count: counts[key],
    conversionRate: index && key !== "replies" ? conversionRate(counts[key], counts[FUNNEL_STAGES[index - 1][0]]) : null }));
}
export function deriveInsights(data: {
  summary: Pick<IntelligenceData["summary"], "qualified" | "pendingApprovals">;
  agents: Pick<IntelligenceData["agents"][number], "label" | "knownEstimatedCostUsd" | "unknownCostRuns">[];
  industries: Pick<IntelligenceData["industries"][number], "key" | "label" | "qualified">[];
  researchQuality: Pick<IntelligenceData["researchQuality"], "unknownSnapshots">;
}): IntelligenceData["insights"] {
  const insights: IntelligenceData["insights"] = [];
  const largest = [...data.industries].filter((item) => item.key !== "Unknown" && item.qualified > 0).sort((a, b) => b.qualified - a.qualified)[0];
  if (largest) insights.push({ key: "industry", text: `${largest.qualified} of ${data.summary.qualified} qualified leads are in ${largest.label}.` });
  const known = data.agents.reduce((sum, agent) => sum + (agent.knownEstimatedCostUsd ?? 0), 0);
  const expensive = [...data.agents].sort((a, b) => (b.knownEstimatedCostUsd ?? 0) - (a.knownEstimatedCostUsd ?? 0))[0];
  if (known > 0 && expensive) insights.push({ key: "agent_cost", text: `${expensive.label} accounts for ${Math.round((expensive.knownEstimatedCostUsd ?? 0) / known * 100)}% of known estimated AI cost incurred in this period${data.agents.some((agent) => agent.unknownCostRuns) ? "; some run costs are unavailable" : ""}.` });
  if (data.summary.pendingApprovals) insights.push({ key: "approval", text: `${data.summary.pendingApprovals} email proposal${data.summary.pendingApprovals === 1 ? " in this cohort is" : "s in this cohort are"} waiting for human review.` });
  if (data.researchQuality.unknownSnapshots) insights.push({ key: "quality", text: `${data.researchQuality.unknownSnapshots} company-workflow record${data.researchQuality.unknownSnapshots === 1 ? " lacks" : "s lack"} a historical research snapshot; evidence and segment details are unavailable.` });
  return insights;
}
