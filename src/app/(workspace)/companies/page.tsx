"use client";

import { Suspense, useMemo, useRef } from "react";
import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowDownWideNarrow, Building2, Search, SlidersHorizontal, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityLoading, EntityResults, EntityStats, entitySelectClass } from "@/components/entities/entity-ui";
import { CompanyDetails } from "@/components/entities/company-details";
import { CompanyRecords } from "@/components/entities/company-records";
import { useDemoStore } from "@/components/app/demo-store";
import { normalizeIndustry, normalizeLocation } from "@/lib/intelligence-normalization";
import { companyIntelligence, prospectUrl } from "@/lib/prospect-filters";
import { cn } from "@/lib/utils";
import { workspaceHref } from "@/lib/workspace-path";
import type { CompanyResearchStatus } from "@/types/domain";

type ScoreFilter = "all" | "high" | "medium" | "unscored";
type SortMode = "recent" | "score" | "name";

export default function CompaniesPage() {
  return <Suspense fallback={<EntityLoading title="Companies" />}><CompaniesContent /></Suspense>;
}

function CompaniesContent() {
  const { companies, leads } = useDemoStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerLauncher = useRef<HTMLElement | null>(null);
  const resultParams = new URLSearchParams(searchParams.toString());
  resultParams.delete("company");
  const query = searchParams.get("q") ?? "";
  const researchValue = searchParams.get("research");
  const research: "all" | CompanyResearchStatus = researchValue === "queued" || researchValue === "researching" || researchValue === "researched" || researchValue === "failed" ? researchValue : "all";
  const scoreValue = searchParams.get("score");
  const score: ScoreFilter = scoreValue === "high" || scoreValue === "medium" || scoreValue === "unscored" ? scoreValue : "all";
  const sortValue = searchParams.get("sort");
  const sort: SortMode = sortValue === "score" || sortValue === "name" ? sortValue : "recent";
  const industry = searchParams.get("industry") ?? "all";
  const intelligence = useMemo(() => new Map(companies.map((company) => [company.id, companyIntelligence(company, leads)])), [companies, leads]);
  const selectedCompany = companies.find((company) => company.id === searchParams.get("company")) ?? null;
  const researched = companies.filter((company) => company.researchStatus === "researched").length;
  const researching = companies.filter((company) => company.researchStatus === "researching").length;
  const markets = new Set(companies.map((company) => normalizeLocation(company.location)).filter((value) => value !== "Unknown")).size;
  const industries = [...new Set(companies.map((company) => normalizeIndustry(company.industry)))].sort();
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return companies.filter((company) => {
      const matchesSearch = !term || [company.name, company.industry, company.location, company.opportunity].some((value) => value.toLowerCase().includes(term));
      const matchesResearch = research === "all" || company.researchStatus === research;
      const latestScore = intelligence.get(company.id)?.latestScore ?? null;
      const matchesScore = score === "all" || (score === "high" && latestScore !== null && latestScore >= 80) || (score === "medium" && latestScore !== null && latestScore >= 70 && latestScore < 80) || (score === "unscored" && latestScore === null);
      return matchesSearch && matchesResearch && matchesScore && (industry === "all" || normalizeIndustry(company.industry) === industry);
    }).sort((a, b) => sort === "score" ? (intelligence.get(b.id)?.latestScore ?? -1) - (intelligence.get(a.id)?.latestScore ?? -1) : sort === "name" ? a.name.localeCompare(b.name) : Date.parse(b.lastResearchedAt ?? b.updatedAt) - Date.parse(a.lastResearchedAt ?? a.updatedAt));
  }, [companies, query, research, score, sort, industry, intelligence]);
  const filtersActive = query !== "" || research !== "all" || score !== "all" || industry !== "all";
  const companyUrl = (search: string, updates: Record<string, string | null>) => workspaceHref(prospectUrl("/companies", search, updates), pathname);
  const openCompany = (id: string) => {
    drawerLauncher.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    router.push(companyUrl(searchParams.toString(), { company: id }), { scroll: false });
  };
  const restoreDrawerFocus = () => drawerLauncher.current?.isConnected ? drawerLauncher.current : searchRef.current;
  const updateFilter = (key: string, value: string) => window.history.replaceState(null, "", companyUrl(window.location.search, { [key]: value }));
  const resetFilters = () => window.history.replaceState(null, "", companyUrl(window.location.search, { q: null, research: null, score: null, industry: null, sort: null }));

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Research intelligence" title="Companies" description="Company context, source evidence, and the opportunity behind the score." actions={<Button variant="outline" nativeButton={false} render={<Link href="/workflows" />}>Research workflows<ArrowRight data-icon="inline-end" /></Button>} />
    <EntityStats items={[{ label: "Company profiles", value: companies.length, note: "Unique workspace companies" }, { label: "Research completed", value: researched, note: companies.length ? `${Math.round(researched / companies.length * 100)}% of discovered companies` : "No company history yet", accent: true }, { label: "In research", value: researching, note: "Awaiting a completed assessment" }, { label: "Locations recorded", value: markets, note: "Normalized recorded locations" }]} />
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="research-database-heading">
      <div className="flex items-center justify-between gap-4"><h2 id="research-database-heading" className="text-sm font-medium">Research database <span className="ml-1.5 font-mono text-xs text-muted-foreground">{companies.length}</span></h2><span className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-[var(--success-fg)]" />{researched} profiles ready for qualification</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input ref={searchRef} id="company-search" type="search" aria-label="Search companies" placeholder="Search companies, industries, markets…" value={query} onChange={(event) => updateFilter("q", event.target.value)} className="h-9 pl-9" /></div>
        <div className="relative"><SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="company-research-filter" aria-label="Filter by research status" value={research} onChange={(event) => updateFilter("research", event.target.value)} className={cn(entitySelectClass, "pl-8")}><option value="all">All research states</option><option value="researched">Researched</option><option value="researching">In research</option><option value="queued">Queued</option><option value="failed">Failed</option></select></div>
        <select id="company-score-filter" aria-label="Filter by latest lead score" value={score} onChange={(event) => updateFilter("score", event.target.value)} className={entitySelectClass}><option value="all">All latest scores</option><option value="high">80+ high fit</option><option value="medium">70–79 fit</option><option value="unscored">Unscored</option></select>
        <select id="company-industry-filter" aria-label="Filter companies by industry" value={industry} onChange={(event) => updateFilter("industry", event.target.value)} className={entitySelectClass}><option value="all">All industries</option>{industries.map((value) => <option key={value}>{value}</option>)}</select>
        <div className="relative"><ArrowDownWideNarrow aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="company-sort" aria-label="Sort companies" value={sort} onChange={(event) => updateFilter("sort", event.target.value)} className={cn(entitySelectClass, "pl-8")}><option value="recent">Recent research</option><option value="score">Highest latest score</option><option value="name">Company A–Z</option></select></div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={resetFilters}><X data-icon="inline-start" />Reset</Button>}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">Latest score and confidence use the most recently created lead assessment. Earlier workflow assessments remain in their original lead records.</p>
      <EntityResults resultKey={resultParams.toString()}>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {filtered.length ? <><CompanyRecords companies={filtered} intelligence={intelligence} onOpen={openCompany} /><div className="flex items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3 text-[11px] text-muted-foreground"><span aria-live="polite">{filtered.length} of {companies.length} companies</span><span>Workspace records</span></div></> : <EmptyState icon={Building2} title={filtersActive ? "No companies in this view" : "Build your research universe"} description={filtersActive ? "Try a broader search or reset the filters to see all company profiles." : "Companies discovered by research workflows will appear here."} action={filtersActive ? <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button> : <Button variant="outline" nativeButton={false} render={<Link href="/workflows" />}>View workflows</Button>} />}
        </div>
      </EntityResults>
    </section>
    <CompanyDetails key={selectedCompany?.id ?? "closed"} company={selectedCompany} finalFocus={restoreDrawerFocus} onClose={() => router.replace(companyUrl(searchParams.toString(), { company: null }), { scroll: false })} />
  </div>;
}
