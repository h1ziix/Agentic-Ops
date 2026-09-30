import { cn } from "@/lib/utils";

type StatusBadgeProps = { status: string; label?: string; className?: string };

const statusLabels: Record<string, string> = {
  running: "Running",
  planning: "Planning",
  paused: "Paused",
  waiting_for_approval: "Waiting approval",
  waiting_approval: "Waiting approval",
  ready_for_execution: "Ready for execution",
  needs_revision: "Needs revision",
  waiting: "Waiting",
  pending: "Pending",
  completed: "Completed",
  complete: "Complete",
  qualified: "Qualified",
  outreach_ready: "Outreach ready",
  approved: "Approved",
  executed: "Executed",
  failed: "Failed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  draft: "Draft",
  new: "New",
  contacted: "Contacted",
  responded: "Responded",
  in_research: "In research",
  researched: "Researched",
  researching: "Researching",
  queued: "Queued",
  drafted: "Drafted",
  not_started: "Not started",
  sent: "Sent",
  converted: "Converted",
};

function statusTone(status: string) {
  if (["running", "planning", "in_research"].includes(status)) return "text-[var(--success-fg)] bg-[var(--success-fg)]/9 border-[var(--success-fg)]/20 before:bg-[var(--success-fg)]";
  if (["waiting_for_approval", "waiting_approval", "waiting", "pending", "outreach_ready", "needs_revision"].includes(status)) return "text-[var(--warning-fg)] bg-[var(--warning-fg)]/9 border-[var(--warning-fg)]/20 before:bg-[var(--warning-fg)]";
  if (["completed", "complete", "qualified", "approved", "executed", "responded", "researched", "ready_for_execution", "converted", "sent"].includes(status)) return "text-[var(--success-fg)] bg-[var(--success-fg)]/9 border-[var(--success-fg)]/20 before:bg-[var(--success-fg)]";
  if (["failed", "rejected", "cancelled"].includes(status)) return "text-[var(--danger-fg)] bg-[var(--danger-fg)]/9 border-[var(--danger-fg)]/20 before:bg-[var(--danger-fg)]";
  return "text-[var(--text-muted-strong)] bg-muted/50 border-border before:bg-[var(--icon-muted)]";
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 before:size-1.5 before:rounded-full", statusTone(status), className)}>
      {label ?? statusLabels[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
