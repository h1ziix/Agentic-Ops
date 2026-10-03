import "server-only";
import { AppError } from "../errors";
import { getAppOrigin, serverEnvironment } from "../config/env";
import type { z } from "zod";
import type { providerSchema } from "@/lib/validation/execution";
export type IntegrationProvider = z.infer<typeof providerSchema>;
export const appOrigin = getAppOrigin;
export function oauthConfig(provider: IntegrationProvider) {
  const env = serverEnvironment();
  const clientId = provider === "gmail" ? env.GOOGLE_CLIENT_ID : env.HUBSPOT_CLIENT_ID;
  const clientSecret = provider === "gmail" ? env.GOOGLE_CLIENT_SECRET : env.HUBSPOT_CLIENT_SECRET;
  if (!clientId?.trim() || !clientSecret?.trim()) throw new AppError("integration_configuration", `${provider === "gmail" ? "Google" : "HubSpot"} OAuth is not configured. Ask the owner to configure the server variables.`);
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim(), redirectUri: `${appOrigin()}/api/integrations/${provider}/callback` };
}
