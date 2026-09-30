"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUpRight, GitBranch, Search, Workflow as WorkflowIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { useDemoStore } from "@/components/app/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkflowStatus } from "@/types/domain";

type StatusFilter = "all" | WorkflowStatus;
type SortMode = "activity" | "created";
const statuses: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" }, { value: "planning", label: "Planning" },
  { value: "running", label: "Running" }, { value: "waiting_for_approval", label: "Waiting approval" },
  { value: "ready_for_execution", label: "Ready for execution" }, { value: "needs_revision", label: "Needs revision" },
  { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" },
  { value: "draft", label: "Draft" }, { value: "cancelled", label: "Cancelled" },
];

export default function WorkflowsPage() {
  const { workflows, workflowTasks, mode } = useDemoStore();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("activity");
  const filteredWorkflows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workflows.filter((workflow) =>
      (!term || [workflow.title, workflow.goal, workflow.currentStep].some((value) => value.toLowerCase().includes(term)))
      && (statusFilter === "all" || workflow.status === statusFilter),
    ).sort((a, b) => Date.parse(sortMode === "activity" ? b.updatedAt : b.createdAt) - Date.parse(sortMode === "activity" ? a.updatedAt : a.createdAt));
  }, [workflows, query, statusFilter, sortMode]);
  const filtersActive = query !== "" || statusFilter !== "all";
  const resetFilters = () => { setQuery(""); setStatusFilter("all"); };
  const inProgress = workflows.filter((workflow) => ["running", "planning"].includes(workflow.status)).length;
  const waiting = workflows.filter((workflow) => workflow.status === "waiting_for_approval").length;
  const completed = workflows.filter((workflow) => workflow.status === "completed").length;

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Operations / Workflows" title="Workflows" description="Plan, research, qualify, and review. Keep every agent action in view." actions={<NewWorkflowButton />} />
    <div className="grid grid-cols-2 gap-y-5 border-b border-border pb-6 sm:grid-cols-4">
      {[
        { label: "Total workflows", value: workflows.length, detail: "Across this workspace" },
        { label: "In progress", value: inProgress, detail: "Recorded execution state" },
        { label: "Awaiting review", value: waiting, detail: "Human decision required" },
        { label: "Completed", value: completed, detail: "Reached the final stage" },
      ].map((item, index) => <div key={item.label} className={cn("flex flex-col gap-1.5", index > 0 && "sm:border-l sm:border-border sm:pl-6", index % 2 === 1 && "border-l border-border pl-5")}>
        <span className="section-label">{item.label}</span><span className={cn("font-mono text-[26px] font-medium tabular-nums tracking-tight", index === 2 && waiting > 0 && "text-[var(--warning-fg)]")}>{String(item.value).padStart(2, "0")}</span><span className="text-[11px] text-muted-foreground">{item.detail}</span>
      </div>)}
    </div>
    <section aria-label="Workflow directory" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:basis-auto sm:flex-1"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="workflow-search" type="search" aria-label="Search workflows" placeholder="Search workflows or goals…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
        <select id="workflow-status" aria-label="Filter by workflow status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-9 min-w-0 rounded-md border border-border bg-card px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
        <div className="relative"><ArrowUpDown aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="workflow-sort" aria-label="Sort workflows" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="h-9 rounded-md border border-border bg-card pl-8 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="activity">Last activity</option><option value="created">Newest created</option></select></div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={resetFilters}><X data-icon="inline-start" />Clear</Button>}
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground md:block">{filteredWorkflows.length} workflows</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_110px_100px_125px_20px] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground xl:grid"><span>Workflow / current task</span><span>Status</span><span>Progress</span><span>Research</span><span>Last activity</span><span /></div>
        <AnimatePresence initial={false}>
          {filteredWorkflows.map((workflow) => {
            const currentTask = workflowTasks.find((task) => task.workflowId === workflow.id && task.status === "running");
            return <motion.div key={workflow.id} layout={!reducedMotion} initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
              <Link href={`/workflows/${workflow.id}`} className="interactive-row group grid gap-x-4 gap-y-3 border-b border-border px-4 py-4 transition-colors hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5 xl:grid-cols-[minmax(0,1fr)_150px_110px_100px_125px_20px] xl:items-center">
                <div className="min-w-0"><div className="flex items-start gap-2.5"><GitBranch aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><h2 className="text-[13px] font-medium leading-5">{workflow.title}</h2></div><p className="mt-1 ml-[26px] truncate text-xs text-muted-foreground" title={workflow.currentStep}>{workflow.currentStep}{currentTask ? ` · ${currentTask.agent}` : ""}</p></div>
                <div className="flex flex-wrap items-center gap-3 xl:block"><StatusBadge status={workflow.status} /><span className="text-[11px] text-muted-foreground xl:hidden">Updated {formatDateTime(workflow.updatedAt)}</span></div>
                <div className="flex items-center gap-2.5"><span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", workflow.status === "failed" ? "bg-[var(--danger-fg)]" : workflow.status === "waiting_for_approval" ? "bg-[var(--warning-fg)]" : "bg-[var(--success-fg)]")} style={{ width: `${workflow.progress}%` }} /></span><span className="font-mono text-[11px] tabular-nums text-muted-foreground">{workflow.progress}%</span><span className="ml-auto text-right text-[11px] text-muted-foreground xl:hidden">{workflow.companyCount} companies · {workflow.qualifiedLeadCount} qualified</span></div>
                <div className="hidden text-[11px] xl:block"><span className="font-mono tabular-nums">{workflow.companyCount}<span className="text-muted-foreground">/{workflow.targetCompanies}</span></span><p className="mt-1 text-muted-foreground">{workflow.qualifiedLeadCount} qualified</p></div>
                <time dateTime={workflow.updatedAt} className="hidden font-mono text-[11px] tabular-nums text-muted-foreground xl:block">{formatDateTime(workflow.updatedAt)}</time><ArrowUpRight aria-hidden className="hidden size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 xl:block" />
              </Link>
            </motion.div>;
          })}
        </AnimatePresence>
        {!filteredWorkflows.length && <EmptyState icon={WorkflowIcon} title={filtersActive ? "No matching workflows" : "Your next goal starts here"} description={filtersActive ? "Try a broader search or another status." : "Describe an outcome to create a visible, auditable workflow plan."} action={filtersActive ? <Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button> : <NewWorkflowButton />} />}
        <div className="flex flex-wrap justify-between gap-2 bg-muted/25 px-5 py-3 text-[11px] text-muted-foreground"><span>{filteredWorkflows.length} of {workflows.length} workflows</span><span>{mode === "live" ? "Persisted workspace" : "Demo preview"} · external execution is disconnected</span></div>
      </div>
    </section>
  </div>;
}
