import "server-only";
import MailComposer from "nodemailer/lib/mail-composer";
import { z } from "zod";
import { emailEnvelopeSchema, type EmailEnvelope, type ExecutionResult } from "@/lib/validation/execution";
import { IntegrationError, providerFetch, safeJson, type IntegrationFetch } from "./http";
export function messageIdForOperation(operation: string) { return `<${operation.replace(/[^a-zA-Z0-9-]/g, "")}@execution.agentic-ops.local>`; }
export async function approvedMime(envelope: EmailEnvelope, messageId: string, date: Date): Promise<string> {
  const action = emailEnvelopeSchema.parse(envelope);
  if (!/^<[A-Za-z0-9._-]+@[A-Za-z0-9.-]+>$/.test(messageId) || messageId.length > 240 || !Number.isFinite(date.getTime())) throw new IntegrationError("invalid_message_identity", "blocked");
  const message = new MailComposer({ from: { address: action.connection.identity, name: "" }, to: { address: action.recipient.email, name: action.recipient.name ?? "" },
    subject: action.subject, text: action.body, messageId, date, textEncoding: "base64", disableFileAccess: true, disableUrlAccess: true }).compile();
  const content = await new Promise<Buffer>((resolve, reject) => message.build((error, result) => error ? reject(error) : resolve(result)));
  return content.toString("base64url");
}
export class GmailAdapter {
  constructor(private readonly transport: IntegrationFetch = fetch) {}
  async send(action: EmailEnvelope, accessToken: string, messageId: string, date: Date): Promise<ExecutionResult> {
    const raw = await approvedMime(action, messageId, date);
    const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) }, this.transport);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new IntegrationError("gmail_permission_rejected", "blocked");
      if (response.status === 400 || response.status === 404) throw new IntegrationError("gmail_request_rejected", "terminal");
      // A documented rate-limit rejection is safe to retry explicitly after Retry-After.
      if (response.status === 429) throw new IntegrationError("gmail_rate_limited", "retryable", Math.max(60, Math.min(Number(response.headers.get("retry-after")) || 60, 3600)));
      throw new IntegrationError("gmail_acceptance_unknown", "unknown");
    }
    const parsed = z.object({ id: z.string().min(1).max(240), threadId: z.string().max(240).optional() }).safeParse(await safeJson(response));
    if (!parsed.success) throw new IntegrationError("gmail_acceptance_unknown", "unknown");
    return { messageId: parsed.data.id, threadId: parsed.data.threadId ?? null, acceptedAt: new Date().toISOString() };
  }
}
