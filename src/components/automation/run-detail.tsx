"use client";

import { useRef } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateTime } from "@/lib/format";
import type { AgentRunObservation } from "@/types/observability";
import { formatDuration, formatEstimatedCost, formatTokens } from "./automation-format";

export function RunDetail({ run, taskTitle, onClose }: { run: AgentRunObservation | null; taskTitle?: string; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return <Sheet open={Boolean(run)} onOpenChange={(open) => { if (!open) onClose(); }}><SheetContent initialFocus={titleRef} className="gap-0 overflow-y-auto bg-card sm:max-w-[620px]" style={{ width: "min(100vw, 620px)", maxWidth: "100vw" }}>
    {run && <><SheetHeader className="border-b border-border px-6 pb-5 pt-7"><p className="section-label">Observability / Agent run</p><SheetTitle ref={titleRef} tabIndex={-1} className="mt-2 outline-none">{run.agent}</SheetTitle><SheetDescription>{taskTitle ?? "Recorded workflow execution"}</SheetDescription><div className="mt-3"><StatusBadge status={run.status} /></div></SheetHeader>
      <div className="flex flex-col gap-6 px-6 py-6">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-xs">{[["Model", run.model ?? "Deterministic operation"], ["Provider", run.provider ?? "Internal operation"], ["Duration", formatDuration(run.durationMs)], ["Model calls", run.modelCalls], ["Started", run.startedAt ? formatDateTime(run.startedAt) : "Unknown"], ["Completed", run.completedAt ? formatDateTime(run.completedAt) : "Not completed"], ["Input tokens", formatTokens(run.inputTokens)], ["Output tokens", formatTokens(run.outputTokens)], ["Total tokens", formatTokens(run.totalTokens)], ["Retries", run.retryCount], ["Estimated AI cost", run.costStatus === "not_applicable" ? "Not applicable" : formatEstimatedCost(run.estimatedCostUsd)], ["Usage coverage", run.usageStatus.replaceAll("_", " ")]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1.5 break-words font-mono text-[11px]">{value}</dd></div>)}</dl>
        {run.cachedInputTokens != null && <p className="text-[11px] text-muted-foreground">Observed cached input: {formatTokens(run.cachedInputTokens)} tokens.</p>}
        {run.cacheWriteTokens != null && <p className="text-[11px] text-muted-foreground">Observed cache writes: {formatTokens(run.cacheWriteTokens)} tokens.</p>}
        {run.reasoningTokens != null && <p className="text-[11px] text-muted-foreground">Observed reasoning usage: {formatTokens(run.reasoningTokens)} tokens. Only token counts are recorded.</p>}
        {run.errorSummary && <section className="border-t border-border pt-4"><h3 className="section-label">Recorded error</h3><p className="mt-2 text-xs leading-6 text-[var(--danger-soft-fg)]">{run.errorSummary}</p><p className="mt-2 text-[11px] text-muted-foreground">{run.errorCategory?.replaceAll("_", " ") ?? "Unclassified"}</p></section>}
        <section className="border-t border-border pt-4"><h3 className="section-label">Safe input summary</h3><p className="mt-2 whitespace-pre-line break-words text-xs leading-6 text-muted-foreground">{run.inputSummary || "No safe input summary was recorded."}</p></section>
        <section className="border-t border-border pt-4"><h3 className="section-label">Safe output summary</h3><p className="mt-2 whitespace-pre-line break-words text-xs leading-6 text-muted-foreground">{run.outputSummary || "No output has been saved yet."}</p></section>
        <section className="border-t border-border pt-4"><h3 className="section-label">Tool activity · {run.toolCalls.length}</h3>{run.toolCalls.length ? <div className="mt-3 flex flex-col divide-y divide-border">{run.toolCalls.map((tool) => <details key={tool.id} className="min-w-0 py-3"><summary className="cursor-pointer text-xs leading-6 focus-visible:outline-2 focus-visible:outline-ring">{tool.tool} · {tool.status} · {formatDuration(tool.durationMs)}{tool.cached ? " · cached" : ""}</summary><div className="mt-2 flex flex-col gap-2 text-[11px] leading-6 text-muted-foreground"><p className="whitespace-pre-line break-words">{tool.inputSummary || "Request summary unavailable."}</p><p className="whitespace-pre-line break-words">{tool.outputSummary || "Result pending or unavailable."}</p><p>Retries {tool.retryCount}{tool.errorCategory ? ` · ${tool.errorCategory.replaceAll("_", " ")}` : ""}</p></div></details>)}</div> : <p className="mt-2 text-xs leading-6 text-muted-foreground">No tool calls were recorded for this run.</p>}</section>
        <p className="border-t border-border pt-4 text-[10px] leading-5 text-muted-foreground">Cost is an estimate from recorded provider usage and configured model prices.{run.pricingVersion ? ` Pricing version: ${run.pricingVersion}.` : " Unknown model prices remain unknown."} Older run model counts and tool durations may be inferred from recorded attempts and timestamps. Times shown in Asia/Qyzylorda.</p>
        <p className="break-all font-mono text-[10px] text-muted-foreground">Run {run.id}</p>
      </div></>}
  </SheetContent></Sheet>;
}
