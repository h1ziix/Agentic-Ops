"use client";

import { useEffect, useState } from "react";
import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { workflowIntelligenceSchema, type WorkflowIntelligence } from "@/types/intelligence";
import type { Workflow } from "@/types/domain";
import { number, money } from "./format";

export function WorkflowOutcomes({ workflow }: { workflow: Workflow }) {
  const [metrics, setMetrics] = useState<WorkflowIntelligence | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workflows/${encodeURIComponent(workflow.id)}/intelligence`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const result: unknown = await response.json();
        const parsed = workflowIntelligenceSchema.safeParse(result && typeof result === "object" && "metrics" in result ? result.metrics : null);
        if (controller.signal.aborted) return;
        if (parsed.success) { setMetrics(parsed.data); setError(""); } else { setMetrics(null); setError("Outcome metrics unavailable."); }
      }).catch(() => { if (!controller.signal.aborted) { setMetrics(null); setError("Outcome metrics unavailable. Open Intelligence to inspect workspace data."); } });
    return () => controller.abort();
  }, [workflow.id, workflow.updatedAt]);
  return <section className="flex flex-col gap-3 border-y border-border py-4" aria-label="Workflow outcomes">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-label">Recorded outcomes</h2><Link href={`/intelligence?range=all&workflowId=${encodeURIComponent(workflow.id)}`} className="rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Inspect intelligence →</Link></div>
    {metrics ? <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">{[["Researched", number(metrics.researched)], ["Qualified", number(metrics.qualified)], ["Companies contacted", number(metrics.sent)], ["Detected replies", number(metrics.replies)], ["Estimated AI cost", money(metrics.estimatedCostUsd)]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd></div>)}</dl> : <p role="status" className="text-xs text-muted-foreground">{error || "Loading recorded outcomes…"}</p>}
    {(workflow.icpSnapshot || workflow.templateSnapshot) && <details><summary className="w-fit cursor-pointer rounded text-[11px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Saved strategy · {workflow.icpName ?? "No ICP"} · {workflow.templateName ?? "From goal"}</summary><div className="mt-3 flex flex-col gap-2 text-xs leading-5 text-muted-foreground">{workflow.icpSnapshot && <><p><strong className="font-medium text-foreground">{workflow.icpSnapshot.name}</strong> · minimum score {workflow.icpSnapshot.minimum_lead_score}</p><p>{workflow.icpSnapshot.industries.join(", ") || "All industries"} · {workflow.icpSnapshot.locations.join(", ") || "All locations"}</p><p>Automation focus: {workflow.icpSnapshot.automation_focus.join(", ") || "Unrestricted"}</p><p>Excluded signals: {workflow.icpSnapshot.excluded_signals.join(", ") || "None"}</p></>}{workflow.templateSnapshot && <p>Planning guidance: {workflow.templateSnapshot.task_strategy || "No additional guidance"}</p>}<p className="text-[10px]">Configuration captured at creation. Later source edits do not change this workflow.</p></div></details>}
  </section>;
}
