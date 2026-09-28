import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  MailCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import type { ActivityCategory, AgentEvent } from "@/types/domain";

const categoryIcon: Record<ActivityCategory, LucideIcon> = {
  agent: Bot,
  tool: Wrench,
  workflow: CheckCircle2,
  approval: MailCheck,
  error: AlertTriangle,
};

const categoryLabel: Record<ActivityCategory, string> = {
  agent: "Agent",
  tool: "Tool",
  workflow: "Workflow",
  approval: "Approval",
  error: "Error",
};

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function duration(value: number) {
  return value >= 1000
    ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value / 1000)}s`
    : `${value}ms`;
}

export function ActivityItem({
  event,
  workflowTitle,
}: {
  event: AgentEvent;
  workflowTitle: string;
}) {
  const Icon = categoryIcon[event.category];
  const error = event.category === "error";

  return (
    <li className="group grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-border/80 px-4 py-4 last:border-b-0 sm:grid-cols-[34px_minmax(0,1fr)] sm:px-5">
      <span
        className={`flex size-8 items-center justify-center rounded-md border ${error ? "border-[var(--danger-fg)]/20 bg-[var(--danger-fg)]/[0.07] text-[var(--danger-fg)]" : "border-border bg-muted/60 text-muted-foreground"}`}
      >
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {categoryLabel[event.category]}
            </span>
            <StatusBadge status={event.status} />
          </div>
          <time
            dateTime={event.timestamp}
            className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
            title={event.timestamp}
          >
            {eventTime(event.timestamp)} UTC
          </time>
        </div>
        <h4 className="mt-1.5 text-[13px] font-medium leading-5 text-foreground">{event.title}</h4>
        <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">{event.description}</p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          {event.agent && <span>{event.agent}</span>}
          {event.toolName && (
            <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              {event.toolName}
            </span>
          )}
          {typeof event.durationMs === "number" && <span className="font-mono tabular-nums">{duration(event.durationMs)}</span>}
          <Link
            href={`/workflows/${event.workflowId}`}
            className="min-w-0 max-w-full truncate text-[var(--success-muted-fg)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {workflowTitle}
          </Link>
        </div>
      </div>
    </li>
  );
}
