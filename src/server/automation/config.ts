import "server-only";
import { AppError } from "../errors";
import { serverEnvironment } from "../config/env";

export function automationConfiguration() {
  const env = serverEnvironment();
  if (env.AUTOMATION_ENABLED !== undefined && !["true", "false"].includes(env.AUTOMATION_ENABLED))
    throw new AppError("runtime_configuration", "Set AUTOMATION_ENABLED to true or false.");
  const enabled = env.AUTOMATION_ENABLED === "true";
  const providerConfigured = Boolean(env.TRIGGER_SECRET_KEY?.trim() && env.TRIGGER_PROJECT_REF?.trim()
    && env.AUTOMATION_JOB_SIGNING_SECRET?.trim() && env.AUTOMATION_JOB_SIGNING_SECRET.trim().length >= 32);
  if (enabled && !providerConfigured) throw new AppError("runtime_configuration", "Automation is enabled but Trigger.dev or the job signing secret is missing. Configure the worker before enabling automation.");
  return { enabled: enabled && providerConfigured, providerConfigured, requested: enabled };
}
export function requireAutomation() {
  if (!automationConfiguration().enabled) throw new AppError("runtime_configuration", "Configure Trigger.dev and the job signing secret, then enable automation on the server.");
}
