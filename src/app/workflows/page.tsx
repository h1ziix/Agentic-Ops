"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Search, Workflow as WorkflowIcon, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { useDemoStore } from "@/components/app/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkflowStatus } from "@/types/domain";

type StatusFilter = "all" | WorkflowStatus;
type SortMode = "activity" | "created";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default function WorkflowsPage() {
  const { workflows } = useDemoStore();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("activity");

  const filteredWorkflows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workflows
      .filter((workflow) => (
        (!term || [workflow.title, workflow.goal, workflow.currentStep].some((value) => value.toLowerCase().includes(term)))
        && (statusFilter === "all" || workflow.status === statusFilter)
      ))
      .sort((a, b) => Date.parse(sortMode === "activity" ? b.updatedAt : b.createdAt) - Date.parse(sortMode === "activity" ? a.updatedAt : a.createdAt));
  }, [workflows, query, statusFilter, sortMode]);

  const filtersActive = query !== "" || statusFilter !== "all";
  const resetFilters = () => { setQuery(""); setStatusFilter("all"); };
  const inProgress = workflows.filter((workflow) => workflow.status === "running" || workflow.status === "planning").length;
  const waitingApproval = workflows.filter((workflow) => workflow.status === "waiting_for_approval").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent execution"
        title="Workflows"
        description="Track goals from planning through research, qualification, review, and execution."
        actions={<NewWorkflowButton />}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-4 text-[13px]">
        <span className="font-medium text-foreground"><span className="font-mono tabular-nums">{workflows.length}</span> total workflows</span>
        <span className="text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{inProgress}</span> in progress</span>
        <span className="text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{waitingApproval}</span> waiting for approval</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search workflows"
            placeholder="Search workflows or goals…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <select
          aria-label="Filter by workflow status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All statuses</option>
          <option value="planning">Planning</option>
          <option value="running">Running</option>
          <option value="waiting_for_approval">Waiting approval</option>
          <option value="ready_for_execution">Ready for execution</option>
          <option value="needs_revision">Needs revision</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="draft">Draft</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="relative">
          <ArrowUpDown aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Sort workflows"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-9 rounded-md border border-border bg-card py-0 pl-9 pr-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="activity">Recently updated</option>
            <option value="created">Newest created</option>
          </select>
        </div>
        {filtersActive && (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <X aria-hidden="true" className="size-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="table-shell">
        {filteredWorkflows.length > 0 ? (
          <>
            <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground sm:hidden">Scroll horizontally to see all columns →</p>
            <table className="w-full min-w-[980px] table-fixed text-left text-[13px]">
              <colgroup>
                <col className="w-[27%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="bg-muted/25 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Workflow</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Progress</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Companies</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Qualified</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Current step</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((workflow) => (
                  <tr key={workflow.id} className="border-t border-border transition-colors hover:bg-muted/25">
                    <td className="px-4 py-3.5">
                      <Link href={`/workflows/${workflow.id}`} className="block max-w-full truncate font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" title={workflow.title}>
                        {workflow.title}
                      </Link>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={workflow.goal}>{workflow.goal}</span>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={workflow.status} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-foreground">{workflow.progress}%</span>
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                          <span
                            className={`block h-full rounded-full ${workflow.status === "failed" ? "bg-[var(--danger-fg)]" : workflow.status === "needs_revision" || workflow.status === "waiting_for_approval" ? "bg-[var(--warning-fg)]" : workflow.status === "completed" || workflow.status === "ready_for_execution" ? "bg-[var(--success-fg)]" : "bg-[var(--success-fg)]"}`}
                            style={{ width: `${workflow.progress}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-foreground">
                      {workflow.companyCount}<span className="text-muted-foreground"> / {workflow.targetCompanies}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-foreground">{workflow.qualifiedLeadCount}</td>
                    <td className="truncate px-4 py-3.5 text-muted-foreground" title={workflow.currentStep}>{workflow.currentStep}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">{dateFormatter.format(new Date(workflow.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              Showing <span className="font-mono tabular-nums text-foreground">{filteredWorkflows.length}</span> of {workflows.length} workflows
            </div>
          </>
        ) : (
          <EmptyState
            icon={WorkflowIcon}
            title={filtersActive ? "No matching workflows" : "No workflows yet"}
            description={filtersActive ? "Try a broader search or another status." : "Create a goal to prepare a visible, auditable workflow plan."}
            action={filtersActive ? <Button type="button" variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button> : <NewWorkflowButton />}
          />
        )}
      </div>
    </div>
  );
}
