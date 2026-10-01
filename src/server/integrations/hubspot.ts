import "server-only";
import { z } from "zod";
import { crmEnvelopeSchema, singleEmailSchema, type CrmEnvelope, type ExecutionResult } from "@/lib/validation/execution";
import { IntegrationError, providerFetch, safeJson, type IntegrationFetch } from "./http";
const fields = ["firstname", "lastname", "jobtitle", "company", "website"] as const;
const contactSchema = z.object({ id: z.string().regex(/^\d+$/), properties: z.record(z.string(), z.string().nullable()) });
export type CrmContact = z.infer<typeof contactSchema>;
export class HubSpotAdapter {
  constructor(private readonly transport: IntegrationFetch = fetch) {}
  async lookup(email: string, token: string): Promise<CrmContact | null> {
    const url = `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(singleEmailSchema.parse(email))}?idProperty=email&properties=email,${fields.join(",")}`;
    const response = await providerFetch(url, { headers: { Authorization: `Bearer ${token}` } }, this.transport);
    if (response.status === 404) return null;
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? "reconnect_required" : "crm_lookup_failed", "blocked");
    const contact = contactSchema.safeParse(await safeJson(response));
    if (!contact.success || contact.data.properties.email?.toLowerCase() !== email.toLowerCase()) throw new IntegrationError("crm_identity_conflict", "blocked");
    return contact.data;
  }
  matches(action: CrmEnvelope, contact: CrmContact | null, desired: boolean) {
    return Boolean(contact && (!action.contactId || action.contactId === contact.id) && Object.entries(desired ? action.patch : action.expected)
      .every(([k, v]) => (contact.properties[k] || null) === (v || null)));
  }
  async reconcile(action: CrmEnvelope, token: string): Promise<ExecutionResult | null> {
    const contact = await this.lookup(action.recipient.email, token);
    return this.matches(action, contact, true) ? { contactId: contact!.id, acceptedAt: new Date().toISOString() } : null;
  }
  async upsert(envelope: CrmEnvelope, token: string): Promise<ExecutionResult> {
    const action = crmEnvelopeSchema.parse(envelope);
    const current = await this.lookup(action.recipient.email, token);
    if ((action.contactId === null && current) || (action.contactId !== null && !this.matches(action, current, false))) throw new IntegrationError("crm_preview_conflict", "blocked");
    const url = current ? `https://api.hubapi.com/crm/v3/objects/contacts/${current.id}` : "https://api.hubapi.com/crm/v3/objects/contacts";
    const properties = current ? action.patch : { email: action.recipient.email, ...action.patch };
    const response = await providerFetch(url, { method: current ? "PATCH" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ properties }) }, this.transport);
    if (response.status === 409 && !current) {
      const found = await this.lookup(action.recipient.email, token);
      if (this.matches(action, found, true)) return { contactId: found!.id, acceptedAt: new Date().toISOString() };
      throw new IntegrationError("crm_duplicate_conflict", "blocked");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new IntegrationError("reconnect_required", "blocked");
      if ([400, 404, 422].includes(response.status)) throw new IntegrationError("crm_write_rejected", "terminal");
      if (response.status === 429) throw new IntegrationError("crm_rate_limited", "retryable", 60);
      throw new IntegrationError("crm_write_unknown", "unknown");
    }
    const result = contactSchema.safeParse(await safeJson(response));
    if (!result.success || !this.matches(action, result.data, true)) throw new IntegrationError("crm_write_unknown", "unknown");
    return { contactId: result.data.id, acceptedAt: new Date().toISOString() };
  }
}
