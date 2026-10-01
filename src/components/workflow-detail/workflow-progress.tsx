"use client";

import { Check, Circle, CircleAlert, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { WorkflowStage } from "@/types/domain";
import { cn } from "@/lib/utils";

export function WorkflowProgress({ stages }: { stages: WorkflowStage[] }) {
  const reducedMotion = useReducedMotion();
  return <section aria-labelledby="pipeline-title" className="border-b border-border pb-6">
    <div className="mb-5 flex items-center justify-between"><h2 id="pipeline-title" className="section-label">Execution path</h2><span className="font-mono text-[10px] text-muted-foreground">{stages.filter((stage) => stage.status === "completed").length} / {stages.length} complete</span></div>
    <ol className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-8 lg:gap-0" aria-label="Workflow stages">{stages.map((stage, index) => {
      const done = stage.status === "completed";
      const running = stage.status === "running";
      const failed = stage.status === "failed";
      return <li key={stage.id} className="relative min-w-0 lg:pr-2">
        {index < stages.length - 1 && <span aria-hidden className={cn("absolute top-3 left-7 right-1 hidden h-px lg:block", done ? "bg-[var(--success-border)]" : "bg-border")} />}
        <div className="flex items-center gap-2.5 lg:block">
          <motion.div initial={false} animate={{ scale: 1 }} transition={{ type: "spring", duration: reducedMotion ? 0 : .3, bounce: 0 }} className={cn("relative flex size-6 shrink-0 items-center justify-center rounded-md border", done ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]" : running ? "border-foreground bg-foreground text-background" : failed ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]" : "border-border bg-card text-muted-foreground")}>
            {done ? <Check aria-hidden className="size-3" /> : failed ? <CircleAlert aria-hidden className="size-3" /> : stage.label === "Approval" ? <ShieldCheck aria-hidden className="size-3" /> : running ? <span className="font-mono text-[10px]">{String(index + 1).padStart(2, "0")}</span> : <Circle aria-hidden className="size-2" />}
          </motion.div>
          <div className="lg:mt-3"><p className={cn("text-[11px] font-medium leading-4", running || failed ? "text-foreground" : "text-muted-foreground")}>{stage.label === "Company Discovery" ? "Discovery" : stage.label}</p><p className={cn("mt-0.5 text-[10px]", running ? "text-[var(--success-fg)]" : failed ? "text-[var(--danger-fg)]" : "text-muted-foreground")}>{done ? "Complete" : running ? stage.label === "Approval" ? "Waiting for you" : "In progress" : failed ? "Needs attention" : stage.status === "cancelled" ? "Cancelled" : "Pending"}</p></div>
        </div>
      </li>;
    })}</ol>
  </section>;
}
