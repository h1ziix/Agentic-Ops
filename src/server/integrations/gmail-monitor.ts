import "server-only";
import { z } from "zod";
import { IntegrationError, providerFetch, safeJson, type IntegrationFetch } from "./http";

const READONLY = "https://www.googleapis.com/auth/gmail.readonly";
const METADATA = "https://www.googleapis.com/auth/gmail.metadata";
export function canMonitorReplies(scopes: readonly string[]) { return scopes.includes(READONLY) || scopes.includes(METADATA); }
const threadSchema = z.object({ id: z.string().min(1).max(240), messages: z.array(z.object({ id: z.string().min(1).max(240),
  internalDate: z.string().regex(/^\d+$/), labelIds: z.array(z.string()).optional(), payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string().max(4000) })) }) })).max(100).optional() });
export class GmailMonitor {
  constructor(private readonly transport: IntegrationFetch = fetch) {}
  async replies(threadId: string, sentMessageId: string, recipient: string, sentAt: string, accessToken: string, scopes: readonly string[]) {
    if (!canMonitorReplies(scopes)) throw new IntegrationError("gmail_read_scope_required", "blocked");
    if (!/^[a-zA-Z0-9_-]{1,240}$/.test(threadId)) throw new IntegrationError("invalid_thread", "terminal");
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`);
    url.searchParams.set("format", "metadata"); url.searchParams.append("metadataHeaders", "From");
    url.searchParams.set("fields", "id,messages(id,internalDate,labelIds,payload/headers)");
    const response = await providerFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } }, this.transport);
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "gmail_monitor_auth" : "gmail_monitor_failed",
      response.status === 401 || response.status === 403 ? "blocked" : response.status === 429 || response.status >= 500 ? "retryable" : "terminal");
    const thread = threadSchema.parse(await safeJson(response));
    return (thread.messages ?? []).filter((message) => {
      const from = message.payload.headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
      const mailbox = (from.match(/<([^<>]+)>/)?.[1] ?? from).trim().toLowerCase();
      return message.id !== sentMessageId && !message.labelIds?.includes("SENT") && mailbox === recipient.toLowerCase()
        && Number(message.internalDate) > Date.parse(sentAt);
    }).map((message) => ({ messageId: message.id, threadId: thread.id, sender: recipient, receivedAt: new Date(Number(message.internalDate)).toISOString() }));
  }
}
