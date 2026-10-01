import assert from "node:assert/strict";
import test from "node:test";
import { GmailAdapter, approvedMime } from "./gmail";
import { HubSpotAdapter } from "./hubspot";
import { IntegrationError, providerFetch, safeJson } from "./http";
import { executionFixture, crmFixture } from "../execution/testing/execution-fixtures";

test("Gmail sends only the exact approved UTF-8 MIME using a fixed host", async () => {
  const { envelope } = executionFixture(); let mime = "";
  const gmail = new GmailAdapter(async (url,init) => {
    assert.equal(String(url),"https://gmail.googleapis.com/gmail/v1/users/me/messages/send"); assert.equal(init?.redirect,"error");
    const input = JSON.parse(String(init?.body)) as { raw: string }; assert.deepEqual(Object.keys(input),["raw"]); mime = Buffer.from(input.raw,"base64url").toString("utf8");
    return Response.json({ id: "accepted", threadId: "thread" });
  });
  assert.equal((await gmail.send(envelope,"fake","<stable@operation.local>",new Date("2026-01-01T00:00:00Z"))).messageId,"accepted");
  assert.match(mime,/From: sender@example.com/); assert.match(mime,/To: .*test@example.com/); assert.match(mime,/Message-ID: <stable@operation.local>/);
  assert.match(mime,/Content-Type: text\/plain; charset=utf-8/i); assert.match(mime,/Subject: =\?UTF-8\?B\?/i);
  const encodedSubject = mime.replace(/\r\n[ \t]+/g," ").match(/^Subject: (.+)$/m)![1];
  assert.equal([...encodedSubject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/gi)].map((m) => Buffer.from(m[1],"base64").toString()).join(""),envelope.subject);
  const body = mime.split("\r\n\r\n")[1].replaceAll("\r\n",""); assert.equal(Buffer.from(body,"base64").toString().replaceAll("\r\n","\n"),envelope.body);
  assert.doesNotMatch(mime,/^(Cc|Bcc|Content-Disposition|X-.*):/im);
});
test("MIME construction rejects header injection and unauthorized fields", async () => {
  const { envelope } = executionFixture();
  await assert.rejects(approvedMime({ ...envelope, subject: "subject\r\nBcc: x@example.com" },"<x@local>",new Date()));
  await assert.rejects(approvedMime({ ...envelope, recipient: { ...envelope.recipient,email:"x@example.com,y@example.com" } },"<x@local>",new Date()));
  await assert.rejects(approvedMime(envelope,"<x@local>\r\nBcc: attacker@example.com",new Date()),/invalid_message_identity/);
  await assert.rejects(approvedMime({ ...envelope, subject: "subject\n" },"<x@local>",new Date()));
});
test("Gmail safe rejection and ambiguous success responses never reveal raw provider errors", async () => {
  const { envelope } = executionFixture();
  for (const [status,disposition] of [[400,"terminal"],[401,"blocked"],[403,"blocked"],[429,"retryable"],[500,"unknown"]] as const) {
    await assert.rejects(new GmailAdapter(async () => Response.json({ error:"secret raw body" },{ status })).send(envelope,"fake","<x@local>",new Date()),
      (e: unknown) => e instanceof IntegrationError && e.disposition === disposition && !e.message.includes("secret"));
  }
  await assert.rejects(new GmailAdapter(async () => Response.json({ no_id:true })).send(envelope,"fake","<x@local>",new Date()),(e: unknown) => e instanceof IntegrationError && e.disposition === "unknown");
});
test("Provider transport refuses arbitrary hosts and never forwards authorization through redirects", async () => {
  let calls = 0; await assert.rejects(providerFetch("https://attacker.example.com",{},async () => { calls++; return Response.json({}); })); assert.equal(calls,0);
  await assert.rejects(providerFetch("http://gmail.googleapis.com",{}));
});
test("Untrusted provider JSON is bounded by UTF-8 bytes and malformed bodies stay unknown", async () => {
  await assert.rejects(safeJson(new Response(JSON.stringify({ untrusted: "я".repeat(600000) }))), /invalid_provider_response/);
  await assert.rejects(safeJson(new Response("malformed private response")), /invalid_provider_response/);
  assert.deepEqual(await safeJson(Response.json({ id: "safe" })), { id: "safe" });
});
test("HubSpot missing contact uses canonical email lookup and creates only approved fields", async () => {
  const crm = crmFixture(); const methods: string[] = [];
  const adapter = new HubSpotAdapter(async (url,init) => {
    methods.push(init?.method ?? "GET");
    if (methods.length === 1) { assert.match(String(url),/idProperty=email/); assert.doesNotMatch(String(url),/search/); return new Response(null,{ status:404 }); }
    assert.equal(String(url),"https://api.hubapi.com/crm/v3/objects/contacts");
    const body = JSON.parse(String(init?.body)) as { properties: Record<string,string> }; assert.deepEqual(body.properties,{ email:crm.recipient.email,...crm.patch });
    return Response.json({ id:"42",properties:body.properties });
  });
  assert.equal((await adapter.upsert(crm,"fake")).contactId,"42"); assert.deepEqual(methods,["GET","POST"]);
});
test("HubSpot update preserves unrelated CRM properties", async () => {
  const crm = { ...crmFixture(),contactId:"42",expected:{ firstname:"Old",jobtitle:"Old role" } }; const methods: string[] = [];
  const adapter = new HubSpotAdapter(async (_url,init) => {
    methods.push(init?.method ?? "GET"); if (!init?.method) return Response.json({ id:"42",properties:{ email:crm.recipient.email,firstname:"Old",jobtitle:"Old role",lifecyclestage:"customer",lastname:"Unchanged" } });
    assert.deepEqual(JSON.parse(String(init.body)),{ properties:crm.patch }); return Response.json({ id:"42",properties:{ email:crm.recipient.email,...crm.patch } });
  });
  assert.equal((await adapter.upsert(crm,"fake")).contactId,"42"); assert.deepEqual(methods,["GET","PATCH"]);
});
test("Changed CRM preview blocks write and requires a fresh approval", async () => {
  const crm = { ...crmFixture(),contactId:"42" }; let writes = 0;
  const adapter = new HubSpotAdapter(async (_url,init) => { if (init?.method) writes++; return Response.json({ id:"42",properties:{ email:crm.recipient.email,firstname:"Externally changed",jobtitle:null } }); });
  await assert.rejects(adapter.upsert(crm,"fake"),/crm_preview_conflict/); assert.equal(writes,0);
});
test("Create conflict reconciles by unique identity rather than repeating a create", async () => {
  const crm = crmFixture(); let calls = 0; let writes = 0;
  const adapter = new HubSpotAdapter(async (_url,init) => {
    calls++; if (calls === 1) return new Response(null,{ status:404 }); if (init?.method) { writes++; return new Response(null,{ status:409 }); }
    return Response.json({ id:"42",properties:{ email:crm.recipient.email,...crm.patch } });
  });
  assert.equal((await adapter.upsert(crm,"fake")).contactId,"42"); assert.equal(writes,1);
});
test("Unknown CRM outcome uses read-only reconciliation of exact fields", async () => {
  const crm = crmFixture(); let calls = 0; const adapter = new HubSpotAdapter(async (_url,init) => { calls++; assert.equal(init?.method,undefined); return Response.json({ id:"42",properties:{ email:crm.recipient.email,...crm.patch } }); });
  assert.equal((await adapter.reconcile(crm,"fake"))?.contactId,"42"); assert.equal(calls,1);
  const mismatch = new HubSpotAdapter(async () => Response.json({ id:"42",properties:{ email:crm.recipient.email,firstname:"Different",jobtitle:"Operations" } }));
  assert.equal(await mismatch.reconcile(crm,"fake"),null);
});
