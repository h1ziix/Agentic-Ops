import assert from "node:assert/strict";
import test from "node:test";
import { GeminiProvider } from "./gemini-provider";
import { TavilyProvider } from "./tavily-provider";
import { ResearchBudget, ResearchError } from "./research-budget";
import { researchInput, researchSources, researchAnalysis } from "./testing/research-fixtures";
import { providerJson } from "./provider-http";

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

test("Chunked provider success and quota responses stop at the byte ceiling and cancel the stream", async (t) => {
  for (const status of [200, 429]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // UTF-8 bytes exceed the limit although this contains fewer than 1 Mi characters.
        controller.enqueue(new TextEncoder().encode("я".repeat(524_289)));
      },
      cancel() { cancelled = true; },
    });
    const transport = t.mock.method(globalThis, "fetch", async () => new Response(stream, { status }));
    await assert.rejects(providerJson("gemini", "https://generativelanguage.googleapis.com/mock", {}, 1000),
      (error: unknown) => error instanceof ResearchError && error.code === "ai_invalid_output");
    assert.equal(cancelled, true);
    transport.mock.restore();
  }
});

test("Gemini assessment repair transmits only a safe validation category with unchanged evidence", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const input = JSON.parse(body.contents[0].parts[0].text);
    assert.deepEqual(input.evidence, researchSources);
    assert.deepEqual(input.validationFeedback, { validationReason: "Unsupported evidence citation" });
    assert.equal(input.previousOutput, undefined); assert.equal(body.tools, undefined);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(researchAnalysis) }] } }] });
  });
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "test-server-key";
  try {
    const result = await new GeminiProvider().analyze(researchInput, researchSources, "gemini-fixture", 10_000, { validationReason: "Unsupported evidence citation" });
    assert.deepEqual(result.output, researchAnalysis);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});

test("Malformed successful provider JSON is classified safely while malformed quota diagnostics keep retry handling", async (t) => {
  const transport = t.mock.method(globalThis, "fetch", async () => new Response("raw-token-sensitive-payload"));
  await assert.rejects(providerJson("tavily", "https://api.tavily.com/search", {}, 1000),
    (error: unknown) => error instanceof ResearchError && error.code === "ai_invalid_output" && !error.message.includes("raw-token"));
  transport.mock.restore();
  t.mock.method(globalThis, "fetch", async () => new Response("malformed", { status: 429, headers: { "retry-after": "3" } }));
  await assert.rejects(providerJson("gemini", "https://generativelanguage.googleapis.com/mock", {}, 1000),
    (error: unknown) => error instanceof ResearchError && error.code === "ai_unavailable" && error.retryAfterMs === 3000);
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
