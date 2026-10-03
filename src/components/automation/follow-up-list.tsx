"use client";

import Link from "next/link";
import { CalendarClock, MailCheck } from "lucide-react";
import { useDemoStore } from "@/components/app/demo-store";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import type { AutomationFollowUp, ReplyObservation } from "@/types/automation";
import { formatDateTime } from "@/lib/format";

export function FollowUpList({ plans, replies, pending, onOperation, compact = false, testJobsAllowed = false }: {
  plans: AutomationFollowUp[]; replies: ReplyObservation[]; pending: string;
  onOperation: (id: string, operation: "cancel" | "test_due") => Promise<boolean>; compact?: boolean; testJobsAllowed?: boolean;
}) {
  const { companies, approvals, integrationConnections } = useDemoStore();
  const readAccess = integrationConnections?.some((connection) => connection.provider === "gmail" && connection.status === "connected" && connection.scopes.some((scope) => scope.endsWith("/gmail.readonly") || scope.endsWith("/gmail.metadata")));
  if (!plans.length) return null;
  return <section aria-label="Follow-up plans" className="flex min-w-0 flex-col gap-4 border-t border-border pt-5">
    <div className="flex items-center gap-2"><CalendarClock aria-hidden className="size-3.5 text-muted-foreground" /><h2 className="text-sm font-semibold">{compact ? "Reply & follow-up" : "Follow-up plans"}</h2></div>
    <div className="flex flex-col divide-y divide-border">{plans.map((plan) => {
      const reply = replies.find((item) => item.parent_attempt_id === plan.parent_attempt_id);
      const replyAt = reply?.received_at ?? plan.last_reply_at;
      const approval = approvals.find((item) => item.proposedActions.some((action) => action.id === plan.draft_action_id));
      const cancelled = plan.status === "cancelled" || ["cancelled", "skipped_reply_detected"].includes(plan.automation_status);
      const cancellable = plan.status === "planned" && !["completed", "cancelled", "skipped_reply_detected"].includes(plan.automation_status);
      const dueLabel = new Intl.DateTimeFormat("en-GB", { timeZone: plan.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(plan.due_at));
      return <article key={plan.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium">{plan.company_id ? companies.find((company) => company.id === plan.company_id)?.name ?? "Related lead" : "Saved outreach follow-up"}</p><p className="mt-1 text-xs text-muted-foreground">{dueLabel} · {plan.timezone}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{plan.due_at} UTC</p></div><StatusBadge status={cancelled ? "cancelled" : plan.automation_status === "inactive" ? "planned" : plan.automation_status} label={plan.automation_status === "skipped_reply_detected" ? "Cancelled on reply" : plan.automation_status === "inactive" ? "Saved plan" : undefined} /></div>
        <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><MailCheck aria-hidden className="mt-0.5 size-3 shrink-0" />{replyAt ? `Reply detected ${formatDateTime(replyAt)}. Future follow-up work is cancelled.` : readAccess ? plan.last_checked_at ? `No reply detected at the last check, ${formatDateTime(plan.last_checked_at)}.` : "Reply check pending; no inbox result recorded yet." : "Reply monitoring unavailable — Gmail read access required."}</p>
        {plan.note && !compact && <p className="break-words text-xs leading-6 text-muted-foreground">{plan.note}</p>}
        <div className="flex flex-wrap items-center gap-2">{approval && <Link href={`/approvals?approval=${encodeURIComponent(approval.id)}`} className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{approval.status === "pending" ? "Review follow-up draft" : "View follow-up approval"}</Link>}{plan.lead_id && !compact && <Link href={`/leads?lead=${encodeURIComponent(plan.lead_id)}`} className="px-1 py-1 text-xs text-muted-foreground hover:underline">Open lead</Link>}{cancellable && <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void onOperation(plan.id, "cancel")}>{pending === plan.id ? "Saving…" : "Cancel follow-up"}</Button>}{testJobsAllowed && cancellable && ["inactive", "scheduled", "failed"].includes(plan.automation_status) && <Button size="sm" variant="ghost" disabled={Boolean(pending)} onClick={() => void onOperation(plan.id, "test_due")}>Test due now · draft only</Button>}</div>
        {plan.automation_status === "waiting_for_approval" && <p className="text-[11px] leading-5 text-muted-foreground">The draft requires a new exact approval and separate Execute. The original email approval grants no future send permission.</p>}
      </article>;
    })}</div>
  </section>;
}
