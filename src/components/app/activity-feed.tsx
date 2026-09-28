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
        <div className={cn("mt-0.5 flex size-[21px] items-center justify-center rounded border", event.status === "failed" ? "border-[#704444] bg-[#3a2222] text-[#e48787]" : event.status === "running" ? "border-[#3e625b] bg-[#20372f] text-[#77d3bf]" : event.status === "waiting" ? "border-[#6a5534] bg-[#362a1e] text-[#e8b766]" : "border-border bg-muted text-[#9da8af]")}><Icon className="size-3" /></div>
        <div className="min-w-0"><p className="truncate text-[13px] font-medium text-foreground">{event.title}</p><p className={cn("mt-0.5 text-xs text-muted-foreground", compact ? "truncate" : "leading-5")}>{event.description}</p><p className="mt-1.5 text-[11px] text-[#7f8992]">{event.agent ?? (event.category === "approval" ? "Approval gate" : "Workflow system")}{event.toolName && <span className="ml-1.5 rounded bg-[#252b30] px-1.5 py-0.5 font-mono text-[10px] text-[#b2bdc4]">{event.toolName}</span>}</p></div>
        <div className="flex flex-col items-end gap-1.5"><time dateTime={event.timestamp} className="whitespace-nowrap font-mono text-[11px] tabular-nums text-[#7f8992]">{formatDateTime(event.timestamp)}</time>{!compact && <Link href={`/workflows/${event.workflowId}`} className="text-[11px] text-[#9fc6bd] hover:underline">Workflow</Link>}{event.status === "completed" && compact && <Check className="size-3 text-[#8bce9a]" />}</div>
      </div>;
    })}
  </div>;
}
