import assert from "node:assert/strict";
import test from "node:test";
import { validateResearchAnalysis, publicWebsiteSchema } from "@/lib/validation/research";
import type { AgentMetrics } from "@/lib/validation/agent";
import { ResearchAgent, type ResearchCache } from "./research-agent";
import { ResearchBudget, ResearchError } from "./research-budget";
import { normalizeTavilySources } from "./tavily-provider";
import { researchAnalysis, researchInput, researchSources } from "./testing/research-fixtures";

const metrics = (): AgentMetrics => ({ durationMs: 0, retryCount: 0, taskCount: 0, inputTokens: null, outputTokens: null, totalTokens: null });

test("normalization preserves actual source URLs, removes unsafe/duplicate/empty evidence, and bounds content", () => {
  const rows = [
    { url: "https://fixture.example.com/product#details", title: "Product", content: "a".repeat(5000), score: 0.9 },
    { url: "https://fixture.example.com/product#duplicate", title: "Duplicate", content: "text", score: 0.8 },
    { url: "http://127.0.0.1/private", title: "Private", content: "secret", score: 1 },
    { url: "https://fixture.example.com/empty", title: "Empty", content: " ", score: 1 },
  ];
  const output = normalizeTavilySources({ results: rows });
  assert.equal(output.length, 1); assert.equal(output[0].url, rows[0].url); assert.equal(output[0].content.length, 3500);
  for (const url of ["javascript:alert(1)", "http://localhost/", "https://user:pass@company.com", "http://10.0.0.1", "http://host.internal/"]) {
    assert.equal(publicWebsiteSchema.safeParse(url).success, false);
  }
});

test("structured analysis rejects fabricated evidence, unknown citations, unsupported status fields and inconsistent scores", () => {
  assert.deepEqual(validateResearchAnalysis(researchAnalysis, researchSources), researchAnalysis);
  for (const mutate of [
    (value: typeof researchAnalysis) => { value.facts[0].quote = "Invented employee count"; },
    (value: typeof researchAnalysis) => { value.outreach.sourceIds = ["source_99"]; },
    (value: typeof researchAnalysis) => { value.lead.score = 100; },
  ]) {
    const value = structuredClone(researchAnalysis); mutate(value);
    assert.throws(() => validateResearchAnalysis(value, researchSources));
  }
  assert.throws(() => validateResearchAnalysis({ ...researchAnalysis, approved: true }, researchSources));
});

test("strict budgets include failed attempts and never retry beyond one shared provider retry", () => {
  const budget = new ResearchBudget();
  for (let i = 0; i < 3; i++) budget.reserve("tavily");
  assert.throws(() => budget.reserve("tavily"));
  budget.reserve("gemini"); budget.reserve("gemini"); assert.throws(() => budget.reserve("gemini"));
  assert.equal(budget.retry(new ResearchError("ai_unavailable", "tavily", true, 60_000)), false);
  assert.equal(budget.retry(new ResearchError("ai_unavailable", "tavily", true)), true);
  assert.equal(budget.retry(new ResearchError("ai_unavailable", "gemini", true)), false);
  assert.equal(budget.snapshot().searchCreditsReserved, 3);
});

test("cache replay avoids all Tavily calls and sends only normalized evidence to analysis", async () => {
  let searches = 0; let models = 0;
  const agent = new ResearchAgent({ search: async () => { searches++; return researchSources; } }, {
    analyze: async (input, evidence) => { models++; assert.deepEqual(input, researchInput); assert.deepEqual(evidence, researchSources);
      return { output: researchAnalysis, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }; },
  }, { get: async () => researchSources, set: async () => { throw new Error("Unexpected cache write"); } });
  const measured = metrics();
  const output = await agent.research(researchInput, "gemini-fixture", async () => {}, measured);
  assert.equal(searches, 0); assert.equal(models, 1); assert.equal(output.budget.cacheHits, 2);
  assert.equal(output.approvalRequired, true); assert.equal(measured.totalTokens, 30);
});

test("search cache is persisted before Gemini fails, and the retry reuses evidence", async () => {
  const entries = new Map<string, typeof researchSources>(); let searches = 0; let models = 0;
  const cache: ResearchCache = { get: async (query) => entries.get(query) ?? null, set: async (query, _domain, sources) => { entries.set(query, sources); } };
  const agent = new ResearchAgent({ search: async () => { searches++; return researchSources; } }, {
    analyze: async () => { models++; if (models === 1) throw new ResearchError("ai_unavailable", "gemini", true, 1000);
      return { output: researchAnalysis, usage: null }; },
  }, cache, async () => {});
  const output = await agent.research(researchInput, "gemini-fixture", async () => {}, metrics());
  assert.equal(searches, 2); assert.equal(models, 2); assert.equal(entries.size, 2);
  assert.equal(output.budget.searchCreditsReserved, 2);
});

test("shared retry exhaustion stops the pipeline before invalid evidence can be saved", async () => {
  let searches = 0; let models = 0;
  const agent = new ResearchAgent({ search: async () => { searches++; if (searches === 1) throw new ResearchError("ai_unavailable", "tavily", true); return researchSources; } },
    { analyze: async () => { models++; throw new ResearchError("ai_unavailable", "gemini", true); } },
    { get: async () => null, set: async () => {} }, async () => {});
  await assert.rejects(() => agent.research(researchInput, "gemini-fixture", async () => {}, metrics()), ResearchError);
  assert.equal(searches, 3); assert.equal(models, 1);
});

test("empty searches cannot trigger analysis, and an audit failure prevents provider calls", async () => {
  let models = 0; let searches = 0;
  const agent = new ResearchAgent({ search: async () => { searches++; return []; } },
    { analyze: async () => { models++; return { output: researchAnalysis, usage: null }; } }, { get: async () => null, set: async () => {} });
  await assert.rejects(() => agent.research(researchInput, "gemini-fixture", async () => {}, metrics()), ResearchError);
  assert.equal(models, 0);
  await assert.rejects(() => agent.research(researchInput, "gemini-fixture", async () => { throw new Error("Audit unavailable"); }, metrics()));
  assert.equal(searches, 2);
});
