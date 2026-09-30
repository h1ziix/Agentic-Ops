import Link from "next/link";
import { ArrowRight, Check, Mail, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Approval } from "@/types/domain";

export function ApprovalPreview({ approvals, pendingCount }: { approvals: Approval[]; pendingCount: number }) {
  const needsDecision = pendingCount > 0;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--surface-quiet)]",
        needsDecision ? "border-[var(--warning-border)]" : "border-border",
      )}
      aria-labelledby="approval-preview-title"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 id="approval-preview-title" className="text-[11px] font-semibold">Decision queue</h2>
        <ShieldCheck className={cn("size-3.5", needsDecision ? "text-[var(--warning-fg)]" : "text-[var(--success-fg)]")} aria-hidden="true" />
      </div>
      <div className="flex-1 px-5 py-5">
        <div className="flex items-end gap-3">
          <span className={cn("text-[40px] font-semibold leading-none tracking-[-0.07em] tabular-nums", needsDecision && "text-[var(--warning-fg)]")}>{String(pendingCount).padStart(2, "0")}</span>
          <span className="pb-1 text-[11px] leading-4 text-muted-foreground">messages ready<br />for human review</span>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          {needsDecision ? "Research is done. The next move is yours." : "You're all caught up. New requests will appear here."}
        </p>
        <div className="mt-5 flex flex-col gap-1.5">
          {approvals.map((approval) => (
            <Link
              key={approval.id}
              href="/approvals"
              className="group flex min-w-0 items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded border border-border bg-card"><Mail className="size-3.5 text-muted-foreground" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium transition-colors group-hover:text-[var(--brand-accent)]">{approval.title}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{approval.recipientCount} recipients · Email</span>
              </span>
              <ArrowRight aria-hidden="true" className="size-3 text-muted-foreground transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
            </Link>
          ))}
          {!needsDecision && <span className="flex items-center gap-2 text-xs text-[var(--success-fg)]"><Check className="size-4" aria-hidden="true" />All decisions recorded</span>}
        </div>
      </div>
      <div className="border-t border-border p-3">
        <Link
          href="/approvals"
          className={cn(
            "group flex min-h-9 items-center justify-between rounded-md border px-3 text-[11px] font-semibold transition-[background-color,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            needsDecision ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)] hover:bg-[var(--warning-bg-strong)]" : "border-border bg-card hover:bg-muted",
          )}
        >
          {needsDecision ? "Open approval inbox" : "View decision history"}
          <ArrowRight className="size-3 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <p className="mt-2 px-0.5 text-[9px] text-muted-foreground">External sending is disabled.</p>
      </div>
    </section>
  );
}
