"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { CompanyMark, RecordChevron, ScoreRail } from "@/components/entities/entity-ui";
import { companyById, entityDate, outreachLabel } from "@/components/entities/prospect-data";
import { cn } from "@/lib/utils";
import type { Lead, Workflow } from "@/types/domain";

type LeadRecordsProps = {
  leads: Lead[]; workflows: Workflow[]; selection: Set<string>;
  onOpen: (id: string) => void; onSelect: (id: string) => void; onSelectAll: () => void;
};

export function LeadRecords({ leads, workflows, selection, onOpen, onSelect, onSelectAll }: LeadRecordsProps) {
  const allSelected = leads.length > 0 && leads.every((lead) => selection.has(lead.id));
  const someSelected = leads.some((lead) => selection.has(lead.id));
  return <>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[700px] table-fixed text-left text-xs">
        <colgroup><col className="w-10" /><col className="w-[27%] xl:w-[23%]" /><col className="w-[35%] xl:w-[29%]" /><col className="w-[14%] xl:w-[12%]" /><col className="w-[20%] xl:w-[16%]" /><col className="hidden w-[16%] xl:table-column" /><col className="w-8" /></colgroup>
        <thead className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground"><tr>
          <th scope="col" className="pl-4"><input id="leads-select-visible" type="checkbox" aria-label="Select all visible leads" checked={allSelected} ref={(node) => { if (node) node.indeterminate = someSelected && !allSelected; }} onChange={onSelectAll} className="size-3.5 cursor-pointer accent-primary" /></th>
          {["Company", "Opportunity / Source", "Fit score", "Stage", "Outreach"].map((label) => <th key={label} scope="col" className={cn("px-3 py-3 font-medium", label === "Outreach" && "hidden xl:table-cell")}>{label}</th>)}<th scope="col"><span className="sr-only">Details</span></th>
        </tr></thead>
        <tbody className="divide-y divide-border">{leads.map((lead) => {
          const company = companyById.get(lead.companyId);
          const workflow = workflows.find((item) => item.id === lead.workflowId);
          return <tr key={lead.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button,a,input")) onOpen(lead.id); }} className={cn("interactive-row group cursor-pointer transition-colors hover:bg-muted/35", selection.has(lead.id) && "bg-muted/50")}>
            <td className="pl-4"><input id={`select-${lead.id}`} type="checkbox" aria-label={`Select ${company?.name}`} checked={selection.has(lead.id)} onChange={() => onSelect(lead.id)} className="size-3.5 cursor-pointer accent-primary" /></td>
            <td className="px-3 py-3.5"><button onClick={() => onOpen(lead.id)} className="flex max-w-full items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"><CompanyMark name={company?.name ?? "Company"} /><span className="min-w-0"><span className="block truncate font-medium text-foreground">{company?.name}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{company?.industry}</span></span></button></td>
            <td className="px-3 py-3.5"><p className="truncate text-foreground/85" title={lead.opportunity}>{lead.opportunity}</p><Link href={`/workflows/${lead.workflowId}`} className="interactive-link mt-1 block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline" title={workflow?.title}>{workflow?.title ?? "Source workflow"}</Link></td>
            <td className="px-3 py-3.5"><ScoreRail score={lead.score} /></td>
            <td className="px-3 py-3.5"><StatusBadge status={lead.status} /><span className="mt-1 block text-[10px] text-muted-foreground xl:hidden">{outreachLabel(lead.outreachStatus)}</span></td>
            <td className="hidden px-3 py-3.5 xl:table-cell"><span className={cn("inline-flex items-center gap-1.5 text-[11px]", lead.outreachStatus === "waiting_approval" ? "text-[var(--warning-fg)]" : "text-muted-foreground")}><span className={cn("size-1.5 rounded-full", lead.outreachStatus === "waiting_approval" ? "bg-[var(--warning-fg)]" : "bg-muted-foreground/40")} />{outreachLabel(lead.outreachStatus)}</span><span className="mt-1 block text-[10px] text-muted-foreground">{entityDate.format(new Date(lead.updatedAt))}</span></td>
            <td className="pr-3"><RecordChevron /></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="flex flex-col divide-y divide-border md:hidden">{leads.map((lead) => {
      const company = companyById.get(lead.companyId);
      return <div key={lead.id} className={cn("flex items-start gap-3 p-4", selection.has(lead.id) && "bg-muted/50")}>
        <input id={`mobile-select-${lead.id}`} type="checkbox" aria-label={`Select ${company?.name}`} checked={selection.has(lead.id)} onChange={() => onSelect(lead.id)} className="mt-2 size-4 shrink-0 accent-primary" />
        <button onClick={() => onOpen(lead.id)} className="interactive-row flex min-w-0 flex-1 flex-col gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex w-full items-center gap-2.5"><CompanyMark name={company?.name ?? "Company"} /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{company?.name}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{company?.industry}</span></span><span className="font-mono text-sm font-medium">{lead.score}</span><ArrowUpRight className="size-3.5 text-muted-foreground" /></span>
          <span className="text-xs leading-5 text-muted-foreground">{lead.opportunity}</span><span className="flex flex-wrap items-center gap-2"><StatusBadge status={lead.status} /><span className="text-[11px] text-muted-foreground">{outreachLabel(lead.outreachStatus)}</span></span>
        </button>
      </div>;
    })}</div>
  </>;
}
