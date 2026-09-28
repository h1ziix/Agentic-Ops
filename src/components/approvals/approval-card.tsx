"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Clock3, Mail, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/app/status-badge";
import type { Approval, ProposedAction } from "@/types/domain";

function requestedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function ReviewDialog({
  approval,
  open,
  onOpenChange,
  onDecision,
}: {
  approval: Approval;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (status: "approved" | "rejected") => void;
}) {
  const [selectedId, setSelectedId] = useState(approval.proposedActions[0]?.id);
  const selected = approval.proposedActions.find((action) => action.id === selectedId) ?? approval.proposedActions[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Review drafts <ChevronRight aria-hidden="true" className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(88vh,900px)] w-[min(1040px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-[16px]">{approval.title}</DialogTitle>
            <StatusBadge status={approval.status} />
          </div>
          <DialogDescription className="text-xs leading-5">
            Review every proposed email before recording a decision. No messages are sent in this demo.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="grid min-h-0 flex-1 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-b border-border bg-background/50 md:border-b-0 md:border-r">
              <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Proposed emails · {approval.proposedActions.length}
              </div>
              <div className="max-h-40 overflow-y-auto p-2 md:max-h-[58vh]">
                {approval.proposedActions.map((action, index) => (
                  <button
                    key={action.id}
                    type="button"
                    aria-pressed={selected.id === action.id}
                    onClick={() => setSelectedId(action.id)}
                    className={`mb-1 flex w-full min-w-0 items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${selected.id === action.id ? "border-border bg-muted/80" : "border-transparent hover:bg-muted/45"}`}
                  >
                    <span className="mt-0.5 w-5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">{action.recipientName}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{action.subject}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <EmailPreview action={selected} />
          </div>
        ) : (
          <div className="p-8 text-sm text-muted-foreground">This approval has no proposed emails to review.</div>
        )}

        <div className="flex flex-col gap-3 border-t border-border bg-card px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">Decision is stored locally for this demo. Sending is disabled.</span>
          {approval.status === "pending" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onDecision("rejected")}>
                <X aria-hidden="true" className="size-3.5" /> Reject
              </Button>
              <Button size="sm" onClick={() => onDecision("approved")}>
                <Check aria-hidden="true" className="size-3.5" /> Approve all {approval.proposedActions.length} drafts
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmailPreview({ action }: { action: ProposedAction }) {
  return (
    <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="section-label">Individual action · Send email</span>
        <StatusBadge status={action.status} />
      </div>
      <dl className="grid gap-x-4 gap-y-3 border-b border-border pb-5 text-xs sm:grid-cols-[72px_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Recipient</dt>
        <dd className="min-w-0 font-medium text-foreground">{action.recipientName}</dd>
        <dt className="text-muted-foreground">Address</dt>
        <dd className="min-w-0 break-all text-foreground">{action.recipientEmail}</dd>
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="min-w-0 font-medium text-foreground">{action.subject}</dd>
      </dl>
      <div className="pt-5">
        <p className="section-label mb-3">Message body</p>
        <div className="whitespace-pre-wrap break-words rounded-md border border-border bg-background/75 p-4 text-[13px] leading-6 text-foreground">
          {action.body}
        </div>
      </div>
    </div>
  );
}

export function ApprovalCard({
  approval,
  workflowTitle,
  onDecision,
}: {
  approval: Approval;
  workflowTitle: string;
  onDecision: (status: "approved" | "rejected") => void;
}) {
  const pending = approval.status === "pending";
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/65">
            <Mail aria-hidden="true" className="size-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{approval.title}</h3>
              <StatusBadge status={approval.status} />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{approval.description}</p>
            <Link
              href={`/workflows/${approval.workflowId}`}
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-[var(--success-muted-fg)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="truncate">{workflowTitle}</span>
              <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1.5 self-start rounded-md border border-[var(--warning-fg)]/20 bg-[var(--warning-fg)]/[0.06] px-2.5 py-1.5 text-[11px] text-[var(--warning-fg)]">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          External communication
        </div>
      </div>

      <dl className="grid gap-4 border-y border-border bg-background/20 px-5 py-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="section-label">Proposed actions</dt>
          <dd className="mt-1 font-medium tabular-nums text-foreground">{approval.proposedActions.length} personalized emails</dd>
        </div>
        <div>
          <dt className="section-label">Generated by</dt>
          <dd className="mt-1 font-medium text-foreground">{approval.requestedBy}</dd>
        </div>
        <div>
          <dt className="section-label">Requested</dt>
          <dd className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
            <Clock3 aria-hidden="true" className="size-3 text-muted-foreground" />
            <time dateTime={approval.requestedAt}>{requestedAt(approval.requestedAt)} UTC</time>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <ReviewDialog approval={approval} open={reviewOpen} onOpenChange={setReviewOpen} onDecision={onDecision} />
        {pending ? (
          <>
            <Button size="sm" onClick={() => setReviewOpen(true)}>
              <Check aria-hidden="true" className="size-3.5" /> Approve
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDecision("rejected")}>
              <X aria-hidden="true" className="size-3.5" /> Reject
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {approval.status === "approved" ? "Approved in demo" : "Declined in demo"} · no emails sent
          </span>
        )}
      </div>
    </article>
  );
}
