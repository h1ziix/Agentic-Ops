"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCheck, FileText, GitBranch, Mail, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/status-badge";
import { useApprovalDrafts } from "@/components/approvals/use-approval-drafts";
import { CompanyMark, DemoSourceNote, EntitySection, ScoreRail } from "@/components/entities/entity-ui";
import { entityDate, outreachLabel, useProspectData } from "@/components/entities/prospect-data";
import type { Lead } from "@/types/domain";
import { ScoreBreakdown } from "./score-breakdown";
import { ResearchSources } from "./research-sources";

export function LeadDetails({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(true);
  const { drafts } = useApprovalDrafts();
  const { workflows, approvals, activity, companyById, mode } = useProspectData();
  if (!lead) return null;
  const currentCompany = companyById.get(lead.companyId);
  const company = currentCompany ? { ...currentCompany, ...lead.researchContext } : undefined;
  const workflow = workflows.find((item) => item.id === lead.workflowId);
  const linked = approvals.flatMap((item) => item.proposedActions.filter((action) => action.leadId === lead.id).map((action) => ({ approval: item, action })));
  const selected = linked.find((item) => item.action.actionType === "send_email" && !item.action.supersededById && !["cancelled", "rejected"].includes(item.action.status)) ?? linked.find((item) => item.action.actionType === "send_email");
  const approval = selected?.approval; const proposal = selected?.action;
  const crm = linked.filter((item) => item.action.actionType === "upsert_crm_contact" && !item.action.supersededById);
  const message = proposal ? mode === "demo" ? drafts[proposal.id] ?? proposal : proposal : null;
  const events = activity.filter((event) => event.workflowId === lead.workflowId && (event.leadId === lead.id || event.companyId === lead.companyId));

  return <Sheet open={open} onOpenChange={setOpen} onOpenChangeComplete={(nextOpen) => { if (!nextOpen) onClose(); }}>
    <SheetContent initialFocus={titleRef} className="gap-0 overflow-y-auto bg-card sm:max-w-[580px]" style={{ width: "min(100vw, 580px)", maxWidth: "100vw" }}>
      <SheetHeader className="gap-0 border-b border-border px-6 pb-5 pt-7">
        <p className="section-label mb-5">Lead / Opportunity</p>
        <div className="flex items-center gap-3.5"><CompanyMark name={company?.name ?? "Company"} large /><div className="min-w-0"><SheetTitle ref={titleRef} tabIndex={-1} className="text-xl tracking-tight outline-none">{company?.name ?? "Company"}</SheetTitle><SheetDescription className="mt-1">{company?.industry} · {company?.location.split(",")[0]}</SheetDescription></div></div>
        <div className="mt-4 flex items-center gap-2"><StatusBadge status={lead.status} /><span className="text-[11px] text-muted-foreground">Updated {entityDate.format(new Date(lead.updatedAt))}</span></div>
      </SheetHeader>
      <div className="flex flex-col gap-7 px-6 py-6">
        <div className="rounded-lg border border-border bg-muted/25 p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="mb-3 text-xs font-medium text-muted-foreground">Opportunity fit</p><ScoreRail score={lead.score} detailed /></div><span className="inline-flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground"><ShieldCheck className="size-3.5" />{lead.confidence ? `${lead.confidence} confidence` : "Not assessed"}</span></div>
          <p className="mt-5 text-sm font-medium leading-5">{lead.opportunity}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{lead.scoreReason}</p>
          <div className="mt-4"><ScoreBreakdown components={lead.scoreComponents} /></div>
        </div>
        <EntitySection title="Qualification context" icon={<CheckCheck className="size-4 text-muted-foreground" />}>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-xs"><div><dt className="text-muted-foreground">Industry</dt><dd className="mt-1.5 text-foreground">{company?.industry ?? "Not available"}</dd></div><div><dt className="text-muted-foreground">Company size</dt><dd className="mt-1.5 text-foreground">{company?.employeeEstimate ?? "Not available"} employees</dd></div><div><dt className="text-muted-foreground">Market</dt><dd className="mt-1.5 text-foreground">{company?.location ?? "Not available"}</dd></div><div><dt className="text-muted-foreground">Research</dt><dd className="mt-1.5 capitalize text-foreground">{company?.researchStatus ?? "Not available"}</dd></div></dl>
        </EntitySection>
        {company && <EntitySection title="Research sources" icon={<FileText className="size-4 text-muted-foreground" />}><ResearchSources company={company} /></EntitySection>}
        {lead.review && <EntitySection title="Evidence review" icon={<ShieldCheck className="size-4 text-muted-foreground" />}><p className="text-xs font-medium capitalize">{lead.review.decision.replaceAll('_', ' ')} · {lead.review.confidence} confidence</p><p className="text-xs leading-6 text-muted-foreground">{lead.review.summary}</p>{lead.review.concerns.map((concern) => <p key={concern} className="text-[11px] leading-5 text-muted-foreground">{concern}</p>)}</EntitySection>}
        <EntitySection title="Outreach preview" icon={<Mail className="size-4 text-muted-foreground" />}>
          <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">Message status</span><StatusBadge status={lead.outreachStatus} label={outreachLabel(lead.outreachStatus)} /></div>
          {proposal && message ? <div className="overflow-hidden rounded-md border border-border"><div className="flex flex-col gap-1 border-b border-border bg-muted/30 px-4 py-3"><p className="break-all text-[11px] text-muted-foreground">To: {proposal.recipientEmail || `${company?.name ?? "Company"} team · recipient not confirmed`}</p><p className="text-xs font-medium">{message.subject}</p></div><p className="whitespace-pre-line break-words px-4 py-3 text-xs leading-5 text-muted-foreground">{message.body.split("\n\n").slice(0, 3).join("\n\n")}</p></div> : <p className="text-xs leading-5 text-muted-foreground">{lead.outreachStatus === "sent" ? mode === "demo" ? "Outreach was sent in the seeded demo history. No external messages are sent by this workspace." : "Recorded send result. Open workflow execution history for its provider or operator verification." : "Research is available. Outreach has not been drafted for this opportunity."}</p>}
          {approval && <Button variant={approval.status === "pending" ? "default" : "outline"} className="self-start" nativeButton={false} render={<Link href={`/approvals?approval=${encodeURIComponent(approval.id)}`} />}><ShieldCheck data-icon="inline-start" />{approval.status === "pending" ? "Review outreach" : "View approval decision"}<ArrowRight data-icon="inline-end" /></Button>}
          {approval?.status === "approved" && <p className="text-[11px] leading-5 text-muted-foreground">{mode === "demo" ? "Preview authorization only; no external transport." : proposal?.envelope ? "Exact revision approved. Execute separately from the approval or workflow." : "Historical content approval; recipient and sender must be reviewed in a replacement before execution."}</p>}
          {mode === "live" && proposal?.attempts?.map((attempt) => <div key={attempt.id} className="min-w-0 border-t border-border pt-3 text-xs leading-6"><p>Execution attempt {attempt.attempt_number}: {attempt.status.replaceAll("_", " ")}</p><p className="text-muted-foreground">Verification: {attempt.verification_method.replaceAll("_", " ")}</p>{attempt.result?.messageId && <p className="break-all font-mono text-[11px]">Gmail accepted message {attempt.result.messageId}; delivery and reading not confirmed.</p>}{attempt.safe_error_code && <p className="text-[var(--warning-fg)]">{attempt.safe_error_code} · preparation results are retained.</p>}</div>)}
        </EntitySection>
        {mode === "live" && <EntitySection title="CRM sync / separate permission" icon={<Building2 className="size-4 text-muted-foreground" />}>{crm.length ? crm.map(({ approval: group, action }) => <div key={action.id} className="min-w-0 text-xs leading-6"><Link href={`/approvals?approval=${group.id}`} className="underline">{action.status} · revision {action.revision}</Link>{action.attempts?.map((t) => <p key={t.id} className="break-all text-muted-foreground">{t.status.replaceAll("_", " ")}{t.result?.contactId ? ` · HubSpot contact ${t.result.contactId}` : ""}</p>)}</div>) : <p className="text-xs leading-6 text-muted-foreground">No CRM proposal. Email approval never authorizes a CRM write.</p>}</EntitySection>}
        {events.length > 0 && <EntitySection title="Recent agent activity" icon={<FileText className="size-4 text-muted-foreground" />}><ol className="flex flex-col gap-3 border-l border-border pl-4">{events.map((event) => <li key={event.id}><p className="text-xs leading-5">{event.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{event.agent ?? "Workflow"} · {entityDate.format(new Date(event.timestamp))}</p></li>)}</ol></EntitySection>}
        <EntitySection title="Connected records" icon={<GitBranch className="size-4 text-muted-foreground" />}>
          <Link href={`/companies?company=${encodeURIComponent(lead.companyId)}`} className="interactive-row group flex items-center gap-3 rounded-md border border-border p-3 text-xs transition-colors hover:bg-muted/50"><Building2 className="size-4 text-muted-foreground" /><span className="flex-1">Open company research</span><ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>
          <Link href={`/workflows/${lead.workflowId}`} className="interactive-row group flex items-center gap-3 rounded-md border border-border p-3 text-xs transition-colors hover:bg-muted/50"><GitBranch className="size-4 shrink-0 text-muted-foreground" /><span className="flex-1 leading-5">{workflow?.title ?? "View workflow"}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>
        </EntitySection>
        <DemoSourceNote />
      </div>
    </SheetContent>
  </Sheet>;
}
