import { ArrowUpRight, Building2, FileText, ShieldCheck, Target } from "lucide-react";
import { LeadScore } from "@/components/app/lead-score";
import { useDemoStore } from "@/components/app/demo-store";
import type { ProposedAction } from "@/types/domain";
import { ScoreBreakdown } from "@/components/entities/score-breakdown";

export function ApprovalResearch({ companyId, leadId, action }: { companyId: string; leadId: string; action?: ProposedAction }) {
  const { companies, leads } = useDemoStore();
  const company = companies.find((item) => item.id === companyId);
  const lead = leads.find((item) => item.id === leadId);
  const metadata = action?.metadata;
  const review = metadata?.review ?? lead?.review;
  if (!company) return <aside className="border-t border-border p-5 text-xs text-muted-foreground xl:border-l xl:border-t-0">No research context is available for this recipient.</aside>;

  return (
    <aside aria-label="Personalization context" className="flex min-w-0 flex-col gap-5 border-t border-border bg-[var(--surface-quiet)] p-5 xl:border-l xl:border-t-0">
      <div><p className="section-label">Why this message</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Context available to the agent</p></div>
      <div className="flex gap-2"><Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><div><p className="text-xs font-semibold">{company.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{company.industry}<br />{company.location} · {company.employeeEstimate} people</p></div></div>
      {lead && <div className="border-t border-border pt-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Opportunity fit</span><LeadScore score={metadata?.leadScore ?? lead.score} /></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Qualification is separate from recipient availability.</p><details className="mt-3"><summary className="cursor-pointer text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring">Score breakdown</summary><div className="mt-3"><ScoreBreakdown components={metadata?.scoreBreakdown ?? lead.scoreComponents} /></div></details></div>}
      {review && <div className="border-t border-border pt-4"><p className="flex items-center gap-1.5 text-xs font-medium"><ShieldCheck className="size-3.5" />Reviewer verdict</p><p className="mt-2 text-[11px] font-medium capitalize">{review.decision.replaceAll('_', ' ')} · {review.confidence} confidence</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{review.summary}</p>{review.concerns.length > 0 && <details className="mt-3 text-[11px]"><summary className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring">Concerns ({review.concerns.length})</summary><ul className="mt-2 flex list-disc flex-col gap-2 pl-4 text-muted-foreground">{review.concerns.map((concern) => <li key={concern}>{concern}</li>)}</ul></details>}</div>}
      <div className="border-t border-border pt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><Target className="size-3.5 text-muted-foreground" />Outreach angle</p><p className="text-xs leading-6 text-muted-foreground">{review?.outreachAngle.primaryProblem ?? company.opportunity}</p><p className="mt-2 text-[10px] text-[var(--warning-fg)]">Opportunity hypothesis · internal needs unverified</p></div>
      {Boolean(action?.evidenceReferences?.length) && <div className="border-t border-border pt-4"><p className="section-label">Facts used in this draft</p><ol className="mt-3 flex flex-col gap-4">{action?.evidenceReferences?.map((fact, index) => <li key={`${fact.sourceUrl}-${index}`}><p className="text-xs font-medium leading-5">{fact.claim}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">“{fact.quote}”</p><a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"><span className="truncate">{new URL(fact.sourceUrl).hostname}</span><ArrowUpRight className="size-3 shrink-0" /></a></li>)}</ol></div>}
      <details className="border-t border-border pt-4"><summary className="cursor-pointer text-xs font-medium outline-none hover:text-[var(--brand-accent)] focus-visible:ring-2 focus-visible:ring-ring">Research summary</summary><p className="mt-2 text-xs leading-6 text-muted-foreground">{metadata?.company.researchSummary ?? company.researchSummary}</p>{metadata?.researchUncertainties.map((uncertainty) => <p key={uncertainty} className="mt-2 text-[11px] leading-5 text-muted-foreground">{uncertainty}</p>)}</details>
      {!metadata && <div className="border-t border-border pt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><FileText className="size-3.5 text-muted-foreground" />Sources</p><div className="flex flex-col gap-2">{company.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="interactive-link flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><span className="min-w-0 truncate">Source {index + 1}</span><ArrowUpRight className="size-3" /></a>)}</div></div>}
      <div className="flex gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-fg)]" /><p>External communication.<br />Confirm recipient and claims before approving.</p></div>
    </aside>
  );
}
