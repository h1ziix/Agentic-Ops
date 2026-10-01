import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { executableEnvelopeSchema, executeRequestSchema, singleEmailSchema, crmEnvelopeSchema, revisionSelectionSchema, followUpRequestSchema, connectionRowSchema } from "@/lib/validation/execution";
import { executionFixture, crmFixture } from "./testing/execution-fixtures";
import { executionBlockers } from "./readiness";
import { envelopeDigest, canonicalJson } from "./digest";

test("Legacy approvals and loose/unknown action JSON never become executable", () => {
  const f = executionFixture();
  for (const action of [{ ...f.action, schema_version: 1 }, { ...f.action, executable_envelope: { subject: "old", recipient: null } },
    { ...f.action, executable_envelope: { ...f.envelope, actionType: "constructor" } }, { ...f.action, executable_envelope: { ...f.envelope, cc: "other@example.com" } }])
    assert.ok(executionBlockers(action, f.snapshot, f.connection, f.workflow, []).length);
});
test("One email address rejects header injection, multiple addresses and invented headers", () => {
  for (const email of ["a@example.com\r\nBcc: x@example.com", "a@example.com\r\n", "\na@example.com", "a@example.com,b@example.com", "a@example.com;b@example.com", "Name <a@example.com>", "a@example.com\0"]) assert.equal(singleEmailSchema.safeParse(email).success, false);
  assert.equal(singleEmailSchema.parse(" a@example.com "), "a@example.com");
  assert.equal(executeRequestSchema.safeParse({ actionId: randomUUID(), expectedSnapshotId: randomUUID(), subject: "browser mutation" }).success, false);
});
test("Approved content, recipient and sender changes invalidate the exact immutable snapshot", () => {
  const f = executionFixture(); assert.deepEqual(executionBlockers(f.action, f.snapshot, f.connection, f.workflow, []), []);
  for (const modified of [{ ...f.envelope, body: "Changed after approval" }, { ...f.envelope, recipient: { ...f.envelope.recipient, email: "other@example.com" } },
    { ...f.envelope, connection: { ...f.envelope.connection, identity: "other@example.com" } }, { ...f.envelope, revision: 2 }]) {
    assert.ok(executionBlockers({ ...f.action, executable_envelope: modified }, f.snapshot, f.connection, f.workflow, []).length);
  }
  assert.ok(executionBlockers(f.action, { ...f.snapshot, envelope: { ...f.envelope, subject: "tampered snapshot" } }, f.connection, f.workflow, []).length);
});
test("Workspace, connection generation, account and scope mismatches fail closed", () => {
  const f = executionFixture();
  for (const connection of [{ ...f.connection, workspace_id: randomUUID() }, { ...f.connection, generation: 2 }, { ...f.connection, provider_identity: "wrong@example.com" },
    { ...f.connection, scopes: ["openid"] }, { ...f.connection, status: "disconnected" as const }, null]) assert.ok(executionBlockers(f.action, f.snapshot, connection, f.workflow, []).length);
  assert.ok(executionBlockers(f.action, { ...f.snapshot, workspace_id: randomUUID() }, f.connection, f.workflow, []).length);
});
test("CRM and follow-up actions cannot inherit email approval", () => {
  const f = executionFixture(); const crm = crmFixture();
  assert.ok(executionBlockers({ ...f.action, action_type: "upsert_crm_contact", executable_envelope: crm, is_auxiliary: true }, f.snapshot, f.connection, f.workflow, []).length);
  const follow = { schemaVersion: 2, actionType: "schedule_follow_up", workspaceId: f.action.workspace_id, workflowId: f.workflow.id, actionId: randomUUID(), snapshotId: randomUUID(), lineageId: randomUUID(), revision: 1,
    parentAttemptId: randomUUID(), parentActionId: f.action.id, dueAt: new Date(Date.now()+86_400_000).toISOString(), timezone: "Asia/Qyzylorda", note: null };
  assert.ok(executionBlockers({ ...f.action, executable_envelope: follow, is_auxiliary: true }, f.snapshot, null, f.workflow, []).length);
});
test("CRM properties are allowlisted, absent means unchanged and empty never clears a field", () => {
  const crm = crmFixture(); assert.ok(crmEnvelopeSchema.safeParse(crm).success);
  for (const patch of [{ firstname: "" }, { jobtitle: null }, { lifecyclestage: "customer" }, { hubspot_owner_id: "1" }, { custom: "x" }]) assert.equal(crmEnvelopeSchema.safeParse({ ...crm, patch }).success, false);
  assert.equal(crmEnvelopeSchema.safeParse({ ...crm, expected: { firstname: null } }).success, false);
});
test("Bulk decisions require distinct expected revisions; stale snapshot identity is checked", () => {
  const f = executionFixture(); assert.ok(revisionSelectionSchema.safeParse([{ actionId: f.action.id, revision: 1 }]).success);
  assert.equal(revisionSelectionSchema.safeParse([{ actionId: f.action.id, revision: 1 }, { actionId: f.action.id, revision: 1 }]).success, false);
  assert.ok(executionBlockers(f.action, { ...f.snapshot, revision: 2 }, f.connection, f.workflow, []).length);
});
test("Canonical digest covers exact UTF-8 content and is independent of object key insertion", () => {
  const f = executionFixture(); const reversed = Object.fromEntries(Object.entries(f.envelope).reverse());
  assert.equal(canonicalJson(f.envelope), canonicalJson(reversed)); assert.equal(envelopeDigest(f.envelope), envelopeDigest(executableEnvelopeSchema.parse(reversed)));
  assert.notEqual(envelopeDigest(f.envelope), envelopeDigest({ ...f.envelope, subject: f.envelope.subject+"!" }));
});
test("Follow-up input keeps explicit UTC and IANA timezone; public DTO excludes credentials", () => {
  const request = { parentAttemptId: randomUUID(), requestId: randomUUID(), dueAt: "2030-01-01T12:00:00.000Z", timezone: "Asia/Qyzylorda", note: null };
  assert.ok(followUpRequestSchema.safeParse(request).success);
  assert.equal(followUpRequestSchema.safeParse({ ...request, dueAt: "2030-01-01T12:00:00" }).success, false);
  assert.equal(followUpRequestSchema.safeParse({ ...request, timezone: "invented" }).success, false);
  const dto = connectionRowSchema.parse({ ...executionFixture().connection, access_token: "never-client", encrypted_tokens: "never-client" });
  assert.equal(JSON.stringify(dto).includes("never-client"), false);
});
