import "server-only";
import { z } from "zod";
import { canonicalAppOrigin } from "@/lib/validation/app-origin";
import { isSupabasePublicKey } from "@/lib/validation/supabase-public-key";
import { parseModelPricing } from "../observability/pricing";

type Environment = Record<string, string | undefined>;
export type LaunchValidation = { errors: string[]; warnings: string[] };
const nonempty = (value: string | undefined) => Boolean(value?.trim() && !/YOUR_|configure-trigger-project/.test(value));

/** Reports names/categories only. Error messages must never include configured values. */
export function validateLaunchEnvironment(env: Environment, options: { production?: boolean; requireAutomation?: boolean } = {}): LaunchValidation {
  const errors: string[] = []; const warnings: string[] = [];
  const requireValue = (name: string) => { if (!nonempty(env[name])) errors.push(`${name}: required`); };
  for (const name of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY"]) requireValue(name);
  if (!nonempty(env.SUPABASE_SECRET_KEY) && !nonempty(env.SUPABASE_SERVICE_ROLE_KEY)) errors.push("SUPABASE_SECRET_KEY: required (or legacy SUPABASE_SERVICE_ROLE_KEY)");
  if (env.NEXT_PUBLIC_APP_URL) {
    try { canonicalAppOrigin(env.NEXT_PUBLIC_APP_URL, options.production); }
    catch { errors.push("NEXT_PUBLIC_APP_URL: invalid canonical origin for target environment"); }
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    try { canonicalAppOrigin(env.NEXT_PUBLIC_SUPABASE_URL, options.production); }
    catch { errors.push("NEXT_PUBLIC_SUPABASE_URL: invalid project origin for target environment"); }
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publicKey && !isSupabasePublicKey(publicKey)) errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: require a public publishable key or valid legacy anon JWT; never a server secret");
  const provider = env.AI_PROVIDER?.trim() || "openai";
  if (!["gemini", "openai"].includes(provider)) errors.push("AI_PROVIDER: use gemini or openai");
  if (provider === "openai") requireValue("OPENAI_API_KEY");
  for (const name of ["AUTOMATION_ENABLED", "AUTOMATION_ALLOW_TEST_JOBS"]) {
    if (env[name] !== undefined && !["true", "false"].includes(env[name]!)) errors.push(`${name}: use true or false`);
  }
  for (const prefix of ["GOOGLE", "HUBSPOT"]) {
    if (nonempty(env[`${prefix}_CLIENT_ID`]) || nonempty(env[`${prefix}_CLIENT_SECRET`])) {
      requireValue(`${prefix}_CLIENT_ID`); requireValue(`${prefix}_CLIENT_SECRET`); requireValue("INTEGRATION_TOKEN_ENCRYPTION_KEY");
    } else warnings.push(`${prefix}: external integration unavailable until OAuth is configured`);
  }
  if (env.INTEGRATION_TOKEN_ENCRYPTION_KEY && !/^[A-Za-z0-9+/]{43}=$/.test(env.INTEGRATION_TOKEN_ENCRYPTION_KEY.trim())) errors.push("INTEGRATION_TOKEN_ENCRYPTION_KEY: require 32 bytes encoded as base64");
  if (options.requireAutomation && env.AUTOMATION_ENABLED !== "true") errors.push("AUTOMATION_ENABLED: required for durable automation launch acceptance");
  if (env.AUTOMATION_ENABLED === "true" || options.requireAutomation) {
    requireValue("TRIGGER_PROJECT_REF"); requireValue("TRIGGER_SECRET_KEY"); requireValue("AUTOMATION_JOB_SIGNING_SECRET");
    if ((env.AUTOMATION_JOB_SIGNING_SECRET?.trim().length ?? 0) < 32) errors.push("AUTOMATION_JOB_SIGNING_SECRET: minimum 32 characters");
    try { canonicalAppOrigin(env.AUTOMATION_APP_URL ?? env.NEXT_PUBLIC_APP_URL, options.production); }
    catch { errors.push("AUTOMATION_APP_URL: invalid canonical worker origin configuration"); }
  } else warnings.push("AUTOMATION_ENABLED: durable worker disabled; synchronous browser continuation only");
  if (options.production && env.AUTOMATION_ALLOW_TEST_JOBS === "true") errors.push("AUTOMATION_ALLOW_TEST_JOBS: development-only, disable for production");
  if (env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW !== undefined && !z.coerce.number().int().min(1).max(20).safeParse(env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW).success) errors.push("MAX_RESEARCH_COMPANIES_PER_WORKFLOW: integer from 1 to 20");
  try { new Intl.DateTimeFormat("en", { timeZone: env.WORKSPACE_TIMEZONE?.trim() || "Asia/Qyzylorda" }); }
  catch { errors.push("WORKSPACE_TIMEZONE: invalid IANA timezone"); }
  if (!Object.keys(parseModelPricing(env.AI_MODEL_PRICING_JSON)).length) warnings.push("AI_MODEL_PRICING_JSON: absent, invalid or empty pricing; estimated AI cost unavailable");
  return { errors: [...new Set(errors)], warnings };
}
