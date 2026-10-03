import { Check, ShieldCheck } from "lucide-react";
import type { WorkspaceViewData } from "@/types/domain";
import { recordedTotal } from "./pipeline-state";
import { formatTokens } from "@/components/automation/automation-format";

export function PreparationRunPanel({ runs }: { runs: NonNullable<WorkspaceViewData["preparationRuns"]> }) {
  if (!runs.length) return null;
  return <section aria-label="Review and outreach runs" className="flex flex-col gap-4 rounded-md border border-border bg-muted/20 p-4">
    <h2 className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-3.5" />Evidence review & outreach preparation</h2>
    <div className="grid gap-4 sm:grid-cols-2">{(["Reviewer Agent", "Outreach Agent"] as const).map((agent) => {
      const related = runs.filter((run) => run.agent === agent);
      const latest = related[0];
      return <div key={agent} className="flex min-w-0 flex-col gap-2"><p className="flex items-center justify-between text-xs font-medium">{agent}{latest?.status === "completed" && <Check className="size-3 text-[var(--success-fg)]" />}</p><p className="text-[11px] text-muted-foreground">{related.length} runs · {related.filter((run) => run.status === "failed").length} failed · {formatTokens(recordedTotal(related.map((run) => run.totalTokens)))} tokens</p><p className="truncate font-mono text-[10px] text-muted-foreground">{latest?.model ?? "Awaiting accepted reviews"}</p>{latest?.error && <p className="text-[11px] leading-5 text-destructive">{latest.error}</p>}</div>;
    })}</div>
    <p className="border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">Accepted facts support each draft. Human authorization leaves external execution pending.</p>
  </section>;
}
