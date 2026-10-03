import { Activity } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDuration, formatTokens } from "@/components/automation/automation-format";
import type { PipelineRun } from "./pipeline-state";

export function RecordedRunList({ runs }: { runs: PipelineRun[] }) {
  return <section aria-labelledby="recorded-runs-title" className="flex min-w-0 flex-col gap-4">
    <div><h2 id="recorded-runs-title" className="text-sm font-semibold">Recorded agent runs</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">Sample history. Inspect saved outcomes and usage; these runs do not call a provider.</p></div>
    {runs.length ? <ol className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">{runs.map((run) => <li key={run.id} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-xs font-medium">{run.agent}</h3><p className="mt-1 break-words font-mono text-[10px] text-muted-foreground">{run.model ?? "Model not recorded"}</p></div><StatusBadge status={run.status} /></div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[11px]"><div><dt className="inline text-muted-foreground">Duration </dt><dd className="inline font-mono">{formatDuration(run.durationMs)}</dd></div><div><dt className="inline text-muted-foreground">Tokens </dt><dd className="inline font-mono">{formatTokens(run.totalTokens)}</dd></div></dl>
      {run.summary && <p className="mt-3 text-xs leading-6 text-muted-foreground">{run.summary}</p>}{run.error && <p className="mt-3 text-xs leading-6 text-destructive">{run.error}</p>}
    </li>)}</ol> : <EmptyState icon={Activity} title="No recorded runs yet" description="Agent runs appear after a plan starts. Missing usage remains unknown." />}
  </section>;
}
