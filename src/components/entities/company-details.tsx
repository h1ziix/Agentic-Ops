"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, GitBranch, Globe, ScanSearch, Target } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/status-badge";
import { CompanyMark, DemoSourceNote, EntitySection, ScoreRail } from "@/components/entities/entity-ui";
import { entityDate, useProspectData } from "@/components/entities/prospect-data";
import type { Company } from "@/types/domain";

export function CompanyDetails({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(true);
  const { workflows, leads, activity } = useProspectData();
  if (!company) return null;
  const workflow = workflows.find((item) => item.id === company.workflowId);
  const lead = leads.find((item) => item.companyId === company.id);
  const events = activity.filter((event) => event.companyId === company.id);

  return <Sheet open={open} onOpenChange={setOpen} onOpenChangeComplete={(nextOpen) => { if (!nextOpen) onClose(); }}>
    <SheetContent initialFocus={titleRef} className="gap-0 overflow-y-auto bg-card sm:max-w-[580px]" style={{ width: "min(100vw, 580px)", maxWidth: "100vw" }}>
      <SheetHeader className="gap-0 border-b border-border px-6 pb-5 pt-7">
        <p className="section-label mb-5">Research / Company profile</p>
        <div className="flex items-center gap-3.5"><CompanyMark name={company.name} large /><div className="min-w-0"><SheetTitle ref={titleRef} tabIndex={-1} className="text-xl tracking-tight outline-none">{company.name}</SheetTitle><SheetDescription className="mt-1">{new URL(company.website).hostname}</SheetDescription></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge status={company.researchStatus === "researching" ? "in_research" : company.researchStatus} /><span className="text-[11px] text-muted-foreground">{company.location}</span></div>
      </SheetHeader>
      <div className="flex flex-col gap-7 px-6 py-6">
        <EntitySection title="Company overview" icon={<Globe className="size-4 text-muted-foreground" />}>
          <p className="text-[13px] leading-6 text-muted-foreground">{company.description}</p>
          <dl className="grid grid-cols-2 gap-4 rounded-md bg-muted/40 p-4 text-xs"><div><dt className="text-muted-foreground">Industry</dt><dd className="mt-1.5">{company.industry}</dd></div><div><dt className="text-muted-foreground">Team size</dt><dd className="mt-1.5">{company.employeeEstimate} employees</dd></div><div><dt className="text-muted-foreground">Market</dt><dd className="mt-1.5">{company.location.split(", ").at(-1)}</dd></div><div><dt className="text-muted-foreground">Last researched</dt><dd className="mt-1.5">{company.lastResearchedAt ? entityDate.format(new Date(company.lastResearchedAt)) : "In progress"}</dd></div></dl>
        </EntitySection>
        <EntitySection title="Research assessment" icon={<ScanSearch className="size-4 text-muted-foreground" />}>
          <div className="rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Opportunity fit</p><ScoreRail score={company.score} /></div><p className="mt-4 text-sm font-medium leading-5">{company.opportunity}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{company.researchSummary}</p></div>
          <p className="text-[11px] leading-5 text-muted-foreground">This opportunity is a qualification hypothesis, not a verified customer requirement.</p>
          {lead && <Button variant="outline" className="self-start" nativeButton={false} render={<Link href={`/leads?lead=${encodeURIComponent(lead.id)}`} />}><Target data-icon="inline-start" />View lead assessment<ArrowRight data-icon="inline-end" /></Button>}
        </EntitySection>
        <EntitySection title="Source references" icon={<FileText className="size-4 text-muted-foreground" />}>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">{company.sourceUrls.map((source, index) => <li key={source} className="flex items-center gap-3 px-3 py-3"><span className="flex size-7 shrink-0 items-center justify-center rounded bg-muted font-mono text-[11px] text-muted-foreground">0{index + 1}</span><div className="min-w-0"><p className="text-xs font-medium">{index === 0 ? "Company website" : "Company overview"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{new URL(source).hostname}{new URL(source).pathname === "/" ? "" : new URL(source).pathname}</p></div><span className="ml-auto text-[10px] text-muted-foreground">Demo source</span></li>)}</ul>
        </EntitySection>
        {events.length > 0 && <EntitySection title="Research activity" icon={<Check className="size-4 text-muted-foreground" />}><ol className="flex flex-col gap-3 border-l border-border pl-4">{events.map((event) => <li key={event.id}><p className="text-xs leading-5">{event.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{event.agent ?? "Workflow"} · {entityDate.format(new Date(event.timestamp))}</p></li>)}</ol></EntitySection>}
        <EntitySection title="Source workflow" icon={<GitBranch className="size-4 text-muted-foreground" />}><Link href={`/workflows/${company.workflowId}`} className="interactive-row group flex items-center justify-between gap-3 rounded-md border border-border p-3 text-xs leading-5 transition-colors hover:bg-muted/50">{workflow?.title ?? "View workflow"}<ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link></EntitySection>
        <DemoSourceNote />
      </div>
    </SheetContent>
  </Sheet>;
}
