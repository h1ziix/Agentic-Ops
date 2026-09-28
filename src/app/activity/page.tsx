"use client";

import { useState } from "react";
import { Activity, Eye, ListFilter } from "lucide-react";
import { ActivityItem } from "@/components/activity/activity-item";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useDemoStore } from "@/components/app/demo-store";
import { Button } from "@/components/ui/button";
import type { ActivityCategory, AgentEvent } from "@/types/domain";

type Filter = "all" | ActivityCategory;

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "tool", label: "Tools" },
  { value: "workflow", label: "Workflows" },
  { value: "approval", label: "Approvals" },
  { value: "error", label: "Errors" },
];

const emptyCopy: Record<Filter, { title: string; description: string }> = {
  all: {
    title: "No activity yet",
    description: "Workflow events, tool calls and approval decisions will appear here as work progresses.",
  },
  agent: {
    title: "No agent events in this view",
    description: "Agent starts, task updates and qualification summaries will appear here.",
  },
  tool: {
    title: "No tool events in this view",
    description: "Validated tool calls and their results will appear here when a workflow uses a tool.",
  },
  workflow: {
    title: "No workflow events in this view",
    description: "Workflow starts, task completions and finished runs will appear here.",
  },
  approval: {
    title: "No approval events in this view",
    description: "Requests and recorded human decisions will appear here.",
  },
  error: {
    title: "No errors in this view",
    description: "Execution or source verification failures will appear here when attention is needed.",
  },
};

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function groupByDay(events: AgentEvent[]) {
  const groups: { day: string; events: AgentEvent[] }[] = [];
  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

export default function ActivityPage() {
  const { activity, workflows } = useDemoStore();
  const [filter, setFilter] = useState<Filter>("all");
  const visible = activity.filter((event) => filter === "all" || event.category === filter);
  const groups = groupByDay(visible);
  const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));
  const attentionCount = activity.filter((event) => event.status === "failed").length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Execution history"
        title="Activity"
        description="A trace of what agents, tools and workflows have done in this workspace."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
            <Activity aria-hidden="true" className="size-3.5 text-[#77d3bf]" />
            Demo event stream
          </span>
        }
      />

      <div className="panel flex flex-col gap-3 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-2">
          <Eye aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <p>Events show safe summaries, actions and results. Hidden agent reasoning is not displayed.</p>
        </div>
        <div className="flex shrink-0 items-center gap-4 font-mono tabular-nums">
          <span><strong className="font-semibold text-foreground">{activity.length}</strong> events</span>
          <span><strong className={`font-semibold ${attentionCount ? "text-[#e48787]" : "text-foreground"}`}>{attentionCount}</strong> needs attention</span>
        </div>
      </div>

      <section aria-label="Audit log">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-label">Global audit log</p>
            <h2 className="mt-1 text-[15px] font-semibold text-foreground">Event stream</h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{visible.length} shown</span>
        </div>

        <div className="mb-3 flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1" role="group" aria-label="Filter activity by category">
          {filters.map((item) => {
            const count = item.value === "all"
              ? activity.length
              : activity.filter((event) => event.category === item.value).length;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${filter === item.value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                {item.label}
                <span className="font-mono text-[10px] tabular-nums opacity-65">{count}</span>
              </button>
            );
          })}
        </div>

        {groups.length ? (
          <div className="panel overflow-hidden">
            {groups.map((group, index) => (
              <div key={group.day}>
                <div className={`flex items-center justify-between border-b border-border bg-background/25 px-4 py-2 sm:px-5 ${index > 0 ? "border-t" : ""}`}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{dayLabel(group.day)}</h3>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {group.events.length} {group.events.length === 1 ? "event" : "events"}
                  </span>
                </div>
                <ol>
                  {group.events.map((event) => (
                    <ActivityItem
                      key={event.id}
                      event={event}
                      workflowTitle={workflowsById.get(event.workflowId) ?? "Workflow"}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon={ListFilter}
              title={emptyCopy[filter].title}
              description={emptyCopy[filter].description}
              action={
                filter !== "all" && <Button variant="outline" size="sm" onClick={() => setFilter("all")}>Show all events</Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
