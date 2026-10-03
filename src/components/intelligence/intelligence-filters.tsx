import type { IntelligenceData, IntelligenceFilters } from "@/types/intelligence";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const selectClass = "h-9 min-w-0 w-full rounded-md border border-input bg-card px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-ring";
export function IntelligenceFilterControls({ data, filters }: { data?: IntelligenceData; filters?: Partial<IntelligenceFilters> }) {
  const options = data?.filterOptions;
  return <form action="/intelligence" className="flex flex-col gap-4 border-b border-border pb-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Workflow creation period<select name="range" defaultValue={filters?.range ?? "30d"} className={selectClass}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Workflow<select name="workflowId" defaultValue={filters?.workflowId ?? ""} className={selectClass}><option value="">All workflows</option>{options?.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Saved ICP<select name="icpId" defaultValue={filters?.icpId ?? ""} className={selectClass}><option value="">All profiles</option>{options?.icps.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Template<select name="templateId" defaultValue={filters?.templateId ?? ""} className={selectClass}><option value="">All templates</option>{options?.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    </div>
    <details className="group"><summary className="w-fit cursor-pointer rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Lead & company filters</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Industry<select name="industry" defaultValue={filters?.industry ?? ""} className={selectClass}><option value="">All industries</option>{options?.industries.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Location<select name="location" defaultValue={filters?.location ?? ""} className={selectClass}><option value="">All locations</option>{options?.locations.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Confidence<select name="confidence" defaultValue={filters?.confidence ?? ""} className={selectClass}><option value="">All confidence levels</option>{["high", "medium", "low"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Lead status<select name="leadStatus" defaultValue={filters?.leadStatus ?? ""} className={selectClass}><option value="">All lead statuses</option>{["new", "qualified", "outreach_ready", "waiting_approval", "contacted", "responded", "converted", "rejected"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Minimum score<input type="number" min={0} max={100} name="minScore" defaultValue={filters?.minScore ?? ""} className={selectClass} /></label>
      <label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Maximum score<input type="number" min={0} max={100} name="maxScore" defaultValue={filters?.maxScore ?? ""} className={selectClass} /></label>
    </div></details>
    <div className="flex items-center gap-2"><Button type="submit" size="sm">Apply filters</Button><Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/intelligence" />}>Reset</Button><p className="ml-auto hidden text-[10px] text-muted-foreground sm:block">UTC storage · {data?.period.timeZone ?? "Asia/Qyzylorda"} calendar days</p></div>
  </form>;
}
