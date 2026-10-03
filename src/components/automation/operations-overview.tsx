"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { useDemoStore } from "@/components/app/demo-store";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutomation } from "./use-automation";
import { formatEstimatedCost, formatTokens, jobTypeLabels } from "./automation-format";

export function OperationsOverview() {
  const { mode, workflows, approvals, integrationConnections } = useDemoStore();
  const { data, loading, error } = useAutomation();
  if (mode !== "live") return null;
  const jobs = data?.automation.jobs ?? [];
  const plans = data?.automation.followUps ?? [];
  const actions = approvals.flatMap((approval) => approval.proposedActions.map((action) => ({ action, approval })));
  const futureJobs = jobs.filter((job) => ["scheduled", "queued", "retry_scheduled"].includes(job.status));
  const failedJobs = jobs.filter((job) => job.status === "failed").filter((job) => {
    const plan = plans.find((item) => item.id === job.follow_up_plan_id);
    if (plan) return plan.status === "planned" && !["completed", "cancelled", "skipped_reply_detected"].includes(plan.automation_status)
      && (job.job_type === "reply_check" || !["waiting_for_approval", "approved"].includes(plan.automation_status));
    const action = actions.find((item) => item.action.id === job.proposed_action_id)?.action;
    if (action) return !action.supersededById && !["executed", "cancelled", "rejected"].includes(action.status) && !action.attempts?.some((attempt) => attempt.status === "succeeded");
    const workflow = workflows.find((item) => item.id === job.workflow_id);
    return !workflow || !["completed", "cancelled", "waiting_for_approval", "ready_for_execution"].includes(workflow.status);
  });
  const dueFollowUps = data?.automation.followUps.filter((plan) => ["due", "drafting", "waiting_for_approval", "failed"].includes(plan.automation_status) && plan.status !== "cancelled") ?? [];
  const usage = data?.observability?.usageToday;
  const attention = [
    ...(integrationConnections ?? []).filter((connection) => ["reconnect_required", "blocked"].includes(connection.status)).map((connection) => ({ id: connection.id, title: `${connection.provider === "gmail" ? "Gmail" : "HubSpot"} needs reconnection`, detail: "Authorization must be restored before dependent jobs continue.", href: "/settings#integrations" })),
    ...actions.filter(({ action }) => action.attempts?.some((attempt) => attempt.status === "outcome_unknown" && !["closed_for_replacement", "user_confirmed", "provider_read"].includes(attempt.verification_method))).map(({ action, approval }) => ({ id: action.id, title: "External execution is uncertain", detail: "Reconcile the recorded attempt before retrying or replacing it.", href: `/approvals?approval=${encodeURIComponent(approval.id)}` })),
    ...failedJobs.map((job) => ({ id: job.id, title: `${jobTypeLabels[job.job_type]} ${job.attempt_count >= job.max_attempts ? "exhausted retries" : "needs attention"}`, detail: job.error_summary ?? "Inspect the saved error and allowed recovery operation.", href: `/automation?status=failed&workflow=${encodeURIComponent(job.workflow_id)}` })),
    ...actions.filter(({ action }) => action.status === "approved" && !action.supersededById && action.blockers?.some((blocker) => /recipient/i.test(blocker))).map(({ action, approval }) => ({ id: action.id, title: "Approved outreach needs a recipient", detail: "Confirm the recipient in a replacement and review the new revision.", href: `/approvals?approval=${encodeURIComponent(approval.id)}` })),
    ...workflows.filter((workflow) => workflow.status === "failed" && !failedJobs.some((job) => job.workflow_id === workflow.id)).map((workflow) => ({ id: workflow.id, title: "Workflow needs recovery", detail: workflow.errorSummary ?? workflow.currentStep, href: `/workflows/${workflow.id}` })),
  ];

  return <section aria-labelledby="operations-health-title" className="flex min-w-0 flex-col gap-5 border-y border-border py-5">
    <header className="flex items-center justify-between gap-3"><h2 id="operations-health-title" className="text-sm font-semibold">Operational health</h2><Link href="/automation" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">Inspect jobs<ArrowRight aria-hidden className="size-3" /></Link></header>
    {loading ? <Skeleton className="h-16" /> : <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">{[["Scheduled jobs", data ? futureJobs.length : "—"], ["Failed jobs", data ? failedJobs.length : "—"], ["Replies detected", data?.automation.replies.length ?? "—"], ["Follow-ups due", data ? dueFollowUps.length : "—"], [usage?.unknownUsageCount ? "AI tokens today · partial" : "AI tokens today", usage ? formatTokens(usage.totalTokens) : "Unknown"], ["Estimated AI cost today", usage ? formatEstimatedCost(usage.estimatedCostUsd) : "Unknown"]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[10px] leading-5 text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd></div>)}</dl>}
    {usage && (usage.unknownCostCount > 0 || usage.unknownUsageCount > 0) && <p className="text-[10px] leading-5 text-muted-foreground">{usage.unknownCostCount > 0 ? `${usage.unknownCostCount} model runs have unknown cost. ` : ""}{usage.unknownUsageCount > 0 ? `${usage.unknownUsageCount} runs have incomplete token usage.` : ""}</p>}
    {data && <p className="text-[10px] leading-5 text-muted-foreground">Job and reply counts cover the current record window.{data.observability?.truncated ? " Usage totals cover a bounded run window; older history remains in the audit trail." : ""}</p>}
    <div className="flex flex-col gap-3 border-t border-border pt-4"><div className="flex items-center gap-2"><CircleAlert aria-hidden className="size-3.5 text-muted-foreground" /><h3 className="text-xs font-medium">Needs attention</h3><span className="font-mono text-[10px] text-muted-foreground">{attention.length}</span></div>{attention.length ? <ul className="divide-y divide-border">{attention.slice(0, 5).map((item) => <li key={item.id}><Link href={item.href} className="flex items-center gap-3 rounded px-2 py-3 hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{item.title}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{item.detail}</span></span><ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /></Link></li>)}</ul> : !loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 aria-hidden className="size-3.5" />{error ? "Operational health is unavailable until automation reconnects." : "No active problems require your attention."}</p>}{attention.length > 5 && <Link href="/automation?status=failed" className="text-[11px] text-muted-foreground hover:underline">Inspect the remaining {attention.length - 5} items in jobs and workflow records</Link>}</div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>;
}
