"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ProposedAction } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import { useExecution } from "./use-execution";
import type { useAutomation } from "@/components/automation/use-automation";
export function ActionResult({ action, workflowId, automation }: { action: ProposedAction; workflowId: string; automation?: ReturnType<typeof useAutomation> }) {
  const execution = useExecution(workflowId); const [note, setNote] = useState("");
  const noteId = useId();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  const latest = [...(action.attempts ?? [])].sort((a, b) => b.attempt_number - a.attempt_number)[0];
  const ready = action.status === "approved" && !action.blockers?.length && action.snapshot;
  const active = latest && ["claimed", "dispatching"].includes(latest.status);
  const retry = latest?.retry_eligible && !action.blockers?.length && (!latest.next_retry_at || new Date(latest.next_retry_at).getTime() <= now);
  return <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
    <h3 className="section-label">Execution / separate from approval</h3>
    {action.status === "approved" && Boolean(action.blockers?.length) && <ul className="flex flex-col gap-2 text-xs leading-5 text-[var(--warning-fg)]">{action.blockers?.map((r) => <li key={r}>{r}</li>)}</ul>}
    {latest && <div className="flex flex-col gap-2 text-xs leading-5"><p className="font-medium">Attempt {latest.attempt_number} · {latest.status.replaceAll("_", " ")}</p><p className="text-muted-foreground">{formatDateTime(latest.claimed_at)} · verification: {latest.verification_method.replaceAll("_", " ")}</p>
      {latest.verification_method === "closed_for_replacement" && <p className="text-[var(--warning-fg)]">Uncertain operation closed for replacement review. No absence of sending was established; duplicate risk remains.</p>}
      {latest.safe_error_code && <p className="text-[var(--warning-fg)]">{latest.safe_error_code.replaceAll("_", " ")}{latest.next_retry_at ? ` · retry after ${formatDateTime(latest.next_retry_at)}` : ""}</p>}
      {latest.rfc_message_id && <p className="break-all font-mono text-[11px]">Message-ID: {latest.rfc_message_id}</p>}
      {latest.result?.messageId && <p className="break-all font-mono text-[11px]">Gmail message: {latest.result.messageId}{latest.result.threadId ? ` · thread ${latest.result.threadId}` : ""}</p>}
      {latest.result?.contactId && <a className="w-fit underline" href={`https://app.hubspot.com/contacts/${action.envelope && "connection" in action.envelope ? action.envelope.connection.identity : ""}/contact/${latest.result.contactId}`} target="_blank" rel="noreferrer">HubSpot contact {latest.result.contactId}</a>}
      {latest.status === "succeeded" && <p className="text-[var(--success-fg)]">{action.actionType === "send_email" ? latest.verification_method === "user_confirmed" ? "Sent mail confirmed by operator; not API-confirmed." : "Accepted by Gmail. Delivery and reading are not confirmed." : action.actionType === "schedule_follow_up" ? "Plan saved. Follow-up drafting is scheduled separately; a future email requires new approval and Execute." : "Exact approved fields saved to HubSpot."}</p>}
    </div>}
    {latest?.status === "outcome_unknown" && action.actionType === "schedule_follow_up" && <div className="flex flex-col gap-2 text-xs leading-6"><p>Recover the internal transaction status. If no plan committed, a future approved date may be retried explicitly. No email transport is involved.</p><Button size="sm" variant="outline" disabled={Boolean(execution.pending)} onClick={() => execution.reconcile({ recover: true })}>Recover internal plan status</Button></div>}
    {latest?.status === "outcome_unknown" && action.actionType !== "schedule_follow_up" && latest.verification_method !== "closed_for_replacement" && <div className="flex flex-col gap-3 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
      <p className="text-xs leading-6">{action.actionType === "send_email" ? `Check Gmail Sent manually for ${action.recipientEmail}, this timestamp and Message-ID. “Not found” does not unblock resend.` : "Use a read-only reconciliation of contact identity and exact approved fields. No write will be retried."}</p>
      <label htmlFor={noteId} className="text-xs font-medium">Verification note (at least 10 characters)</label><Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
      <div className="flex flex-wrap gap-2">{action.actionType === "send_email" ? <>
        <Button size="sm" disabled={Boolean(execution.pending) || note.trim().length < 10} onClick={() => execution.reconcile({ attemptId: latest.id, resolution: "user_confirmed", note })}>I found this sent message</Button>
        <Button size="sm" variant="outline" disabled={Boolean(execution.pending) || note.trim().length < 10} onClick={() => execution.reconcile({ attemptId: latest.id, resolution: "not_found", note })}>Record “not found”</Button>
        <Button size="sm" variant="outline" disabled={Boolean(execution.pending) || note.trim().length < 10} onClick={() => execution.reconcile({ attemptId: latest.id, resolution: "close_for_replacement", note })}>Close unknown · duplicate risk</Button>
      </> : <Button size="sm" disabled={Boolean(execution.pending) || note.trim().length < 10} onClick={() => execution.reconcile({ attemptId: latest.id, resolution: "crm_read", note })}>Reconcile CRM (read only)</Button>}</div>
      <p className="text-[11px] leading-5 text-muted-foreground">Closing uncertainty preserves the record. A resend needs a replacement proposal, new approval and Execute; duplicates remain possible.</p>
    </div>}
    <div className="flex flex-wrap gap-2">{ready && !active && !latest && <Button size="sm" disabled={Boolean(execution.pending)} onClick={() => execution.execute([action])}>{execution.pending ? "Executing…" : "Execute approved action"}</Button>}
      {retry && <Button size="sm" variant="outline" disabled={Boolean(execution.pending)} onClick={() => execution.execute([action], true)}>Retry / resume explicitly</Button>}
      {automation?.data?.enabled && ready && latest?.status === "failed_retryable" && latest.retry_eligible && action.snapshot && <Button size="sm" variant="outline" disabled={Boolean(automation.pending) || Boolean(execution.pending)} onClick={() => void automation.retryExecution(workflowId, action.id, action.snapshot!.id)}>{automation.pending === action.id ? "Scheduling…" : "Schedule exact approved retry"}</Button>}
      {active && <><p className="text-xs text-muted-foreground">{latest.status === "dispatching" ? "Current bounded request may still complete. Refresh never starts another send." : "Action claimed; waiting for dispatch readiness."}</p><Button size="sm" variant="outline" disabled={Boolean(execution.pending) || new Date(latest.lease_until).getTime() > now} onClick={() => execution.reconcile({ recover: true })}>Recover expired status</Button></>}
      {action.status === "approved" && !ready && (!action.envelope || action.blockers?.some((r) => /connection|account|permission|reconnect/i.test(r))) && <Link href="/settings#integrations" className="text-xs underline">Review integration</Link>}</div>
    {retry === false && latest?.retry_eligible && latest.next_retry_at && <p className="text-[11px] leading-6 text-muted-foreground">Retry becomes available after {formatDateTime(latest.next_retry_at)} and a fresh readiness check.</p>}
    {execution.error && <p role="alert" className="text-xs leading-6 text-destructive">{execution.error}</p>}{execution.notice && <p role="status" className="text-xs leading-6 text-muted-foreground">{execution.notice}</p>}
    {automation?.error && <p role="alert" className="text-xs leading-6 text-destructive">{automation.error}</p>}
  </div>;
}
