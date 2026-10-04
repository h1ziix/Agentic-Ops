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

test("public evidence with a DNS root dot is canonicalized and deduplicated safely", () => {
  const output = normalizeTavilySources({ results: [
    { url: "https://rekassa.kz./product?lang=ru#details", title: "Product", content: "Public product evidence", score: .9 },
    { url: "https://rekassa.kz/product?lang=ru#duplicate", title: "Duplicate", content: "Same source", score: .9 },
    { url: "https://host.internal./private", title: "Internal", content: "Private", score: 1 },
    { url: "https://127.0.0.1./private", title: "IP", content: "Private", score: 1 },
  ] });
  assert.equal(output.length, 1);
  assert.equal(output[0].url, "https://rekassa.kz/product?lang=ru#details");
});

test("structured analysis rejects fabricated evidence, unknown citations, unsupported status fields and inconsistent scores", () => {
  assert.deepEqual(validateResearchAnalysis(researchAnalysis, researchSources), researchAnalysis);
  for (const mutate of [
    (value: typeof researchAnalysis) => { value.facts[0].quote = "Invented employee count"; },
    (value: typeof researchAnalysis) => { value.lead.sourceIds = ["source_99"]; },
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
  assert.equal(output.researchOnly, true); assert.equal(measured.totalTokens, 30);
});

test("unsupported citations get one validated repair using identical cached evidence and observed usage", async () => {
  let searches = 0; let models = 0;
  const rejected = structuredClone(researchAnalysis);
  rejected.facts[0].quote = "Fabricated quote must never appear in safe events";
  const events: string[] = [];
  const agent = new ResearchAgent({ search: async () => { searches++; return researchSources; } }, {
    analyze: async (input, sources, _model, _timeout, feedback) => {
      models++; assert.deepEqual(input, researchInput); assert.deepEqual(sources, researchSources);
      assert.deepEqual(feedback, models === 1 ? undefined : { validationReason: "Unsupported evidence citation" });
      return { output: models === 1 ? rejected : researchAnalysis, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } };
    },
  }, { get: async () => researchSources, set: async () => { throw new Error("Unexpected cache write"); } });
  const measured = metrics();
  const result = await agent.research(researchInput, "gemini-fixture", async (type, summary, metadata) => { events.push(JSON.stringify({type, summary, metadata})); }, measured);
  assert.deepEqual(result.analysis, researchAnalysis); assert.equal(searches, 0); assert.equal(models, 2);
  assert.equal(result.budget.modelRequests, 2); assert.equal(measured.retryCount, 1); assert.equal(measured.totalTokens, 60);
  assert.equal(measured.usageObservationCount, 2);
  assert.ok(events.some((event) => event.includes("Requesting a corrected assessment")));
  assert.ok(events.every((event) => !event.includes(rejected.facts[0].quote)));
});

test("a second unsupported assessment still fails without saving or widening the model budget", async () => {
  let models = 0;
  const rejected = structuredClone(researchAnalysis); rejected.facts[0].sourceId = "source_99";
  const agent = new ResearchAgent({ search: async () => { throw new Error("Unexpected search"); } }, {
    analyze: async () => { models++; return { output: rejected, usage: null }; },
  }, { get: async () => researchSources, set: async () => {} });
  const measured = metrics();
  await assert.rejects(agent.research(researchInput, "gemini-fixture", async () => {}, measured),
    (error: unknown) => error instanceof ResearchError && error.code === "ai_invalid_output");
  assert.equal(models, 2); assert.equal(measured.retryCount, 1); assert.equal(measured.taskCount, 0);
});

test("a provider retry consumes the shared retry before an unsupported assessment", async () => {
  let models = 0;
  const rejected = structuredClone(researchAnalysis); rejected.lead.score = 100;
  const agent = new ResearchAgent({ search: async () => { throw new Error("Unexpected search"); } }, {
    analyze: async () => { models++; if (models === 1) throw new ResearchError("ai_unavailable", "gemini", true, 0); return { output: rejected, usage: null }; },
  }, { get: async () => researchSources, set: async () => {} }, async () => {});
  const measured = metrics();
  await assert.rejects(agent.research(researchInput, "gemini-fixture", async () => {}, measured),
    (error: unknown) => error instanceof ResearchError && error.code === "ai_invalid_output");
  assert.equal(models, 2); assert.equal(measured.retryCount, 1);
});

test("a search retry prevents validation repair even when a model-call slot remains", async () => {
  let searches = 0; let models = 0;
  const rejected = structuredClone(researchAnalysis); rejected.facts[0].quote = "Unsupported quote";
  const agent = new ResearchAgent({ search: async () => { searches++; if (searches === 1) throw new ResearchError("ai_unavailable", "tavily", true, 0); return researchSources; } }, {
    analyze: async () => { models++; return { output: rejected, usage: null }; },
  }, { get: async () => null, set: async () => {} }, async () => {});
  const measured = metrics();
  await assert.rejects(agent.research(researchInput, "gemini-fixture", async () => {}, measured),
    (error: unknown) => error instanceof ResearchError && error.code === "ai_invalid_output");
  assert.equal(searches, 3); assert.equal(models, 1); assert.equal(measured.retryCount, 1);
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


test("directory candidates resolve a website from actual evidence before analysis within two model calls", async () => {
  let searches = 0; let resolves = 0; let analyses = 0;
  const agent = new ResearchAgent({ search: async (_query, domain) => { searches++; if (searches === 1) assert.equal(domain,null); else assert.equal(domain,"fixture.example.com"); return researchSources; } },
    { analyze: async (input) => { analyses++; assert.equal(input.website,"https://fixture.example.com"); return {output:researchAnalysis,usage:null}; } },
    {get:async()=>null,set:async()=>{}},async()=>{}, {
      profile:async()=>{throw new Error("Unexpected profile call");}, discover:async()=>{throw new Error("Unexpected discovery call");},
      resolve:async()=>{resolves++; return {output:{summary:"Verified official domain",candidates:[{name:"Fixture SaaS",website:"https://fixture.example.com",sourceId:"source_1",quote:"helps software teams manage their projects"}]},usage:null};},
    });
  const result = await agent.research({...researchInput,website:null,location:"Kazakhstan"},"gemini-fixture",async()=>{},metrics());
  assert.equal(searches,2); assert.equal(resolves,1); assert.equal(analyses,1); assert.equal(result.budget.modelRequests,2);
  assert.equal(result.company.website,"https://fixture.example.com"); assert.equal(result.researchOnly,true);
});

test("website resolution leaves no third model call for a rejected assessment", async () => {
  let models = 0; let resolves = 0;
  const rejected = structuredClone(researchAnalysis); rejected.facts[0].quote = "Unsupported quote";
  const agent = new ResearchAgent({ search: async () => researchSources }, {
    analyze: async () => { models++; return { output: rejected, usage: null }; },
  }, { get: async () => researchSources, set: async () => {} }, async () => {}, {
    profile: async () => { throw new Error("Unexpected profile"); }, discover: async () => { throw new Error("Unexpected discovery"); },
    resolve: async () => { resolves++; return { output: { summary: "Verified official domain", candidates: [{ name: "Fixture SaaS", website: "https://fixture.example.com", sourceId: "source_1", quote: "helps software teams manage their projects" }] }, usage: null }; },
  });
  const measured = metrics();
  await assert.rejects(agent.research({...researchInput, website: null}, "gemini-fixture", async () => {}, measured),
    (error: unknown) => error instanceof ResearchError && error.code === "ai_invalid_output");
  assert.equal(resolves, 1); assert.equal(models, 1); assert.equal(measured.retryCount, 0);
});
