"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@base-ui/react/field";
import { saveExecutableEmailAction } from "@/app/actions/approvals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDemoStore } from "@/components/app/demo-store";
import type { ProposedAction } from "@/types/domain";
export function ExecutableEmailEditor({ action, close }: { action: ProposedAction; close: () => void }) {
  const { integrationConnections } = useDemoStore(); const router = useRouter();
  const email = action.envelope?.actionType === "send_email" ? action.envelope : undefined;
  const connections = integrationConnections?.filter((c) => c.provider === "gmail" && c.status === "connected") ?? [];
  const [edit, setEdit] = useState({ email: email?.recipient.email ?? action.recipientEmail, name: email?.recipient.name ?? "", role: email?.recipient.role ?? "", connectionId: email?.connection.id ?? connections[0]?.id ?? "", subject: action.subject, body: action.body });
  const [confirmed, setConfirmed] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function save() {
    setPending(true); setError("");
    const result = await saveExecutableEmailAction({ ...edit, actionId: action.id, revision: action.revision ?? 0, name: edit.name.trim() || null, role: edit.role.trim() || null, confirmRecipient: confirmed });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    close(); router.replace(`/approvals?approval=${result.approvalId}`); router.refresh();
  }
  return <div className="flex min-w-0 flex-col gap-4">
    <p className="text-xs leading-6 text-muted-foreground">{action.status === "approved" ? "Saving creates a replacement proposal. The previous approval cannot authorize the new recipient, sender or content." : "Saving creates an executable revision. Approval remains a separate decision."} Original AI output and evidence stay in history.</p>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field.Root className="flex min-w-0 flex-col gap-2"><Field.Label htmlFor="contact-email" className="text-xs font-medium">Recipient email</Field.Label><Input id="contact-email" type="email" autoComplete="off" value={edit.email} onChange={(e) => { setEdit({ ...edit, email: e.target.value }); setConfirmed(false); }} maxLength={254} /></Field.Root>
      <Field.Root className="flex min-w-0 flex-col gap-2"><Field.Label htmlFor="sender-connection" className="text-xs font-medium">Sending Gmail account</Field.Label><select id="sender-connection" className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring" value={edit.connectionId} onChange={(e) => setEdit({ ...edit, connectionId: e.target.value })}><option value="">Select connected account</option>{connections.map((c) => <option key={c.id} value={c.id}>{c.provider_identity} · generation {c.generation}</option>)}</select></Field.Root>
      <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="contact-name" className="text-xs font-medium">Display name (optional)</Field.Label><Input id="contact-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={240} /></Field.Root>
      <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="contact-role" className="text-xs font-medium">Role (optional)</Field.Label><Input id="contact-role" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} maxLength={240} /></Field.Root>
    </div>
    <label className="flex items-start gap-2 text-xs leading-6"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm this exact recipient is intended for this company. This does not verify deliverability.</label>
    <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="executable-subject" className="text-xs font-medium">Subject</Field.Label><Input id="executable-subject" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} maxLength={200} /></Field.Root>
    <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="executable-body" className="text-xs font-medium">Plain-text message</Field.Label><Textarea id="executable-body" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} maxLength={10000} rows={12} /></Field.Root>
    {error && <p role="alert" className="text-xs leading-6 text-destructive">{error}</p>}
    {!connections.length && <p className="text-xs text-muted-foreground">Connect Gmail in Settings before saving an executable revision.</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" disabled={pending} onClick={close}>Cancel edit</Button><Button size="sm" disabled={pending || !confirmed || !edit.connectionId} onClick={save}>{pending ? "Saving…" : action.status === "approved" ? "Save replacement for review" : "Save confirmed revision"}</Button></div>
  </div>;
}
