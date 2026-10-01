"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveApprovalDraftAction } from "@/app/actions/approvals";
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
import { useDemoStore } from "@/components/app/demo-store";
import { approvalDraftSchema, useApprovalDrafts, type ApprovalDraft } from "@/components/approvals/use-approval-drafts";
import type { ActionContentEdit } from "@/lib/validation/approval";
import { formatDateTime } from "@/lib/format";
import type { Approval } from "@/types/domain";
import { LiveApprovalWorkspace } from "./live-approval-workspace";

export function ApprovalWorkspace({ approval, workflowTitle, onDecision }: { approval: Approval; workflowTitle: string; onDecision: (status: "approved" | "rejected", edits: ActionContentEdit[], actionIds?: string[]) => Promise<void> }) {
  const { mode } = useDemoStore();
  return mode === "live" ? <LiveApprovalWorkspace approval={approval} workflowTitle={workflowTitle} /> : <DemoApprovalWorkspace approval={approval} workflowTitle={workflowTitle} onDecision={onDecision} />;
}

function DemoApprovalWorkspace({ approval, workflowTitle, onDecision }: { approval: Approval; workflowTitle: string; onDecision: (status: "approved" | "rejected", edits: ActionContentEdit[], actionIds?: string[]) => Promise<void> }) {
  const { mode } = useDemoStore();
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<ApprovalDraft>({ subject: "", body: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [savedEdits, setSavedEdits] = useState<Record<string, ApprovalDraft & { revision: number }>>({});
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionIds, setDecisionIds] = useState<string[]>([]);
  const [viewed, setViewed] = useState<Set<number>>(new Set([0]));
  const { drafts, saveDraft, storageAvailable } = useApprovalDrafts();
  const reduced = useReducedMotion();
  const action = approval.proposedActions[selectedIndex];
  const pending = approval.status === "pending";
  const pendingActions = approval.proposedActions.filter((item) => ["pending_approval", "waiting_for_approval"].includes(item.status));
  const editable = pending && action && pendingActions.some((item) => item.id === action.id);
  const eligible = pendingActions.filter((item) => item.executionReadiness === "ready" && item.recipientEmail);
  const blockedCount = pendingActions.length - eligible.length;
  const override = action ? savedEdits[action.id] : undefined;
  const message = action ? mode === "demo" ? drafts[action.id] ?? action
    : override && override.revision > (action.revision ?? 0) ? override : action : null;

  function requestDecision(status: "approved" | "rejected", ids: string[]) {
    setDecisionIds(ids); setDecisionError(""); setDecision(status);
  }

  function select(index: number) {
    setSelectedIndex(index);
    setViewed((current) => new Set([...current, index]));
    setEditing(false);
    setSaved(false);
    setError("");
  }

  async function save() {
    const parsed = approvalDraftSchema.safeParse(edit);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the message."); return; }
    if (!action) return;
    if (savePending) return;
    setSavePending(true);
    try {
      if (mode === "live") {
        const revision = Math.max(action.revision ?? 0, savedEdits[action.id]?.revision ?? 0);
        const result = await saveApprovalDraftAction({ actionId: action.id, ...parsed.data, revision });
        if (!result.ok) throw new Error(result.error);
        setSavedEdits((current) => ({ ...current, [action.id]: { ...parsed.data, revision: revision + 1 } }));
        router.refresh();
      } else saveDraft(action.id, parsed.data);
      setEditing(false); setSaved(true); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be saved."); }
    finally { setSavePending(false); }
  }

  async function confirmDecision() {
    if (!decision || decisionPending) return;
    setDecisionPending(true);
    setDecisionError("");
    try {
      const edits = mode === "live" ? [] : approval.proposedActions.flatMap((item) => drafts[item.id]
        ? [{ actionId: item.id, subject: drafts[item.id].subject, body: drafts[item.id].body }]
        : []);
      await onDecision(decision, edits, mode === "live" ? decisionIds : undefined);
      setDecision(null);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "The decision could not be saved.");
    } finally {
      setDecisionPending(false);
    }
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
            {approval.proposedActions.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.metadata?.company.name ?? item.recipientName} · {item.recipientEmail ? "Recipient available" : "Recipient missing"} · {item.status.replaceAll('_', ' ')}</option>)}
          </select>
          <div className="ml-auto flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Previous recipient" disabled={selectedIndex === 0 || editing} onClick={() => select(selectedIndex - 1)}><ChevronLeft /></Button><span className="min-w-10 text-center font-mono text-[11px] text-muted-foreground">{selectedIndex + 1}/{approval.proposedActions.length}</span><Button variant="ghost" size="icon-sm" aria-label="Next recipient" disabled={selectedIndex === approval.proposedActions.length - 1 || editing} onClick={() => select(selectedIndex + 1)}><ChevronRight /></Button></div>
        </div>
        <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><span className="section-label">Message preview</span>{editable && !editing && <Button variant="ghost" size="sm" onClick={() => { setEdit({ subject: message.subject, body: message.body }); setEditing(true); setSaved(false); }}><PencilLine data-icon="inline-start" /> Edit draft</Button>}{!editable && <StatusBadge status={action.status} />}</div>
            <div className="mb-5 grid grid-cols-[45px_minmax(0,1fr)] gap-2 border-b border-border pb-5 text-xs"><span className="text-muted-foreground">To</span><div className="min-w-0"><p className="font-medium">{action.metadata?.company.name ?? action.recipientName}</p><p className="mt-1 break-all text-[11px] text-muted-foreground">{action.recipientEmail || "No verified recipient · future execution blocked"}</p></div></div>
            {action.metadata && <div className="mb-5 flex flex-wrap gap-2 text-[11px]"><StatusBadge status={action.status} /><StatusBadge status={action.executionReadiness === "ready" ? "qualified" : "blocked_missing_recipient"} label={action.executionReadiness === "ready" ? "Recipient available" : undefined} /><span className="self-center text-muted-foreground">{action.riskLevel ?? "Medium"} risk · {action.metadata.review.confidence} reviewer confidence</span></div>}
            <AnimatePresence mode="wait" initial={false}>
              {editing ? <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.14 }} className="flex flex-col gap-4">
                <Field.Root invalid={Boolean(error)} className="flex flex-col gap-2"><Field.Label htmlFor="approval-subject" className="text-xs font-medium">Subject</Field.Label><Input id="approval-subject" value={edit.subject} onChange={(event) => { setEdit({ ...edit, subject: event.target.value }); setError(""); }} maxLength={200} aria-invalid={Boolean(error)} /></Field.Root>
                <Field.Root invalid={Boolean(error)} className="flex flex-col gap-2"><Field.Label htmlFor="approval-body" className="text-xs font-medium">Message</Field.Label><Textarea id="approval-body" value={edit.body} onChange={(event) => { setEdit({ ...edit, body: event.target.value }); setError(""); }} rows={13} maxLength={10000} className="min-h-64" aria-invalid={Boolean(error)} /></Field.Root>
                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{mode === "live" ? "Saving persists this edit. Approval stays pending." : "Edits stay in this browser."}</span><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={savePending} onClick={() => { setEditing(false); setError(""); }}>Cancel</Button><Button size="sm" disabled={savePending} onClick={save}><Save data-icon="inline-start" />{savePending ? "Saving…" : "Save draft"}</Button></div></div>
              </motion.div> : <motion.div key={action.id} initial={{ opacity: 0, transform: reduced ? "none" : "translateY(4px)" }} animate={{ opacity: 1, transform: "none" }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
                <h3 className="mb-5 text-[13px] font-semibold leading-6">{message.subject}</h3>
                <div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-[var(--text-secondary)]">{message.body}</div>
                <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground" role={saved ? "status" : undefined}>{saved ? <><CircleCheck className="size-3.5 text-[var(--success-fg)]" />{mode === "live" ? "Draft saved to workspace · approval still pending" : storageAvailable ? "Draft held in this browser until your decision" : "Saved until this batch closes"}</> : !editable && mode === "live" ? "Decision recorded · saved proposal" : "Proposed draft · review before approval"}</p>
                {Boolean(action.warnings?.length) && <div className="mt-5 border-t border-border pt-4"><p className="section-label text-[var(--warning-fg)]">Before execution</p><ul className="mt-2 flex list-disc flex-col gap-2 pl-4 text-xs leading-5 text-muted-foreground">{action.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                {action.metadata && <details className="mt-5 border-t border-border pt-4 text-[11px] text-muted-foreground"><summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Proposed action record</summary><dl className="mt-3 flex flex-col gap-2 break-all"><div>Action: {action.id}</div><div>Model: {action.metadata.model}</div><div>Revision: {Math.max(action.revision ?? 0, override?.revision ?? 0)}</div><div>Generation: {action.metadata.generationSummary}</div><div>Execution: pending future release</div></dl></details>}
              </motion.div>}
            </AnimatePresence>
          </div>
          <ApprovalResearch companyId={action.companyId} leadId={action.leadId} action={action} />
        </div>
      </> : <div className="p-6 text-sm text-muted-foreground">There are no proposed messages in this batch.</div>}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border bg-[var(--surface-quiet)] p-4 sm:px-6">
        <div><p className="flex items-center gap-1.5 text-xs font-medium"><LockKeyhole className="size-3.5 text-[var(--warning-fg)]" />{pending ? "Held at the approval gate" : mode === "live" ? "Decision saved to workspace" : "Decision saved locally"}</p><p className="mt-1 text-[11px] text-muted-foreground">{pending ? `${viewed.size} of ${approval.proposedActions.length} drafts opened · sending is disabled` : "No emails were sent."}</p></div>
        {editable && mode === "live" && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => requestDecision("rejected", [action.id])} disabled={editing}><X data-icon="inline-start" />Reject draft</Button><Button size="sm" onClick={() => requestDecision("approved", [action.id])} disabled={editing}><Check data-icon="inline-start" />Authorize draft</Button></div>}
      </footer>
      {pending && (pendingActions.length > 1 || mode === "demo") && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-6"><p className="text-[11px] text-muted-foreground">{pendingActions.length} pending · {eligible.length} recipients available · {blockedCount} blocked</p><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={editing} onClick={() => requestDecision("rejected", pendingActions.map((item) => item.id))}>Reject remaining</Button><Button variant="outline" size="sm" disabled={editing || !eligible.length} onClick={() => requestDecision("approved", eligible.map((item) => item.id))}>Approve eligible ({eligible.length})</Button><Button variant="outline" size="sm" disabled={editing} onClick={() => requestDecision("approved", pendingActions.map((item) => item.id))}>Authorize all ({pendingActions.length})</Button></div></div>}

      <Dialog open={decision !== null} onOpenChange={(open) => { if (!open) setDecision(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{decision === "approved" ? `Authorize ${decisionIds.length} draft${decisionIds.length === 1 ? "" : "s"}?` : `Reject ${decisionIds.length} draft${decisionIds.length === 1 ? "" : "s"}?`}</DialogTitle><DialogDescription>{decision === "approved" ? "Record authorization for future execution. Missing recipients remain blocked. No emails will be sent." : "Decline these drafts. Rejected actions will never be executed; remaining drafts can still be reviewed."}</DialogDescription></DialogHeader>
          <div className="rounded-md border border-border bg-muted/50 p-3 text-xs leading-5"><p className="font-medium">{workflowTitle}</p><ul className="mt-2 flex flex-col gap-2 text-muted-foreground">{approval.proposedActions.filter((item) => decisionIds.includes(item.id)).map((item) => <li key={item.id}>{item.metadata?.company.name ?? item.recipientName} · {item.recipientEmail || "Recipient missing · blocked"}</li>)}</ul><p className="mt-3 text-muted-foreground">{viewed.size} of {approval.proposedActions.length} drafts opened. This decision cannot be changed after saving.</p></div>
          {decisionError && <p role="alert" className="text-xs text-destructive">{decisionError}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setDecision(null)} disabled={decisionPending}>Go back</Button><Button variant={decision === "rejected" ? "destructive" : "default"} onClick={confirmDecision} disabled={decisionPending}>{decisionPending ? "Saving…" : decision === "approved" ? "Confirm approval" : "Confirm rejection"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
