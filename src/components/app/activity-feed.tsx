import Link from "next/link";
import { AlertCircle, Check, CircleDot, Globe2, ShieldCheck, Workflow } from "lucide-react";
import type { AgentEvent } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
const icons = { agent: CircleDot, tool: Globe2, workflow: Workflow, approval: ShieldCheck, error: AlertCircle };
export function ActivityFeed({ events, compact = false }: { events: AgentEvent[]; compact?: boolean }) {
  return <div className="divide-y divide-border">{events.map(event => {
    const Icon = icons[event.category];
    return <div key={event.id} className={cn("grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 gap-y-1.5 py-4 sm:grid-cols-[22px_minmax(0,1fr)_auto]", !compact && "px-4 sm:px-5")}>
      <div className={cn("mt-0.5 flex size-[21px] items-center justify-center rounded border", event.status === "failed" ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]" : "border-border bg-muted text-muted-foreground")}><Icon className="size-3" /></div>
      <div className="min-w-0"><p className="text-[12px] font-medium leading-5">{event.title}</p><p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{event.description}</p><p className="mt-1 text-[10px] text-muted-foreground">{event.agent ?? (event.category === "approval" ? "Approval gate" : "Workflow system")}{event.toolName && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">{event.toolName}</span>}</p></div>
      <div className="col-start-2 flex items-center gap-2 sm:col-start-3 sm:flex-col sm:items-end"><time dateTime={event.timestamp} className="whitespace-nowrap font-mono text-[9px] tabular-nums text-muted-foreground">{formatDateTime(event.timestamp)}</time>{!compact && <Link href={"/workflows/" + event.workflowId} className="text-[10px] text-[var(--brand-accent)] hover:underline">Workflow</Link>}{event.status === "completed" && compact && <Check className="hidden size-3 text-[var(--success-fg)] sm:block" />}</div>
    </div>;
  })}</div>;
}
