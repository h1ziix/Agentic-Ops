import "server-only";
import { z } from "zod";
import { REQUIRED_SCOPES, hasRequiredScopes, singleEmailSchema } from "@/lib/validation/execution";
import { oauthConfig, type IntegrationProvider } from "./config";
import { IntegrationError, providerFetch, safeJson, type IntegrationFetch } from "./http";
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number().positive(), scope: z.string().optional() });
export type OAuthTokens = z.infer<typeof tokenSchema>;
export function authorizationUrl(provider: IntegrationProvider, state: string, challenge?: string) {
  const config = oauthConfig(provider);
  const url = new URL(provider === "gmail" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://app.hubspot.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", state, scope: REQUIRED_SCOPES[provider].join(" ") }).toString();
  if (provider === "gmail") { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); url.searchParams.set("code_challenge_method", "S256"); url.searchParams.set("code_challenge", challenge!); }
  return url.toString();
}
export class OAuthProvider {
  constructor(private readonly transport: IntegrationFetch = fetch) {}
  async tokens(provider: IntegrationProvider, grant: { code: string; verifier: string } | { refreshToken: string }): Promise<OAuthTokens> {
    const config = oauthConfig(provider);
    const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret });
    if ("code" in grant) {
      form.set("grant_type", "authorization_code"); form.set("code", grant.code); form.set("redirect_uri", config.redirectUri);
      if (provider === "gmail") form.set("code_verifier", grant.verifier);
    } else { form.set("grant_type", "refresh_token"); form.set("refresh_token", grant.refreshToken); }
    const response = await providerFetch(provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://api.hubspot.com/oauth/v3/token",
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }, this.transport);
    if (!response.ok) {
      const error = z.object({ error: z.string().optional() }).safeParse(await safeJson(response));
      throw new IntegrationError(error.success && error.data.error === "invalid_grant" ? "reconnect_required" : "oauth_failed", "blocked");
    }
    const parsed = tokenSchema.safeParse(await safeJson(response));
    if (!parsed.success) throw new IntegrationError("oauth_response_invalid", "blocked");
    return parsed.data;
  }
  async identity(provider: IntegrationProvider, tokens: OAuthTokens) {
    if (provider === "gmail") {
      const response = await providerFetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } }, this.transport);
      if (!response.ok) throw new IntegrationError("identity_failed", "blocked");
      // Verified by the authenticated provider endpoint, never decoded unverified JWT claims.
      const info = z.object({ sub: z.string().min(1), email: singleEmailSchema, email_verified: z.literal(true) }).safeParse(await safeJson(response));
      const scopes = (tokens.scope ?? "").split(" ");
      if (!info.success || !hasRequiredScopes("gmail", scopes)) throw new IntegrationError("identity_or_scopes_missing", "blocked");
      return { identity: info.data.email, displayName: info.data.email, scopes };
    }
    const c = oauthConfig(provider);
    const response = await providerFetch("https://api.hubspot.com/oauth/v3/token/introspect", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, token_type_hint: "access_token", access_token: tokens.access_token }) }, this.transport);
    if (!response.ok) throw new IntegrationError("identity_failed", "blocked");
    const info = z.object({ active: z.literal(true), hub_id: z.number().int().positive(), client_id: z.literal(c.clientId), scopes: z.array(z.string()), hub_domain: z.string().optional() }).safeParse(await safeJson(response));
    if (!info.success || !hasRequiredScopes("hubspot", info.data.scopes)) throw new IntegrationError("identity_or_scopes_missing", "blocked");
    return { identity: String(info.data.hub_id), displayName: `Portal ${info.data.hub_id}${info.data.hub_domain ? ` · ${info.data.hub_domain.slice(0, 200)}` : ""}`, scopes: info.data.scopes };
  }
  async revokeGoogle(token: string) {
    const response = await providerFetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }, this.transport);
    return response.ok;
  }
}
