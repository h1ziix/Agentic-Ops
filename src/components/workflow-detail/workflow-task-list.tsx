"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle, CircleAlert, ListChecks } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { WorkflowTask } from "@/types/domain";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/app/empty-state";

export function WorkflowTaskList({ tasks }: { tasks: WorkflowTask[] }) {
  const [expanded, setExpanded] = useState<string | null>(() => tasks.find((task) => task.status === "running" || task.status === "failed")?.id ?? null);
  const reducedMotion = useReducedMotion();
  return <section aria-labelledby="task-plan-title">
    <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="task-plan-title" className="text-sm font-semibold">Task plan</h2><p className="mt-1 text-xs text-muted-foreground">Ordered work, with an accountable agent at every step.</p></div><span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{tasks.filter((task) => task.status === "completed").length}/{tasks.length}</span></div>
    {tasks.length ? <ol className="overflow-hidden rounded-lg border border-border bg-card">{tasks.map((task) => {
      const open = expanded === task.id;
      return <li key={task.id} className={cn("border-b border-border last:border-b-0", task.status === "running" && "bg-muted/35")}>
        <button type="button" aria-expanded={open} aria-controls={`task-${task.id}`} onClick={() => setExpanded(open ? null : task.id)} className="interactive-row group grid w-full grid-cols-[22px_minmax(0,1fr)_14px] items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
          <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded border", task.status === "completed" ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]" : task.status === "running" ? "border-foreground bg-foreground text-background" : task.status === "failed" ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]" : "border-border text-muted-foreground")}>{task.status === "completed" ? <Check aria-hidden className="size-2.5" /> : task.status === "failed" ? <CircleAlert aria-hidden className="size-2.5" /> : task.status === "running" ? <span className="font-mono text-[9px]">{task.order}</span> : <Circle aria-hidden className="size-1.5" />}</span>
          <span className="min-w-0"><span className={cn("block text-[13px] font-medium leading-5", task.status === "pending" && "text-muted-foreground")}>{task.title}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span>{task.agent}</span><span aria-hidden>·</span><span>{task.status === "running" ? "In progress" : task.status === "pending" ? "Queued" : task.status === "failed" ? "Needs attention" : "Complete"}</span></span></span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reducedMotion ? 0 : .18 }} className="mt-1"><ChevronDown aria-hidden className="size-3.5 text-muted-foreground" /></motion.span>
        </button>
        <AnimatePresence initial={false}>{open && <motion.div id={`task-${task.id}`} initial={{ height: reducedMotion ? "auto" : 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: reducedMotion ? "auto" : 0, opacity: 0 }} transition={{ duration: .18 }} className="overflow-hidden"><div className="mr-4 mb-4 ml-[50px] border-l-2 border-border pl-3"><p className="text-xs leading-6 text-muted-foreground">{task.description}</p>{task.completedAt && <p className="mt-2 font-mono text-[10px] text-muted-foreground">Completed {formatDateTime(task.completedAt)} · Almaty</p>}</div></motion.div>}</AnimatePresence>
      </li>;
    })}</ol> : <EmptyState icon={ListChecks} title="A plan is being prepared" description="Tasks will appear here when this workflow has a structured plan." />}
  </section>;
}
