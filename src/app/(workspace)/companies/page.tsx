"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowDownWideNarrow, Building2, Search, SlidersHorizontal, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityLoading, EntityResults, EntityStats, entitySelectClass } from "@/components/entities/entity-ui";
import { CompanyDetails } from "@/components/entities/company-details";
import { CompanyRecords } from "@/components/entities/company-records";
import { useDemoStore } from "@/components/app/demo-store";
import { cn } from "@/lib/utils";
import type { CompanyResearchStatus } from "@/types/domain";

type ScoreFilter = "all" | "high" | "medium" | "unscored";
type SortMode = "recent" | "score" | "name";

export default function CompaniesPage() {
  return <Suspense fallback={<EntityLoading title="Companies" />}><CompaniesContent /></Suspense>;
}

function CompaniesContent() {
  const { companies } = useDemoStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [research, setResearch] = useState<"all" | CompanyResearchStatus>("all");
  const [score, setScore] = useState<ScoreFilter>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const selectedCompany = companies.find((company) => company.id === searchParams.get("company")) ?? null;
  const researched = companies.filter((company) => company.researchStatus === "researched").length;
  const researching = companies.filter((company) => company.researchStatus === "researching").length;
  const markets = new Set(companies.map((company) => company.location.split(", ").at(-1))).size;
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return companies.filter((company) => {
      const matchesSearch = !term || [company.name, company.industry, company.location, company.opportunity].some((value) => value.toLowerCase().includes(term));
      const matchesResearch = research === "all" || company.researchStatus === research;
      const matchesScore = score === "all" || (score === "high" && company.score !== null && company.score >= 80) || (score === "medium" && company.score !== null && company.score >= 70 && company.score < 80) || (score === "unscored" && company.score === null);
      return matchesSearch && matchesResearch && matchesScore;
    }).sort((a, b) => sort === "score" ? (b.score ?? -1) - (a.score ?? -1) : sort === "name" ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [companies, query, research, score, sort]);
  const filtersActive = query !== "" || research !== "all" || score !== "all";
  const resetFilters = () => { setQuery(""); setResearch("all"); setScore("all"); };

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Research intelligence" title="Companies" description="Company context, source evidence, and the opportunity behind the score." actions={<Button variant="outline" nativeButton={false} render={<Link href="/workflows" />}>Research workflows<ArrowRight data-icon="inline-end" /></Button>} />
    <EntityStats items={[{ label: "Company profiles", value: companies.length, note: "Your research universe" }, { label: "Research completed", value: researched, note: `${companies.length ? Math.round(researched / companies.length * 100) : 0}% of discovered companies`, accent: true }, { label: "In research", value: researching, note: "Awaiting a completed assessment" }, { label: "Markets covered", value: markets, note: "Across Central Asia" }]} />
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="research-database-heading">
      <div className="flex items-center justify-between gap-4"><h2 id="research-database-heading" className="text-sm font-medium">Research database <span className="ml-1.5 font-mono text-xs text-muted-foreground">{companies.length}</span></h2><span className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-[var(--success-fg)]" />{researched} profiles ready for qualification</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="company-search" type="search" aria-label="Search companies" placeholder="Search companies, industries, markets…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9" /></div>
        <div className="relative"><SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="company-research-filter" aria-label="Filter by research status" value={research} onChange={(event) => setResearch(event.target.value as "all" | CompanyResearchStatus)} className={cn(entitySelectClass, "pl-8")}><option value="all">All research states</option><option value="researched">Researched</option><option value="researching">In research</option><option value="queued">Queued</option><option value="failed">Failed</option></select></div>
        <select id="company-score-filter" aria-label="Filter by lead score" value={score} onChange={(event) => setScore(event.target.value as ScoreFilter)} className={entitySelectClass}><option value="all">All scores</option><option value="high">80+ high fit</option><option value="medium">70–79 fit</option><option value="unscored">Unscored</option></select>
        <div className="relative"><ArrowDownWideNarrow className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><select id="company-sort" aria-label="Sort companies" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className={cn(entitySelectClass, "pl-8")}><option value="recent">Recent research</option><option value="score">Highest score</option><option value="name">Company A–Z</option></select></div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={resetFilters}><X data-icon="inline-start" />Reset</Button>}
      </div>
      <EntityResults resultKey={`${query}-${research}-${score}-${sort}`}>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {filtered.length ? <><CompanyRecords companies={filtered} onOpen={(id) => router.push(`/companies?company=${encodeURIComponent(id)}`, { scroll: false })} /><div className="flex items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3 text-[11px] text-muted-foreground"><span aria-live="polite">{filtered.length} of {companies.length} companies</span><span>Workspace records</span></div></> : <EmptyState icon={Building2} title={filtersActive ? "No companies in this view" : "Build your research universe"} description={filtersActive ? "Try a broader search or reset the filters to see all company profiles." : "Companies discovered by research workflows will appear here."} action={filtersActive ? <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button> : <Button variant="outline" nativeButton={false} render={<Link href="/workflows" />}>View workflows</Button>} />}
        </div>
      </EntityResults>
    </section>
    <CompanyDetails key={selectedCompany?.id ?? "closed"} company={selectedCompany} onClose={() => router.replace("/companies", { scroll: false })} />
  </div>;
}
