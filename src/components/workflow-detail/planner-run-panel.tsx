"use client";

import { Bot, Check, LoaderCircle } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import type { PlannerRun, WorkflowStatus } from "@/types/domain";

export function PlannerRunPanel({ run, status }: { run?: PlannerRun; status: WorkflowStatus }) {
  if (!run && status !== "planning") return null;
  const active = !run || run.status === "running" || run.status === "queued";
  return <section aria-labelledby="planner-result" className="border-b border-border pb-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="planner-result" className="flex items-center gap-2 text-sm font-semibold"><Bot aria-hidden className="size-4 text-muted-foreground" />Planner Agent</h2>
      {run && <StatusBadge status={run.status} />}
    </div>
    {active ? <p role="status" className="mt-3 flex items-center gap-2 text-xs leading-6 text-muted-foreground"><LoaderCircle aria-hidden className="size-3.5 shrink-0 motion-safe:animate-spin" />Generating and validating your execution plan…</p>
      : run?.summary ? <><p className="mt-3 text-xs leading-6 text-muted-foreground">{run.summary}</p>
        {run.assumptions.length > 0 && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">Planning assumptions <span className="ml-1 font-mono text-[10px]">{run.assumptions.length}</span></summary><ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 leading-6">{run.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details>}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--success-muted-fg)]"><Check aria-hidden className="size-3" />Validated plan · {run.taskCount} tasks saved</p></>
      : <p className="mt-3 text-xs leading-6 text-muted-foreground">{run?.error ?? "Planning did not complete."}</p>}
    {run && <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
      <div className="flex gap-1.5"><dt className="font-sans">Model</dt><dd>{run.model ?? "Not recorded"}</dd></div>
      <div className="flex gap-1.5"><dt className="font-sans">Duration</dt><dd>{run.durationMs === null ? active ? "In progress" : "Unknown" : `${(run.durationMs / 1000).toFixed(1)}s`}</dd></div>
      <div className="flex gap-1.5"><dt className="font-sans">Retries</dt><dd>{run.retryCount}</dd></div>
      {run.totalTokens !== null && <div className="flex gap-1.5"><dt className="font-sans">Tokens</dt><dd>{run.totalTokens.toLocaleString("en-US")}</dd></div>}
    </dl>}
  </section>;
}
