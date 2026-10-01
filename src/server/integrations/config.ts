import "server-only";
import { AppError } from "../errors";
import type { z } from "zod";
import type { providerSchema } from "@/lib/validation/execution";
export type IntegrationProvider = z.infer<typeof providerSchema>;
export function appOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    if (url.origin !== (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || url.username || url.password || url.search || url.hash
      || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    return url.origin;
  } catch { throw new AppError("integration_configuration", "Set NEXT_PUBLIC_APP_URL to the canonical HTTPS origin, or localhost for local verification."); }
}
export function oauthConfig(provider: IntegrationProvider) {
  const clientId = provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId?.trim() || !clientSecret?.trim()) throw new AppError("integration_configuration", `${provider === "gmail" ? "Google" : "HubSpot"} OAuth is not configured. Ask the owner to configure the server variables.`);
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim(), redirectUri: `${appOrigin()}/api/integrations/${provider}/callback` };
}
