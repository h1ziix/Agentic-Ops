"use client";

import { Suspense, useState } from "react";
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
import { exportLeadCsv, outreachLabel, useProspectData } from "@/components/entities/prospect-data";
import { normalizeOpportunity } from "@/lib/intelligence-normalization";
import { leadFilterKeys, leadIndustry, leadMatchesFilters, prospectUrl, readLeadFilters, type LeadFilters } from "@/lib/prospect-filters";
import { cn } from "@/lib/utils";
import type { OutreachStatus } from "@/types/domain";

export default function LeadsPage() {
  return <Suspense fallback={<EntityLoading title="Leads" />}><LeadsContent /></Suspense>;
}

function LeadsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { leads, workflows, companies, companyById } = useProspectData();
  const filters = readLeadFilters(searchParams);
  const { query, view, status, sort } = filters;
  const advancedCount = [filters.workflow, filters.icp, filters.confidence, filters.industry, filters.opportunity, filters.outreach, filters.reply].filter((value) => value !== "all").length
    + [filters.minScore, filters.maxScore].filter((value) => value !== null).length + [filters.from, filters.to].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(advancedCount > 0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [exportStatus, setExportStatus] = useState("");
  const selectedLead = leads.find((lead) => lead.id === searchParams.get("lead")) ?? null;
  const highFit = leads.filter((lead) => lead.score !== null && lead.score >= 80).length;
  const needsReview = leads.filter((lead) => lead.outreachStatus === "waiting_approval").length;
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const filtered = leads.filter((lead) => leadMatchesFilters(lead, companyById.get(lead.companyId), workflowById.get(lead.workflowId), filters))
    .sort((a, b) => sort === "score" ? (b.score ?? -1) - (a.score ?? -1) : sort === "updated" ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt) : (companyById.get(a.companyId)?.name ?? "").localeCompare(companyById.get(b.companyId)?.name ?? ""));
  const industries = [...new Set(leads.map((lead) => leadIndustry(lead, companyById.get(lead.companyId))))].sort();
  const opportunities = [...new Set(leads.map((lead) => normalizeOpportunity(lead.opportunity)))].sort();
  const icps = [...new Map(workflows.filter((workflow) => workflow.icpId).map((workflow) => [workflow.icpId!, workflow.icpName ?? "Saved ICP"])).entries()];
  const selectedLeads = leads.filter((lead) => selection.has(lead.id));
  const filtersActive = query !== "" || status !== "all" || view !== "all" || advancedCount > 0;
  const updateFilter = (key: string, value: string) => window.history.replaceState(null, "", prospectUrl("/leads", window.location.search, { [key]: value }));
  const clearFilters = () => window.history.replaceState(null, "", prospectUrl("/leads", window.location.search, Object.fromEntries(leadFilterKeys.map((key) => [key, null]))));
  const toggleLead = (id: string) => setSelection((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleVisible = () => setSelection((current) => { const next = new Set(current); const all = filtered.every((lead) => current.has(lead.id)); filtered.forEach((lead) => { if (all) next.delete(lead.id); else next.add(lead.id); }); return next; });
  const exportLeads = () => { const records = selectedLeads.length ? selectedLeads : filtered; exportLeadCsv(records, companies); setExportStatus(`Exported ${records.length} ${records.length === 1 ? "lead" : "leads"} as CSV.`); };
  const views = [{ value: "all", label: "All leads", count: leads.length }, { value: "high_fit", label: "High fit", count: highFit }, { value: "needs_review", label: "Needs review", count: needsReview }] as const;

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Sales intelligence" title="Leads" description="A qualified starting point for every conversation." actions={<Button variant="outline" onClick={exportLeads} disabled={!filtered.length && !selectedLeads.length}><Download data-icon="inline-start" />Export{selectedLeads.length ? ` ${selectedLeads.length}` : " leads"}</Button>} />
    <EntityStats items={[{ label: "Tracked opportunities", value: leads.length, note: "Across research workflows" }, { label: "High-fit leads", value: highFit, note: "Scored 80 or higher", accent: true }, { label: "Awaiting your review", value: needsReview, note: "Outreach held for approval" }, { label: "Replies detected", value: leads.filter((lead) => lead.replyStatus === "detected").length, note: "Persisted reply observations" }]} />
    <Tabs.Root value={view} onValueChange={(value) => { if (value === "all" || value === "high_fit" || value === "needs_review") updateFilter("view", value); }} className="flex min-w-0 flex-col gap-4">
      <Tabs.List aria-label="Lead views" className="flex min-w-0 items-center gap-5 overflow-x-auto border-b border-border">
        {views.map((item) => <Tabs.Tab key={item.value} id={`leads-tab-${item.value}`} value={item.value} className="interactive-tab relative flex shrink-0 items-center gap-2 border-b-2 border-transparent pb-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:border-foreground data-active:font-medium data-active:text-foreground">{item.label}<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums">{item.count}</span></Tabs.Tab>)}
      </Tabs.List>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="lead-search" type="search" aria-label="Search leads" placeholder="Search companies or opportunities…" value={query} onChange={(event) => updateFilter("q", event.target.value)} className="h-9 pl-9" /></div>
        <select id="lead-status-filter" aria-label="Filter by lead status" value={status} onChange={(event) => updateFilter("stage", event.target.value)} className={entitySelectClass}><option value="all">All stages</option><option value="new">New</option><option value="qualified">Qualified</option><option value="outreach_ready">Outreach ready</option><option value="waiting_approval">Waiting approval</option><option value="contacted">Contacted</option><option value="responded">Responded</option><option value="converted">Converted</option><option value="rejected">Rejected</option></select>
        <div className="relative"><ArrowDownWideNarrow aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="lead-sort" aria-label="Sort leads" value={sort} onChange={(event) => updateFilter("sort", event.target.value)} className={cn(entitySelectClass, "pl-8")}><option value="score">Highest score</option><option value="updated">Recently updated</option><option value="company">Company A–Z</option></select></div>
        <Button variant="outline" size="sm" aria-expanded={filtersOpen} aria-controls="lead-advanced-filters" onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal data-icon="inline-start" />Filters{advancedCount > 0 ? ` · ${advancedCount}` : ""}</Button>
        {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}><X data-icon="inline-start" />Reset</Button>}
        <span className="ml-auto hidden text-[11px] text-muted-foreground xl:block">Company-level opportunities</span>
      </div>
      {filtersOpen && <LeadAdvancedFilters filters={filters} updateFilter={updateFilter} industries={industries} opportunities={opportunities} workflows={workflows.map((workflow) => [workflow.id, workflow.title])} icps={icps} />}
      {selectedLeads.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/60 px-3 py-2 text-xs"><span className="font-medium">{selectedLeads.length} selected</span><Button variant="ghost" size="sm" onClick={exportLeads}><Download data-icon="inline-start" />Export selected</Button><Button variant="ghost" size="sm" onClick={() => setSelection(new Set())}>Clear selection</Button></div>}
      {exportStatus && <p role="status" className="text-xs text-[var(--success-fg)]">{exportStatus}</p>}
      <Tabs.Panel id={`leads-panel-${view}`} value={view} className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <EntityResults resultKey={searchParams.toString()}>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {filtered.length ? <><LeadRecords leads={filtered} workflows={workflows} companies={companies} selection={selection} onOpen={(id) => router.push(prospectUrl("/leads", searchParams.toString(), { lead: id }), { scroll: false })} onSelect={toggleLead} onSelectAll={toggleVisible} /><div className="flex items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3 text-[11px] text-muted-foreground"><span aria-live="polite">{filtered.length} of {leads.length} opportunities</span><span>Workspace records</span></div></> : <EmptyState icon={Target} title={filtersActive ? "No leads in this view" : "Your next opportunity starts here"} description={filtersActive ? "Try a different search or reset the filters to see all leads." : "Start a research workflow to discover and qualify companies."} action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Reset filters</Button> : <Button variant="outline" nativeButton={false} render={<Link href="/workflows" />}>View workflows</Button>} />}
          </div>
        </EntityResults>
      </Tabs.Panel>
    </Tabs.Root>
    <LeadDetails key={selectedLead?.id ?? "closed"} lead={selectedLead} onClose={() => router.replace(prospectUrl("/leads", searchParams.toString(), { lead: null }), { scroll: false })} />
  </div>;
}

function LeadAdvancedFilters({ filters, updateFilter, industries, opportunities, workflows, icps }: {
  filters: LeadFilters; updateFilter: (key: string, value: string) => void; industries: string[]; opportunities: string[]; workflows: string[][]; icps: string[][];
}) {
  const scoreInvalid = filters.minScore !== null && filters.maxScore !== null && filters.minScore > filters.maxScore;
  const dateInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const selects = [
    { key: "workflow", label: "Workflow", value: filters.workflow, options: workflows, empty: "All workflows" },
    { key: "icp", label: "ICP at creation", value: filters.icp, options: icps, empty: "All ICPs" },
    { key: "confidence", label: "Confidence", value: filters.confidence, options: [["high", "High"], ["medium", "Medium"], ["low", "Low"], ["unknown", "Unknown"]], empty: "All confidence" },
    { key: "industry", label: "Industry", value: filters.industry, options: industries.map((value) => [value, value]), empty: "All industries" },
    { key: "opportunity", label: "Opportunity", value: filters.opportunity, options: opportunities.map((value) => [value, value]), empty: "All opportunities" },
    { key: "outreach", label: "Outreach", value: filters.outreach, options: (["not_started", "reviewing", "drafting", "draft_ready", "drafted", "waiting_approval", "approved", "sent", "rejected", "needs_more_research", "blocked_missing_recipient", "failed"] as OutreachStatus[]).map((value) => [value, outreachLabel(value)]), empty: "All outreach states" },
    { key: "reply", label: "Reply observation", value: filters.reply, options: [["detected", "Reply detected"], ["unavailable", "Unavailable"]], empty: "All reply states" },
  ];
  return <fieldset id="lead-advanced-filters" className="min-w-0 rounded-md border border-border bg-muted/20 p-4">
    <legend className="px-1 text-xs font-medium">Refine opportunities</legend>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {selects.map((field) => <label key={field.key} className="flex min-w-0 flex-col gap-1.5 text-[11px] text-muted-foreground" htmlFor={`lead-filter-${field.key}`}>{field.label}<select id={`lead-filter-${field.key}`} value={field.value} onChange={(event) => updateFilter(field.key, event.target.value)} className={cn(entitySelectClass, "w-full")}><option value="all">{field.empty}</option>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
      <div className="flex min-w-0 flex-col gap-1.5 text-[11px] text-muted-foreground"><span id="lead-score-range-label">Score range</span><div className="flex items-center gap-2" aria-labelledby="lead-score-range-label"><Input aria-label="Minimum lead score" type="number" min={0} max={100} value={filters.minScore ?? ""} placeholder="Min" aria-invalid={scoreInvalid} onChange={(event) => updateFilter("minScore", event.target.value)} /><span aria-hidden="true">–</span><Input aria-label="Maximum lead score" type="number" min={0} max={100} value={filters.maxScore ?? ""} placeholder="Max" aria-invalid={scoreInvalid} onChange={(event) => updateFilter("maxScore", event.target.value)} /></div></div>
      <label htmlFor="lead-created-from" className="flex min-w-0 flex-col gap-1.5 text-[11px] text-muted-foreground">Created from (UTC)<Input id="lead-created-from" type="date" value={filters.from} aria-invalid={dateInvalid} onChange={(event) => updateFilter("from", event.target.value)} /></label>
      <label htmlFor="lead-created-to" className="flex min-w-0 flex-col gap-1.5 text-[11px] text-muted-foreground">Created through (UTC)<Input id="lead-created-to" type="date" value={filters.to} aria-invalid={dateInvalid} onChange={(event) => updateFilter("to", event.target.value)} /></label>
    </div>
    {(scoreInvalid || dateInvalid) && <p role="status" className="mt-3 text-xs text-destructive">{scoreInvalid ? "Minimum score must not exceed maximum score." : "The start date must not follow the end date."}</p>}
    <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Industry uses the lead’s saved research context. Unavailable replies indicate missing monitoring evidence, including send-only accounts.</p>
  </fieldset>;
}
