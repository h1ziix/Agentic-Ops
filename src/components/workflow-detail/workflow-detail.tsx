"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, AlertTriangle, Building2, CircleDot, ExternalLink, ShieldCheck } from "lucide-react";
import { ActivityFeed } from "@/components/app/activity-feed";
import { EmptyState } from "@/components/app/empty-state";
import { LeadScore } from "@/components/app/lead-score";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/components/app/demo-store";
import { WorkflowCompanies } from "@/components/workflow-detail/workflow-companies";
import { WorkflowProgress } from "@/components/workflow-detail/workflow-progress";
import { WorkflowTaskList } from "@/components/workflow-detail/workflow-task-list";
import { companies, leads } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkflowDetail({ id }: { id: string }) {
  const { workflows, workflowStages, workflowTasks, approvals, activity, hydrated } = useDemoStore();
  const workflow = workflows.find((item) => item.id === id);
  if (!hydrated) return <div className="space-y-5"><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>;
  if (!workflow) return <div className="panel"><EmptyState icon={CircleDot} title="Workflow not found" description="This workflow may have been removed from your local demo data." action={<Link href="/workflows" className="text-xs text-[#a9d2c8] hover:underline">Back to workflows</Link>} /></div>;

  const stages = workflowStages.filter((stage) => stage.workflowId === id).sort((a, b) => a.order - b.order);
  const tasks = workflowTasks.filter((task) => task.workflowId === id).sort((a, b) => a.order - b.order);
  const workflowCompanies = companies.filter((company) => company.workflowId === id);
  const workflowEvents = activity.filter((event) => event.workflowId === id);
  const workflowApprovals = approvals.filter((approval) => approval.workflowId === id && approval.status === "pending");
  const decidedApprovals = approvals.filter((approval) => approval.workflowId === id && approval.status !== "pending");
  const currentTask = tasks.find((task) => task.status === "running" || task.status === "failed");
  const topLead = leads.filter((lead) => lead.workflowId === id).sort((a, b) => b.score - a.score)[0];
  const topCompany = topLead && companies.find((company) => company.id === topLead.companyId);
  const currentMessage = workflow.status === "planning" ? "A starter plan has been staged in the browser. Live agents and research are not connected in Stage 1."
    : workflow.status === "ready_for_execution" ? "All proposed actions were approved in this demo. Execution is unavailable, and no messages were sent."
    : workflow.status === "needs_revision" ? "Outreach was rejected in this demo. No messages were sent; the proposal would need revision before another review."
    : workflow.status === "waiting_for_approval" ? "Research is complete. Proposed external actions remain held until you review them."
    : workflow.status === "completed" ? "This demo run has reached its final stage."
    : workflow.status === "failed" ? workflow.errorSummary ?? "This workflow needs attention."
    : currentTask ? `${currentTask.agent} owns the active task: ${currentTask.title.toLowerCase()}.` : "No task is running.";

  return <div className="space-y-6">
    <div><Link href="/workflows" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Workflows</Link><div className="mt-4 flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 max-w-4xl"><div className="mb-2 flex items-center gap-2"><span className="section-label">Workflow / {id.startsWith("demo-") ? "New demo plan" : "Recorded run"}</span><StatusBadge status={workflow.status} /></div><h1 className="max-w-3xl text-[25px] font-semibold leading-[1.2] tracking-[-0.04em] sm:text-[28px]">{workflow.title}</h1><p className="mt-3 max-w-3xl text-[13px] leading-6 text-muted-foreground">{workflow.goal}</p></div><Link href="/activity" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-[#d5dddf] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View audit log <ExternalLink className="size-3" /></Link></div></div>

    {workflow.errorSummary && <div role="alert" className="flex gap-3 rounded-md border border-[#6a4545] bg-[#351f21] px-4 py-3 text-xs leading-5 text-[#e7b0b0]"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><strong className="block font-semibold">Research stopped</strong>{workflow.errorSummary}</div></div>}

    <div className="panel grid grid-cols-2 divide-x divide-y divide-border overflow-hidden md:grid-cols-4 md:divide-y-0"><div className="px-5 py-4"><p className="section-label">Progress</p><p className="mt-2 font-mono text-[22px] font-semibold tabular-nums">{workflow.progress}<span className="text-sm text-muted-foreground">%</span></p><div className="mt-2 h-1 w-full rounded-full bg-[#30363b]"><div className="h-full rounded-full bg-[#77d3bf]" style={{ width: `${workflow.progress}%` }} /></div></div><div className="px-5 py-4"><p className="section-label">Companies</p><p className="mt-2 font-mono text-[22px] font-semibold tabular-nums">{workflow.companyCount}<span className="ml-1 text-sm text-muted-foreground">/ {workflow.targetCompanies}</span></p><p className="mt-1 text-[11px] text-muted-foreground">Target profiles</p></div><div className="px-5 py-4"><p className="section-label">Qualified leads</p><p className="mt-2 font-mono text-[22px] font-semibold tabular-nums">{workflow.qualifiedLeadCount}</p><p className="mt-1 text-[11px] text-muted-foreground">Opportunities identified</p></div><div className="px-5 py-4"><p className="section-label">Last updated</p><p className="mt-2 font-mono text-[14px] font-medium tabular-nums">{formatDateTime(workflow.updatedAt)}</p><p className="mt-1 text-[11px] text-muted-foreground">Almaty time</p></div></div>

    <WorkflowProgress stages={stages} />

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
      <WorkflowTaskList tasks={tasks} />
      <div className="space-y-5">
        <section className="panel overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Current execution</h2><p className="mt-0.5 text-xs text-muted-foreground">What the system is doing now</p></div><div className="p-5"><StatusBadge status={workflow.status} /><p className="mt-4 text-[14px] font-medium leading-5">{workflow.currentStep}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{currentMessage}</p></div><div className="flex items-center justify-between border-t border-border bg-[#111519] px-5 py-3 text-[11px] text-muted-foreground"><span>Started {workflow.startedAt ? formatDateTime(workflow.startedAt) : "not yet"}</span><span>{workflowEvents.length} audit {workflowEvents.length === 1 ? "event" : "events"}</span></div></section>
        <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Approval checkpoint</h2><p className="mt-0.5 text-xs text-muted-foreground">Outbound actions require a decision</p></div><ShieldCheck className="size-4 text-[#e8b766]" /></div><div className="p-5">{workflowApprovals.length > 0 ? <><p className="font-mono text-[25px] font-semibold tabular-nums text-[#e8b766]">{workflowApprovals.reduce((sum, approval) => sum + approval.recipientCount, 0)}</p><p className="mt-1 text-xs text-muted-foreground">personalized messages waiting for review</p><Link href="/approvals" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#e8c27f] hover:underline">Review proposed actions <ArrowRight className="size-3.5" /></Link></> : decidedApprovals.length > 0 ? <><p className="text-xs leading-5 text-muted-foreground">{decidedApprovals.reduce((sum, approval) => sum + approval.recipientCount, 0)} proposed messages were {decidedApprovals.some((approval) => approval.status === "rejected") ? "rejected" : "approved"} in the demo. No messages were sent.</p><Link href="/approvals" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#b9d8cf] hover:underline">View recorded decision <ArrowRight className="size-3.5" /></Link></> : <><p className="text-xs leading-5 text-muted-foreground">No pending external actions for this workflow. Future messages will be held here before execution.</p><div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#9acaaa]"><ShieldCheck className="size-3" />Approval required before sending</div></>}</div></section>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
      <WorkflowCompanies companies={workflowCompanies} total={workflow.companyCount} />
      <section className="panel overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Qualification evidence</h2><p className="mt-0.5 text-xs text-muted-foreground">A concise reason behind lead scores</p></div>{topLead && topCompany ? <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="section-label">Highest scored lead</p><Link href={`/companies?company=${topCompany.id}`} className="mt-2 block text-sm font-medium hover:text-[#b9d8cf]">{topCompany.name}</Link></div><LeadScore score={topLead.score} /></div><p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{topLead.scoreReason}</p><div className="mt-4 flex justify-between text-[11px] text-[#89949c]"><span>Confidence: {topLead.confidence}</span><span>{topCompany.sourceUrls.length} illustrative sources</span></div></div> : <EmptyState icon={Building2} title="Evidence is still being gathered" description="Score explanations will appear once researched companies become qualified leads." />}</section>
    </div>

    <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Agent activity</h2><p className="mt-0.5 text-xs text-muted-foreground">Tool calls, summaries and state changes for this workflow</p></div><span className="font-mono text-xs tabular-nums text-muted-foreground">{workflowEvents.length} {workflowEvents.length === 1 ? "event" : "events"}</span></div>{workflowEvents.length ? <ActivityFeed events={workflowEvents} /> : <EmptyState icon={CircleDot} title="No execution events yet" description="A visible event record will appear when this workflow starts." />}</section>
  </div>;
}
