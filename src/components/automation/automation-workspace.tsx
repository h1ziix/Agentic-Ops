"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronRight, ListFilter, RefreshCw, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/components/app/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAutomation } from "./use-automation";
import { canCancelJob, canRetryJob, jobTypeLabels } from "./automation-format";
import { JobDetail } from "./job-detail";
import { FollowUpList } from "./follow-up-list";

const statuses = ["scheduled", "queued", "running", "retry_scheduled", "failed", "completed", "cancelled"] as const;
const selectClass = "h-9 min-w-0 max-w-full rounded-md border border-border bg-card px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AutomationWorkspace() {
  const { workflows, companies, leads, mode } = useDemoStore();
  const automation = useAutomation();
  const params = useSearchParams();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const status = params.get("status") ?? "all";
  const workflowId = params.get("workflow") ?? "all";
  const type = params.get("type") ?? "all";
  const date = params.get("date") ?? "";
  const jobs = automation.data?.automation.jobs ?? [];
  const visible = jobs.filter((job) => (status === "all" || job.status === status) && (workflowId === "all" || job.workflow_id === workflowId) && (type === "all" || job.job_type === type) && (!date || job.scheduled_for.slice(0, 10) === date));
  const workflowNames = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const leadCompanies = new Map(leads.map((lead) => [lead.id, companyNames.get(lead.companyId)]));
  const selected = jobs.find((job) => job.id === selectedId) ?? null;
  const setFilter = (key: string, value: string) => { const query = new URLSearchParams(params.toString()); if (!value || value === "all") query.delete(key); else query.set(key, value); router.replace(`/automation${query.size ? `?${query}` : ""}`, { scroll: false }); };
  async function operate(id: string, operation: "retry" | "cancel") { const saved = await automation.jobOperation(id, operation); if (saved) setNotice(operation === "cancel" ? "Future job cancelled. Recorded results are retained." : "Retry scheduled within the saved attempt limit."); return saved; }

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Operations / Automation" title="Scheduled work" description="Inspect background continuation, bounded retries, and follow-ups held for human review." actions={<Button variant="outline" size="sm" disabled={automation.loading || mode !== "live"} onClick={() => void automation.refresh()}><RefreshCw data-icon="inline-start" />Refresh</Button>} />
    <dl className="grid grid-cols-2 gap-4 border-y border-border py-5 md:grid-cols-4">{[["Scheduled", jobs.filter((job) => ["scheduled", "queued", "retry_scheduled"].includes(job.status)).length], ["Running", jobs.filter((job) => job.status === "running").length], ["Need attention", jobs.filter((job) => job.status === "failed").length], ["Completed", jobs.filter((job) => job.status === "completed").length]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="section-label">{label}</dt><dd className="mt-2 font-mono text-2xl tabular-nums">{automation.loading || mode === "live" && !automation.data ? "—" : value}</dd></div>)}</dl>
    {mode === "demo" ? <p className="text-xs leading-6 text-muted-foreground">Demo preview. Sign in to a configured workspace to inspect persisted automation jobs.</p> : automation.data && !automation.data.enabled && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-xs leading-5 text-[var(--warning-fg)]"><span>{automation.data.providerConfigured ? "Background automation is paused in workspace configuration." : "Background worker setup is required. Saved plans remain visible; no scheduled email will be sent."}</span><Link href="/settings#integrations" className="font-medium underline underline-offset-4">Open settings</Link></div>}
    {automation.error && <p role="alert" className="text-xs leading-6 text-destructive">{automation.error}</p>}{notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {automation.data && <p className="text-[11px] leading-5 text-muted-foreground">Counts cover the loaded job window. Active work, failures, and recent completed records are retained separately.</p>}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[170px_190px_minmax(0,1fr)_180px_auto]">
      <select aria-label="Filter jobs by status" value={status} onChange={(event) => setFilter("status", event.target.value)} className={selectClass}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
      <select aria-label="Filter jobs by type" value={type} onChange={(event) => setFilter("type", event.target.value)} className={selectClass}><option value="all">All job types</option>{Object.entries(jobTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filter jobs by workflow" value={workflowId} onChange={(event) => setFilter("workflow", event.target.value)} className={selectClass}><option value="all">All workflows</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}</select>
      <Input type="date" aria-label="Filter scheduled date in UTC" title="Scheduled date (UTC)" value={date} onChange={(event) => setFilter("date", event.target.value)} />
      {(status !== "all" || type !== "all" || workflowId !== "all" || date) && <Button variant="ghost" onClick={() => router.replace("/automation", { scroll: false })}><X data-icon="inline-start" />Reset</Button>}
    </div>
    <section aria-label="Automation jobs" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{visible.length} records in view · active work and recent history</span><span>Date filter uses UTC · refreshes every 10s while visible</span></div>
      {automation.loading ? <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : visible.length ? <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] table-fixed text-left text-xs"><colgroup><col className="w-[25%]" /><col className="w-[25%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[16%]" /></colgroup><thead className="border-b border-border bg-muted/35 text-[11px] text-muted-foreground"><tr>{["Job", "Workflow / Lead", "Scheduled / Retry", "Status / Attempts", "Actions"].map((label) => <th scope="col" key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{visible.map((job) => <tr key={job.id} className="hover:bg-muted/25"><td className="px-4 py-4"><button type="button" onClick={() => setSelectedId(job.id)} className="text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{jobTypeLabels[job.job_type]}</button>{job.error_summary && <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[var(--danger-soft-fg)]">{job.error_summary}</p>}</td><td className="px-4 py-4"><Link href={`/workflows/${job.workflow_id}`} className="block truncate hover:underline" title={workflowNames.get(job.workflow_id)}>{workflowNames.get(job.workflow_id) ?? "Workflow"}</Link><span className="mt-1 block truncate text-[11px] text-muted-foreground">{job.lead_id ? leadCompanies.get(job.lead_id) ?? "Related lead" : "Workflow operation"}</span></td><td className="px-4 py-4"><time dateTime={job.scheduled_for} className="font-mono text-[10px]">{formatDateTime(job.scheduled_for)}</time>{job.next_retry_at && <p className="mt-1 text-[10px] text-muted-foreground">Retry {formatDateTime(job.next_retry_at)}</p>}</td><td className="px-4 py-4"><StatusBadge status={job.status} /><p className="mt-1 font-mono text-[10px] text-muted-foreground">{job.attempt_count} / {job.max_attempts} attempts</p></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{canRetryJob(job) && <Button variant="ghost" size="icon-sm" aria-label={`Retry ${jobTypeLabels[job.job_type]}`} disabled={Boolean(automation.pending) || !automation.data?.enabled} title={automation.data?.enabled ? undefined : "Enable the background worker to retry"} onClick={() => void operate(job.id, "retry")}><RotateCcw /></Button>}{canCancelJob(job) && <Button variant="ghost" size="icon-sm" aria-label={`Cancel ${jobTypeLabels[job.job_type]}`} disabled={Boolean(automation.pending)} onClick={() => void operate(job.id, "cancel")}><X /></Button>}<Button variant="ghost" size="icon-sm" aria-label={`Inspect ${jobTypeLabels[job.job_type]}`} onClick={() => setSelectedId(job.id)}><ChevronRight /></Button></div></td></tr>)}</tbody></table></div>
        <div className="flex flex-col divide-y divide-border md:hidden">{visible.map((job) => <article key={job.id} className="flex flex-col gap-3 p-4"><button type="button" className="flex items-start justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedId(job.id)}><span className="font-medium text-xs">{jobTypeLabels[job.job_type]}</span><StatusBadge status={job.status} /></button><Link href={`/workflows/${job.workflow_id}`} className="truncate text-xs text-muted-foreground hover:underline">{workflowNames.get(job.workflow_id) ?? "Workflow"}</Link><p className="text-[11px] text-muted-foreground">{formatDateTime(job.scheduled_for)} · {job.attempt_count}/{job.max_attempts} attempts</p>{job.error_summary && <p className="text-xs leading-5 text-[var(--danger-soft-fg)]">{job.error_summary}</p>}<div className="flex flex-wrap gap-2">{canRetryJob(job) && <Button size="sm" variant="outline" disabled={Boolean(automation.pending) || !automation.data?.enabled} title={automation.data?.enabled ? undefined : "Enable the background worker to retry"} onClick={() => void operate(job.id, "retry")}>Retry</Button>}{canCancelJob(job) && <Button size="sm" variant="outline" disabled={Boolean(automation.pending)} onClick={() => void operate(job.id, "cancel")}>Cancel future job</Button>}<Button size="sm" variant="ghost" onClick={() => setSelectedId(job.id)}>Inspect<ChevronRight data-icon="inline-end" /></Button></div></article>)}</div>
      </div> : <EmptyState icon={status === "all" && type === "all" && workflowId === "all" && !date ? CalendarClock : ListFilter} title={jobs.length ? "No jobs match these filters" : "No scheduled jobs yet"} description={jobs.length ? "Change the job type, status, workflow, or scheduled date to inspect another operation." : "Background work will appear here when a workflow continues or an approved follow-up plan is scheduled."} action={jobs.length ? <Button size="sm" variant="outline" onClick={() => router.replace("/automation", { scroll: false })}>Show all jobs</Button> : undefined} />}
    </section>
    {automation.data?.enabled && automation.data.automation.followUps.some((plan) => plan.status === "planned" && plan.automation_status === "inactive") && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs leading-6 text-muted-foreground">Previously approved plans can now schedule draft preparation at their saved due time.</p><Button size="sm" variant="outline" disabled={Boolean(automation.pending)} onClick={async () => { if (await automation.activateFollowUps()) setNotice("Saved follow-up plans scheduled for draft preparation. No email was sent."); }}>Activate saved plans · draft only</Button></div>}
    <FollowUpList plans={(automation.data?.automation.followUps ?? []).filter((plan) => workflowId === "all" || plan.workflow_id === workflowId)} replies={automation.data?.automation.replies ?? []} pending={automation.pending} onOperation={automation.followUpOperation} testJobsAllowed={automation.data?.enabled && automation.data.testJobsAllowed} />
    <p className={cn("text-[11px] leading-6 text-muted-foreground", !visible.length && "border-t border-border pt-4")}>Future outreach is always drafted for a separate approval. Scheduled work never grants permission for a new external action.</p>
    <JobDetail job={selected} workflowTitle={selected ? workflowNames.get(selected.workflow_id) : undefined} pending={automation.pending} error={automation.error} retryEnabled={automation.data?.enabled ?? false} onClose={() => setSelectedId(null)} onOperation={operate} />
  </div>;
}
