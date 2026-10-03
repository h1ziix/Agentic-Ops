"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@base-ui/react/tabs";
import { Activity, ArrowDown, ListFilter, Search, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { workspaceHref } from "@/lib/workspace-path";
import { ActivityItem } from "@/components/activity/activity-item";
import { useEventHistory } from "@/components/activity/use-event-history";
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
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const workflowId = searchParams.get("workflow") ?? "all";
  const [paging, setPaging] = useState({ workflowId: "all", page: 1 });
  const page = paging.workflowId === workflowId ? paging.page : 1;
  const history = useEventHistory(workflowId, page);
  const workflowEvents = (mode === "live" ? history.data?.items ?? [] : activity.filter((event) => workflowId === "all" || event.workflowId === workflowId))
    .toSorted((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));
  const term = query.trim().toLowerCase();
  const visible = workflowEvents.filter((event) => (filter === "all" || event.category === filter) && (!term || [event.title, event.description, event.agent ?? "", event.toolName ?? ""].some((value) => value.toLowerCase().includes(term))));
  const groups = groupByDay(visible);
  const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));
  const attentionCount = workflowEvents.filter((event) => event.status === "failed").length;
  const unavailable = mode === "live" && (history.loading || Boolean(history.error));
  const changeWorkflow = (id: string) => router.replace(workspaceHref(id === "all" ? "/activity" : `/activity?workflow=${encodeURIComponent(id)}`, pathname), { scroll: false });
  const clearFilters = () => { setFilter("all"); setQuery(""); setPaging({ workflowId: "all", page: 1 }); changeWorkflow("all"); };
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Operations / Observability" title="Execution trace" description="Follow the decisions, tools, and handoffs behind every workflow." actions={<span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Activity aria-hidden className="size-3.5" />{mode === "live" ? "Persisted events" : "Recorded demo events"}</span>} />
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border pb-5">
      <div className="flex items-baseline gap-2"><span className="font-mono text-2xl font-medium tabular-nums">{unavailable ? "—" : workflowEvents.length}</span><span className="text-xs text-muted-foreground">{mode === "live" ? "events on this page" : workflowEvents.length === 1 ? "recorded event" : "recorded events"}</span></div>
      <div className="flex items-baseline gap-2"><span className="font-mono text-2xl font-medium tabular-nums">{unavailable ? "—" : workflowEvents.filter((event) => event.category === "tool").length}</span><span className="text-xs text-muted-foreground">tool events</span></div>
      <div className="flex items-baseline gap-2"><span className={attentionCount ? "font-mono text-2xl font-medium tabular-nums text-[var(--danger-fg)]" : "font-mono text-2xl font-medium tabular-nums"}>{unavailable ? "—" : attentionCount}</span><span className="text-xs text-muted-foreground">recorded failures</span></div>
      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground lg:flex"><ShieldCheck aria-hidden className="size-3.5" />Safe summaries and recorded results</span>
    </div>
    <Tabs.Root value={filter} onValueChange={(value) => setFilter(value as Filter)} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="activity-search" type="search" aria-label="Search events" placeholder="Search events, agents, or tools…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div>
        <select id="activity-workflow" aria-label="Filter activity by workflow" value={workflowId} onChange={(event) => changeWorkflow(event.target.value)} className="h-9 max-w-full rounded-md border border-border bg-card px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[280px]"><option value="all">All workflows</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}</select>
        {(query || workflowId !== "all" || filter !== "all") && <Button variant="ghost" size="sm" onClick={clearFilters}><X data-icon="inline-start" />Reset</Button>}
      </div>
      <Tabs.List aria-label="Filter activity by category" className="flex max-w-full gap-5 overflow-x-auto border-b border-border">
        {filters.map((item) => <Tabs.Tab key={item.value} value={item.value} className="interactive-tab relative flex shrink-0 items-center gap-1.5 pb-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:font-medium data-[active]:text-foreground">{item.label}<span className="font-mono text-[10px] text-muted-foreground">{unavailable ? "—" : item.value === "all" ? workflowEvents.length : workflowEvents.filter((event) => event.category === item.value).length}</span>{filter === item.value && <motion.span layoutId="activity-category" className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" transition={{ type: "spring", duration: reducedMotion ? 0 : .3, bounce: 0 }} />}</Tabs.Tab>)}
      </Tabs.List>
      <Tabs.Panel value={filter} aria-busy={history.loading} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <motion.div key={filter} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .18 }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{history.loading ? "Loading event history…" : history.error ? "Event history unavailable" : `${visible.length} ${visible.length === 1 ? "event" : "events"} · expand a row to inspect`}</span><span className="flex items-center gap-1"><ArrowDown aria-hidden className="size-3" />Newest first · UTC</span></div>
          {history.loading ? <div aria-label="Loading event history" className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : history.error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4"><p className="text-xs leading-6 text-destructive">{history.error}</p><Button variant="outline" size="sm" onClick={history.retry}>Retry history</Button></div> : groups.length ? <div className="overflow-hidden rounded-lg border border-border bg-card">{groups.map((group) => <div key={group.day}><div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2.5 sm:px-5"><h2 className="text-[11px] font-medium">{dateFormat.format(new Date(group.day))}</h2><span className="font-mono text-[10px] text-muted-foreground">{group.events.length} {group.events.length === 1 ? "event" : "events"}</span></div><ol>{group.events.map((event) => <ActivityItem key={event.id} event={event} workflowTitle={event.workflowId ? workflowsById.get(event.workflowId) ?? "Workflow" : "Workspace integration"} />)}</ol></div>)}</div> : <EmptyState icon={ListFilter} title="No events in this view" description="Try another workflow, event category, or search term. Recorded actions will appear here as the workspace changes." action={<Button variant="outline" size="sm" onClick={clearFilters}>Show all events</Button>} />}
          {mode === "live" && <nav aria-label="Event history pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-[11px] leading-5 text-muted-foreground">Page {page} · {history.data?.pageSize ?? 100} events per page. Search and categories apply to this page.</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || history.loading} onClick={() => setPaging({ workflowId, page: page - 1 })}>Previous</Button><Button variant="outline" size="sm" disabled={!history.data?.hasMore || history.loading} onClick={() => setPaging({ workflowId, page: page + 1 })}>Next page</Button></div></nav>}
        </motion.div>
      </Tabs.Panel>
    </Tabs.Root>
  </div>;
}

export default function ActivityPage() { return <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>}><ActivityWorkspace /></Suspense>; }
