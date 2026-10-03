import "server-only";
import { z } from "zod";
import { canonicalAppOrigin } from "@/lib/validation/app-origin";
import { AppError } from "../errors";

/** The only server configuration reader. Read lazily; never serialize this object. */
export function serverEnvironment() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_PLANNER_MODEL: process.env.OPENAI_PLANNER_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    PLANNER_MODEL: process.env.PLANNER_MODEL,
    RESEARCH_MODEL: process.env.RESEARCH_MODEL,
    REVIEWER_MODEL: process.env.REVIEWER_MODEL,
    OUTREACH_MODEL: process.env.OUTREACH_MODEL,
    MAX_RESEARCH_COMPANIES_PER_WORKFLOW: process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID,
    HUBSPOT_CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET,
    INTEGRATION_TOKEN_ENCRYPTION_KEY: process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY,
    AUTOMATION_ENABLED: process.env.AUTOMATION_ENABLED,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF,
    AUTOMATION_JOB_SIGNING_SECRET: process.env.AUTOMATION_JOB_SIGNING_SECRET,
    AUTOMATION_APP_URL: process.env.AUTOMATION_APP_URL,
    AUTOMATION_ALLOW_TEST_JOBS: process.env.AUTOMATION_ALLOW_TEST_JOBS,
    AI_MODEL_PRICING_JSON: process.env.AI_MODEL_PRICING_JSON,
    WORKSPACE_TIMEZONE: process.env.WORKSPACE_TIMEZONE,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export function getAIProvider(): "gemini" | "openai" {
  const parsed = z.enum(["gemini", "openai"]).safeParse(serverEnvironment().AI_PROVIDER?.trim() || "openai");
  if (!parsed.success) throw new AppError("ai_configuration", "Set AI_PROVIDER to gemini or openai.");
  return parsed.data;
}

export function getAppOrigin() {
  const env = serverEnvironment();
  try { return canonicalAppOrigin(env.NEXT_PUBLIC_APP_URL, env.VERCEL === "1"); }
  catch { throw new AppError("integration_configuration", "Set NEXT_PUBLIC_APP_URL to the canonical HTTPS origin; loopback is permitted only for local verification."); }
}

export function getAutomationAppOrigin() {
  const env = serverEnvironment();
  try { return canonicalAppOrigin(env.AUTOMATION_APP_URL ?? env.NEXT_PUBLIC_APP_URL, env.VERCEL === "1"); }
  catch { throw new AppError("runtime_configuration", "Configure the canonical AUTOMATION_APP_URL reachable by the worker."); }
}

export function getWorkspaceTimezone() {
  const value = serverEnvironment().WORKSPACE_TIMEZONE?.trim() || "Asia/Qyzylorda";
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return value; }
  catch { throw new AppError("runtime_configuration", "Set WORKSPACE_TIMEZONE to an IANA timezone."); }
}
