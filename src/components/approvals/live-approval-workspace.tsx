"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolveApprovalAction } from "@/app/actions/approvals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/components/app/demo-store";
import { hasRequiredScopes } from "@/lib/validation/execution";
import { ApprovalResearch } from "./approval-research";
import { ExecutableEmailEditor } from "./executable-email-editor";
import { ActionResult } from "@/components/execution/action-result";
import { AuxiliaryProposals } from "@/components/execution/auxiliary-proposals";
import { ReplacementControls } from "@/components/execution/replacement-controls";
import type { Approval, ProposedAction } from "@/types/domain";
import { useAutomation } from "@/components/automation/use-automation";
type Decision = { status: "approved" | "rejected"; actions: ProposedAction[] };
export function LiveApprovalWorkspace({ approval, workflowTitle }: { approval: Approval; workflowTitle: string }) {
  const { integrationConnections, approvals } = useDemoStore();
  const automation = useAutomation(approval.workflowId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  const router = useRouter(); const [selected, setSelected] = useState(approval.proposedActions[0]?.id); const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const action = approval.proposedActions.find((a) => a.id === selected) ?? approval.proposedActions[0];
  const waiting = approval.proposedActions.filter((a) => ["pending_approval", "waiting_for_approval"].includes(a.status) && !a.supersededById);
  function approvalReady(a: ProposedAction) {
    const e = a.envelope; if (!e) return false;
    if (e.actionType === "schedule_follow_up") return new Date(e.dueAt).getTime() > now;
    return integrationConnections?.some((c) => c.id === e.connection.id && c.generation === e.connection.generation && c.provider === e.connection.provider
      && c.provider_identity === e.connection.identity && c.status === "connected" && hasRequiredScopes(c.provider, c.scopes)) ?? false;
  }
  const eligible = waiting.filter(approvalReady);
  const previous = approvals.flatMap((a) => a.proposedActions).find((a) => a.id === action?.replacesActionId);
  const duplicateRisk = previous?.attempts?.some((t) => t.verification_method === "closed_for_replacement");
  async function decide() {
    if (!decision) return; setPending(true); setError("");
    const result = await resolveApprovalAction(approval.id, decision.status, [], decision.actions.map((a) => a.id), decision.actions.map((a) => ({ actionId: a.id, revision: a.revision ?? 0 })));
    setPending(false); if (!result.ok) { setError(result.error); return; }
    setNotice(`${decision.actions.length} action(s) ${decision.status}; no provider write was performed.`); setDecision(null); router.refresh();
  }
  const editable = action && action.actionType === "send_email" && !action.supersededById && ["pending_approval", "waiting_for_approval", "approved"].includes(action.status)
    && !action.attempts?.some((t) => ["claimed", "dispatching", "succeeded"].includes(t.status) || (t.status === "outcome_unknown" && t.verification_method !== "closed_for_replacement"));
  return <section className="flex min-w-0 flex-col" aria-label="Selected approval">
    <header className="flex flex-col gap-3 border-b border-border p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><span className="section-label">Exact action review</span><StatusBadge status={approval.status} /></div><h2 className="text-lg font-semibold tracking-tight">{approval.title}</h2><p className="text-xs leading-6 text-muted-foreground">{approval.description}</p><Link href={`/workflows/${approval.workflowId}`} className="w-fit max-w-full truncate text-xs underline">{workflowTitle}</Link></header>
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-6"><label htmlFor="live-action-select" className="text-xs font-medium">Proposal in this group</label><select id="live-action-select" disabled={editing} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring" value={action?.id ?? ""} onChange={(e) => { setSelected(e.target.value); setEditing(false); setError(""); }}>
      {approval.proposedActions.map((a) => <option key={a.id} value={a.id}>{a.metadata?.company.name.trim() || a.recipientEmail || a.actionType.replaceAll("_", " ")} · r{a.revision} · {a.status}{a.supersededById ? " · superseded" : ""}</option>)}</select></div>
    {action ? <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_260px]"><div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="section-label">{action.actionType.replaceAll("_", " ")} · revision {action.revision}</h3>{editable && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{action.status === "approved" ? "Create replacement" : "Set recipient / edit"}</Button>}</div>
      {action.supersededById && <p className="text-xs text-muted-foreground">Superseded · this historical approval has no dispatch rights.</p>}
      {duplicateRisk && <p role="alert" className="rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs leading-6 text-[var(--warning-fg)]">Duplicate risk: the previous email outcome was closed without proving that it was not sent. This replacement requires a new exact approval and explicit Execute.</p>}
      {waiting.some((a) => a.id === action.id) && action.envelope && !approvalReady(action) && <p className="text-xs leading-6 text-[var(--warning-fg)]">Approval blocked: the selected authorization changed, permissions are missing, or the plan date passed. Review a replacement first.</p>}
      {editing ? <ExecutableEmailEditor key={`${action.id}:${action.revision}`} action={action} close={() => setEditing(false)} /> : <>
        {action.actionType === "send_email" ? <><dl className="grid min-w-0 grid-cols-[45px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-border pb-4 text-xs"><dt className="text-muted-foreground">To</dt><dd className="break-all font-medium">{action.recipientEmail || "Missing · create a confirmed revision"}</dd><dt className="text-muted-foreground">From</dt><dd className="break-all font-medium">{action.envelope?.actionType === "send_email" ? `${action.envelope.connection.identity} · generation ${action.envelope.connection.generation}` : "Not selected"}</dd></dl>
          <h4 className="text-[13px] font-semibold leading-6">{action.subject}</h4><p className="whitespace-pre-wrap break-words text-[13px] leading-7 text-[var(--text-secondary)]">{action.body}</p>
          {!action.envelope && <p className="text-xs leading-6 text-[var(--warning-fg)]">Content-only proposal from Release 0.5. Authorization cannot send it. Save a confirmed recipient and Gmail account, then approve the new revision.</p>}</>
        : action.envelope?.actionType === "upsert_crm_contact" ? <><p className="break-all text-xs">{action.envelope.recipient.email} · HubSpot portal {action.envelope.connection.identity} · {action.envelope.contactId ? `update ${action.envelope.contactId}` : "create"}</p><dl className="flex flex-col gap-3 text-xs">{Object.entries(action.envelope.patch).map(([k, v]) => <div key={k} className="border-b border-border pb-3"><dt className="font-medium">{k}</dt><dd className="mt-1 break-words text-muted-foreground">{action.envelope?.actionType === "upsert_crm_contact" ? action.envelope.expected[k as "firstname" | "lastname" | "jobtitle" | "company" | "website"] || "not set" : ""} → {v}</dd></div>)}</dl><p className="text-xs leading-6 text-muted-foreground">Only these approved fields change. Other properties are untouched. A changed preview blocks execution.</p></>
        : action.envelope?.actionType === "schedule_follow_up" ? <><p className="text-xs font-medium">Due: {action.envelope.dueAt} UTC</p><p className="text-xs text-muted-foreground">Timezone: {action.envelope.timezone} · {new Intl.DateTimeFormat("en", { timeZone: action.envelope.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(action.envelope.dueAt))}</p><p className="whitespace-pre-wrap break-words text-xs leading-6">{action.envelope.note}</p><p className="text-xs leading-6 text-muted-foreground">Internal plan only. No automatic send or calendar event. Future email needs a new draft and approval.</p></> : <p className="text-xs text-muted-foreground">Historical record has no executable schema.</p>}
        <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">Provenance and approval identity</summary><dl className="mt-3 flex flex-col gap-2 break-all"><div>Action: {action.id}</div><div>Original outreach run: {action.metadata?.outreachRunId ?? "Separate auxiliary action"}</div><div>Snapshot: {action.snapshot?.id ?? "No executable approval"}</div><div>Approved by: {action.snapshot?.approved_by ?? "Not approved"}</div><div>Digest: {action.snapshot?.digest ?? "Not approved"}</div></dl></details>
        <ActionResult key={`${action.id}:${action.attempts?.at(-1)?.status}`} action={action} workflowId={approval.workflowId} automation={automation} />
        <AuxiliaryProposals action={action} />
        <ReplacementControls action={action} />
      </>}
    </div>{action.actionType === "send_email" && <ApprovalResearch action={action} companyId={action.companyId} leadId={action.leadId} />}</div> : <p className="p-6 text-xs text-muted-foreground">No proposed actions in this group.</p>}
    <footer className="flex flex-col gap-3 border-t border-border p-4 sm:px-6"><p className="text-[11px] leading-5 text-muted-foreground">Approval records authorization only. Execute is always a separate action. CRM and follow-up require their own approvals.</p>
      <div className="flex flex-wrap gap-2">{action && waiting.some((a) => a.id === action.id) && <><Button size="sm" variant="outline" disabled={editing || pending} onClick={() => setDecision({ status: "rejected", actions: [action] })}>Reject this action</Button><Button size="sm" disabled={editing || pending || Boolean(action.envelope && !approvalReady(action))} onClick={() => setDecision({ status: "approved", actions: [action] })}>{action.envelope ? "Approve exact revision" : "Authorize content only"}</Button></>}
        {waiting.length > 1 && <><Button size="sm" variant="outline" disabled={editing || pending || !eligible.length} onClick={() => setDecision({ status: "approved", actions: eligible })}>Approve executable subset ({eligible.length})</Button><Button size="sm" variant="outline" disabled={editing || pending} onClick={() => setDecision({ status: "approved", actions: waiting })}>Review bulk approval ({waiting.length})</Button><Button size="sm" variant="ghost" disabled={editing || pending} onClick={() => setDecision({ status: "rejected", actions: waiting })}>Reject remaining</Button></>}</div>
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    </footer>
    <Dialog open={decision !== null} onOpenChange={(v) => { if (!v && !pending) setDecision(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{decision?.status === "approved" ? "Approve these exact revisions?" : "Reject selected actions?"}</DialogTitle><DialogDescription>Each listed revision is checked atomically. Stale data returns a conflict. No provider request happens during approval.</DialogDescription></DialogHeader>
      <ul className="flex flex-col gap-4 text-xs leading-6">{decision?.actions.map((a) => <li key={a.id} className="min-w-0 border-b border-border pb-3"><p className="font-medium">{a.actionType.replaceAll("_", " ")} · r{a.revision} · {a.envelope ? "executable snapshot" : "content-only, sending blocked"}</p><p className="break-all">{a.recipientEmail || "No recipient"}{a.envelope && "connection" in a.envelope ? ` · ${a.envelope.connection.identity}` : ""}</p><p className="break-words">{a.subject}</p>{a.actionType === "send_email" && <details><summary className="cursor-pointer underline focus-visible:outline-2 focus-visible:outline-ring">Review exact message</summary><p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{a.body}</p></details>}{a.envelope?.actionType === "schedule_follow_up" && <p>{a.envelope.dueAt} · {a.envelope.timezone}</p>}{a.envelope?.actionType === "upsert_crm_contact" && <pre className="whitespace-pre-wrap break-all">{JSON.stringify({ expected: a.envelope.expected, changes: a.envelope.patch }, null, 2)}</pre>}</li>)}</ul>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDecision(null)}>Go back</Button><Button disabled={pending} onClick={decide}>{pending ? "Saving…" : "Confirm decision"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
