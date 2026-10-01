"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@base-ui/react/field";
import { previewCrmAction, proposeCrmAction, proposeFollowUpAction } from "@/app/actions/execution";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useDemoStore } from "@/components/app/demo-store";
import type { ProposedAction } from "@/types/domain";
import type { z } from "zod";
import type { crmPatchSchema, crmCurrentSchema } from "@/lib/validation/execution";
type PreviewResult = Awaited<ReturnType<typeof previewCrmAction>>;
type Preview = Extract<PreviewResult, { ok: true }> ["preview"];
export function AuxiliaryProposals({ action, followUpReplacement, crmReplacement }: { action: ProposedAction; followUpReplacement?: ProposedAction; crmReplacement?: ProposedAction }) {
  const { integrationConnections } = useDemoStore(); const router = useRouter();
  const [open, setOpen] = useState<"crm" | "follow" | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null); const [patch, setPatch] = useState<Record<string, string>>({});
  const [due, setDue] = useState(""); const [timezone, setTimezone] = useState("Asia/Qyzylorda"); const [note, setNote] = useState(""); const [requestId, setRequestId] = useState("");
  const portal = integrationConnections?.find((c) => c.provider === "hubspot" && c.status === "connected");
  const success = action.attempts?.find((t) => t.status === "succeeded");
  if (action.envelope?.actionType !== "send_email" || action.supersededById || ["cancelled", "rejected"].includes(action.status)) return null;
  async function loadCrm() {
    if (!portal) return; setPending(true); setError(""); setRequestId(crypto.randomUUID());
    const result = await previewCrmAction({ actionId: action.id, connectionId: portal.id }); setPending(false);
    if (!result.ok) { setError(result.error); return; }
    setPreview(result.preview); setPatch({}); setOpen("crm");
  }
  async function propose() {
    setPending(true); setError("");
    try {
      if (open === "crm" && preview) {
        const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v.trim() && v.trim() !== (preview.properties[k] ?? "")).map(([k, v]) => [k, v.trim()]));
        const expected = Object.fromEntries(Object.keys(changed).map((k) => [k, preview.properties[k] || null]));
        const result = await proposeCrmAction({ sourceActionId: action.id, revision: preview.revision, connectionId: preview.connection.id, connectionGeneration: preview.connection.generation,
          connectionIdentity: preview.connection.identity, contactId: preview.contactId, patch: changed as z.infer<typeof crmPatchSchema>, expected: expected as z.infer<typeof crmCurrentSchema>, previewedAt: preview.previewedAt, requestId, replacesActionId: crmReplacement?.id });
        if (!result.ok) throw new Error(result.error);
      } else {
        if (!success || !due) throw new Error("Choose a future UTC date and time.");
        const dueAt = new Date(`${due}:00Z`).toISOString();
        if (new Date(dueAt).getTime() <= Date.now()) throw new Error("Choose a date in the future.");
        const result = await proposeFollowUpAction({ parentAttemptId: success.id, dueAt, timezone, note: note.trim() || null, requestId, replacesActionId: followUpReplacement?.id });
        if (!result.ok) throw new Error(result.error);
      }
      setOpen(null); setNotice("Proposal saved to Approval inbox. Review, approve and Execute separately."); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Proposal could not be saved."); } finally { setPending(false); }
  }
  const keys = ["firstname", "lastname", "jobtitle"] as const;
  function openFollowUp() {
    const old = followUpReplacement?.envelope;
    if (old?.actionType === "schedule_follow_up") { setDue(old.dueAt.slice(0,16)); setTimezone(old.timezone); setNote(old.note ?? ""); }
    setOpen("follow"); setRequestId(crypto.randomUUID()); setError("");
  }
  return <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
    <div className="flex flex-wrap gap-2">{!followUpReplacement && <Button size="sm" variant="outline" disabled={pending || !portal} onClick={loadCrm}>{pending ? "Loading preview…" : crmReplacement ? "Fresh CRM preview / replacement" : "Sync contact / preview"}</Button>}
      {success && !crmReplacement && <Button size="sm" variant="outline" disabled={pending} onClick={openFollowUp}>{followUpReplacement ? "Change date / new approval" : "Plan follow-up"}</Button>}</div>
    {!followUpReplacement && !portal && <p className="text-[11px] text-muted-foreground">Connect HubSpot to preview contact changes.</p>}{error && !open && <p role="alert" className="text-xs text-destructive">{error}</p>}{notice && <p role="status" className="text-xs leading-5 text-muted-foreground">{notice}</p>}
    <Dialog open={open !== null} onOpenChange={(v) => { if (!v && !pending) setOpen(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{open === "crm" ? "Propose exact CRM field changes" : "Plan an internal follow-up"}</DialogTitle><DialogDescription>{open === "crm" ? "Only the fields shown below are proposed. Empty inputs leave existing fields unchanged. HubSpot does not offer atomic compare-and-swap; another external edit can race the final write." : "Enter UTC explicitly to avoid ambiguous local times. The plan saves a reminder only. Automatic execution will appear in Release 0.7."}</DialogDescription></DialogHeader>
      {open === "crm" && preview ? <div className="flex min-w-0 flex-col gap-4">{crmReplacement && <p className="text-xs leading-6 text-[var(--warning-fg)]">The old proposal will be cancelled. Review and approve the new preview independently.</p>}<p className="break-all text-xs font-medium">{preview.recipient} · {preview.connection.displayName} · {preview.contactId ? `Update contact ${preview.contactId}` : "Create contact"}</p>
        {keys.map((k) => <Field.Root key={k} className="flex flex-col gap-2"><Field.Label htmlFor={`crm-${k}`} className="text-xs font-medium">{k === "firstname" ? "First name (explicit)" : k === "lastname" ? "Last name (explicit)" : "Job title"}</Field.Label><Input id={`crm-${k}`} maxLength={240} value={patch[k] ?? ""} onChange={(e) => setPatch({ ...patch, [k]: e.target.value })} placeholder="Leave unchanged" /><p className="text-[11px] text-muted-foreground">Current: {preview.properties[k] || "not set"}</p></Field.Root>)}
        <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={Boolean(patch.company)} onChange={(e) => setPatch({ ...patch, company: e.target.checked ? preview.supportedCompany : "" })} />Use source-supported company: {preview.supportedCompany}</label>
        <label className="flex items-start gap-2 break-all text-xs leading-5"><input type="checkbox" checked={Boolean(patch.website)} onChange={(e) => setPatch({ ...patch, website: e.target.checked ? preview.supportedWebsite : "" })} />Use source-supported website: {preview.supportedWebsite}</label>
        <dl className="flex flex-col gap-2 border-t border-border pt-3 text-xs">{Object.entries(patch).filter(([k, v]) => v.trim() && v.trim() !== (preview.properties[k] ?? "")).map(([k, v]) => <div key={k} className="break-words"><dt className="font-medium">{k}</dt><dd className="mt-1 text-muted-foreground">{preview.properties[k] || "not set"} → {v}</dd></div>)}</dl>
      </div> : <div className="flex flex-col gap-4">{followUpReplacement && <p className="text-xs leading-6 text-[var(--warning-fg)]">Saving the replacement cancels the previous plan. The new date requires its own review, approval and Execute.</p>}<p className="break-all text-xs">Parent email: {action.recipientEmail} · {success?.result?.messageId ?? "operator-confirmed operation"}</p>
        <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="follow-due" className="text-xs font-medium">Due date and time (UTC)</Field.Label><Input id="follow-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field.Root>
        <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="follow-zone" className="text-xs font-medium">Operator timezone (IANA)</Field.Label><Input id="follow-zone" value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={80} /></Field.Root>
        {due && <p className="text-xs text-muted-foreground">Exact UTC: {due.replace("T", " ")} UTC</p>}
        <Field.Root className="flex flex-col gap-2"><Field.Label htmlFor="follow-note" className="text-xs font-medium">Internal note (optional)</Field.Label><Textarea id="follow-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} /></Field.Root>
      </div>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}<Button disabled={pending} onClick={propose}>{pending ? "Saving proposal…" : "Save proposal for separate approval"}</Button>
    </DialogContent></Dialog>
  </div>;
}
