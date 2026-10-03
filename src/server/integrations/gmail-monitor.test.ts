import test from "node:test";
import assert from "node:assert/strict";
import { GmailMonitor, canMonitorReplies } from "./gmail-monitor";
const scope = "https://www.googleapis.com/auth/gmail.readonly";
test("send-only OAuth does not grant inbox access and invokes no read transport", async () => {
  let calls = 0; const monitor = new GmailMonitor(async () => { calls++; throw new Error(); });
  assert.equal(canMonitorReplies(["https://www.googleapis.com/auth/gmail.send"]), false);
  await assert.rejects(monitor.replies("thread1", "sent1", "controlled@example.com", new Date().toISOString(), "secret", [])); assert.equal(calls, 0);
});
test("targeted metadata lookup detects only recipient replies after sent time and drops mailbox content", async () => {
  const sentAt = "2026-10-01T10:00:00Z";
  const message = (id: string, from: string, time: string, labels: string[] = []) => ({ id, internalDate: String(Date.parse(time)), labelIds: labels, payload: { headers: [{ name: "From", value: from }] } });
  const monitor = new GmailMonitor(async (url, options) => {
    assert.equal(new URL(String(url)).pathname, "/gmail/v1/users/me/threads/thread1"); assert.equal(new URL(String(url)).searchParams.get("format"), "metadata");
    assert.equal(options?.method, undefined); assert.equal(options?.redirect, "error");
    return Response.json({ id: "thread1", messages: [message("sent1", "me@example.com", sentAt, ["SENT"]),
      message("old", "controlled@example.com", "2026-10-01T09:00:00Z"), message("stranger", "other@example.com", "2026-10-02T10:00:00Z"),
      message("reply1", "Controlled <controlled@example.com>", "2026-10-02T10:00:00Z")] });
  });
  const result = await monitor.replies("thread1", "sent1", "controlled@example.com", sentAt, "server-only-token", [scope]);
  assert.deepEqual(result, [{ messageId: "reply1", threadId: "thread1", sender: "controlled@example.com", receivedAt: "2026-10-02T10:00:00.000Z" }]);
});
test("untrusted thread IDs cannot change provider path and read-only rate limits are recoverable", async () => {
  let calls = 0; const monitor = new GmailMonitor(async () => { calls++; return new Response(null, { status: 429 }); });
  await assert.rejects(monitor.replies("../messages", "sent", "test@example.com", "2026-10-01T00:00:00Z", "token", [scope])); assert.equal(calls, 0);
  await assert.rejects(monitor.replies("thread1", "sent", "test@example.com", "2026-10-01T00:00:00Z", "token", [scope]), (error: unknown) =>
    error instanceof Error && "disposition" in error && error.disposition === "retryable");
});
