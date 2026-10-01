"use client";
import { useDemoStore } from "@/components/app/demo-store";
import { AuxiliaryProposals } from "./auxiliary-proposals";
import type { ProposedAction } from "@/types/domain";
export function ReplacementControls({ action }: { action: ProposedAction }) {
  const { approvals } = useDemoStore(); const e = action.envelope;
  if (!e || e.actionType === "send_email" || action.supersededById || ["rejected", "cancelled"].includes(action.status)
    || action.attempts?.some((t) => ["claimed", "dispatching"].includes(t.status) || (t.status === "outcome_unknown" && t.verification_method !== "closed_for_replacement"))) return null;
  if (e.actionType === "upsert_crm_contact" && action.status === "executed") return null;
  const source = approvals.flatMap((a) => a.proposedActions).find((a) => a.id === (e.actionType === "upsert_crm_contact" ? e.sourceActionId : e.parentActionId));
  return source ? <AuxiliaryProposals action={source} crmReplacement={e.actionType === "upsert_crm_contact" ? action : undefined} followUpReplacement={e.actionType === "schedule_follow_up" ? action : undefined} /> : null;
}
