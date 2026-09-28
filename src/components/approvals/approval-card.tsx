"use client";

import { useState } from "react";
import Link from "next/link";
import { Field } from "@base-ui/react/field";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleCheck, LockKeyhole, Mail, PencilLine, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { ApprovalResearch } from "@/components/approvals/approval-research";
import { approvalDraftSchema, useApprovalDrafts, type ApprovalDraft } from "@/components/approvals/use-approval-drafts";
import { formatDateTime } from "@/lib/format";
import type { Approval } from "@/types/domain";

export function ApprovalWorkspace({ approval, workflowTitle, onDecision }: { approval: Approval; workflowTitle: string; onDecision: (status: "approved" | "rejected") => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<ApprovalDraft>({ subject: "", body: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [viewed, setViewed] = useState<Set<number>>(new Set([0]));
  const { drafts, saveDraft, storageAvailable } = useApprovalDrafts();
  const reduced = useReducedMotion();
  const action = approval.proposedActions[selectedIndex];
  const pending = approval.status === "pending";
  const message = action ? drafts[action.id] ?? action : null;

  function select(index: number) {
    setSelectedIndex(index);
    setViewed((current) => new Set([...current, index]));
    setEditing(false);
    setSaved(false);
    setError("");
  }

  function save() {
    const parsed = approvalDraftSchema.safeParse(edit);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the message."); return; }
    if (!action) return;
    saveDraft(action.id, parsed.data);
    setEditing(false);
    setSaved(true);
    setError("");
  }

  return (
    <section className="flex min-w-0 flex-col" aria-label="Selected approval">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="section-label">Proposal / {approval.actionType.replaceAll('_', ' ')}</span><StatusBadge status={approval.status} /></div>
        <div><h2 className="text-lg font-semibold tracking-tight">{approval.title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{approval.description}</p></div>
        <Link href={`/workflows/${approval.workflowId}`} className="interactive-link flex w-fit max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><span className="truncate">{workflowTitle}</span><ArrowUpRight className="size-3 shrink-0" /></Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span>Prepared by {approval.requestedBy}</span><span>{formatDateTime(approval.requestedAt)} · Almaty</span></div>
      </header>

      {action && message ? <>
        <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface-quiet)] px-5 py-3 sm:px-6">
          <Mail className="size-3.5 shrink-0 text-muted-foreground" />
          <label htmlFor="approval-recipient" className="sr-only">Select recipient to review</label>
          <select id="approval-recipient" value={selectedIndex} disabled={editing} onChange={(event) => select(Number(event.target.value))} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            {approval.proposedActions.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.recipientName}</option>)}
          </select>
          <div className="ml-auto flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Previous recipient" disabled={selectedIndex === 0 || editing} onClick={() => select(selectedIndex - 1)}><ChevronLeft /></Button><span className="min-w-10 text-center font-mono text-[11px] text-muted-foreground">{selectedIndex + 1}/{approval.proposedActions.length}</span><Button variant="ghost" size="icon-sm" aria-label="Next recipient" disabled={selectedIndex === approval.proposedActions.length - 1 || editing} onClick={() => select(selectedIndex + 1)}><ChevronRight /></Button></div>
        </div>
        <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><span className="section-label">Message preview</span>{pending && !editing && <Button variant="ghost" size="sm" onClick={() => { setEdit({ subject: message.subject, body: message.body }); setEditing(true); setSaved(false); }}><PencilLine data-icon="inline-start" /> Edit draft</Button>}{!pending && <span className="text-[11px] text-muted-foreground">Decision recorded</span>}</div>
            <div className="mb-5 grid grid-cols-[45px_minmax(0,1fr)] gap-2 border-b border-border pb-5 text-xs"><span className="text-muted-foreground">To</span><div className="min-w-0"><p className="font-medium">{action.recipientName}</p><p className="mt-1 break-all text-[11px] text-muted-foreground">{action.recipientEmail}</p></div></div>
            <AnimatePresence mode="wait" initial={false}>
              {editing ? <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.14 }} className="flex flex-col gap-4">
                <Field.Root invalid={Boolean(error)} className="flex flex-col gap-2"><Field.Label htmlFor="approval-subject" className="text-xs font-medium">Subject</Field.Label><Input id="approval-subject" value={edit.subject} onChange={(event) => { setEdit({ ...edit, subject: event.target.value }); setError(""); }} maxLength={200} aria-invalid={Boolean(error)} /></Field.Root>
                <Field.Root invalid={Boolean(error)} className="flex flex-col gap-2"><Field.Label htmlFor="approval-body" className="text-xs font-medium">Message</Field.Label><Textarea id="approval-body" value={edit.body} onChange={(event) => { setEdit({ ...edit, body: event.target.value }); setError(""); }} rows={13} maxLength={10000} className="min-h-64" aria-invalid={Boolean(error)} /></Field.Root>
                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Edits stay in this browser.</span><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => { setEditing(false); setError(""); }}>Cancel</Button><Button size="sm" onClick={save}><Save data-icon="inline-start" /> Save draft</Button></div></div>
              </motion.div> : <motion.div key={action.id} initial={{ opacity: 0, transform: reduced ? "none" : "translateY(4px)" }} animate={{ opacity: 1, transform: "none" }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
                <h3 className="mb-5 text-[13px] font-semibold leading-6">{message.subject}</h3>
                <div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-[var(--text-secondary)]">{message.body}</div>
                <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground" role={saved ? "status" : undefined}>{saved ? <><CircleCheck className="size-3.5 text-[var(--success-fg)]" />{storageAvailable ? "Draft saved in this browser" : "Saved until this batch closes; browser storage is unavailable"}</> : drafts[action.id] ? "Edited locally · demo draft" : "Agent-generated draft · demo content"}</p>
              </motion.div>}
            </AnimatePresence>
          </div>
          <ApprovalResearch companyId={action.companyId} leadId={action.leadId} />
        </div>
      </> : <div className="p-6 text-sm text-muted-foreground">There are no proposed messages in this batch.</div>}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border bg-[var(--surface-quiet)] p-4 sm:px-6">
        <div><p className="flex items-center gap-1.5 text-xs font-medium"><LockKeyhole className="size-3.5 text-[var(--warning-fg)]" />{pending ? "Held at the approval gate" : "Decision saved locally"}</p><p className="mt-1 text-[11px] text-muted-foreground">{pending ? `${viewed.size} of ${approval.proposedActions.length} drafts opened · sending is disabled` : "No emails were sent."}</p></div>
        {pending && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setDecision("rejected")} disabled={editing}><X data-icon="inline-start" />Reject batch</Button><Button size="sm" onClick={() => setDecision("approved")} disabled={editing || !action}><Check data-icon="inline-start" />Approve {approval.proposedActions.length} drafts</Button></div>}
      </footer>

      <Dialog open={decision !== null} onOpenChange={(open) => { if (!open) setDecision(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{decision === "approved" ? "Approve this outreach batch?" : "Reject this outreach batch?"}</DialogTitle><DialogDescription>{decision === "approved" ? `Record approval for all ${approval.proposedActions.length} proposed emails. The workflow will be marked ready for execution. Sending remains unavailable in this demo.` : "Decline the proposed emails and mark this workflow as needing revision. No messages will be sent."}</DialogDescription></DialogHeader>
          <div className="rounded-md border border-border bg-muted/50 p-3 text-xs leading-5"><p className="font-medium">{workflowTitle}</p><p className="mt-1 text-muted-foreground">{viewed.size} of {approval.proposedActions.length} drafts opened. This decision applies to the entire batch and cannot be changed in this demo.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>Go back</Button><Button variant={decision === "rejected" ? "destructive" : "default"} onClick={() => { if (decision) onDecision(decision); setDecision(null); }}>{decision === "approved" ? "Confirm approval" : "Confirm rejection"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
