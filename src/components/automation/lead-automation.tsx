"use client";

import { useAutomation } from "./use-automation";
import { FollowUpList } from "./follow-up-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead } from "@/types/domain";
import { useDemoStore } from "@/components/app/demo-store";

export function LeadAutomation({ lead }: { lead: Lead }) {
  const automation = useAutomation(lead.workflowId);
  const { approvals } = useDemoStore();
  if (automation.loading) return <Skeleton className="h-28" />;
  const attempts = approvals.flatMap((approval) => approval.proposedActions.filter((action) => action.leadId === lead.id).flatMap((action) => action.attempts ?? []));
  const plans = automation.data?.automation.followUps.filter((plan) => plan.lead_id === lead.id || attempts.some((attempt) => attempt.id === plan.parent_attempt_id)) ?? [];
  if (!plans.length && lead.outreachStatus !== "sent" && lead.status !== "responded") return null;
  return <div className="flex flex-col gap-3">{plans.length ? <FollowUpList plans={plans} replies={automation.data?.automation.replies ?? []} pending={automation.pending} onOperation={automation.followUpOperation} compact testJobsAllowed={automation.data?.enabled && automation.data.testJobsAllowed} /> : <section className="border-t border-border pt-5"><h2 className="text-sm font-semibold">Reply & follow-up</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{lead.status === "responded" ? "A reply is recorded for this lead. No future follow-up plan is active." : "No follow-up plan saved. Plan a follow-up from the sent action in Approvals."}</p><p className="mt-2 text-[11px] text-muted-foreground">Reply monitoring requires separately granted Gmail read access.</p></section>}{automation.error && <p role="alert" className="text-xs text-destructive">{automation.error}</p>}</div>;
}
