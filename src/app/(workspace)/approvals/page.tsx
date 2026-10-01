"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ArrowUpRight, CheckCheck, Inbox, LockKeyhole, Mail } from "lucide-react";
import { ApprovalWorkspace } from "@/components/approvals/approval-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/components/app/demo-store";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActionContentEdit } from "@/lib/validation/approval";

export default function ApprovalsPage() {
  return <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>}><ApprovalInbox /></Suspense>;
}

function ApprovalInbox() {
  const { approvals, workflows, setApprovalStatus, hydrated, mode } = useDemoStore();
  const requestedId = useSearchParams().get("approval");
  const requested = approvals.find((approval) => approval.id === requestedId);
  const [chosenView, setView] = useState<"pending" | "reviewed" | null>(null);
  const view = chosenView ?? (requested && requested.status !== "pending" ? "reviewed" : "pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const reduced = useReducedMotion();
  const pending = approvals.filter((approval) => approval.status === "pending");
  const reviewed = approvals.filter((approval) => approval.status !== "pending");
  const visible = view === "pending" ? pending : reviewed;
  const selected = visible.find((approval) => approval.id === (selectedId ?? requestedId)) ?? visible[0];
  const messagesHeld = pending.reduce((total, approval) => total + approval.proposedActions.filter((action) => ["pending_approval", "waiting_for_approval"].includes(action.status)).length, 0);
  const workflowTitles = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));

  async function decide(status: "approved" | "rejected", edits: ActionContentEdit[], actionIds?: string[]) {
    if (!selected) return;
    await setApprovalStatus(selected.id, status, edits, actionIds);
    const count = actionIds?.length ?? selected.proposedActions.length;
    setNotice(`${count} draft${count === 1 ? "" : "s"} ${status}. Decision recorded; no messages sent.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Human oversight" title="Approval inbox" description="The final checkpoint between agent intent and external action." actions={<span className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 text-[var(--success-fg)]" /> Human review required</span>} />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-8">
          <div><p className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums tracking-tight">{pending.length}</span><span className="text-xs text-muted-foreground">batches to review</span></p></div>
          <div className="border-l border-border pl-8"><p className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums tracking-tight">{messagesHeld}</span><span className="text-xs text-muted-foreground">emails held</span></p></div>
        </div>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">Inspect the recipient, message, and research.<br className="hidden sm:block" /> {mode === "live" ? "Decisions are saved to your workspace." : "Decisions are saved locally in this preview."}</p>
      </div>
      <AnimatePresence initial={false}>
        {notice && <motion.div role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduced ? 0 : 0.18 }} className="flex items-center gap-2 overflow-hidden text-xs text-[var(--success-fg)]"><CheckCheck className="size-4 shrink-0" />{notice}</motion.div>}
      </AnimatePresence>
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-5 border-b border-border px-4" role="tablist" aria-label="Approval status">
          {([['pending', 'Pending', pending.length], ['reviewed', 'Decisions', reviewed.length]] as const).map(([value, label, count]) => (
            <button key={value} id={`approval-tab-${value}`} type="button" role="tab" aria-selected={view === value} aria-controls="approval-panel" tabIndex={view === value ? 0 : -1} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "pending" : event.key === "End" ? "reviewed" : value === "pending" ? "reviewed" : "pending"; setView(next); setSelectedId(null); document.getElementById(`approval-tab-${next}`)?.focus(); }} onClick={() => { setView(value); setSelectedId(null); }} className={cn("interactive-tab relative flex min-h-12 items-center gap-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", view === value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums">{count}</span>
              {view === value && <motion.span layoutId="approval-inbox-tab" transition={{ type: "spring", duration: reduced ? 0 : 0.3, bounce: 0 }} className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />}
            </button>
          ))}
          <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">Email channel</span>
        </div>
        <div id="approval-panel" role="tabpanel" aria-labelledby={`approval-tab-${view}`}>
          {!hydrated ? <div className="grid gap-5 p-5 md:grid-cols-[220px_1fr]"><Skeleton className="h-48" /><Skeleton className="h-96" /></div> : selected ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[238px_minmax(0,1fr)]">
              <aside className="min-w-0 border-b border-border bg-[var(--surface-quiet)] lg:border-b-0 lg:border-r" aria-label="Approval batches">
                <div className="flex items-center justify-between px-4 py-3"><span className="section-label">{view === "pending" ? "Decision queue" : "Recorded decisions"}</span><Inbox className="size-3.5 text-muted-foreground" /></div>
                <div className="flex gap-2 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((approval) => <motion.button layout key={approval.id} type="button" aria-pressed={selected.id === approval.id} onClick={() => setSelectedId(approval.id)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transform: reduced ? "none" : "translateX(-4px)" }} transition={{ duration: reduced ? 0 : 0.18 }} className={cn("interactive-row min-w-60 rounded-md border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0", selected.id === approval.id ? "border-border bg-card shadow-sm" : "border-transparent hover:bg-muted")}>
                      <span className="mb-3 flex items-center justify-between"><Mail className="size-3.5 text-muted-foreground" /><StatusBadge status={approval.status} /></span>
                      <span className="block text-[13px] font-semibold">{approval.title}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{workflowTitles.get(approval.workflowId)}</span>
                      <span className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>{approval.proposedActions.length} drafts · {approval.proposedActions.filter((item) => !item.recipientEmail).length} recipients missing</span><ArrowUpRight className="size-3.5 shrink-0" /></span>
                      <span className="mt-2 block truncate text-[10px] text-muted-foreground">{approval.proposedActions.map((item) => item.metadata?.company.name ?? item.recipientName).join(', ')}</span>
                    </motion.button>)}
                  </AnimatePresence>
                </div>
              </aside>
              <ApprovalWorkspace key={selected.id} approval={selected} workflowTitle={workflowTitles.get(selected.workflowId) ?? "Workflow"} onDecision={decide} />
            </div>
          ) : <EmptyState icon={view === "pending" ? CheckCheck : Inbox} title={view === "pending" ? "You're all caught up" : "No decisions yet"} description={view === "pending" ? "Every proposed action has been reviewed. Your decisions are available in the Decisions tab." : "Approved and rejected proposals will appear here with their original context."} />}
        </div>
      </div>
    </div>
  );
}
