"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { StatusBadge } from "@/components/app/status-badge";
import { ActivityFeed } from "@/components/app/activity-feed";
import { useDemoStore } from "@/components/app/demo-store";
import { dashboardMetrics, demoWorkspace } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function Metric({ label, value, note, alert = false }: { label: string; value: string | number; note: string; alert?: boolean }) {
  return <div className="min-w-0 px-5 py-4 sm:py-5"><div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground"><span className={cn("size-1.5 rounded-full", alert ? "bg-[var(--warning-fg)]" : "bg-[var(--icon-muted)]")} />{label}</div><div className="mt-2 font-mono text-[28px] font-semibold leading-none tracking-[-0.06em] tabular-nums text-foreground">{value}</div><p className="mt-2 truncate text-[11px] text-[var(--text-faint)]">{note}</p></div>;
}

export default function DashboardPage() {
  const { workflows, approvals, activity } = useDemoStore();
  const pendingCount = approvals.filter((approval) => approval.status === "pending").reduce((sum, approval) => sum + approval.recipientCount, 0);
  const activeCount = workflows.filter((workflow) => ["planning", "running", "waiting_for_approval", "ready_for_execution", "needs_revision"].includes(workflow.status)).length;
  const executingCount = workflows.filter((workflow) => ["planning", "running"].includes(workflow.status)).length;
  const waitingCount = workflows.filter((workflow) => workflow.status === "waiting_for_approval").length;
  const priority = workflows.filter((workflow) => ["running", "waiting_for_approval", "ready_for_execution", "needs_revision", "completed"].includes(workflow.status)).slice(0, 3);
  return <div className="space-y-6">
    <PageHeader eyebrow="Workspace overview" title="Operations" description={`Research, qualification and approval activity across the ${demoWorkspace.name} demo workspace.`} actions={<NewWorkflowButton />} />
    <div className="panel grid grid-cols-2 divide-x divide-y divide-border overflow-hidden md:grid-cols-4 md:divide-y-0">
      <Metric label="Active workflows" value={Math.max(dashboardMetrics.activeWorkflows, activeCount)} note={`${executingCount} running · ${waitingCount} at review`} />
      <Metric label="Companies researched" value={dashboardMetrics.companiesResearched} note={dashboardMetrics.companiesChange} />
      <Metric label="Qualified leads" value={dashboardMetrics.qualifiedLeads} note={dashboardMetrics.leadsChange} />
      <Metric label="Pending approvals" value={pendingCount} note="External actions on hold" alert />
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <section className="panel min-w-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Priority workflows</h2><p className="mt-0.5 text-xs text-muted-foreground">Current research and approvals</p></div><Link href="/workflows" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-foreground">View all <ArrowRight className="size-3.5" /></Link></div>
        <div className="divide-y divide-border">
          {priority.map((workflow) => <Link key={workflow.id} href={`/workflows/${workflow.id}`} className="group block px-5 py-4 transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-medium text-foreground group-hover:text-foreground">{workflow.title}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{workflow.currentStep}</p></div><StatusBadge status={workflow.status} /></div><div className="mt-4 flex items-center gap-3"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--progress-track)]"><div className={cn("h-full rounded-full", workflow.status === "waiting_for_approval" ? "bg-[var(--warning-fg)]" : "bg-[var(--success-fg)]")} style={{ width: `${workflow.progress}%` }} /></div><span className="w-8 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted-strong)]">{workflow.progress}%</span></div><div className="mt-2 flex items-center gap-4 font-mono text-[11px] tabular-nums text-[var(--text-faint)]"><span>{workflow.companyCount} / {workflow.targetCompanies} companies</span><span>{workflow.qualifiedLeadCount} qualified</span>{workflow.pendingApprovalCount > 0 && <span className="text-[var(--warning-fg)]">{workflow.pendingApprovalCount} approvals</span>}</div></Link>)}
        </div>
      </section>
      <section className="panel flex min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Approval gate</h2><p className="mt-0.5 text-xs text-muted-foreground">Waiting on a human decision</p></div><ShieldCheck className="size-4 text-[var(--warning-fg)]" /></div>
        <div className="flex-1 p-5"><div className="flex items-end gap-2"><span className="font-mono text-[38px] font-semibold leading-none tracking-[-0.065em] tabular-nums">{pendingCount}</span><span className="pb-1 text-xs text-muted-foreground">proposed messages</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Every external email is held for review. Approval records a decision in this demo; no messages are sent.</p><div className="mt-5 space-y-2 border-t border-border pt-4">{approvals.filter((approval) => approval.status === "pending").map((approval) => <div key={approval.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-[var(--text-secondary)]">{approval.title}</span><span className="font-mono tabular-nums text-[var(--warning-fg)]">{approval.recipientCount}</span></div>)}</div></div>
        <Link href="/approvals" className="flex items-center justify-between border-t border-border px-5 py-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">Review approval queue <ArrowUpRight className="size-3.5" /></Link>
      </section>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <section className="panel min-w-0 overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Recent agent activity</h2><p className="mt-0.5 text-xs text-muted-foreground">Safe execution summaries and tool events</p></div><Link href="/activity" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-foreground">Full log <ArrowRight className="size-3.5" /></Link></div><ActivityFeed events={activity.slice(0, 4)} compact /></section>
      <section className="panel min-w-0 overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Execution snapshot</h2><p className="mt-0.5 text-xs text-muted-foreground">Demo activity for the last 7 days</p></div><div className="divide-y divide-border px-5"><div className="flex items-center justify-between py-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="size-3.5" /> Agent runs</span><span className="font-mono text-sm tabular-nums">{dashboardMetrics.agentRunsThisWeek}</span></div><div className="flex items-center justify-between py-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Average run duration</span><span className="font-mono text-sm tabular-nums">{dashboardMetrics.averageRunDuration}</span></div><div className="flex items-center justify-between py-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-[var(--success-fg)]" /> Successful runs</span><span className="font-mono text-sm tabular-nums">{dashboardMetrics.successfulRuns} <span className="text-xs text-muted-foreground">/ {dashboardMetrics.agentRunsThisWeek}</span></span></div></div><div className="border-t border-border bg-[var(--surface-quiet)] px-5 py-4 text-xs leading-5 text-muted-foreground">Runtime metrics are representative demo data. Live usage and cost tracking arrive with agent execution.</div></section>
    </div>
  </div>;
}
