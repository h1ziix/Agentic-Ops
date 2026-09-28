"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ExternalLink, Search, Target, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { LeadScore } from "@/components/app/lead-score";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { companies, leads, workflows } from "@/lib/mock-data";
import type { Lead, LeadStatus, OutreachStatus } from "@/types/domain";

type LeadFilter = "all" | LeadStatus;
type SortMode = "score" | "updated";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const companyById = new Map(companies.map((company) => [company.id, company]));
const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));

function outreachLabel(status: OutreachStatus) {
  switch (status) {
    case "not_started": return "Not started";
    case "drafted": return "Drafted";
    case "waiting_approval": return "Waiting approval";
    case "approved": return "Approved";
    case "sent": return "Sent";
  }
}

export default function LeadsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const filteredLeads = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads
      .filter((lead) => {
        const company = companyById.get(lead.companyId);
        const searchValues = [company?.name ?? "", company?.industry ?? "", lead.opportunity];
        return (!term || searchValues.some((value) => value.toLowerCase().includes(term)))
          && (statusFilter === "all" || lead.status === statusFilter);
      })
      .sort((a, b) => sortMode === "score" ? b.score - a.score : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [query, statusFilter, sortMode]);

  const filtersActive = query !== "" || statusFilter !== "all";
  const resetFilters = () => { setQuery(""); setStatusFilter("all"); };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Qualified opportunities"
        title="Leads"
        description="Review scored opportunities, outreach readiness, and the workflow behind each recommendation."
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-4 text-[13px]">
        <span className="font-medium text-foreground"><span className="font-mono tabular-nums">{leads.length}</span> tracked leads</span>
        <span className="text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{leads.filter((lead) => lead.score >= 80).length}</span> high fit</span>
        <span className="text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{leads.filter((lead) => lead.status === "waiting_approval").length}</span> awaiting approval</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search leads"
            placeholder="Search companies or opportunities…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <select
          aria-label="Filter by lead status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as LeadFilter)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="qualified">Qualified</option>
          <option value="outreach_ready">Outreach ready</option>
          <option value="waiting_approval">Waiting approval</option>
          <option value="contacted">Contacted</option>
          <option value="responded">Responded</option>
          <option value="converted">Converted</option>
          <option value="rejected">Rejected</option>
        </select>
        <div className="relative">
          <ArrowUpDown aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Sort leads"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-9 rounded-md border border-border bg-card py-0 pl-9 pr-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="score">Highest score</option>
            <option value="updated">Recently updated</option>
          </select>
        </div>
        {filtersActive && (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <X aria-hidden="true" className="size-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="table-shell">
        {filteredLeads.length > 0 ? (
          <>
            <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground sm:hidden">Scroll horizontally to see all columns →</p>
            <table className="w-full min-w-[980px] table-fixed text-left text-[13px]">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="bg-muted/25 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Company</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Lead score</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Opportunity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Outreach</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Workflow</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const company = companyById.get(lead.companyId);
                  const workflow = workflowById.get(lead.workflowId);
                  return (
                    <tr key={lead.id} className="border-t border-border transition-colors hover:bg-muted/25">
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => setSelectedLead(lead)}
                          className="block max-w-full truncate text-left font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          title={`View ${company?.name ?? "lead"} opportunity`}
                        >
                          {company?.name ?? "Unknown company"}
                        </button>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{company?.industry ?? "Company"}</span>
                      </td>
                      <td className="px-4 py-3.5"><LeadScore score={lead.score} /></td>
                      <td className="truncate px-4 py-3.5 text-foreground/85" title={lead.opportunity}>{lead.opportunity}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={lead.status} /></td>
                      <td className="px-4 py-3.5"><StatusBadge status={lead.outreachStatus} label={outreachLabel(lead.outreachStatus)} /></td>
                      <td className="truncate px-4 py-3.5">
                        <Link href={`/workflows/${lead.workflowId}`} className="text-muted-foreground hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" title={workflow?.title}>
                          {workflow?.title ?? "Workflow"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">{dateFormatter.format(new Date(lead.updatedAt))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              Showing <span className="font-mono tabular-nums text-foreground">{filteredLeads.length}</span> of {leads.length} leads
            </div>
          </>
        ) : (
          <EmptyState
            icon={Target}
            title={filtersActive ? "No matching leads" : "No leads qualified yet"}
            description={filtersActive ? "Try another status or clear the search to see all opportunities." : "Qualified opportunities will appear after company research and scoring."}
            action={filtersActive ? <Button type="button" variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button> : <Link href="/workflows" className="text-sm text-foreground underline underline-offset-4">View workflows</Link>}
          />
        )}
      </div>

      <LeadDetails lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}

function LeadDetails({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  if (!lead) return null;
  const company = companyById.get(lead.companyId);
  const workflow = workflowById.get(lead.workflowId);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent initialFocus={titleRef} style={{ width: "min(100vw, 560px)" }} className="gap-0 overflow-y-auto bg-card">
        <SheetHeader className="border-b border-border px-6 pb-5 pt-7">
          <p className="section-label mb-2">Lead opportunity</p>
          <SheetTitle ref={titleRef} tabIndex={-1} className="text-xl font-semibold tracking-tight">{company?.name ?? "Company"}</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] leading-5">{company?.industry ?? "Research lead"} · {company?.location ?? "Unknown location"}</SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <StatusBadge status={lead.status} />
            <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{lead.confidence} confidence</span>
          </div>
        </SheetHeader>

        <div className="space-y-7 px-6 py-6">
          <section>
            <p className="section-label mb-3">Lead assessment</p>
            <div className="flex items-baseline gap-3">
              <LeadScore score={lead.score} className="text-3xl" />
              <span className="text-xs text-muted-foreground">Opportunity fit</span>
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">{lead.opportunity}</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{lead.scoreReason}</p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Outreach</p>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-muted-foreground">Current state</span>
              <StatusBadge status={lead.outreachStatus} label={outreachLabel(lead.outreachStatus)} />
            </div>
            <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
              Proposed external communication stays in the approval queue until reviewed.
            </p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Context</p>
            <p className="text-[13px] leading-6 text-foreground/85">{company?.description ?? "Company research is not available."}</p>
            <p className="mt-3 text-xs text-muted-foreground">This is a fictional company in the Stage 1 demo.</p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Source workflow</p>
            <Link href={`/workflows/${lead.workflowId}`} onClick={onClose} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              {workflow?.title ?? "View workflow"}<ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
