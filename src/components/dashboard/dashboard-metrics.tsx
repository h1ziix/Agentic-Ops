"use client";

import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useDemoStore } from "@/components/app/demo-store";
import { cn } from "@/lib/utils";

type DashboardMetricsProps = {
  activeCount: number;
  executingCount: number;
  waitingCount: number;
  pendingCount: number;
};

export function DashboardMetrics({ activeCount, executingCount, waitingCount, pendingCount }: DashboardMetricsProps) {
  const { approvals, companies, leads } = useDemoStore();
  const reduced = useReducedMotion();
  const researchedCount = companies.filter((company) => company.researchStatus === "researched").length;
  const highFitCount = leads.filter((lead) => lead.score !== null && lead.score >= 80).length;
  const metrics = [
    { label: "Active workflows", value: activeCount, note: `${executingCount} in progress · ${waitingCount} in review`, href: "/workflows", bars: [executingCount, waitingCount, Math.max(0, activeCount - executingCount - waitingCount)] },
    { label: "Companies researched", value: researchedCount, note: `of ${companies.length} company profiles`, href: "/companies", bars: [researchedCount, companies.length - researchedCount] },
    { label: "High-fit leads", value: highFitCount, note: `Score 80+ · ${leads.length} leads evaluated`, href: "/leads", bars: [highFitCount, leads.length - highFitCount] },
    { label: "Messages for review", value: pendingCount, note: pendingCount ? "Your decision is the next step" : "All proposals have a decision", href: "/approvals", bars: [pendingCount, approvals.reduce((total, approval) => total + approval.recipientCount, 0) - pendingCount] },
  ];

  return (
    <section aria-label="Workspace metrics" className="grid overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => {
        const attention = index === 3 && pendingCount > 0;
        const tallest = Math.max(...metric.bars, 1);
        return (
          <Link
            key={metric.label}
            href={metric.href}
            className={cn(
              "group relative min-w-0 p-4 outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:z-10 focus-visible:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:p-5",
              index > 0 && "lg:border-l lg:border-border",
              index % 2 === 1 && "border-l border-border",
              index > 1 && "border-t border-border lg:border-t-0",
              attention && "bg-[var(--warning-bg)]",
            )}
          >
            <div className="flex items-start justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="font-medium leading-4">{metric.label}</span>
              <ArrowUpRight aria-hidden="true" className="size-3 shrink-0 transition-[color,transform] duration-200 group-hover:text-[var(--brand-accent)] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:-translate-y-0.5 motion-safe:group-focus-visible:translate-x-0.5" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <motion.span
                key={metric.value}
                initial={reduced ? false : { opacity: 0, transform: "translateY(7px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.24, delay: reduced ? 0 : index * 0.045, ease: "easeOut" }}
                className={cn("text-[34px] font-semibold leading-none tracking-[-0.065em] tabular-nums sm:text-[38px]", attention && "text-[var(--warning-fg)]")}
              >
                {String(metric.value).padStart(2, "0")}
              </motion.span>
              <span className="mb-1 flex h-6 w-11 shrink-0 items-end gap-1" aria-hidden="true">
                {metric.bars.map((count, bar) => (
                  <span
                    key={bar}
                    className={cn("min-h-1 flex-1 rounded-[1px]", bar === 0 ? attention ? "bg-[var(--warning-fg)]" : "bg-[var(--brand-accent)]" : "bg-[var(--surface-strong)]")}
                    style={{ height: `${Math.max(15, (count / tallest) * 100)}%` }}
                  />
                ))}
              </span>
            </div>
            <p className={cn("mt-3 min-h-4 text-[10px] leading-4", attention ? "text-[var(--warning-fg)]" : "text-muted-foreground")}>{metric.note}</p>
          </Link>
        );
      })}
    </section>
  );
}
