import assert from "node:assert/strict";
import test, { mock } from "node:test";
import OpenAI from "openai";
import { OpenAIPlannerProvider } from "./openai-planner-provider";
import { PlannerError } from "./errors";
import { examplePlan, examplePlannerInput } from "./testing/planner-fixtures";

function sdkResponse(output: unknown = examplePlan) {
  return { id: "resp_test", object: "response", created_at: 1, status: "completed", model: "test-model",
    output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }],
    usage: { input_tokens: 40, output_tokens: 160, total_tokens: 200, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
}

test("OpenAI adapter calls Responses with a strict schema, no tools or provider storage, and extracts safe output only", async () => {
  let body: Record<string, unknown> = {};
  let calls = 0;
  const client = new OpenAI({ apiKey: "unit-test-placeholder", maxRetries: 0, fetch: async (_url, init) => {
    calls++;
    body = JSON.parse(String(init?.body));
    return Response.json(sdkResponse());
  } });
  const result = await new OpenAIPlannerProvider(client).generate(examplePlannerInput, "test-model", 1);
  assert.equal(calls, 1);
  assert.deepEqual(result.output, examplePlan);
  assert.deepEqual(result.usage, { inputTokens: 40, outputTokens: 160, totalTokens: 200 });
  assert.equal(body.model, "test-model");
  assert.equal(body.store, false);
  assert.equal("tools" in body, false);
  assert.equal((body.text as { format: { strict: boolean } }).format.strict, true);
  assert.ok(!JSON.stringify(result).includes("unit-test-placeholder"));
});

test("OpenAI adapter refuses malformed structured outputs and explicit refusals", async () => {
  const invalid = new OpenAI({ apiKey: "unit-test-placeholder", fetch: async () => Response.json(sdkResponse({ tasks: [] })) });
  await assert.rejects(() => new OpenAIPlannerProvider(invalid).generate(examplePlannerInput, "test-model", 1),
    (error) => error instanceof PlannerError && error.code === "ai_invalid_output" && error.retryable);
  const refused = sdkResponse();
  const refusalResponse = { ...refused, output: [{ type: "message", content: [{ type: "refusal", refusal: "Provider refusal text" }] }] };
  const client = new OpenAI({ apiKey: "unit-test-placeholder", fetch: async () => Response.json(refusalResponse) });
  await assert.rejects(() => new OpenAIPlannerProvider(client).generate(examplePlannerInput, "test-model", 1),
    (error) => error instanceof PlannerError && error.code === "ai_refused" && !error.retryable);
});

test("OpenAI adapter maps authentication, transient provider errors and timeouts to safe errors without SDK retries", async () => {
  for (const status of [401, 429, 503]) {
    let calls = 0;
    const client = new OpenAI({ apiKey: "unit-test-placeholder", fetch: async () => {
      calls++; return Response.json({ error: { message: "Sensitive provider detail sk-secret", type: "api_error" } }, { status });
    } });
    await assert.rejects(() => new OpenAIPlannerProvider(client).generate(examplePlannerInput, "test-model", 1),
      (error) => error instanceof PlannerError && !error.message.includes("sk-secret") && error.retryable === (status !== 401));
    assert.equal(calls, 1);
  }
  const client = new OpenAI({ apiKey: "unit-test-placeholder" });
  mock.method(client.responses, "parse", async () => { throw new OpenAI.APIConnectionTimeoutError(); });
  await assert.rejects(() => new OpenAIPlannerProvider(client).generate(examplePlannerInput, "test-model", 1),
    (error) => error instanceof PlannerError && error.code === "ai_timeout");
});

test("missing API key returns a useful configuration error before any provider call", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(() => new OpenAIPlannerProvider().generate(examplePlannerInput, "test-model", 1),
      (error) => error instanceof PlannerError && error.code === "ai_configuration" && !error.retryable);
  } finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});

test("billing quota failures are actionable and never treated as transient rate limits", async () => {
  for (const code of ["credit_balance_exhausted", "organization_spend_limit_exceeded", "insufficient_quota"]) {
    let calls = 0;
    const client = new OpenAI({ apiKey: "unit-test-placeholder", fetch: async () => {
      calls++;
      return Response.json({ error: { message: "Sensitive billing detail sk-secret", type: "insufficient_quota", code } }, { status: 429 });
    } });
    await assert.rejects(() => new OpenAIPlannerProvider(client).generate(examplePlannerInput, "test-model", 1),
      (error) => error instanceof PlannerError && error.code === "ai_quota_exhausted" && !error.retryable
        && error.message.includes("API billing") && !error.message.includes("sk-secret"));
    assert.equal(calls, 1);
  }
});
