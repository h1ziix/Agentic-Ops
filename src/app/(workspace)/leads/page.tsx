"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@base-ui/react/tabs";
import { ArrowDownWideNarrow, Download, Search, SlidersHorizontal, Target, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityLoading, EntityResults, EntityStats, entitySelectClass } from "@/components/entities/entity-ui";
import { LeadDetails } from "@/components/entities/lead-details";
import { LeadRecords } from "@/components/entities/lead-records";
import { exportLeadCsv, useProspectData } from "@/components/entities/prospect-data";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/types/domain";

type LeadView = "all" | "high_fit" | "needs_review";
type SortMode = "score" | "updated" | "company";

export default function LeadsPage() {
  return <Suspense fallback={<EntityLoading title="Leads" />}><LeadsContent /></Suspense>;
}

function LeadsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { leads, workflows, companies, companyById } = useProspectData();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<LeadView>("all");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [sort, setSort] = useState<SortMode>("score");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [exportStatus, setExportStatus] = useState("");
  const selectedLead = leads.find((lead) => lead.id === searchParams.get("lead")) ?? null;
  const highFit = leads.filter((lead) => lead.score !== null && lead.score >= 80).length;
  const needsReview = leads.filter((lead) => lead.outreachStatus === "waiting_approval").length;
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const company = companyById.get(lead.companyId);
      return (!term || [company?.name ?? "", company?.industry ?? "", company?.location ?? "", lead.opportunity].some((value) => value.toLowerCase().includes(term)))
        && (view === "all" || (view === "high_fit" && lead.score !== null && lead.score >= 80) || (view === "needs_review" && lead.outreachStatus === "waiting_approval"))
        && (status === "all" || lead.status === status);
    }).sort((a, b) => sort === "score" ? (b.score ?? -1) - (a.score ?? -1) : sort === "updated" ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt) : (companyById.get(a.companyId)?.name ?? "").localeCompare(companyById.get(b.companyId)?.name ?? ""));
  }, [leads, query, view, status, sort, companyById]);
  const selectedLeads = leads.filter((lead) => selection.has(lead.id));
  const filtersActive = query !== "" || status !== "all" || view !== "all";
  const clearFilters = () => { setQuery(""); setStatus("all"); setView("all"); };
  const toggleLead = (id: string) => setSelection((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleVisible = () => setSelection((current) => { const next = new Set(current); const all = filtered.every((lead) => current.has(lead.id)); filtered.forEach((lead) => { if (all) next.delete(lead.id); else next.add(lead.id); }); return next; });
  const exportLeads = () => { const records = selectedLeads.length ? selectedLeads : filtered; exportLeadCsv(records, companies); setExportStatus(`Exported ${records.length} ${records.length === 1 ? "lead" : "leads"} as CSV.`); };
  const views = [{ value: "all", label: "All leads", count: leads.length }, { value: "high_fit", label: "High fit", count: highFit }, { value: "needs_review", label: "Needs review", count: needsReview }] as const;

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Sales intelligence" title="Leads" description="A qualified starting point for every conversation." actions={<Button variant="outline" onClick={exportLeads} disabled={!filtered.length && !selectedLeads.length}><Download data-icon="inline-start" />Export{selectedLeads.length ? ` ${selectedLeads.length}` : " leads"}</Button>} />
    <EntityStats items={[{ label: "Tracked opportunities", value: leads.length, note: "Across research workflows" }, { label: "High-fit leads", value: highFit, note: "Scored 80 or higher", accent: true }, { label: "Awaiting your review", value: needsReview, note: "Outreach held for approval" }, { label: "Responses", value: leads.filter((lead) => lead.status === "responded").length, note: "Recorded lead responses" }]} />
    <Tabs.Root value={view} onValueChange={(value) => { if (value === "all" || value === "high_fit" || value === "needs_review") setView(value); }} className="flex min-w-0 flex-col gap-4">
      <Tabs.List aria-label="Lead views" className="flex min-w-0 items-center gap-5 overflow-x-auto border-b border-border">
        {views.map((item) => <Tabs.Tab key={item.value} id={`leads-tab-${item.value}`} value={item.value} className="interactive-tab relative flex shrink-0 items-center gap-2 border-b-2 border-transparent pb-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:border-foreground data-active:font-medium data-active:text-foreground">{item.label}<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums">{item.count}</span></Tabs.Tab>)}
      </Tabs.List>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="lead-search" type="search" aria-label="Search leads" placeholder="Search companies or opportunities…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9" /></div>
        <div className="relative"><SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="lead-status-filter" aria-label="Filter by lead status" value={status} onChange={(event) => setStatus(event.target.value as "all" | LeadStatus)} className={cn(entitySelectClass, "pl-8")}><option value="all">All stages</option><option value="new">New</option><option value="qualified">Qualified</option><option value="outreach_ready">Outreach ready</option><option value="waiting_approval">Waiting approval</option><option value="contacted">Contacted</option><option value="responded">Responded</option><option value="converted">Converted</option><option value="rejected">Rejected</option></select></div>
        <div className="relative"><ArrowDownWideNarrow className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="lead-sort" aria-label="Sort leads" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className={cn(entitySelectClass, "pl-8")}><option value="score">Highest score</option><option value="updated">Recently updated</option><option value="company">Company A–Z</option></select></div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}><X data-icon="inline-start" />Reset</Button>}
        <span className="ml-auto hidden text-[11px] text-muted-foreground xl:block">Company-level opportunities</span>
      </div>
      {selectedLeads.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/60 px-3 py-2 text-xs"><span className="font-medium">{selectedLeads.length} selected</span><Button variant="ghost" size="sm" onClick={exportLeads}><Download data-icon="inline-start" />Export selected</Button><Button variant="ghost" size="sm" onClick={() => setSelection(new Set())}>Clear selection</Button></div>}
      {exportStatus && <p role="status" className="text-xs text-[var(--success-fg)]">{exportStatus}</p>}
      <Tabs.Panel id={`leads-panel-${view}`} value={view} className="min-w-0 outline-none">
        <EntityResults resultKey={`${view}-${query}-${status}-${sort}`}>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {filtered.length ? <><LeadRecords leads={filtered} workflows={workflows} companies={companies} selection={selection} onOpen={(id) => router.push(`/leads?lead=${encodeURIComponent(id)}`, { scroll: false })} onSelect={toggleLead} onSelectAll={toggleVisible} /><div className="flex items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3 text-[11px] text-muted-foreground"><span aria-live="polite">{filtered.length} of {leads.length} opportunities</span><span>Workspace records</span></div></> : <EmptyState icon={Target} title={filtersActive ? "No leads in this view" : "Your next opportunity starts here"} description={filtersActive ? "Try a different search or reset the filters to see all leads." : "Start a research workflow to discover and qualify companies."} action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Reset filters</Button> : <Button variant="outline" nativeButton={false} render={<Link href="/workflows" />}>View workflows</Button>} />}
          </div>
        </EntityResults>
      </Tabs.Panel>
    </Tabs.Root>
    <LeadDetails key={selectedLead?.id ?? "closed"} lead={selectedLead} onClose={() => router.replace("/leads", { scroll: false })} />
  </div>;
}
