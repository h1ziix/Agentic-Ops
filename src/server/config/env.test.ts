import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { canonicalAppOrigin } from "@/lib/validation/app-origin";
import { isSupabasePublicKey } from "@/lib/validation/supabase-public-key";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";
import { getAIProvider, getAppOrigin, getAutomationAppOrigin, getWorkspaceTimezone, serverEnvironment } from "./env";
import { validateLaunchEnvironment } from "./launch";
import { automationConfiguration, requireAutomation } from "../automation/config";
import { oauthConfig } from "../integrations/config";
import { estimateModelCost } from "../observability/pricing";
import { register } from "../../instrumentation";

type Environment = Record<string, string | undefined>;
const baseline = (): Environment => ({ NEXT_PUBLIC_APP_URL: "https://ops.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", SUPABASE_SECRET_KEY: "test-server-key",
  AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-gemini-key", TAVILY_API_KEY: "test-search-key" });
const worker = (): Environment => ({ AUTOMATION_ENABLED: "true", TRIGGER_PROJECT_REF: "proj_test",
  TRIGGER_SECRET_KEY: "test-worker-key", AUTOMATION_JOB_SIGNING_SECRET: "test-signature-secret-with-at-least-32-characters" });
const jwt = (role: string, header: object = { alg: "HS256", typ: "JWT" }) => [header, { role, iss: "supabase" }]
  .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).concat("testsignature").join(".");
async function withEnvironment<T>(values: Environment, operation: () => T | Promise<T>): Promise<T> {
  const saved = new Map(Object.keys(values).map((name) => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(values)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    return await operation();
  } finally {
    for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}

test("server configuration is lazy and optional missing providers do not prevent local production startup", async () => {
  await withEnvironment({ NODE_ENV: "production", NEXT_RUNTIME: "nodejs", VERCEL: undefined, VERCEL_ENV: undefined,
    NEXT_PUBLIC_APP_URL: undefined, AI_PROVIDER: undefined, OPENAI_API_KEY: undefined, GEMINI_API_KEY: undefined,
    GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, HUBSPOT_CLIENT_ID: undefined, HUBSPOT_CLIENT_SECRET: undefined,
    AUTOMATION_ENABLED: undefined, TRIGGER_SECRET_KEY: undefined, TRIGGER_PROJECT_REF: undefined, AUTOMATION_JOB_SIGNING_SECRET: undefined }, async () => {
    assert.equal(serverEnvironment().OPENAI_API_KEY, undefined);
    assert.equal(getAIProvider(), "openai");
    assert.deepEqual(automationConfiguration(), { enabled: false, providerConfigured: false, requested: false });
    assert.throws(() => requireAutomation(), { code: "runtime_configuration" });
    assert.throws(() => oauthConfig("gmail"), { code: "integration_configuration" });
    assert.throws(() => oauthConfig("hubspot"), { code: "integration_configuration" });
    await register(); // The isolated public demo/local production build needs no live OAuth or worker.
  });
});

test("canonical origins require HTTPS on hosted targets and reject every loopback form including HTTPS", () => {
  assert.equal(canonicalAppOrigin("https://ops.example.com/", true), "https://ops.example.com");
  for (const origin of ["http://ops.example.com", "https://localhost", "https://localhost.", "https://sub.localhost",
    "https://127.0.0.1", "https://127.0.0.2", "https://[::1]", "https://[::ffff:7f00:1]", "file:///tmp",
    "https://user:password@ops.example.com", "https://ops.example.com/callback", "https://ops.example.com?secret=hidden", "https://ops.example.com#token"])
    assert.throws(() => canonicalAppOrigin(origin, true));
});

test("local production accepts canonical loopback while hosted app and worker getters reject it", async () => {
  await withEnvironment({ NODE_ENV: "production", VERCEL: undefined, NEXT_PUBLIC_APP_URL: "http://localhost:3001/", AUTOMATION_APP_URL: undefined }, () => {
    assert.equal(getAppOrigin(), "http://localhost:3001");
    assert.equal(getAutomationAppOrigin(), "http://localhost:3001");
  });
  await withEnvironment({ VERCEL: "1", NEXT_PUBLIC_APP_URL: "https://localhost", AUTOMATION_APP_URL: "https://127.0.0.1" }, () => {
    assert.throws(() => getAppOrigin(), { code: "integration_configuration" });
    assert.throws(() => getAutomationAppOrigin(), { code: "runtime_configuration" });
  });
});

test("launch secrets are conditional on the selected Planner but Gemini and search remain required for research", () => {
  assert.deepEqual(validateLaunchEnvironment(baseline(), { production: true }).errors, []);
  const openai = { ...baseline(), AI_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-key" };
  assert.deepEqual(validateLaunchEnvironment(openai, { production: true }).errors, []);
  assert.ok(validateLaunchEnvironment({ ...openai, OPENAI_API_KEY: undefined }).errors.some((error) => error.startsWith("OPENAI_API_KEY:")));
  for (const name of ["GEMINI_API_KEY", "TAVILY_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"])
    assert.ok(validateLaunchEnvironment({ ...baseline(), [name]: undefined }).errors.some((error) => error.startsWith(`${name}:`)));
  assert.deepEqual(validateLaunchEnvironment({ ...baseline(), SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: "test-legacy-server-key" }).errors, []);
});

test("provider selection consistently trims whitespace and rejects unknown providers without echoing them", async () => {
  for (const provider of ["gemini", "openai"]) {
    await withEnvironment({ AI_PROVIDER: ` ${provider} ` }, () => assert.equal(getAIProvider(), provider));
    assert.deepEqual(validateLaunchEnvironment({ ...baseline(), AI_PROVIDER: ` ${provider} `, OPENAI_API_KEY: "test-openai-key" }).errors, []);
  }
  await withEnvironment({ AI_PROVIDER: "private-invalid-provider-value" }, () => {
    assert.throws(() => getAIProvider(), (error: unknown) => error instanceof Error && !error.message.includes("private-invalid-provider-value"));
  });
});

test("both launch and runtime public-key guards reject server secrets and malformed JWTs, retaining anon keys", async () => {
  for (const key of ["test-publishable-key", "sb_publishable_test", jwt("anon")]) {
    assert.equal(isSupabasePublicKey(key), true);
    assert.deepEqual(validateLaunchEnvironment({ ...baseline(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }).errors, []);
  }
  const secretKeys = ["sb_secret_test-private-value", " sb_secret_test-private-value ", jwt("service_role"), ` ${jwt("service_role")} `,
    jwt("service_role", { typ: "JWT", alg: "HS256" }), "eyJ.invalid.signature", "eyJ.payload", "e30.e30.signature", "e30.bnVsbA.signature"];
  for (const key of secretKeys) {
    assert.equal(isSupabasePublicKey(key), false);
    const result = validateLaunchEnvironment({ ...baseline(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
    assert.ok(result.errors.some((error) => error.startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:")));
    assert.equal(JSON.stringify(result).includes(key.trim()), false);
    await withEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, () => {
      assert.equal(isSupabaseConfigured(), false);
      assert.throws(() => getSupabaseEnv(), (error: unknown) => error instanceof Error && !error.message.includes(key.trim()));
    });
  }
});

test("missing optional OAuth stays unavailable and partial OAuth fails clearly with variable names only", () => {
  const missing = validateLaunchEnvironment(baseline());
  assert.deepEqual(missing.errors, []);
  assert.ok(missing.warnings.some((warning) => warning.startsWith("GOOGLE:")));
  assert.ok(missing.warnings.some((warning) => warning.startsWith("HUBSPOT:")));
  for (const prefix of ["GOOGLE", "HUBSPOT"]) {
    const partial = validateLaunchEnvironment({ ...baseline(), [`${prefix}_CLIENT_ID`]: "test-client-id" });
    assert.ok(partial.errors.some((error) => error.startsWith(`${prefix}_CLIENT_SECRET:`)));
    assert.ok(partial.errors.some((error) => error.startsWith("INTEGRATION_TOKEN_ENCRYPTION_KEY:")));
    const complete = { ...baseline(), [`${prefix}_CLIENT_ID`]: "test-client-id", [`${prefix}_CLIENT_SECRET`]: "test-client-secret",
      INTEGRATION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") };
    assert.deepEqual(validateLaunchEnvironment(complete).errors, []);
    assert.ok(validateLaunchEnvironment({ ...complete, INTEGRATION_TOKEN_ENCRYPTION_KEY: "wrong-key" }).errors.some((error) => error.startsWith("INTEGRATION_TOKEN_ENCRYPTION_KEY:")));
  }
});

test("explicit automation requires real configuration instead of silently using browser continuation", async () => {
  for (const missing of ["TRIGGER_PROJECT_REF", "TRIGGER_SECRET_KEY", "AUTOMATION_JOB_SIGNING_SECRET"]) {
    const values = { ...baseline(), ...worker(), [missing]: undefined };
    assert.ok(validateLaunchEnvironment(values, { production: true }).errors.some((error) => error.startsWith(`${missing}:`)));
    await withEnvironment(values, () => assert.throws(() => automationConfiguration(), { code: "runtime_configuration" }));
  }
  const disabled = validateLaunchEnvironment({ ...baseline(), AUTOMATION_ENABLED: "false" }, { requireAutomation: true });
  assert.ok(disabled.errors.some((error) => error.startsWith("AUTOMATION_ENABLED:")));
  await withEnvironment({ ...worker(), AUTOMATION_ENABLED: "yes" }, () => assert.throws(() => automationConfiguration(), { code: "runtime_configuration" }));
  await withEnvironment({ ...worker(), AUTOMATION_JOB_SIGNING_SECRET: "short" }, () => assert.throws(() => automationConfiguration(), { code: "runtime_configuration" }));
});

test("worker launch validation rejects unsafe origins, invalid flags and production test jobs", () => {
  assert.deepEqual(validateLaunchEnvironment({ ...baseline(), ...worker() }, { production: true, requireAutomation: true }).errors, []);
  for (const AUTOMATION_APP_URL of ["http://localhost:3000", "https://127.0.0.1", "https://ops.example.com/dispatch", "https://token@ops.example.com"])
    assert.ok(validateLaunchEnvironment({ ...baseline(), ...worker(), AUTOMATION_APP_URL }, { production: true }).errors.some((error) => error.startsWith("AUTOMATION_APP_URL:")));
  for (const name of ["AUTOMATION_ENABLED", "AUTOMATION_ALLOW_TEST_JOBS"])
    assert.ok(validateLaunchEnvironment({ ...baseline(), [name]: "maybe" }).errors.some((error) => error.startsWith(`${name}:`)));
  assert.ok(validateLaunchEnvironment({ ...baseline(), AUTOMATION_ALLOW_TEST_JOBS: "true" }, { production: true }).errors.some((error) => error.startsWith("AUTOMATION_ALLOW_TEST_JOBS:")));
});

test("malformed and absent pricing remain unknown with an explicit warning, rather than a zero estimate", async () => {
  const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
  for (const AI_MODEL_PRICING_JSON of [undefined, "", "{}", "broken-json", "[]", '{"mock":{"inputUsdPerMillion":-1,"outputUsdPerMillion":1,"version":"test"}}']) {
    const report = validateLaunchEnvironment({ ...baseline(), AI_MODEL_PRICING_JSON });
    assert.deepEqual(report.errors, []);
    assert.ok(report.warnings.some((warning) => warning.startsWith("AI_MODEL_PRICING_JSON:")));
    await withEnvironment({ AI_MODEL_PRICING_JSON }, () => assert.deepEqual(estimateModelCost("mock", usage), { estimatedCostUsd: null, costStatus: "unknown", pricingVersion: null }));
  }
  const pricing = JSON.stringify({ mock: { inputUsdPerMillion: 1, outputUsdPerMillion: 2, version: "test-2026-10-03" } });
  assert.equal(validateLaunchEnvironment({ ...baseline(), AI_MODEL_PRICING_JSON: pricing }).warnings.some((warning) => warning.startsWith("AI_MODEL_PRICING_JSON:")), false);
});

test("validation and hosted startup diagnostics never contain configured values or OAuth credentials", async () => {
  const marker = "private-test-marker-that-must-not-appear";
  const values = { ...baseline(), AI_PROVIDER: marker, NEXT_PUBLIC_APP_URL: `https://user:${marker}@ops.example.com`,
    GOOGLE_CLIENT_ID: marker, GOOGLE_CLIENT_SECRET: marker, INTEGRATION_TOKEN_ENCRYPTION_KEY: marker,
    AUTOMATION_ENABLED: "true", AUTOMATION_JOB_SIGNING_SECRET: marker, WORKSPACE_TIMEZONE: marker, AI_MODEL_PRICING_JSON: marker };
  const result = validateLaunchEnvironment(values, { production: true, requireAutomation: true });
  assert.ok(result.errors.length > 0);
  assert.equal(JSON.stringify(result).includes(marker), false);
  await withEnvironment({ ...values, NEXT_RUNTIME: "nodejs", VERCEL: "1", VERCEL_ENV: "production" }, async () => {
    await assert.rejects(register(), (error: unknown) => error instanceof Error && error.message.startsWith("Production configuration invalid:") && !error.message.includes(marker));
  });
});

test("timezone and research limits fail clearly while absent timezone uses the configured default", async () => {
  await withEnvironment({ WORKSPACE_TIMEZONE: undefined }, () => assert.equal(getWorkspaceTimezone(), "Asia/Qyzylorda"));
  await withEnvironment({ WORKSPACE_TIMEZONE: "private-invalid-timezone" }, () => assert.throws(() => getWorkspaceTimezone(), { code: "runtime_configuration" }));
  for (const MAX_RESEARCH_COMPANIES_PER_WORKFLOW of ["0", "21", "1.5", "not-a-number"])
    assert.ok(validateLaunchEnvironment({ ...baseline(), MAX_RESEARCH_COMPANIES_PER_WORKFLOW }).errors.some((error) => error.startsWith("MAX_RESEARCH_COMPANIES_PER_WORKFLOW:")));
});

test("Edge startup skips Node-only validation and local production remains usable without optional integrations", async () => {
  await withEnvironment({ NEXT_RUNTIME: "edge", VERCEL: "1", VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: undefined }, async () => { await register(); });
});

test("Trigger build resolves server-only for ordinary Node and registers workers without a network call or embedded secrets", async () => {
  await withEnvironment({ TRIGGER_PROJECT_REF: "proj_offline_test", AUTOMATION_JOB_SIGNING_SECRET: "private-test-worker-signing-value" }, async () => {
    const { default: config } = await import("../../../trigger.config");
    const bundled = await build({ entryPoints: ["src/trigger/automation.ts"], bundle: true, write: false, format: "cjs", platform: "node",
      external: ["@trigger.dev/sdk", "zod"], conditions: ["trigger.dev", "module", "node", ...(config.build?.conditions ?? [])], logLevel: "silent" });
    const code = bundled.outputFiles[0].text;
    assert.equal(code.includes("private-test-worker-signing-value"), false);
    const ordinaryNode = spawnSync(process.execPath, ["-e", `
      const { createRequire } = require("node:module");
      let networkCalls = 0;
      globalThis.fetch = () => { networkCalls++; throw new Error("Offline worker must not call a provider"); };
      const bundled = require("node:fs").readFileSync(0, "utf8");
      const module = { exports: {} };
      new Function("require", "module", "exports", bundled)(createRequire(process.cwd() + "/package.json"), module, module.exports);
      if (networkCalls !== 0) process.exit(2);
    `], { input: code, encoding: "utf8", timeout: 20_000 });
    assert.equal(ordinaryNode.status, 0, "Worker bundle must load outside Next's react-server test condition.");
  });
});

test("Trigger config refuses a missing project before CLI deployment instead of using a fake project", async () => {
  for (const TRIGGER_PROJECT_REF of [undefined, "", "configure-trigger-project"]) {
    await withEnvironment({ TRIGGER_PROJECT_REF }, async () => {
      const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "import('./trigger.config.ts')"], { encoding: "utf8", timeout: 20_000 });
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes("Configure TRIGGER_PROJECT_REF before starting or deploying"));
    });
  }
});
