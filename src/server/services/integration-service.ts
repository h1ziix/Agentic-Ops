import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { createRuntimeClient } from "@/lib/supabase/admin";
import { connectionRowSchema, providerSchema, type IntegrationConnection } from "@/lib/validation/execution";
import { requireUser, requireWorkspace, type WorkspaceContext } from "../auth/context";
import { AppError } from "../errors";
import { appOrigin, oauthConfig, type IntegrationProvider } from "../integrations/config";
import { assertEncryptionConfigured, decryptSecret, encryptSecret } from "../integrations/crypto";
import { IntegrationError } from "../integrations/http";
import { authorizationUrl, OAuthProvider } from "../integrations/oauth-provider";
import { credentialSchema, IntegrationRepository } from "../repositories/integration-repository";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const tokensSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }).strict();
export async function requireOwner(context: WorkspaceContext) {
  const { data, error } = await context.supabase.from("workspace_members").select("role").eq("workspace_id", context.workspace.id).eq("user_id", context.user.id).single();
  if (error || data?.role !== "owner") throw new AppError("unauthorized", "Only the workspace owner can manage integrations.");
}
async function verifiedSessionId(context: Awaited<ReturnType<typeof requireUser>>) {
  const { data, error } = await context.supabase.auth.getClaims();
  const id = z.string().min(1).safeParse(data?.claims.session_id);
  if (error || !id.success) throw new AppError("unauthenticated");
  return id.data;
}
export async function integrationSettings() {
  const context = await requireWorkspace();
  const { data } = await context.supabase.from("workspace_members").select("role").eq("workspace_id", context.workspace.id).eq("user_id", context.user.id).single();
  const connections = await new IntegrationRepository(context.supabase).list(context.workspace.id);
  const configured = Object.fromEntries(providerSchema.options.map((p) => { try { oauthConfig(p); assertEncryptionConfigured(); return [p, true]; } catch { return [p, false]; } }));
  return { connections, owner: data?.role === "owner", configured };
}
export async function beginConnection(provider: IntegrationProvider) {
  const context = await requireWorkspace(); await requireOwner(context); assertEncryptionConfigured(); oauthConfig(provider);
  const session = await verifiedSessionId(context);
  const repository = new IntegrationRepository(createRuntimeClient());
  const existing = (await repository.list(context.workspace.id)).find((c) => c.provider === provider);
  const id = existing?.id ?? randomUUID(); const state = randomBytes(32).toString("base64url"); const binding = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  await repository.rpc("begin_integration_oauth", { p_workspace: context.workspace.id, p_actor: context.user.id, p_provider: provider, p_hash: hash(state),
    p_binding: hash(`${binding}:${session}`), p_connection: id, p_verifier: encryptSecret(verifier, { workspaceId: context.workspace.id, connectionId: id, provider }) });
  (await cookies()).set(`ao-oauth-${provider}`, binding, { httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax", path: `/api/integrations/${provider}`, maxAge: 600 });
  return { url: authorizationUrl(provider, state, hashBase64(verifier)) };
}
const hashBase64 = (v: string) => createHash("sha256").update(v).digest("base64url");
export async function completeConnection(provider: IntegrationProvider, params: URLSearchParams) {
  const identity = await requireUser(); const session = await verifiedSessionId(identity);
  const state = z.string().regex(/^[A-Za-z0-9_-]{43}$/).safeParse(params.get("state"));
  const binding = (await cookies()).get(`ao-oauth-${provider}`)?.value;
  if (!state.success || !binding) throw new AppError("unauthorized", "OAuth state expired or does not match this browser. Start connection again.");
  const repository = new IntegrationRepository(createRuntimeClient());
  const saved = z.object({ workspace_id: z.uuid(), connection_id: z.uuid(), encrypted_verifier: z.string() }).parse(await repository.rpc("consume_integration_oauth", {
    p_hash: hash(state.data), p_actor: identity.user.id, p_provider: provider, p_binding: hash(`${binding}:${session}`) }));
  (await cookies()).set(`ao-oauth-${provider}`, "", { path: `/api/integrations/${provider}`, httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax", maxAge: 0 });
  const context = await requireWorkspace(saved.workspace_id); await requireOwner(context);
  if (params.has("error")) throw new IntegrationError("consent_denied", "blocked");
  const code = z.string().min(1).max(4096).parse(params.get("code"));
  const cipherContext = { workspaceId: saved.workspace_id, connectionId: saved.connection_id, provider };
  const oauth = new OAuthProvider(); const tokens = await oauth.tokens(provider, { code, verifier: decryptSecret(saved.encrypted_verifier, cipherContext) });
  if (!tokens.refresh_token) throw new IntegrationError("offline_access_missing", "blocked");
  const account = await oauth.identity(provider, tokens);
  const scopes = account.scopes.map((s) => s === "email" ? "https://www.googleapis.com/auth/userinfo.email" : s);
  return connectionRowSchema.parse(await repository.rpc("connect_integration", { p_workspace: context.workspace.id, p_actor: context.user.id, p_id: saved.connection_id,
    p_provider: provider, p_identity: account.identity, p_display: account.displayName, p_scopes: scopes,
    p_tokens: encryptSecret(JSON.stringify({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }), cipherContext),
    p_expires: new Date(Date.now() + tokens.expires_in * 1000).toISOString() }));
}
export async function disconnectConnection(id: string) {
  const context = await requireWorkspace(); await requireOwner(context);
  const repository = new IntegrationRepository(createRuntimeClient());
  const current = (await repository.list(context.workspace.id)).find((c) => c.id === z.uuid().parse(id));
  if (!current) throw new AppError("not_found");
  const creds = await repository.credentials(context.workspace.id, id);
  // Local authorization is revoked before remote I/O; a remote failure cannot preserve local dispatch rights.
  await repository.rpc("disconnect_integration", { p_workspace: context.workspace.id, p_actor: context.user.id, p_connection: id });
  let revoked = false;
  if (current.provider === "gmail" && creds) {
    try { const tokens = tokensSchema.parse(JSON.parse(decryptSecret(creds.encrypted_tokens, { workspaceId: context.workspace.id, connectionId: id, provider: current.provider })));
      revoked = await new OAuthProvider().revokeGoogle(tokens.refreshToken); } catch { /* local disconnect already committed */ }
  }
  return { disconnected: true, remoteRevoked: revoked, instruction: current.provider === "hubspot"
    ? "Uninstall the app in HubSpot Settings → Integrations → Connected apps. Local credentials have been deleted."
    : revoked ? "Google access revoked. In-flight requests may still complete." : "Local credentials deleted. Remove app access in your Google account if remote revocation did not complete." };
}
/** Refresh is fenced by DB generation/version and a separate connection claim; no lock crosses HTTP. */
export class IntegrationService {
  constructor(private readonly repository: Pick<IntegrationRepository, "rpc">, private readonly oauth = new OAuthProvider()) {}
  async accessToken(connection: IntegrationConnection, actor: string): Promise<string> {
    assertEncryptionConfigured(); const claim = randomUUID();
    const credentials = credentialSchema.parse(await this.repository.rpc("claim_integration_refresh", { p_workspace: connection.workspace_id, p_actor: actor,
      p_connection: connection.id, p_generation: connection.generation, p_claim: claim }));
    const context = { workspaceId: connection.workspace_id, connectionId: connection.id, provider: connection.provider };
    const old = tokensSchema.parse(JSON.parse(decryptSecret(credentials.encrypted_tokens, context)));
    if (credentials.refresh_claim !== claim) return old.accessToken;
    try {
      const tokens = await this.oauth.tokens(connection.provider, { refreshToken: old.refreshToken });
      const account = await this.oauth.identity(connection.provider, { ...tokens, scope: tokens.scope ?? connection.scopes.join(" ") });
      if (account.identity !== connection.provider_identity) throw new IntegrationError("identity_changed", "blocked");
      await this.repository.rpc("finish_integration_refresh", { p_workspace: connection.workspace_id, p_actor: actor, p_connection: connection.id,
        p_generation: connection.generation, p_claim: claim, p_version: credentials.version,
        p_tokens: encryptSecret(JSON.stringify({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? old.refreshToken }), context),
        p_expires: new Date(Date.now() + tokens.expires_in * 1000).toISOString() });
      return tokens.access_token;
    } catch (e) {
      const code = e instanceof IntegrationError && ["reconnect_required", "identity_changed"].includes(e.code) ? e.code
        : e instanceof IntegrationError && e.code === "identity_or_scopes_missing" ? "missing_scopes" : "refresh_failed";
      await this.repository.rpc("finish_integration_refresh", { p_workspace: connection.workspace_id, p_actor: actor, p_connection: connection.id,
        p_generation: connection.generation, p_claim: claim, p_version: credentials.version, p_tokens: null, p_expires: null, p_error: code });
      throw new AppError("execution_blocked", "Connection needs owner attention. No action was dispatched.");
    }
  }
}
