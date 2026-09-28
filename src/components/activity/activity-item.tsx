"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, MailCheck, Wrench, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { StatusBadge } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";
import type { ActivityCategory, AgentEvent } from "@/types/domain";

const categoryIcon: Record<ActivityCategory, LucideIcon> = { agent: Bot, tool: Wrench, workflow: CheckCircle2, approval: MailCheck, error: AlertTriangle };
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });
function duration(value: number) { return value >= 1000 ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value / 1000)}s` : `${value}ms`; }

export function ActivityItem({ event, workflowTitle }: { event: AgentEvent; workflowTitle: string }) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const Icon = categoryIcon[event.category];
  const error = event.category === "error";
  const detailId = `event-detail-${event.id}`;
  return <li className="border-b border-border last:border-b-0">
    <button type="button" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded(!expanded)} className="interactive-row group grid w-full grid-cols-[24px_minmax(0,1fr)_16px] items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:grid-cols-[72px_26px_minmax(0,1fr)_100px_16px] sm:px-5">
      <time dateTime={event.timestamp} className="hidden pt-1 font-mono text-[10px] tabular-nums text-muted-foreground sm:block" title={`${event.timestamp} · UTC`}>{timeFormat.format(new Date(event.timestamp))}</time>
      <span className={cn("flex size-6 items-center justify-center rounded border", error ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]" : "border-border bg-muted/60 text-muted-foreground")}><Icon aria-hidden className="size-3" /></span>
      <span className="min-w-0"><span className="block text-[13px] font-medium leading-5">{event.title}</span><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-5 text-muted-foreground"><span>{event.agent ?? (event.category === "approval" ? "Approval gate" : "Workflow system")}</span>{event.toolName && <span className="font-mono text-[10px]">/ {event.toolName}</span>}{typeof event.durationMs === "number" && <span className="font-mono text-[10px]">· {duration(event.durationMs)}</span>}<time dateTime={event.timestamp} className="font-mono text-[10px] sm:hidden">· {timeFormat.format(new Date(event.timestamp))} UTC</time></span></span>
      <span className="hidden pt-0.5 sm:block"><StatusBadge status={event.status} /></span>
      <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: reducedMotion ? 0 : .18 }} className="pt-1"><ChevronRight aria-hidden className="size-3.5 text-muted-foreground" /></motion.span>
    </button>
    <AnimatePresence initial={false}>
      {expanded && <motion.div id={detailId} initial={{ height: reducedMotion ? "auto" : 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: reducedMotion ? "auto" : 0, opacity: 0 }} transition={{ duration: .18 }} className="overflow-hidden">
        <div className="mx-4 mb-4 ml-[52px] flex flex-col gap-4 border-l-2 border-border pl-4 sm:mr-9 sm:ml-[130px]">
          <div><p className="section-label">{event.eventType === "reasoning_summary" ? "Decision summary" : "Recorded result"}</p><p className="mt-1.5 max-w-3xl text-xs leading-6 text-muted-foreground">{event.description}</p></div>
          <dl className="grid gap-x-6 gap-y-3 text-[11px] sm:grid-cols-2"><div><dt className="text-muted-foreground">Event type</dt><dd className="mt-1 font-mono text-[10px]">{event.eventType}</dd></div><div><dt className="text-muted-foreground">Workflow</dt><dd className="mt-1"><Link href={`/workflows/${event.workflowId}`} className="interactive-link text-[var(--success-muted-fg)] underline-offset-4 hover:underline">{workflowTitle}</Link></dd></div></dl>
          <div className="sm:hidden"><StatusBadge status={event.status} /></div>
          <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">Raw event record</summary><pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[10px] leading-5">{JSON.stringify(event, null, 2)}</pre></details>
        </div>
      </motion.div>}
    </AnimatePresence>
  </li>;
}
