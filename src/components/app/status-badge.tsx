import { cn } from "@/lib/utils";

type StatusBadgeProps = { status: string; label?: string; className?: string };

const statusLabels: Record<string, string> = {
  running: "Running",
  planning: "Planning",
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
  if (["running", "planning", "in_research"].includes(status)) return "text-[#77d3bf] bg-[#77d3bf]/9 border-[#77d3bf]/20 before:bg-[#77d3bf]";
  if (["waiting_for_approval", "waiting_approval", "waiting", "pending", "outreach_ready", "needs_revision"].includes(status)) return "text-[#e8b766] bg-[#e8b766]/9 border-[#e8b766]/20 before:bg-[#e8b766]";
  if (["completed", "complete", "qualified", "approved", "executed", "responded", "researched", "ready_for_execution", "converted", "sent"].includes(status)) return "text-[#8bce9a] bg-[#8bce9a]/9 border-[#8bce9a]/20 before:bg-[#8bce9a]";
  if (["failed", "rejected", "cancelled"].includes(status)) return "text-[#e48787] bg-[#e48787]/9 border-[#e48787]/20 before:bg-[#e48787]";
  return "text-[#a7afb7] bg-white/[0.03] border-white/10 before:bg-[#858e98]";
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 before:size-1.5 before:rounded-full", statusTone(status), className)}>
      {label ?? statusLabels[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
