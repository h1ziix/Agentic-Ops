import test from "node:test";
import assert from "node:assert/strict";
import { intelligenceFilterSchema } from "@/types/intelligence";
import { normalizeIndustry, normalizeLocation, normalizeOpportunity } from "@/lib/intelligence-normalization";
import { buildLeadFunnel, conversionRate, costPerUnit, deriveInsights } from "./metric-definitions";
import { analyticsPeriod, localDay, startOfLocalDay } from "./time-range";

test("funnel preserves distinct cohort counts and zero denominators; reply coverage stays unavailable", () => {
  const funnel = buildLeadFunnel({ discovered: 20, researched: 10, qualified: 4, reviewerApproved: 3, drafts: 3, approvalRequested: 3, approved: 2, sent: 1, replies: 0 });
  assert.equal(funnel[1].conversionRate, 40);
  assert.equal(funnel[2].conversionRate, 75);
  assert.equal(funnel[7].conversionRate, null);
  assert.equal(conversionRate(0, 0), null);
  assert.equal(conversionRate(0, 2), 0);
  assert.equal(costPerUnit(null, 4), null);
  assert.equal(costPerUnit(0, 4), 0);
  assert.equal(costPerUnit(4, 0), null);
  assert.equal(costPerUnit(1.8, 6), .3);
});
test("strict analytics filters accept real dimensions and reject malformed/crossed score intervals", () => {
  assert.equal(intelligenceFilterSchema.parse({}).range, "30d");
  assert.deepEqual(intelligenceFilterSchema.parse({ range: "7d", minScore: "60", maxScore: "90", industry: "FinTech" }),
    { range: "7d", minScore: 60, maxScore: 90, industry: "FinTech" });
  for (const input of [{ minScore: 90, maxScore: 20 }, { minScore: 101 }, { workflowId: "bad" }, { workspaceId: "other" }, { confidence: "unknown" }, { range: "yesterday" }]) {
    assert.equal(intelligenceFilterSchema.safeParse(input).success, false);
  }
});
test("UTC filtering follows configured local calendar days including DST", () => {
  const now = new Date("2026-10-03T02:00:00Z");
  assert.equal(localDay(now, "Asia/Qyzylorda"), "2026-10-03");
  assert.equal(analyticsPeriod("today", now).from, "2026-10-02T19:00:00.000Z");
  assert.equal(analyticsPeriod("7d", now).from, "2026-09-26T19:00:00.000Z");
  assert.equal(analyticsPeriod("30d", now).from, "2026-09-03T19:00:00.000Z");
  assert.equal(analyticsPeriod("all", now).from, null);
  assert.equal(startOfLocalDay("2026-03-08", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(startOfLocalDay("2026-03-09", "America/New_York").toISOString(), "2026-03-09T04:00:00.000Z");
});
test("normalization preserves original text and unknown values", () => {
  assert.equal(normalizeIndustry("  FIN-tech  "), "Fintech");
  assert.equal(normalizeIndustry("B2B SaaS"), "SaaS");
  assert.equal(normalizeIndustry("Health Care"), "Health Care");
  assert.equal(normalizeIndustry(null), "Unknown");
  assert.equal(normalizeLocation("Almaty, Kazakhstan"), "Kazakhstan");
  assert.equal(normalizeLocation("Almaty"), "Almaty");
  assert.equal(normalizeLocation("not specified"), "Unknown");
  assert.equal(normalizeOpportunity("AI-powered support ticket classification"), "Customer support");
  assert.equal(normalizeOpportunity("knowledge_retrieval"), "Knowledge automation");
  assert.equal(normalizeOpportunity("Internal_operations"), "Internal operations");
  assert.equal(normalizeOpportunity("not_specified"), "Unknown");
  assert.equal(normalizeOpportunity("unclassified initiative"), "Other");
  assert.equal(normalizeOpportunity(null), "Unknown");
});
test("derived insights cite supplied counts and partial known cost without inventing a winner", () => {
  const data = { summary: { qualified: 5, pendingApprovals: 2 }, industries: [{ key: "Fintech", label: "Fintech", qualified: 3 }],
    agents: [{ key: "researcher", label: "Researcher", knownEstimatedCostUsd: 3, unknownCostRuns: 1 }, { key: "planner", label: "Planner", knownEstimatedCostUsd: 1, unknownCostRuns: 0 }],
    researchQuality: { unknownSnapshots: 1 } };
  const result = deriveInsights(data);
  assert.match(result[0].text, /3 of 5/);
  assert.match(result[1].text, /75% of known estimated AI cost/);
  assert.match(result[1].text, /some run costs are unavailable/);
  assert.match(result[2].text, /2 email proposals/);
  assert.deepEqual(deriveInsights({ summary: { qualified: 0, pendingApprovals: 0 }, industries: [], agents: [], researchQuality: { unknownSnapshots: 0 } }), []);
});
