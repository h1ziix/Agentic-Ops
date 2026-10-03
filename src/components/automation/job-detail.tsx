"use client";

import Link from "next/link";
import { useRef } from "react";
import { RotateCcw, X } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/format";
import type { AutomationJob } from "@/types/automation";
import { canCancelJob, canRetryJob, jobExplanation, jobTypeLabels } from "./automation-format";

export function JobDetail({ job, workflowTitle, pending, error, retryEnabled = true, onClose, onOperation }: {
  job: AutomationJob | null; workflowTitle?: string; pending: string; error?: string; retryEnabled?: boolean; onClose: () => void;
  onOperation: (id: string, operation: "retry" | "cancel") => Promise<boolean>;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return <Sheet open={Boolean(job)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent initialFocus={titleRef} className="gap-0 overflow-y-auto bg-card sm:max-w-[560px]" style={{ width: "min(100vw, 560px)", maxWidth: "100vw" }}>
      {job && <><SheetHeader className="border-b border-border px-6 pb-5 pt-7"><p className="section-label">Automation / Job record</p><SheetTitle ref={titleRef} tabIndex={-1} className="mt-2 outline-none">{jobTypeLabels[job.job_type]}</SheetTitle><SheetDescription>{jobExplanation(job)}</SheetDescription><div className="mt-3"><StatusBadge status={job.status} /></div></SheetHeader>
        <div className="flex flex-col gap-6 px-6 py-6">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-5 text-xs">
            <div className="col-span-2"><dt className="section-label">Workflow</dt><dd className="mt-2"><Link href={`/workflows/${job.workflow_id}`} className="hover:underline">{workflowTitle ?? "Open workflow"}</Link></dd></div>
            <div><dt className="text-muted-foreground">Scheduled</dt><dd className="mt-1.5">{formatDateTime(job.scheduled_for)}</dd></div>
            <div><dt className="text-muted-foreground">Attempts</dt><dd className="mt-1.5 font-mono">{job.attempt_count} / {job.max_attempts}</dd></div>
            <div><dt className="text-muted-foreground">Started</dt><dd className="mt-1.5">{job.started_at ? formatDateTime(job.started_at) : "Not started"}</dd></div>
            <div><dt className="text-muted-foreground">Completed</dt><dd className="mt-1.5">{job.completed_at ? formatDateTime(job.completed_at) : "Not completed"}</dd></div>
            <div><dt className="text-muted-foreground">Next retry</dt><dd className="mt-1.5">{job.next_retry_at ? formatDateTime(job.next_retry_at) : "None scheduled"}</dd></div>
            <div><dt className="text-muted-foreground">Related lead</dt><dd className="mt-1.5">{job.lead_id ? <Link href={`/leads?lead=${encodeURIComponent(job.lead_id)}`} className="hover:underline">Open lead</Link> : "Workflow operation"}</dd></div>
          </dl>
          {job.error_summary && <section className="border-t border-border pt-4"><h3 className="section-label">Recorded error</h3><p className="mt-2 text-xs leading-6 text-[var(--danger-soft-fg)]">{job.error_summary}</p><p className="mt-2 text-[11px] text-muted-foreground">{job.error_category?.replaceAll("_", " ")} · {canRetryJob(job) ? "Manual retry available" : job.status === "retry_scheduled" ? "Bounded retry scheduled" : "Review the workflow before recovery"}</p></section>}
          {job.result && <section className="border-t border-border pt-4"><h3 className="section-label">Saved result</h3><dl className="mt-3 flex flex-col gap-3 text-xs">{Object.entries(job.result).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-muted-foreground">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words">{value == null ? "Unknown" : String(value)}</dd></div>)}</dl></section>}
          <div className="flex flex-wrap gap-2">{canRetryJob(job) && <Button size="sm" variant="outline" disabled={Boolean(pending) || !retryEnabled} title={retryEnabled ? undefined : "Enable the background worker to retry this job"} onClick={() => void onOperation(job.id, "retry")}><RotateCcw data-icon="inline-start" />{pending === job.id ? "Saving…" : "Retry job"}</Button>}{canCancelJob(job) && <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void onOperation(job.id, "cancel")}><X data-icon="inline-start" />{pending === job.id ? "Cancelling…" : "Cancel future job"}</Button>}</div>
          {error && <p role="alert" className="text-xs leading-6 text-destructive">{error}</p>}
          <p className="border-t border-border pt-4 text-[11px] leading-6 text-muted-foreground">Cancellation stops future scheduled work. Completed provider actions remain in the audit history. Times shown in Asia/Qyzylorda.</p>
          <p className="break-all font-mono text-[10px] text-muted-foreground">Job {job.id}</p>
        </div></>}
    </SheetContent>
  </Sheet>;
}
