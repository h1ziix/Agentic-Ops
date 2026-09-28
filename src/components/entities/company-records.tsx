"use client";

import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { CompanyMark, RecordChevron, ScoreRail } from "@/components/entities/entity-ui";
import { entityDate } from "@/components/entities/prospect-data";
import type { Company } from "@/types/domain";

export function CompanyRecords({ companies, onOpen }: { companies: Company[]; onOpen: (id: string) => void }) {
  return <>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[700px] table-fixed text-left text-xs">
      <colgroup><col className="w-[24%]" /><col className="w-[17%]" /><col className="w-[27%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-8" /></colgroup>
      <thead className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground"><tr>{["Company", "Market / Size", "Opportunity", "Fit score", "Research"].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}<th scope="col"><span className="sr-only">Details</span></th></tr></thead>
      <tbody className="divide-y divide-border">{companies.map((company) => <tr key={company.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button,a")) onOpen(company.id); }} className="interactive-row group cursor-pointer transition-colors hover:bg-muted/35">
        <td className="px-4 py-3.5"><button onClick={() => onOpen(company.id)} className="flex max-w-full items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"><CompanyMark name={company.name} /><span className="min-w-0"><span className="block truncate font-medium">{company.name}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{company.industry}</span></span></button></td>
        <td className="px-4 py-3.5"><p className="truncate" title={company.location}>{company.location.split(",")[0]}</p><p className="mt-1 text-[11px] text-muted-foreground">{company.employeeEstimate} employees</p></td>
        <td className="px-4 py-3.5"><p className="truncate text-foreground/85" title={company.opportunity}>{company.opportunity}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{new URL(company.website).hostname}</p></td>
        <td className="px-4 py-3.5"><ScoreRail score={company.score} /></td>
        <td className="px-4 py-3.5"><StatusBadge status={company.researchStatus === "researching" ? "in_research" : company.researchStatus} /><p className="mt-1 text-[10px] text-muted-foreground">{company.lastResearchedAt ? entityDate.format(new Date(company.lastResearchedAt)) : "Research in progress"}</p></td>
        <td className="pr-3"><RecordChevron /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="flex flex-col divide-y divide-border md:hidden">{companies.map((company) => <button key={company.id} onClick={() => onOpen(company.id)} className="interactive-row flex flex-col gap-3 p-4 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex items-center gap-2.5"><CompanyMark name={company.name} /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{company.name}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{company.industry} · {company.location.split(",")[0]}</span></span><ArrowUpRight className="size-3.5 text-muted-foreground" /></span>
      <span className="text-xs leading-5 text-muted-foreground">{company.opportunity}</span><span className="flex items-center justify-between gap-3"><StatusBadge status={company.researchStatus === "researching" ? "in_research" : company.researchStatus} /><ScoreRail score={company.score} /></span>
    </button>)}</div>
  </>;
}
