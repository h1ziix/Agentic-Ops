"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ArrowRight, RotateCcw } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import type { Workflow, WorkflowTask } from "@/types/domain";
import type { AgentRunObservation } from "@/types/observability";
import type { useAutomation } from "./use-automation";
import { formatDuration, formatEstimatedCost, formatTokens } from "./automation-format";
import { RunDetail } from "./run-detail";
import { FollowUpList } from "./follow-up-list";

type AutomationState = ReturnType<typeof useAutomation>;

export function WorkflowObservabilityMetrics({ workflow, automation }: { workflow: Workflow; automation: AutomationState }) {
  const metrics = automation.data?.observability?.workflowMetrics.find((item) => item.workflowId === workflow.id);
  const jobs = automation.data?.automation.jobs ?? [];
  const pendingJobs = jobs.filter((job) => ["queued", "scheduled", "running", "retry_scheduled"].includes(job.status));
  const plans = automation.data?.automation.followUps.filter((plan) => plan.status === "planned" && !["completed", "skipped_reply_detected", "cancelled"].includes(plan.automation_status)) ?? [];
  return <section aria-label="Workflow observability" className="flex flex-col gap-3">
    {automation.loading ? <Skeleton className="h-16" /> : <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-border pb-4 sm:grid-cols-3 xl:grid-cols-6">{[["Agent duration", formatDuration(metrics?.durationMs)], [metrics?.unknownUsageCount ? "AI tokens · partial" : "AI tokens", formatTokens(metrics?.totalTokens)], ["Estimated AI cost", formatEstimatedCost(metrics?.estimatedCostUsd)], ["Agent runs", metrics?.runCount ?? "Unknown"], ["Tool calls", metrics?.toolCalls ?? "Unknown"], ["Retries", metrics?.retryCount ?? "Unknown"]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-2 font-mono text-[17px] tabular-nums">{value}</dd></div>)}</dl>}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground"><Link href={`/automation?workflow=${encodeURIComponent(workflow.id)}`} className="inline-flex items-center gap-1 hover:text-foreground">{automation.data ? `${pendingJobs.length} active jobs · ${plans.length} saved follow-ups` : "Inspect scheduled jobs and follow-ups"}<ArrowRight aria-hidden className="size-3" /></Link>{metrics && metrics.unknownCostCount > 0 && <span>{metrics.unknownCostCount} runs have unknown cost</span>}{metrics && metrics.unknownUsageCount > 0 && <span>{metrics.unknownUsageCount} runs have incomplete usage</span>}{automation.data?.observability?.truncated && <span>Recent run window; older history remains in the audit trail.</span>}</div>
    {automation.error && <p role="alert" className="text-xs text-destructive">{automation.error}</p>}
  </section>;
}

export function WorkflowRunList({ workflow, tasks, automation }: { workflow: Workflow; tasks: WorkflowTask[]; automation: AutomationState }) {
  const [selected, setSelected] = useState<AgentRunObservation | null>(null);
  const [notice, setNotice] = useState("");
  const runs = automation.data?.observability?.runs.filter((run) => run.workflowId === workflow.id) ?? [];
  const selectedRun = runs.find((run) => run.id === selected?.id) ?? selected;
  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Agent runs & recovery</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">Recorded usage, estimated cost, safe summaries, and tool results.</p></div>{automation.data?.enabled && workflow.status !== "cancelled" && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={Boolean(automation.pending)} onClick={async () => { if (await automation.workflowOperation(workflow.id, "health_check")) setNotice("Workflow health check scheduled."); }}>Check health</Button>{["failed", "planning", "running"].includes(workflow.status) && <Button size="sm" variant="outline" disabled={Boolean(automation.pending)} onClick={async () => { if (await automation.workflowOperation(workflow.id, "recover")) setNotice("Recovery inspection scheduled. Unknown external outcomes remain blocked."); }}><RotateCcw data-icon="inline-start" />Inspect recovery</Button>}</div>}</header>
    {notice && <p role="status" className="text-xs leading-6 text-muted-foreground">{notice}</p>}
    {automation.loading ? <Skeleton className="h-40" /> : runs.length ? <ol className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">{runs.map((run) => <li key={run.id}><button type="button" onClick={() => setSelected(run)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_100px_100px_100px]">
      <span className="min-w-0"><span className="block text-xs font-medium">{run.agent}</span><span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{run.model ?? "Deterministic operation"}</span><span className="mt-1 block text-[10px] text-muted-foreground">{run.startedAt ? formatDateTime(run.startedAt) : "No start time"} · {run.retryCount} retries</span></span><span className="self-start"><StatusBadge status={run.status} /></span><span className="hidden self-center font-mono text-xs text-muted-foreground sm:block">{formatDuration(run.durationMs)}</span><span className="hidden self-center font-mono text-xs text-muted-foreground sm:block">{run.costStatus === "not_applicable" ? "N/A" : formatEstimatedCost(run.estimatedCostUsd)}<span className="mt-1 block font-sans text-[9px]">estimated</span></span>
    </button></li>)}</ol> : <EmptyState icon={Activity} title="No agent runs recorded" description="Persisted runs will appear as this workflow executes. Missing usage and model prices remain unknown." />}
    <FollowUpList plans={automation.data?.automation.followUps ?? []} replies={automation.data?.automation.replies ?? []} pending={automation.pending} onOperation={automation.followUpOperation} testJobsAllowed={automation.data?.enabled && automation.data.testJobsAllowed} />
    <RunDetail run={selectedRun} taskTitle={tasks.find((task) => task.id === selectedRun?.taskId)?.title} onClose={() => setSelected(null)} />
  </div>;
}
