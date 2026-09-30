import assert from "node:assert/strict";
import test from "node:test";
import { GeminiProvider } from "./gemini-provider";
import { TavilyProvider } from "./tavily-provider";
import { ResearchBudget, ResearchError } from "./research-budget";
import { researchInput, researchSources, researchAnalysis } from "./testing/research-fixtures";

test("Gemini uses a fixed server endpoint, JSON Schema and supplied Tavily evidence without browsing tools", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    const body = JSON.parse(String(init.body));
    assert.equal(body.tools, undefined); assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.maxOutputTokens, 6000);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).evidence, researchSources);
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "Private reasoning excluded" }, { text: JSON.stringify(researchAnalysis) }] } }],
      usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 20, totalTokenCount: 60 } });
  });
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "test-server-key";
  try { const result = await new GeminiProvider().analyze(researchInput, researchSources, "gemini-3.8-flash", 10_000);
    assert.deepEqual(result.output, researchAnalysis); assert.equal(result.usage?.totalTokens, 60);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});

test("Tavily is domain-scoped and uses explicit basic search with automatic upgrades disabled", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.tavily.com/search");
    const body = JSON.parse(String(init.body));
    assert.equal(body.search_depth, "basic"); assert.equal(body.auto_parameters, false);
    assert.equal(body.max_results, 4); assert.equal(body.include_answer, false); assert.deepEqual(body.include_domains, ["fixture.example.com"]);
    return Response.json({ results: [{ url: researchSources[0].url, title: "Product", content: researchSources[0].content, score: 0.9 }] });
  });
  const old = process.env.TAVILY_API_KEY; process.env.TAVILY_API_KEY = "test-server-key";
  try { assert.equal((await new TavilyProvider().search("company product", "fixture.example.com", 10_000)).length, 1); }
  finally { if (old === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = old; }
});

test("both providers respect retry-after and sanitize provider bodies; Gemini RetryInfo is honored", async (t) => {
  const oldGemini = process.env.GEMINI_API_KEY; const oldTavily = process.env.TAVILY_API_KEY;
  process.env.GEMINI_API_KEY = "test-server-key"; process.env.TAVILY_API_KEY = "test-server-key";
  t.mock.method(globalThis, "fetch", async (url: string) => String(url).includes("tavily")
    ? Response.json({ message: "Sensitive provider body" }, { status: 429, headers: { "Retry-After": "60" } })
    : Response.json({ error: { details: [{ retryDelay: "60s" }] } }, { status: 429 }));
  try {
    for (const operation of [() => new TavilyProvider().search("query", "fixture.example.com", 10_000),
      () => new GeminiProvider().analyze(researchInput, researchSources, "gemini-3.8-flash", 10_000)]) {
      await assert.rejects(operation, (error: unknown) => {
        assert.ok(error instanceof ResearchError); assert.equal(error.retryAfterMs, 60_000);
        assert.equal(new ResearchBudget().retry(error), false); assert.ok(!error.message.includes("Sensitive")); return true;
      });
    }
  } finally {
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
    if (oldTavily === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = oldTavily;
  }
});
