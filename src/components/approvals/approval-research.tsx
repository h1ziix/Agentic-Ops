import { ArrowUpRight, Building2, FileText, ShieldCheck, Target } from "lucide-react";
import { LeadScore } from "@/components/app/lead-score";
import { companies, leads } from "@/lib/mock-data";

export function ApprovalResearch({ companyId, leadId }: { companyId: string; leadId: string }) {
  const company = companies.find((item) => item.id === companyId);
  const lead = leads.find((item) => item.id === leadId);
  if (!company) return <aside className="border-t border-border p-5 text-xs text-muted-foreground xl:border-l xl:border-t-0">No research context is available for this recipient.</aside>;

  return (
    <aside aria-label="Personalization context" className="flex min-w-0 flex-col gap-5 border-t border-border bg-[var(--surface-quiet)] p-5 xl:border-l xl:border-t-0">
      <div><p className="section-label">Why this message</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Context available to the agent</p></div>
      <div className="flex gap-2"><Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><div><p className="text-xs font-semibold">{company.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{company.industry}<br />{company.location} · {company.employeeEstimate} people</p></div></div>
      {lead && <div className="border-t border-border pt-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Opportunity fit</span><LeadScore score={lead.score} /></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{lead.confidence.charAt(0).toUpperCase() + lead.confidence.slice(1)} confidence from company research.</p></div>}
      <div className="border-t border-border pt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><Target className="size-3.5 text-muted-foreground" />Personalization signal</p><p className="text-xs leading-6 text-muted-foreground">{company.opportunity}</p></div>
      <details className="border-t border-border pt-4"><summary className="cursor-pointer text-xs font-medium outline-none hover:text-[var(--brand-accent)] focus-visible:ring-2 focus-visible:ring-ring">Research summary</summary><p className="mt-2 text-xs leading-6 text-muted-foreground">{company.researchSummary}</p></details>
      <div className="border-t border-border pt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><FileText className="size-3.5 text-muted-foreground" />Sources</p><div className="flex flex-col gap-2">{company.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="interactive-link flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><span className="min-w-0 truncate">{company.sourceUrls.length > 1 ? `Source ${index + 1}` : "Company website"}</span><ArrowUpRight className="size-3" /></a>)}</div></div>
      <div className="flex gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-fg)]" /><p>External communication.<br />Confirm recipient and claims before approving.</p></div>
    </aside>
  );
}
