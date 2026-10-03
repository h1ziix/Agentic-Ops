"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@base-ui/react/tabs";
import { Activity, ArrowDown, ListFilter, Search, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ActivityItem } from "@/components/activity/activity-item";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useDemoStore } from "@/components/app/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityCategory, AgentEvent } from "@/types/domain";

type Filter = "all" | ActivityCategory;
const filters: { value: Filter; label: string }[] = [{ value: "all", label: "All events" }, { value: "agent", label: "Agents" }, { value: "tool", label: "Tools" }, { value: "workflow", label: "Workflows" }, { value: "approval", label: "Approvals" }, { value: "error", label: "Errors" }];
function groupByDay(events: AgentEvent[]) {
  const groups: { day: string; events: AgentEvent[] }[] = [];
  for (const event of events) { const day = event.timestamp.slice(0, 10); const last = groups[groups.length - 1]; if (last?.day === day) last.events.push(event); else groups.push({ day, events: [event] }); }
  return groups;
}
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function ActivityWorkspace() {
  const { activity, workflows, mode } = useDemoStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const workflowId = searchParams.get("workflow") ?? "all";
  const workflowEvents = activity.filter((event) => workflowId === "all" || event.workflowId === workflowId);
  const term = query.trim().toLowerCase();
  const visible = workflowEvents.filter((event) => (filter === "all" || event.category === filter) && (!term || [event.title, event.description, event.agent ?? "", event.toolName ?? ""].some((value) => value.toLowerCase().includes(term))));
  const groups = groupByDay(visible);
  const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));
  const attentionCount = workflowEvents.filter((event) => event.status === "failed").length;
  const clearFilters = () => { setFilter("all"); setQuery(""); router.replace("/activity", { scroll: false }); };
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Operations / Observability" title="Execution trace" description="Follow the decisions, tools, and handoffs behind every workflow." actions={<span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Activity aria-hidden className="size-3.5" />{mode === "live" ? "Persisted events" : "Recorded demo events"}</span>} />
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border pb-5">
      <div className="flex items-baseline gap-2"><span className="font-mono text-2xl font-medium tabular-nums">{workflowEvents.length}</span><span className="text-xs text-muted-foreground">{workflowEvents.length === 1 ? "recorded event" : "recorded events"}</span></div>
      <div className="flex items-baseline gap-2"><span className="font-mono text-2xl font-medium tabular-nums">{workflowEvents.filter((event) => event.category === "tool").length}</span><span className="text-xs text-muted-foreground">tool events</span></div>
      <div className="flex items-baseline gap-2"><span className={attentionCount ? "font-mono text-2xl font-medium tabular-nums text-[var(--danger-fg)]" : "font-mono text-2xl font-medium tabular-nums"}>{attentionCount}</span><span className="text-xs text-muted-foreground">recorded failures</span></div>
      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground lg:flex"><ShieldCheck aria-hidden className="size-3.5" />Safe summaries and recorded results</span>
    </div>
    <Tabs.Root value={filter} onValueChange={(value) => setFilter(value as Filter)} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="activity-search" type="search" aria-label="Search events" placeholder="Search events, agents, or tools…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
        <select id="activity-workflow" aria-label="Filter activity by workflow" value={workflowId} onChange={(event) => router.replace(event.target.value === "all" ? "/activity" : `/activity?workflow=${encodeURIComponent(event.target.value)}`, { scroll: false })} className="h-9 max-w-full rounded-md border border-border bg-card px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[280px]"><option value="all">All workflows</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}</select>
        {(query || workflowId !== "all" || filter !== "all") && <Button variant="ghost" size="sm" onClick={clearFilters}><X data-icon="inline-start" />Reset</Button>}
      </div>
      <Tabs.List aria-label="Filter activity by category" className="flex max-w-full gap-5 overflow-x-auto border-b border-border">
        {filters.map((item) => <Tabs.Tab key={item.value} value={item.value} className="interactive-tab relative flex shrink-0 items-center gap-1.5 pb-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:font-medium data-[active]:text-foreground">{item.label}<span className="font-mono text-[10px] text-muted-foreground">{item.value === "all" ? workflowEvents.length : workflowEvents.filter((event) => event.category === item.value).length}</span>{filter === item.value && <motion.span layoutId="activity-category" className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" transition={{ type: "spring", duration: reducedMotion ? 0 : .3, bounce: 0 }} />}</Tabs.Tab>)}
      </Tabs.List>
      <Tabs.Panel value={filter} className="outline-none">
        <motion.div key={filter} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }}>
          <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>{visible.length} {visible.length === 1 ? "event" : "events"} · expand a row to inspect</span><span className="flex items-center gap-1"><ArrowDown aria-hidden className="size-3" />Newest first · UTC</span></div>
          {groups.length ? <div className="overflow-hidden rounded-lg border border-border bg-card">{groups.map((group) => <div key={group.day}><div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2.5 sm:px-5"><h2 className="text-[11px] font-medium">{dateFormat.format(new Date(group.day))}</h2><span className="font-mono text-[10px] text-muted-foreground">{group.events.length} {group.events.length === 1 ? "event" : "events"}</span></div><ol>{group.events.map((event) => <ActivityItem key={event.id} event={event} workflowTitle={event.workflowId ? workflowsById.get(event.workflowId) ?? "Workflow" : "Workspace integration"} />)}</ol></div>)}</div> : <EmptyState icon={ListFilter} title="No events in this view" description="Try another workflow, event category, or search term. Recorded actions will appear here as the workspace changes." action={<Button variant="outline" size="sm" onClick={clearFilters}>Show all events</Button>} />}
        </motion.div>
      </Tabs.Panel>
    </Tabs.Root>
  </div>;
}

export default function ActivityPage() { return <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>}><ActivityWorkspace /></Suspense>; }
