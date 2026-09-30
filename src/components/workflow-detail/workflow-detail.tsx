"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs } from "@base-ui/react/tabs";
import { ArrowLeft, ArrowRight, ArrowUpRight, AlertTriangle, Activity, Building2, CircleDot, GitBranch, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ActivityItem } from "@/components/activity/activity-item";
import { EmptyState } from "@/components/app/empty-state";
import { LeadScore } from "@/components/app/lead-score";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/components/app/demo-store";
import { WorkflowCompanies } from "@/components/workflow-detail/workflow-companies";
import { WorkflowProgress } from "@/components/workflow-detail/workflow-progress";
import { WorkflowTaskList } from "@/components/workflow-detail/workflow-task-list";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PlannerRunPanel } from "./planner-run-panel";
import { useWorkflowPlanning } from "./use-workflow-planning";
import { useWorkflowResearch } from "./use-workflow-research";
import { ResearchRunPanel } from "./research-run-panel";

export function WorkflowDetail({ id }: { id: string }) {
  const { workflows, workflowStages, workflowTasks, companies, leads, approvals, activity, hydrated, mode, plannerRuns, researchRuns } = useDemoStore();
  const [tab, setTab] = useState("tasks");
  const reducedMotion = useReducedMotion();
  const workflow = workflows.find((item) => item.id === id);
  const planning = useWorkflowPlanning(workflow);
  const research = useWorkflowResearch(workflow);
  if (!hydrated) return <div className="flex flex-col gap-6"><Skeleton className="h-28" /><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (!workflow) return <EmptyState icon={CircleDot} title="Workflow not found" description="This workflow is unavailable in your workspace." action={<Link href="/workflows" className="interactive-link text-xs text-[var(--success-muted-fg)] hover:underline">Back to workflows</Link>} />;

  const stages = workflowStages.filter((stage) => stage.workflowId === id).sort((a, b) => a.order - b.order);
  const tasks = workflowTasks.filter((task) => task.workflowId === id).sort((a, b) => a.order - b.order);
  const workflowCompanies = companies.filter((company) => company.workflowResearchStatuses?.[id] || company.workflowId === id)
    .map((company) => ({ ...company, researchStatus: company.workflowResearchStatuses?.[id] ?? company.researchStatus }));
  const workflowLeads = leads.filter((lead) => lead.workflowId === id).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const workflowEvents = activity.filter((event) => event.workflowId === id);
  const pendingApprovals = approvals.filter((approval) => approval.workflowId === id && approval.status === "pending");
  const decidedApprovals = approvals.filter((approval) => approval.workflowId === id && approval.status !== "pending");
  const currentTask = tasks.find((task) => task.status === "running" || task.status === "failed");
  const planner = plannerRuns.find((run) => run.workflowId === id);
  const planningError = planning.error || (planner?.status === "failed" ? planner.error : undefined);
  const currentMessage = workflow.status === "planning" ? mode === "live" ? "The Planner is turning your goal into a validated execution plan. Tasks and activity appear as they are saved." : "This local preview uses a deterministic plan. Connect your workspace to run the Planner."
    : workflow.status === "ready_for_execution" ? "All proposed actions are approved. External execution is disconnected; no messages were sent."
    : workflow.status === "needs_revision" ? "Outreach was rejected. The proposal needs revision before another review; no messages were sent."
    : workflow.status === "waiting_for_approval" ? "Research is complete. Outbound actions are held at the approval gate until you review them."
    : workflow.status === "completed" ? "This workflow has reached its final stage."
    : workflow.status === "failed" ? workflow.errorSummary ?? "This workflow needs attention."
    : workflow.status === "paused" && workflow.currentStep.startsWith("Research complete") ? "Company evidence and qualified leads are saved. Outreach and approval tasks remain pending for a future release."
    : planner?.status === "completed" ? "The Research Agent is executing your plan. Company profiles and evidence appear as each result is saved."
    : currentTask ? `${currentTask.agent} owns the current task in this recorded run.` : "This workflow has not started execution.";
  const tabs = [{ value: "tasks", label: "Task plan", count: tasks.length }, { value: "evidence", label: "Research", count: workflowCompanies.length }, { value: "trace", label: "Trace", count: workflowEvents.length }];

  return <div className="flex flex-col gap-6">
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/workflows" className="interactive-link inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-3.5" />All workflows</Link><span className="font-mono text-[10px] text-muted-foreground">WORKFLOW RECORD</span></div>
      <div className="flex flex-col gap-3"><div className="flex flex-wrap items-center gap-2.5"><span className="section-label flex items-center gap-1.5"><GitBranch aria-hidden className="size-3" />Workflow</span><StatusBadge status={workflow.status} /></div><h1 className="max-w-4xl text-[24px] font-semibold leading-[1.25] tracking-[-.035em] sm:text-[28px]">{workflow.title}</h1><p className="max-w-4xl text-[13px] leading-6 text-muted-foreground">{workflow.goal}</p></div>
    </header>

    {(planningError || workflow.errorSummary) && <div role="alert" className="flex flex-wrap items-start gap-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-xs leading-5 text-[var(--danger-soft-fg)]"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1"><strong className="font-medium">{planner || planningError ? "Planning needs attention." : "Workflow needs attention."}</strong> {planningError || workflow.errorSummary}</div>{mode === "live" && !tasks.length && (workflow.status === "planning" || workflow.status === "failed") && <Button size="sm" variant="outline" disabled={planning.pending} onClick={planning.retry}>{planning.pending ? "Retrying…" : "Retry planning"}</Button>}</div>}

    <dl className="grid grid-cols-2 gap-y-5 border-y border-border py-5 md:grid-cols-4">
      <div className="pr-4"><dt className="section-label">Progress</dt><dd className="mt-2 flex items-center gap-3"><span className="font-mono text-[22px] font-medium tabular-nums">{workflow.progress}<span className="text-sm text-muted-foreground">%</span></span><span className="h-1 w-16 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", workflow.status === "failed" ? "bg-[var(--danger-fg)]" : "bg-[var(--success-fg)]")} style={{ width: `${workflow.progress}%` }} /></span></dd></div>
      <div className="border-l border-border pl-5"><dt className="section-label">Companies found</dt><dd className="mt-2 font-mono text-[22px] font-medium tabular-nums">{workflow.companyCount}<span className="text-sm text-muted-foreground"> / {workflow.targetCompanies}</span></dd></div>
      <div className="pr-4 md:border-l md:border-border md:pl-5"><dt className="section-label">Qualified leads</dt><dd className="mt-2 font-mono text-[22px] font-medium tabular-nums">{workflow.qualifiedLeadCount}</dd></div>
      <div className="border-l border-border pl-5"><dt className="section-label">Last updated</dt><dd className="mt-2 font-mono text-xs tabular-nums">{formatDateTime(workflow.updatedAt)}<span className="mt-1 block font-sans text-[10px] text-muted-foreground">Almaty time</span></dd></div>
    </dl>

    <WorkflowProgress stages={stages} />

    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_280px]">
      <Tabs.Root value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0">
        <Tabs.List aria-label="Workflow views" className="mb-5 flex gap-6 border-b border-border">{tabs.map((item) => <Tabs.Tab key={item.value} value={item.value} className="interactive-tab relative flex items-center gap-2 pb-3 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:font-medium data-[active]:text-foreground">{item.label}<span className="font-mono text-[10px] text-muted-foreground">{item.count}</span>{tab === item.value && <motion.span layoutId={`workflow-tab-${id}`} className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" transition={{ type: "spring", duration: reducedMotion ? 0 : .3, bounce: 0 }} />}</Tabs.Tab>)}</Tabs.List>
        <Tabs.Panel value="tasks" className="outline-none"><motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }} className="flex flex-col gap-5">{mode === "live" && <PlannerRunPanel run={planner} status={workflow.status} />}{mode === "live" && planner?.status === "completed" && <ResearchRunPanel runs={researchRuns.filter((run) => run.workflowId === id)} tasks={tasks} pending={research.pending} error={research.error} onRetry={research.retry} />}<WorkflowTaskList tasks={tasks} failed={workflow.status === "failed"} /></motion.div></Tabs.Panel>
        <Tabs.Panel value="evidence" className="outline-none"><motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }} className="flex flex-col gap-6">
          <WorkflowCompanies companies={workflowCompanies} total={workflow.companyCount} />
          <section className="border-t border-border pt-5"><div className="mb-4"><h2 className="text-sm font-semibold">Qualification evidence</h2><p className="mt-1 text-xs text-muted-foreground">The recorded explanation behind each opportunity score.</p></div>{workflowLeads.length ? <div className="divide-y divide-border">{workflowLeads.map((lead) => { const company = companies.find((item) => item.id === lead.companyId); return <article key={lead.id} className="py-4 first:pt-0"><div className="flex items-center justify-between gap-3"><Link href={`/companies?company=${lead.companyId}`} className="text-[13px] font-medium hover:underline">{company?.name ?? "Company"}</Link><LeadScore score={lead.score} /></div><p className="mt-2 text-xs leading-6 text-muted-foreground">{lead.scoreReason}</p><p className="mt-2 text-[10px] text-muted-foreground">{lead.confidence ? `${lead.confidence.charAt(0).toUpperCase() + lead.confidence.slice(1)} confidence` : "Confidence not assessed"} · {company?.sourceUrls.length ?? 0} source references</p></article>; })}</div> : <EmptyState icon={Building2} title="Evidence is still being gathered" description="Score explanations appear once researched companies become qualified leads." />}</section>
        </motion.div></Tabs.Panel>
        <Tabs.Panel value="trace" className="outline-none"><motion.div initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">Execution trace</h2><p className="mt-1 text-xs text-muted-foreground">Safe summaries, tool activity, and recorded decisions.</p></div><Link href={`/activity?workflow=${encodeURIComponent(id)}`} className="interactive-link inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">Open full trace<ArrowUpRight aria-hidden className="size-3" /></Link></div>
          {workflowEvents.length ? <ol className="overflow-hidden rounded-lg border border-border bg-card">{workflowEvents.map((event) => <ActivityItem key={event.id} event={event} workflowTitle={workflow.title} />)}</ol> : <EmptyState icon={Activity} title="No execution events yet" description="A visible audit record appears when this workflow starts." />}
        </motion.div></Tabs.Panel>
      </Tabs.Root>

      <aside className="grid gap-5 sm:grid-cols-3 xl:flex xl:flex-col xl:border-l xl:border-border xl:pl-6">
        <section aria-labelledby="current-execution" className="border-b border-border pb-5 sm:border-b-0 sm:border-r sm:pr-4 xl:border-r-0 xl:border-b xl:pr-0"><div className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", workflow.status === "failed" ? "bg-[var(--danger-fg)]" : workflow.status === "waiting_for_approval" ? "bg-[var(--warning-fg)]" : "bg-[var(--success-fg)]")} /><h2 id="current-execution" className="section-label">Current checkpoint</h2></div><p className="mt-3 text-sm font-medium leading-5">{workflow.currentStep}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{currentMessage}</p>{currentTask && <div className="mt-3 inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground"><CircleDot aria-hidden className="size-3" />{currentTask.agent}</div>}</section>
        <section aria-labelledby="approval-checkpoint" className="border-b border-border pb-5 sm:border-b-0 sm:border-r sm:pr-4 xl:border-r-0 xl:border-b xl:pr-0"><div className="flex items-center gap-2"><ShieldCheck aria-hidden className={cn("size-3.5", pendingApprovals.length ? "text-[var(--warning-fg)]" : "text-muted-foreground")} /><h2 id="approval-checkpoint" className="section-label">Human approval</h2></div>
          {pendingApprovals.length ? <><p className="mt-3 font-mono text-[26px] font-medium tabular-nums text-[var(--warning-fg)]">{pendingApprovals.reduce((sum, approval) => sum + approval.recipientCount, 0)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Personalized messages are ready for your review.</p><Link href="/approvals" className="interactive-row mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs font-medium text-[var(--warning-fg)] transition-colors hover:bg-[var(--warning-bg-strong)]">Review proposals<ArrowRight aria-hidden className="size-3" /></Link></>
          : decidedApprovals.length ? <><p className="mt-3 text-xs leading-6 text-muted-foreground">{decidedApprovals.reduce((sum, approval) => sum + approval.recipientCount, 0)} proposed messages were {decidedApprovals.some((approval) => approval.status === "rejected") ? "rejected" : "approved"}. No messages were sent.</p><Link href="/approvals" className="mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline">View recorded decision<ArrowRight aria-hidden className="size-3" /></Link></>
          : <p className="mt-3 text-xs leading-6 text-muted-foreground">No pending actions. External messages will be held for review before sending.</p>}
        </section>
        <section><h2 className="section-label">Run record</h2><dl className="mt-3 flex flex-col gap-3 text-[11px]"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Started</dt><dd className="text-right font-mono text-[10px]">{workflow.startedAt ? formatDateTime(workflow.startedAt) : "Not started"}</dd></div>{workflow.completedAt && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Completed</dt><dd className="text-right font-mono text-[10px]">{formatDateTime(workflow.completedAt)}</dd></div>}<div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recorded events</dt><dd className="font-mono">{workflowEvents.length}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Execution</dt><dd>{mode === "live" ? "Planner + Research" : "Demo environment"}</dd></div></dl><Link href={`/activity?workflow=${encodeURIComponent(id)}`} className="interactive-link mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">Inspect audit trail<ArrowUpRight aria-hidden className="size-3" /></Link></section>
      </aside>
    </div>
  </div>;
}
