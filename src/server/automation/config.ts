import "server-only";
import { AppError } from "../errors";

export function automationConfiguration() {
  const enabled = process.env.AUTOMATION_ENABLED === "true";
  const providerConfigured = Boolean(process.env.TRIGGER_SECRET_KEY?.trim() && process.env.TRIGGER_PROJECT_REF?.trim()
    && process.env.AUTOMATION_JOB_SIGNING_SECRET?.trim() && process.env.AUTOMATION_JOB_SIGNING_SECRET.trim().length >= 32);
  return { enabled: enabled && providerConfigured, providerConfigured, requested: enabled };
}
export function requireAutomation() {
  if (!automationConfiguration().enabled) throw new AppError("runtime_configuration", "Configure Trigger.dev and the job signing secret, then enable automation on the server.");
}
