"use client";
import Link from "next/link";
import { useState } from "react";
import { useDemoStore } from "@/components/app/demo-store";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/execution/action-result";
import { useExecution } from "@/components/execution/use-execution";
import { ReplacementControls } from "@/components/execution/replacement-controls";
import { cancelFollowUpAction } from "@/app/actions/execution";
import { useRouter } from "next/navigation";
export function ExecutionPanel({ workflowId }: { workflowId: string }) {
  const { approvals, workflows, followUpPlans, mode } = useDemoStore(); const executor = useExecution(workflowId); const router = useRouter(); const [planError, setPlanError] = useState(""); const [cancelling, setCancelling] = useState("");
  if (mode !== "live") return null;
  const workflow = workflows.find((w) => w.id === workflowId);
  const groups = approvals.filter((a) => a.workflowId === workflowId); const actions = groups.flatMap((a) => a.proposedActions).filter((a) => !a.supersededById);
  if (!actions.length) return null;
  const primary = actions.filter((a) => !a.auxiliary); const pending = primary.some((a) => ["pending_approval", "waiting_for_approval"].includes(a.status));
  const approved = actions.filter((a) => a.status === "approved"); const ready = approved.filter((a) => a.snapshot && !a.blockers?.length && !a.attempts?.length && (a.auxiliary || !pending));
  const attempts = actions.flatMap((a) => a.attempts ?? []); const unknown = attempts.filter((t) => t.status === "outcome_unknown" && t.verification_method !== "closed_for_replacement");
  const failed = actions.filter((a) => [...(a.attempts ?? [])].sort((x, y) => y.attempt_number - x.attempt_number)[0]?.status.startsWith("failed"));
  const plans = followUpPlans?.filter((p) => p.workflow_id === workflowId) ?? [];
  return <section className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-4 sm:p-5" aria-labelledby="executor-panel-title">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="executor-panel-title" className="text-sm font-semibold">Executor</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">Core workflow: {workflow?.status.replaceAll("_", " ")} · {actions.filter((a) => a.auxiliary && a.status !== "executed").length} auxiliary proposals independent of core completion.</p></div>
      <Button size="sm" disabled={Boolean(executor.pending) || !ready.length || Boolean(unknown.length) || workflow?.status === "cancelled"} onClick={() => executor.execute(ready.slice(0, 20))}>{executor.pending ? "Executing bounded action…" : attempts.length ? `Resume execution (${Math.min(ready.length, 20)})` : `Execute ready (${Math.min(ready.length, 20)})`}</Button></header>
    <dl className="grid grid-cols-2 gap-4 border-y border-border py-3 text-xs sm:grid-cols-5">{[["Approved", approved.length], ["Blocked", approved.filter((a) => a.blockers?.length).length], ["Succeeded", actions.filter((a) => a.status === "executed").length], ["Failed", failed.length], ["Unknown", unknown.length]].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-mono text-lg">{v}</dd></div>)}</dl>
    {pending && <p className="text-xs leading-6 text-[var(--warning-fg)]">Resolve all primary batch decisions before executing emails. Rejected proposals are skipped.</p>}
    {!approved.length && <p className="text-xs text-muted-foreground">{actions.some((a) => a.status === "executed") ? "All approved actions are complete. Refresh does not dispatch anything." : "No approved actions. Review a proposal first."}</p>}
    {executor.error && <p role="alert" className="text-xs text-destructive">{executor.error}</p>}{executor.notice && <p role="status" className="text-xs leading-6 text-muted-foreground">{executor.notice}</p>}
    <div className="flex flex-col gap-3">{actions.map((a) => <details key={`${a.id}:${a.attempts?.at(-1)?.status}`} open={a.attempts?.some((t) => ["claimed", "dispatching"].includes(t.status) || (t.status === "outcome_unknown" && t.verification_method !== "closed_for_replacement")) || undefined} className="min-w-0 border-b border-border pb-3">
      <summary className="cursor-pointer break-words text-xs leading-6 focus-visible:outline-2 focus-visible:outline-ring"><span className="font-medium">{a.metadata?.company.name ?? a.actionType.replaceAll("_", " ")}</span> · {a.status} · r{a.revision} · {a.recipientEmail || (a.actionType === "schedule_follow_up" ? "internal plan" : "recipient missing")}</summary>
      <div className="mt-3 flex min-w-0 flex-col gap-3"><Link href={`/approvals?approval=${groups.find((g) => g.proposedActions.some((item) => item.id === a.id))?.id}`} className="w-fit text-xs underline">Review exact action and history</Link><ActionResult action={a} workflowId={workflowId} /><ReplacementControls action={a} /></div>
    </details>)}</div>
    {plans.length > 0 && <div className="flex flex-col gap-3"><h3 className="section-label">Internal follow-up plans</h3><p className="text-xs leading-6 text-muted-foreground">План сохранён. Автоматическое выполнение появится в Release 0.7.</p>{plans.map((p) => <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 text-xs"><div className="min-w-0"><p>{new Intl.DateTimeFormat("en", { timeZone: p.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(p.due_at))} · {p.timezone} · {p.status}</p><p className="mt-1 break-words text-muted-foreground">{p.note}</p><p className="mt-1 text-[11px] text-muted-foreground">UTC: {p.due_at}</p></div>{p.status === "planned" && <Button size="sm" variant="ghost" disabled={Boolean(cancelling)} onClick={async () => { setCancelling(p.id); const result = await cancelFollowUpAction(p.id); if (!result.ok) setPlanError(result.error); else router.refresh(); setCancelling(""); }}>Cancel plan</Button>}</div>)}{planError && <p role="alert" className="text-xs text-destructive">{planError}</p>}</div>}
  </section>;
}
