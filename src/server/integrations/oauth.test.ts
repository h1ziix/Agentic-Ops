import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { encryptSecret, decryptSecret, assertEncryptionConfigured } from "./crypto";
import { authorizationUrl, OAuthProvider } from "./oauth-provider";
import { appOrigin } from "./config";
import { IntegrationService } from "../services/integration-service";
import { executionFixture } from "../execution/testing/execution-fixtures";
import { REQUIRED_SCOPES } from "@/lib/validation/execution";

function configured() {
  const values: Record<string,string> = { NEXT_PUBLIC_APP_URL:"http://localhost:3000",GOOGLE_CLIENT_ID:"test-google",GOOGLE_CLIENT_SECRET:"test-google-secret",
    HUBSPOT_CLIENT_ID:"test-hubspot",HUBSPOT_CLIENT_SECRET:"test-hubspot-secret",INTEGRATION_TOKEN_ENCRYPTION_KEY:randomBytes(32).toString("base64") };
  const original = Object.fromEntries(Object.keys(values).map((key) => [key,process.env[key]])); Object.assign(process.env,values);
  return () => { for (const [key,value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value; };
}
test("AES-256-GCM uses random nonces and rejects tampered ciphertext, tags and AAD", () => {
  const restore = configured(); try {
    const context = { workspaceId:randomUUID(),connectionId:randomUUID(),provider:"gmail" }; const encrypted = encryptSecret("sensitive-refresh-token",context);
    assert.equal(decryptSecret(encrypted,context),"sensitive-refresh-token"); assert.notEqual(encrypted,encryptSecret("sensitive-refresh-token",context)); assert.equal(encrypted.includes("sensitive-refresh-token"),false);
    for (const field of ["workspaceId","connectionId","provider"] as const) assert.throws(() => decryptSecret(encrypted,{ ...context,[field]:"changed" }));
    for (const field of ["ciphertext","tag","nonce"]) { const parsed = JSON.parse(encrypted) as Record<string,string>; parsed[field] = Buffer.from("tampered").toString("base64"); assert.throws(() => decryptSecret(JSON.stringify(parsed),context)); }
  } finally { restore(); }
});
test("Missing or malformed encryption key fails closed without silent fallback", () => {
  const restore = configured(); try { for (const key of [undefined,"short",Buffer.alloc(31).toString("base64")]) { if (key === undefined) delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY; else process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = key; assert.throws(assertEncryptionConfigured); } } finally { restore(); }
});
test("Canonical production origin requires HTTPS and rejects paths and credentials", () => {
  const restore = configured(); try {
    assert.equal(appOrigin(),"http://localhost:3000");
    for (const origin of ["http://example.com","https://example.com/path","https://user:pass@example.com","https://example.com/?secret=x"]) { process.env.NEXT_PUBLIC_APP_URL=origin; assert.throws(appOrigin); }
    process.env.NEXT_PUBLIC_APP_URL="https://ops.example.com"; assert.equal(appOrigin(),"https://ops.example.com");
  } finally { restore(); }
});
test("Google authorization uses PKCE, offline access and only send plus verified identity scopes", () => {
  const restore = configured(); try {
    const url = new URL(authorizationUrl("gmail","one-use-state","S256challenge"));
    assert.equal(url.searchParams.get("code_challenge_method"),"S256"); assert.equal(url.searchParams.get("code_challenge"),"S256challenge"); assert.equal(url.searchParams.get("access_type"),"offline");
    assert.equal(url.searchParams.get("redirect_uri"),"http://localhost:3000/api/integrations/gmail/callback");
    assert.deepEqual(url.searchParams.get("scope")!.split(" "),[...REQUIRED_SCOPES.gmail]); assert.doesNotMatch(url.searchParams.get("scope")!,/readonly|modify|calendar/);
    const hubspot = new URL(authorizationUrl("hubspot","one-use-state")); assert.equal(hubspot.searchParams.has("code_challenge"),false);
  } finally { restore(); }
});
test("HubSpot v3 token/introspection credentials stay in POST body rather than URL", async () => {
  const restore = configured(); try {
    const urls: string[]=[]; const provider = new OAuthProvider(async (url,init) => {
      urls.push(String(url)); assert.equal(init?.method,"POST"); assert.equal(new URL(String(url)).search,""); assert.equal(init?.redirect,"error");
      const params=new URLSearchParams(String(init?.body)); assert.equal(params.get("client_secret"),"test-hubspot-secret");
      return urls.length===1 ? Response.json({ access_token:"test-access",refresh_token:"test-refresh",expires_in:1800 }) : Response.json({ active:true,hub_id:1234,client_id:"test-hubspot",scopes:[...REQUIRED_SCOPES.hubspot] });
    });
    const tokens=await provider.tokens("hubspot",{ code:"test-code",verifier:"unused" }); assert.equal((await provider.identity("hubspot",tokens)).identity,"1234");
    assert.deepEqual(urls,["https://api.hubspot.com/oauth/v3/token","https://api.hubspot.com/oauth/v3/token/introspect"]);
  } finally { restore(); }
});
test("Unverified Google identity or missing granted scopes blocks connection", async () => {
  const restore=configured(); try {
    for (const email_verified of [false,true]) {
      const provider=new OAuthProvider(async () => Response.json({ sub:"verified-endpoint-id",email:"test@example.com",email_verified }));
      await assert.rejects(provider.identity("gmail",{ access_token:"test",expires_in:1800,scope: email_verified ? "openid email" : REQUIRED_SCOPES.gmail.join(" ") }),/identity_or_scopes_missing/);
    }
  } finally { restore(); }
});
test("Revoked refresh token maps to a safe reconnect error", async () => {
  const restore=configured(); try { await assert.rejects(new OAuthProvider(async () => Response.json({ error:"invalid_grant",error_description:"sensitive" },{ status:400 })).tokens("gmail",{ refreshToken:"test" }),/reconnect_required/); } finally { restore(); }
});
test("Refresh preserves the existing refresh token when provider omits a new one", async () => {
  const restore=configured(); try {
    const { connection,request }=executionFixture(); const claimData={ connection_id:connection.id,workspace_id:connection.workspace_id,provider:"gmail",generation:1,
      encrypted_tokens:encryptSecret(JSON.stringify({ accessToken:"old-access",refreshToken:"old-refresh" }),{ workspaceId:connection.workspace_id,connectionId:connection.id,provider:"gmail" }),
      expires_at:new Date().toISOString(),version:3,refresh_claim:null,refresh_lease:null };
    let writes=0; const repository={ rpc:async (name:string,args:Record<string,unknown>) => {
      if (name==="claim_integration_refresh") return { ...claimData,refresh_claim:args.p_claim };
      writes++; assert.equal(args.p_generation,1); assert.equal(args.p_version,3);
      const saved=JSON.parse(decryptSecret(String(args.p_tokens),{ workspaceId:connection.workspace_id,connectionId:connection.id,provider:"gmail" })) as Record<string,string>;
      assert.deepEqual(saved,{ accessToken:"new-access",refreshToken:"old-refresh" }); return null;
    } };
    const oauth=new OAuthProvider(async (url) => String(url).includes("/token") ? Response.json({ access_token:"new-access",expires_in:1800 }) : Response.json({ sub:"id",email:connection.provider_identity,email_verified:true }));
    assert.equal(await new IntegrationService(repository,oauth).accessToken(connection,request.userId),"new-access"); assert.equal(writes,1);
  } finally { restore(); }
});
