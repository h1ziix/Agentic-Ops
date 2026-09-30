import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import type { Company } from "@/types/domain";
import { EmptyState } from "@/components/app/empty-state";
import { LeadScore } from "@/components/app/lead-score";
import { StatusBadge } from "@/components/app/status-badge";

export function WorkflowCompanies({ companies, total }: { companies: Company[]; total: number }) {
  return <section aria-labelledby="discovered-title">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="discovered-title" className="text-sm font-semibold">Research directory</h2><p className="mt-1 text-xs text-muted-foreground">Company profiles associated with this workflow.</p></div><span className="shrink-0 font-mono text-[11px] text-muted-foreground">{companies.length} / {total} shown</span></div>
    {companies.length ? <div className="overflow-hidden rounded-lg border border-border bg-card">{companies.map((company) => <Link key={company.id} href={`/companies?company=${company.id}`} className="interactive-row group flex items-start gap-3 border-b border-border p-4 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground">{company.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-[13px] font-medium">{company.name}</h3><StatusBadge status={company.researchStatus} /></div><p className="mt-1 text-[11px] text-muted-foreground">{company.industry} · {company.location}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{company.opportunity}</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">{company.sourceUrls.length} source references</p></div>
      <div className="flex shrink-0 flex-col items-end gap-4"><LeadScore score={company.score} /><ArrowUpRight aria-hidden className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
    </Link>)}</div> : <EmptyState icon={Building2} title="Research is still ahead" description="Company profiles will appear when discovery and research run. This starter plan has not called external tools." />}
  </section>;
}
