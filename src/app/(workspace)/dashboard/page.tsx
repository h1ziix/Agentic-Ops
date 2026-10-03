"use client";

import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { ActivityFeed } from "@/components/app/activity-feed";
import { EmptyState } from "@/components/app/empty-state";
import { useDemoStore } from "@/components/app/demo-store";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { WorkflowSignal } from "@/components/dashboard/workflow-signal";
import { PriorityWorkflows } from "@/components/dashboard/priority-workflows";
import { ApprovalPreview } from "@/components/dashboard/approval-preview";
import { ExecutionSnapshot } from "@/components/dashboard/execution-snapshot";
import { OperationsOverview } from "@/components/automation/operations-overview";

export default function DashboardPage() {
  const { workflows, workflowStages, approvals, activity, mode } = useDemoStore();
  const active = workflows.filter((workflow) =>
    ["planning", "running", "waiting_for_approval", "ready_for_execution", "needs_revision"].includes(workflow.status),
  );
  const executingCount = active.filter((workflow) => ["planning", "running"].includes(workflow.status)).length;
  const waitingCount = active.filter((workflow) => workflow.status === "waiting_for_approval").length;
  const pending = approvals.filter((approval) => approval.status === "pending");
  const pendingCount = pending.reduce((sum, approval) => sum + approval.recipientCount, 0);
  const focus = active.find((workflow) => ["planning", "running"].includes(workflow.status)) ?? active[0];

  return (
    <div className="flex flex-col gap-7 lg:gap-8">
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="size-1.5 rounded-[1px] bg-[var(--brand-accent)]" aria-hidden="true" />
            Operations / Overview
            <span className="border-l border-border pl-2.5 font-normal tracking-[0.08em]">{mode === "live" ? "Live workspace" : "Local preview"}</span>
          </div>
          <h1 className="mt-3 text-[29px] font-semibold leading-none tracking-[-0.055em] sm:text-[34px]">Command center</h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-5 text-muted-foreground">
            Monitor active research, review proposed outreach, and keep every agent decision in view.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-2 border-r border-border pr-3 text-[11px] text-muted-foreground md:flex">
            <span className="size-1.5 rounded-full bg-[var(--brand-accent)]" aria-hidden="true" />
            {executingCount} running
          </span>
          <NewWorkflowButton />
        </div>
      </header>

      <DashboardMetrics
        activeCount={active.length}
        executingCount={executingCount}
        waitingCount={waitingCount}
        pendingCount={pendingCount}
      />
      <OperationsOverview />
      <Link href="/intelligence" className="inline-flex w-fit items-center gap-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Explore historical outcomes and estimated AI cost<ArrowUpRight className="size-3" /></Link>

      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        {focus ? (
          <WorkflowSignal workflow={focus} stages={workflowStages.filter((stage) => stage.workflowId === focus.id)} />
        ) : (
          <EmptyState
            icon={Activity}
            title="Your workspace is ready"
            description="Create a workflow to start exploring an opportunity."
            action={<NewWorkflowButton />}
          />
        )}
        <ApprovalPreview approvals={pending} pendingCount={pendingCount} />
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_310px]">
        <PriorityWorkflows workflows={active.slice(0, 4)} />
        <ExecutionSnapshot />
      </div>

      <section className="min-w-0" aria-labelledby="recent-activity-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 id="recent-activity-title" className="text-[14px] font-semibold tracking-[-0.02em]">Latest activity</h2>
            <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">AUDIT LOG</span>
          </div>
          <Link href="/activity" className="link-arrow inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            View all events <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="border-y border-border">
          {activity.length ? (
            <ActivityFeed events={activity.slice(0, 3)} compact />
          ) : (
            <EmptyState icon={Activity} title="A clear starting point" description="Your workflow actions and decisions will appear here." />
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><ShieldCheck className="size-3" />Every external action begins with your approval.</span>
        <Link href="/settings" className="inline-flex items-center gap-1 rounded px-1 py-1 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {mode === "live" ? "Workspace data · Exact approval required" : "Fictional data · Local demo"} <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
