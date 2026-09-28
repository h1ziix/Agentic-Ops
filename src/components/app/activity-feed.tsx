import Link from "next/link";
import { AlertCircle, Check, CircleDot, Globe2, ShieldCheck, Workflow } from "lucide-react";
import type { AgentEvent } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const icons = { agent: CircleDot, tool: Globe2, workflow: Workflow, approval: ShieldCheck, error: AlertCircle };

export function ActivityFeed({ events, compact = false }: { events: AgentEvent[]; compact?: boolean }) {
  return <div className="divide-y divide-border">
    {events.map((event) => {
      const Icon = icons[event.category];
      return <div key={event.id} className={cn("grid grid-cols-[22px_minmax(0,1fr)_auto] gap-3 px-4 py-3.5 sm:px-5", compact && "py-3")}>
        <div className={cn("mt-0.5 flex size-[21px] items-center justify-center rounded border", event.status === "failed" ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]" : event.status === "running" ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]" : event.status === "waiting" ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]" : "border-border bg-muted text-[var(--text-muted-strong)]")}><Icon className="size-3" /></div>
        <div className="min-w-0"><p className="truncate text-[13px] font-medium text-foreground">{event.title}</p><p className={cn("mt-0.5 text-xs text-muted-foreground", compact ? "truncate" : "leading-5")}>{event.description}</p><p className="mt-1.5 text-[11px] text-[var(--text-faint)]">{event.agent ?? (event.category === "approval" ? "Approval gate" : "Workflow system")}{event.toolName && <span className="ml-1.5 rounded bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted-strong)]">{event.toolName}</span>}</p></div>
        <div className="flex flex-col items-end gap-1.5"><time dateTime={event.timestamp} className="whitespace-nowrap font-mono text-[11px] tabular-nums text-[var(--text-faint)]">{formatDateTime(event.timestamp)}</time>{!compact && <Link href={`/workflows/${event.workflowId}`} className="text-[11px] text-[var(--success-muted-fg)] hover:underline">Workflow</Link>}{event.status === "completed" && compact && <Check className="size-3 text-[var(--success-fg)]" />}</div>
      </div>;
    })}
  </div>;
}
