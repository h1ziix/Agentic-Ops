import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { AppError } from "../errors";
import { IntegrationError } from "../integrations/http";
import { mutationBody, mutationError } from "./mutations";

async function localOrigin(run: () => Promise<void>) {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  try { await run(); } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = original;
  }
}
test("Browser mutations require the canonical request and Origin, including empty bodies", async () => localOrigin(async () => {
  for (const origin of [undefined, "null", "https://foreign.example", "http://localhost:3000.foreign.example"]) {
    await assert.rejects(mutationBody(new Request("http://localhost:3000/api/test", { method: "POST", headers: origin ? { origin } : {} })), { code: "unauthorized" });
  }
  await assert.rejects(mutationBody(new Request("http://foreign.example/api/test", { method: "POST", headers: { origin: "http://localhost:3000" } })), { code: "unauthorized" });
  assert.deepEqual(await mutationBody(new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000" }, body: '{"recover":true}' })), { recover: true });
}));
test("Request limits count UTF-8 bytes even without Content-Length; invalid JSON fails closed", async () => localOrigin(async () => {
  for (const request of [
    new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000", "content-length": "40000" } }),
    new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "я".repeat(17000) }),
    new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "malformed" }),
  ]) await assert.rejects(mutationBody(request), { code: "validation" });
}));
test("Mutation errors expose safe codes and never raw provider or unexpected error bodies", async () => {
  const sensitive = "raw token=never-expose-this";
  const invalid = z.object({ token: z.literal("required") }).safeParse({ token: sensitive });
  assert.equal(invalid.success, false);
  for (const error of [new Error(sensitive), new IntegrationError("transport_uncertain", "unknown"), invalid.error]) {
    const response = mutationError(error);
    assert.equal((await response.text()).includes(sensitive), false);
  }
  assert.equal(mutationError(new AppError("unauthenticated")).status, 401);
  assert.equal(mutationError(new AppError("conflict")).status, 409);
});
test("Oversized streamed mutation bodies stop reading and cancel before buffering the full request", async () => localOrigin(async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(64)); },
    cancel() { cancelled = true; },
  });
  const init: RequestInit & { duplex: "half" } = { method: "POST", headers: { origin: "http://localhost:3000" }, body, duplex: "half" };
  await assert.rejects(mutationBody(new Request("http://localhost:3000/api/test", init), 32), { code: "validation" });
  assert.equal(cancelled, true);
}));
