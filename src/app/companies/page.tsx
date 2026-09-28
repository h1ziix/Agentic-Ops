"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ExternalLink, Search, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { LeadScore } from "@/components/app/lead-score";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { companies, workflows } from "@/lib/mock-data";
import type { Company, CompanyResearchStatus } from "@/types/domain";

type ResearchFilter = "all" | CompanyResearchStatus;
type ScoreFilter = "all" | "high" | "medium" | "unscored";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const workflowNames = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));

function researchedLabel(status: CompanyResearchStatus) {
  return status === "researching" ? "Researching" : status === "researched" ? "Researched" : status === "queued" ? "Queued" : "Failed";
}

function statusKey(status: CompanyResearchStatus) {
  return status === "researching" ? "in_research" : status;
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<CompaniesLoading />}>
      <CompaniesContent />
    </Suspense>
  );
}

function CompaniesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [researchFilter, setResearchFilter] = useState<ResearchFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const selectedCompany = companies.find((company) => company.id === searchParams.get("company")) ?? null;

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    return companies.filter((company) => {
      const matchesSearch = !term || [company.name, company.industry, company.location, company.opportunity]
        .some((value) => value.toLowerCase().includes(term));
      const matchesResearch = researchFilter === "all" || company.researchStatus === researchFilter;
      const matchesScore = scoreFilter === "all"
        || (scoreFilter === "high" && company.score !== null && company.score >= 80)
        || (scoreFilter === "medium" && company.score !== null && company.score >= 70 && company.score < 80)
        || (scoreFilter === "unscored" && company.score === null);
      return matchesSearch && matchesResearch && matchesScore;
    });
  }, [query, researchFilter, scoreFilter]);

  const filtersActive = query !== "" || researchFilter !== "all" || scoreFilter !== "all";
  const resetFilters = () => {
    setQuery("");
    setResearchFilter("all");
    setScoreFilter("all");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Research database"
        title="Companies"
        description="Company profiles discovered and reviewed across your workflows. All records shown are fictional demo data."
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-4 text-[13px]">
        <span className="font-medium text-foreground"><span className="font-mono tabular-nums">{companies.length}</span> company profiles</span>
        <span className="text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{companies.filter((company) => company.researchStatus === "researched").length}</span> researched</span>
        <span className="text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{companies.filter((company) => company.researchStatus === "researching").length}</span> in research</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search companies"
            placeholder="Search companies, industries, opportunities…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <select
          aria-label="Filter by research status"
          value={researchFilter}
          onChange={(event) => setResearchFilter(event.target.value as ResearchFilter)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All research states</option>
          <option value="researched">Researched</option>
          <option value="researching">Researching</option>
          <option value="queued">Queued</option>
          <option value="failed">Failed</option>
        </select>
        <select
          aria-label="Filter by lead score"
          value={scoreFilter}
          onChange={(event) => setScoreFilter(event.target.value as ScoreFilter)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All scores</option>
          <option value="high">80+ high fit</option>
          <option value="medium">70–79 fit</option>
          <option value="unscored">Unscored</option>
        </select>
        {filtersActive && (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <X aria-hidden="true" className="size-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="table-shell">
        {filteredCompanies.length > 0 ? (
          <>
            <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground sm:hidden">Scroll horizontally to see all columns →</p>
            <table className="w-full min-w-[980px] table-fixed text-left text-[13px]">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[13%]" />
                <col className="w-[14%]" />
                <col className="w-[21%]" />
                <col className="w-[8%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-muted/25 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Company</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Industry</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Opportunity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Score</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Researched</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="border-t border-border transition-colors hover:bg-muted/25">
                    <td className="px-4 py-3.5 align-middle">
                      <button
                        type="button"
                        onClick={() => router.push(`/companies?company=${encodeURIComponent(company.id)}`, { scroll: false })}
                        className="block max-w-full truncate text-left font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        title={`View ${company.name} details`}
                      >
                        {company.name}
                      </button>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {new URL(company.website).hostname}
                      </span>
                    </td>
                    <td className="truncate px-4 py-3.5 text-muted-foreground" title={company.industry}>{company.industry}</td>
                    <td className="truncate px-4 py-3.5 text-muted-foreground" title={company.location}>{company.location}</td>
                    <td className="truncate px-4 py-3.5 text-foreground/85" title={company.opportunity}>{company.opportunity}</td>
                    <td className="px-4 py-3.5"><LeadScore score={company.score} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={statusKey(company.researchStatus)} label={researchedLabel(company.researchStatus)} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">
                      {company.lastResearchedAt ? dateFormatter.format(new Date(company.lastResearchedAt)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              Showing <span className="font-mono tabular-nums text-foreground">{filteredCompanies.length}</span> of {companies.length} companies
            </div>
          </>
        ) : (
          <EmptyState
            icon={Building2}
            title={filtersActive ? "No matching companies" : "No companies researched yet"}
            description={filtersActive ? "Try a broader search or clear the current filters." : "Companies discovered by research workflows will appear here."}
            action={filtersActive ? <Button type="button" variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button> : <Link href="/workflows" className="text-sm text-foreground underline underline-offset-4">View workflows</Link>}
          />
        )}
      </div>

      <CompanyDetails company={selectedCompany} onClose={() => router.replace("/companies", { scroll: false })} />
    </div>
  );
}

function CompanyDetails({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  if (!company) return null;
  const workflowName = workflowNames.get(company.workflowId) ?? "Workflow";

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent initialFocus={titleRef} style={{ width: "min(100vw, 560px)" }} className="gap-0 overflow-y-auto bg-card">
        <SheetHeader className="border-b border-border px-6 pb-5 pt-7">
          <p className="section-label mb-2">Company research</p>
          <SheetTitle ref={titleRef} tabIndex={-1} className="text-xl font-semibold tracking-tight">{company.name}</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] leading-5">{company.industry} · {company.location}</SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <StatusBadge status={statusKey(company.researchStatus)} label={researchedLabel(company.researchStatus)} />
            <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Fictional demo profile</span>
          </div>
        </SheetHeader>

        <div className="space-y-7 px-6 py-6">
          <section>
            <p className="section-label mb-3">Overview</p>
            <p className="text-[13px] leading-6 text-foreground/85">{company.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-[13px]">
              <div><dt className="text-xs text-muted-foreground">Website</dt><dd className="mt-1 truncate text-foreground" title={company.website}>{new URL(company.website).hostname}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Employees</dt><dd className="mt-1 text-foreground">{company.employeeEstimate}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Last researched</dt><dd className="mt-1 text-foreground">{company.lastResearchedAt ? dateFormatter.format(new Date(company.lastResearchedAt)) : "In progress"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Lead score</dt><dd className="mt-1"><LeadScore score={company.score} /></dd></div>
            </dl>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Research summary</p>
            <p className="text-[13px] leading-6 text-foreground/85">{company.researchSummary}</p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Potential opportunity</p>
            <p className="text-sm font-medium text-foreground">{company.opportunity}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">This use case is a research hypothesis for qualification, not a verified customer requirement.</p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Sources</p>
            <div className="space-y-2">
              {company.sourceUrls.map((source, index) => (
                <div key={source} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{index === 0 ? "Website profile" : "Company overview"} · {new URL(source).hostname}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Source addresses are illustrative .example placeholders in this demo.</p>
          </section>

          <section className="border-t border-border pt-6">
            <p className="section-label mb-3">Related workflow</p>
            <Link href={`/workflows/${company.workflowId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              {workflowName}<ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CompaniesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading companies">
      <PageHeader eyebrow="Research database" title="Companies" description="Loading company profiles…" />
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
      <div className="table-shell space-y-0 divide-y divide-border p-4">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 animate-pulse bg-muted/40" />)}
      </div>
    </div>
  );
}
