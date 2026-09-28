"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import {
  ArrowRight, ArrowUpRight, Building2, Check, CircleAlert, ClipboardList,
  Mail, Search, Send, ShieldCheck, SlidersHorizontal, type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { SignalDot } from "@/components/app/motion-system";
import { cn } from "@/lib/utils";
import type { Workflow, WorkflowStage } from "@/types/domain";

const stageIcons: Record<string, LucideIcon> = {
  Planning: ClipboardList,
  "Company Discovery": Building2,
  Research: Search,
  Qualification: SlidersHorizontal,
  Outreach: Mail,
  Approval: ShieldCheck,
  Execution: Send,
};
const shortLabels: Record<string, string> = { "Company Discovery": "Discovery", Qualification: "Qualify" };

export function WorkflowSignal({ workflow, stages }: { workflow: Workflow; stages: WorkflowStage[] }) {
  const reduced = useReducedMotion();
  const ordered = stages.filter((stage) => stage.workflowId === workflow.id).sort((a, b) => a.order - b.order);
  const executing = ["running", "planning"].includes(workflow.status);
  const completeCount = ordered.filter((stage) => stage.status === "completed").length;

  return (
    <section className="relative min-w-0 overflow-hidden rounded-lg border border-border border-t-[3px] border-t-[var(--brand-accent)] bg-card shadow-[var(--shadow-soft)]" aria-labelledby="focus-workflow-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <span className="flex items-center gap-2 text-[11px] font-semibold">
          <SignalDot active={executing} className="text-[var(--brand-accent)]" />
          Workflow in focus
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Recorded execution</span>
      </div>

      <div className="relative px-5 pb-5 pt-5">
        <div className="pointer-events-none absolute right-0 top-0 h-36 w-48 overflow-hidden opacity-40" aria-hidden="true">
          <div className="dot-field absolute inset-0 [mask-image:linear-gradient(to_left,black,transparent)]" />
          {!reduced && <motion.span className="absolute right-10 top-12 size-1.5 bg-[var(--brand-accent)]/30" animate={{ y: [0, 18, 0], opacity: [.3, .6, .3] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />}
        </div>

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-lg">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              WF / {workflow.id.startsWith("demo-") ? "Custom goal" : workflow.id.replaceAll("-", " ")}
            </p>
            <h2 id="focus-workflow-title" className="max-w-xl text-[19px] font-semibold leading-6 tracking-[-0.035em] sm:text-[21px] sm:leading-7">
              {workflow.title}
            </h2>
          </div>
          <Link
            aria-label="Open focused workflow"
            href={`/workflows/${workflow.id}`}
            className="group flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-[background-color,border-color,color] hover:border-[var(--brand-accent)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-2.5">
          <StatusBadge status={workflow.status} />
          <span className="min-w-0 text-[11px] text-muted-foreground">{workflow.currentStep}</span>
        </div>

        <div className="relative mt-5 flex items-end justify-between gap-4 text-[10px] text-muted-foreground">
          <span>{completeCount} of {ordered.length} stages complete</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{workflow.progress}%</span>
        </div>
        <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-[var(--progress-track)]" role="progressbar" aria-label="Workflow progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={workflow.progress}>
          <motion.span
            className="block h-full rounded-full bg-[var(--brand-accent)]"
            style={{ width: `${workflow.progress}%`, transformOrigin: "left" }}
            initial={reduced ? false : { transform: "scaleX(0)" }}
            animate={{ transform: "scaleX(1)" }}
            transition={{ duration: reduced ? 0 : 0.55, ease: "easeOut" }}
          />
        </div>

        <ol aria-label="Execution stages" className="mt-6 grid grid-cols-4 gap-y-5 sm:grid-cols-7">
          {ordered.map((stage, index) => {
            const active = executing && stage.status === "running" && stage.label !== "Approval";
            const Icon = stage.status === "completed" ? Check : stage.status === "failed" ? CircleAlert : stageIcons[stage.label] ?? ClipboardList;
            return (
              <motion.li
                key={stage.id}
                aria-current={active ? "step" : undefined}
                className="relative min-w-0 text-center"
                initial={reduced ? false : { opacity: 0, transform: "translateY(5px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.2, delay: reduced ? 0 : 0.12 + index * 0.045 }}
              >
                {index < ordered.length - 1 && <span aria-hidden="true" className={cn("absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-4 border-t", stage.status === "completed" ? "border-[var(--success-border)]" : "border-border", index === 3 && "hidden sm:block")} />}
                <div className={cn(
                  "relative mx-auto flex size-8 items-center justify-center rounded-md border bg-card",
                  stage.status === "completed" ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]" : active ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white shadow-[0_0_0_4px_var(--brand-tint)]" : "border-border text-muted-foreground",
                )}>
                  <Icon className="size-3.5" aria-hidden="true" />
                  {active && !reduced && <motion.span className="absolute -inset-1 rounded-lg border border-[var(--brand-accent)]" animate={{ opacity: [.3, 0], scale: [1, 1.15] }} transition={{ duration: 2.5, repeat: Infinity }} />}
                </div>
                <span className={cn("mt-2.5 block text-[9px] sm:text-[10px]", active ? "font-medium text-[var(--brand-accent)]" : "text-muted-foreground")}>{shortLabels[stage.label] ?? stage.label}</span>
                <span className="sr-only">{stage.status}</span>
              </motion.li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[var(--surface-quiet)] px-5 py-3">
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" aria-hidden="true" />Human approval before execution</span>
        <Link href={`/workflows/${workflow.id}`} className="link-arrow inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-[var(--brand-accent)] transition-colors hover:bg-[var(--brand-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Open execution <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
