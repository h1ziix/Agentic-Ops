import { AlertTriangle, Check, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResearchRun, WorkflowTask } from "@/types/domain";
import { recordedTotal } from "./pipeline-state";
import { formatTokens } from "@/components/automation/automation-format";

export function ResearchRunPanel({ runs, tasks, pending, error, onRetry }: {
  runs: ResearchRun[]; tasks: WorkflowTask[]; pending: boolean; error: string; onRetry: () => void;
}) {
  const latest = runs[0];
  const researchTasks = tasks.filter((task) => ["define_target_profile", "discover_companies", "research_companies", "identify_opportunities", "score_leads"].includes(task.type ?? ""));
  const failedTask = researchTasks.find((task) => task.status === "failed");
  const active = tasks.find((task) => task.status === "running");
  const complete = researchTasks.length > 0 && researchTasks.every((task) => task.status === "completed");
  const tokens = recordedTotal(runs.map((run) => run.totalTokens));
  return <section className="rounded-md border border-border bg-muted/20 p-4" aria-label="Research execution" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xs font-medium">{error || failedTask ? <AlertTriangle aria-hidden className="size-3.5 text-destructive" /> : complete ? <Check aria-hidden className="size-3.5 text-[var(--success-fg)]" /> : <ScanSearch aria-hidden className="size-3.5" />}Research Agent</h2><span className="text-[10px] text-muted-foreground">{pending ? "Running" : complete ? "Research complete" : failedTask ? "Needs attention" : "Ready"}</span></div>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">{error || failedTask?.error || (complete ? "Company research and qualification are saved. Evidence review and draft preparation can continue." : active?.title ?? "Discovering companies and collecting evidence for AI automation opportunities.")}</p>
    {(error || failedTask) && <Button size="sm" variant="outline" className="mt-3" disabled={pending} onClick={onRetry}>Retry research</Button>}
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-[10px] text-muted-foreground"><div className="flex gap-1.5"><dt>Model</dt><dd className="font-mono">{latest?.model ?? "Awaiting first run"}</dd></div><div className="flex gap-1.5"><dt>Runs</dt><dd className="font-mono">{runs.length}</dd></div><div className="flex gap-1.5"><dt>Tokens</dt><dd className="font-mono">{formatTokens(tokens)}</dd></div><div className="flex gap-1.5"><dt>Failed items / runs</dt><dd className="font-mono">{runs.filter((run) => run.status === "failed").length}</dd></div></dl>
  </section>;
}
