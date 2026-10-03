"use client";

import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { ArrowRight, ArrowUpRight, GitBranch } from "lucide-react";
import { motion } from "motion/react";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { Workflow } from "@/types/domain";

export function PriorityWorkflows({ workflows }: { workflows: Workflow[] }) {
  const reduced = useReducedMotion();

  return (
    <section className="min-w-0" aria-labelledby="priority-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 id="priority-title" className="text-[14px] font-semibold tracking-[-0.02em]">Active work</h2>
          <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{workflows.length}</span>
        </div>
        <Link href="/workflows" className="link-arrow inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          All workflows <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-border border-y border-border">
        {workflows.length ? workflows.map((workflow, index) => (
          <motion.div
            key={workflow.id}
            initial={reduced ? false : { opacity: 0, transform: "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ duration: 0.22, delay: reduced ? 0 : 0.08 + index * 0.045 }}
          >
            <Link
              href={`/workflows/${workflow.id}`}
              className="group flex items-start gap-3 rounded-sm px-2 py-3.5 outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-3"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card font-mono text-[9px] text-muted-foreground transition-colors group-hover:border-[var(--brand-accent)] group-hover:text-[var(--brand-accent)]" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium leading-5 transition-colors group-hover:text-[var(--brand-accent)]">{workflow.title}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2.5">
                  <StatusBadge status={workflow.status} />
                  <span className="text-[10px] text-muted-foreground">{workflow.companyCount} companies<span className="mx-2 text-border">/</span>{workflow.qualifiedLeadCount} qualified</span>
                </span>
              </span>
              <span className="mt-1 flex w-14 shrink-0 flex-col items-end gap-2">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{workflow.progress}%</span>
                <span className="h-1 w-14 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full bg-[var(--brand-accent)]" style={{ width: `${workflow.progress}%` }} /></span>
                <ArrowUpRight aria-hidden="true" className="size-3 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
              </span>
            </Link>
          </motion.div>
        )) : (
          <EmptyState icon={GitBranch} title="Ready for a new goal" description="Create a workflow to put your next opportunity in motion." action={<NewWorkflowButton />} />
        )}
      </div>
    </section>
  );
}
