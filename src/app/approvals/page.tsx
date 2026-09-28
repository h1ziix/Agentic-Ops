"use client";

import { Inbox, LockKeyhole, ShieldCheck } from "lucide-react";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useDemoStore } from "@/components/app/demo-store";

export default function ApprovalsPage() {
  const { approvals, workflows, setApprovalStatus } = useDemoStore();
  const pending = approvals.filter((approval) => approval.status === "pending");
  const reviewed = approvals.filter((approval) => approval.status !== "pending");
  const messagesHeld = pending.reduce((total, approval) => total + approval.proposedActions.length, 0);
  const workflowTitles = new Map(workflows.map((workflow) => [workflow.id, workflow.title]));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Human oversight"
        title="Approvals"
        description="Inspect proposed external actions and record a decision before anything can advance."
      />

      <section className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label="Approval gate status">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#e8b766]/25 bg-[#e8b766]/[0.08]">
            <LockKeyhole aria-hidden="true" className="size-4 text-[#e8b766]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Approval gate active</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              {messagesHeld > 0
                ? `${messagesHeld} proposed emails are held for review. Approving a batch records your decision in this local demo; no emails are sent.`
                : "All proposed emails have been reviewed. Decisions are stored locally; no emails have been sent."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-6 border-t border-border pt-4 sm:border-l sm:border-t-0 sm:py-0 sm:pl-6">
          <div>
            <p className="font-mono text-xl font-semibold tabular-nums text-foreground">{pending.length}</p>
            <p className="section-label mt-0.5">Pending batches</p>
          </div>
          <div>
            <p className="font-mono text-xl font-semibold tabular-nums text-foreground">{messagesHeld}</p>
            <p className="section-label mt-0.5">Messages held</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="pending-approvals">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Decision queue</p>
            <h2 id="pending-approvals" className="mt-1 text-[15px] font-semibold text-foreground">
              Pending review <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{pending.length}</span>
            </h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">Review each draft before authorizing</span>
        </div>
        {pending.length ? (
          <div className="grid gap-3">
            {pending.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                workflowTitle={workflowTitles.get(approval.workflowId) ?? "Workflow"}
                onDecision={(status) => setApprovalStatus(approval.id, status)}
              />
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon={Inbox}
              title="Approval queue is clear"
              description="New proposed actions will appear here after a workflow prepares them for human review."
            />
          </div>
        )}
      </section>

      {reviewed.length > 0 && (
        <section aria-labelledby="reviewed-approvals">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 id="reviewed-approvals" className="text-[15px] font-semibold text-foreground">Decisions recorded</h2>
            <span className="font-mono text-xs text-muted-foreground">{reviewed.length}</span>
          </div>
          <div className="grid gap-3">
            {reviewed.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                workflowTitle={workflowTitles.get(approval.workflowId) ?? "Workflow"}
                onDecision={(status) => setApprovalStatus(approval.id, status)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
