"use client";

import { useRef, useState } from "react";
import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { Check, ChevronDown, Circle, CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Approval, WorkflowStage, WorkflowTask } from "@/types/domain";
import { cn } from "@/lib/utils";
import { formatDuration, formatEstimatedCost, formatTokens } from "@/components/automation/automation-format";
import { pipelineStatus, recordedTotal, runsForStage, tasksForStage, type PipelineRun } from "./pipeline-state";

const stageDescriptions: Record<string, string> = {
  Planning: "The Planner turns the goal and saved strategy into validated tasks.",
  "Company Discovery": "Find candidate companies and record their public sources.",
  Research: "Gather company evidence and retain source references.",
  Qualification: "Assess opportunities against the target criteria and save score explanations.",
  "Lead Review": "The Reviewer checks evidence before outreach preparation.",
  Outreach: "Prepare personalized drafts using accepted research.",
  Approval: "A human reviews the exact proposed action. Approval never sends it.",
  Execution: "The deterministic Executor performs only separately approved actions.",
};

export function WorkflowProgress({ stages, tasks = [], runs = [], approvals = [] }: { stages: WorkflowStage[]; tasks?: WorkflowTask[]; runs?: PipelineRun[]; approvals?: Approval[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageButtons = useRef(new Map<string, HTMLButtonElement>());
  const selected = stages.find((stage) => stage.id === selectedId);
  const selectedTasks = selected ? tasksForStage(selected, tasks) : [];
  const selectedRuns = selected ? runsForStage(selected, tasks, runs) : [];
  const latest = selectedRuns[0];
  const collapse = () => { if (selectedId) stageButtons.current.get(selectedId)?.focus(); setSelectedId(null); };
  return <section aria-labelledby="pipeline-title" className="border-b border-border pb-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 id="pipeline-title" className="section-label">Execution path</h2><p className="mt-1 text-[11px] text-muted-foreground">Select a stage to inspect its recorded work.</p></div><span className="font-mono text-[10px] text-muted-foreground">{stages.filter((stage) => pipelineStatus(stage, tasks, approvals) === "completed").length} / {stages.length} complete</span></div>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex" aria-label="Workflow stages">{stages.map((stage, index) => {
      const status = pipelineStatus(stage, tasks, approvals);
      const done = status === "completed";
      const running = status === "running";
      const failed = status === "failed";
      const blocked = status === "blocked";
      const awaitingHuman = stage.label === "Approval" && status === "waiting" && approvals.some((approval) => approval.workflowId === stage.workflowId && approval.status === "pending");
      return <li key={stage.id} className="min-w-0 xl:flex-1">
        <button ref={(node) => { if (node) stageButtons.current.set(stage.id, node); else stageButtons.current.delete(stage.id); }} type="button" aria-expanded={selectedId === stage.id} aria-controls={selectedId === stage.id ? "pipeline-stage-detail" : undefined} onClick={() => setSelectedId((current) => current === stage.id ? null : stage.id)} className={cn("interactive-row flex min-h-20 w-full items-start gap-2.5 rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring xl:min-h-28 xl:flex-col", selectedId === stage.id ? "border-[var(--brand-accent)] bg-[var(--brand-tint)]" : "border-border bg-card", running && "border-[var(--border-strong)]")}>
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border", done ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]" : failed ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]" : blocked || awaitingHuman ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]" : running ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground")}>
            {done ? <Check aria-hidden className="size-3" /> : failed ? <CircleAlert aria-hidden className="size-3" /> : blocked ? <LockKeyhole aria-hidden className="size-3" /> : stage.label === "Approval" ? <ShieldCheck aria-hidden className="size-3" /> : running ? <span className="font-mono text-[10px]">{String(index + 1).padStart(2, "0")}</span> : <Circle aria-hidden className="size-2" />}
          </span>
          <span className="min-w-0"><span className="block text-[11px] font-medium leading-4">{stage.label === "Company Discovery" ? "Discovery" : stage.label}</span><span className={cn("mt-1 block text-[10px] leading-4", failed ? "text-[var(--danger-fg)]" : blocked || awaitingHuman ? "text-[var(--warning-fg)]" : "text-muted-foreground")}>{done ? "Complete" : running ? "In progress" : failed ? "Needs attention" : blocked ? "Blocked" : awaitingHuman ? "Waiting for you" : status === "cancelled" ? "Cancelled" : "Pending"}</span></span>
        </button>
      </li>;
    })}</ol>
    {selected && <div id="pipeline-stage-detail" className="mt-3 rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-xs font-semibold">{selected.label}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{stageDescriptions[selected.label] ?? "Inspect the saved task and run records for this stage."}</p></div><button type="button" aria-label="Collapse stage details" onClick={collapse} className="rounded p-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"><ChevronDown aria-hidden className="size-4 rotate-180" /></button></div>
      {selectedRuns.length > 0 && <><dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">{[["Recorded runs", selectedRuns.length], ["Agent duration", formatDuration(recordedTotal(selectedRuns.map((run) => run.durationMs)))], ["AI tokens", formatTokens(recordedTotal(selectedRuns.map((run) => run.totalTokens)))], ["Estimated AI cost", formatEstimatedCost(recordedTotal(selectedRuns.map((run) => run.estimatedCostUsd)))]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-xs">{value}</dd></div>)}</dl><p className="mt-3 break-words font-mono text-[10px] text-muted-foreground">{latest.agent} · {latest.model ?? "Model not recorded"}{latest.toolCalls != null ? ` · ${latest.toolCalls} tool calls in latest run` : ""}</p>{latest.summary && <p className="mt-2 text-xs leading-6 text-muted-foreground">{latest.summary}</p>}{latest.error && <p className="mt-2 text-xs leading-6 text-destructive">{latest.error}</p>}</>}
      {selectedTasks.length > 0 ? <ul className="mt-4 flex flex-col gap-2">{selectedTasks.map((task) => <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2 text-xs"><span className="min-w-0">{task.title}</span><span className="text-[11px] capitalize text-muted-foreground">{task.status.replaceAll("_", " ")}</span>{task.error && <span className="basis-full text-[11px] text-destructive">{task.error}</span>}</li>)}</ul> : <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{selected.label === "Approval" ? "Proposal decisions are recorded in the approval inbox." : "No task record is available for this stage in the loaded history."}</p>}
      <Link href={selected.label === "Approval" ? "/approvals" : `/activity?workflow=${encodeURIComponent(selected.workflowId)}`} className="interactive-link mt-4 inline-block text-[11px] font-medium text-primary hover:underline">{selected.label === "Approval" ? "Open approval inbox" : "Inspect workflow events"}</Link>
    </div>}
  </section>;
}
