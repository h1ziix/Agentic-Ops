import "server-only";
import { z } from "zod";
import { automationFollowUpRowSchema } from "@/lib/validation/automation";
import { attemptRowSchema, connectionRowSchema, emailEnvelopeSchema, snapshotRowSchema } from "@/lib/validation/execution";
import type { AutomationContext, AutomationJob, ScheduleAutomationInput } from "@/types/automation";
import type { ServerSupabase } from "../auth/context";
import { AppError } from "../errors";
import type { AutomationRepository } from "../repositories/automation-repository";
import { canMonitorReplies } from "../integrations/gmail-monitor";

export const REPLY_CHECK_BUCKET_MS = 600_000;
export const REPLY_CHECK_LIMIT = 20;
// Drafts awaiting approval remain monitored; an approved draft still requires explicit Execute.
const eligiblePlanStatuses = ["scheduled", "due", "drafting", "waiting_for_approval", "approved"] as const;
const ongoingStatuses = ["scheduled", "queued", "running", "retry_scheduled"];
const planSchema = automationFollowUpRowSchema.pick({ id: true, workspace_id: true, workflow_id: true, parent_attempt_id: true, lead_id: true,
  status: true, automation_status: true, last_reply_at: true });
const parentSchema = attemptRowSchema.pick({ id: true, workspace_id: true, workflow_id: true, snapshot_id: true, connection_id: true, status: true, result: true });
const snapshotSchema = snapshotRowSchema.pick({ id: true, workspace_id: true, workflow_id: true, approved_by: true }).extend({
  envelope: emailEnvelopeSchema.pick({ actionType: true, workspaceId: true, workflowId: true, leadId: true, connection: true }),
});
const connectionSchema = connectionRowSchema.pick({ id: true, workspace_id: true, provider: true, status: true, generation: true, provider_identity: true, scopes: true });
export interface ReplyCheckCandidate {
  plan: z.infer<typeof planSchema>;
  parent: z.infer<typeof parentSchema> | null;
  snapshot: z.infer<typeof snapshotSchema> | null;
  connection: z.infer<typeof connectionSchema> | null;
}
export interface ReplyScheduleStore {
  isOwner(context: AutomationContext): Promise<boolean>;
  candidates(context: AutomationContext, limit: number): Promise<ReplyCheckCandidate[]>;
  ongoingPlanIds(context: AutomationContext, planIds: string[]): Promise<string[]>;
  schedule(input: ScheduleAutomationInput): Promise<AutomationJob>;
}

export function eligibleReplyCandidate(candidate: ReplyCheckCandidate, context: AutomationContext) {
  const { plan, parent, snapshot, connection } = candidate;
  if (plan.workspace_id !== context.workspaceId || plan.status !== "planned" || plan.last_reply_at !== null
    || !eligiblePlanStatuses.some((status) => status === plan.automation_status) || !parent || !snapshot || !connection) return false;
  const expected = snapshot.envelope.connection;
  return parent.id === plan.parent_attempt_id && parent.status === "succeeded" && Boolean(parent.result?.threadId && parent.result.messageId)
    && parent.workspace_id === plan.workspace_id && parent.workflow_id === plan.workflow_id
    && snapshot.workspace_id === plan.workspace_id && snapshot.workflow_id === plan.workflow_id && snapshot.id === parent.snapshot_id
    && snapshot.envelope.workspaceId === plan.workspace_id && snapshot.envelope.workflowId === plan.workflow_id
    && (plan.lead_id === null || plan.lead_id === snapshot.envelope.leadId) && snapshot.approved_by === context.userId
    && connection.workspace_id === plan.workspace_id && connection.provider === "gmail" && connection.status === "connected"
    && parent.connection_id === expected.id && connection.id === expected.id
    && connection.generation === expected.generation && connection.provider_identity === expected.identity && canMonitorReplies(connection.scopes);
}

/** Persists references only. No OAuth expansion, credentials, mailbox reads, or external writes. */
export async function scheduleReplyChecks(context: AutomationContext, store: ReplyScheduleStore,
  dispatch: (job: AutomationJob) => Promise<AutomationJob>, now = Date.now()) {
  if (!await store.isOwner(context)) return { scheduled: 0, skipped: 0, failed: 0 };
  const candidates = (await store.candidates(context, REPLY_CHECK_LIMIT)).slice(0, REPLY_CHECK_LIMIT);
  const ongoing = new Set(await store.ongoingPlanIds(context, candidates.map(({ plan }) => plan.id)));
  const bucket = Math.floor(now / REPLY_CHECK_BUCKET_MS);
  let scheduled = 0; let skipped = 0; let failed = 0;
  for (const candidate of candidates) {
    if (!eligibleReplyCandidate(candidate, context) || ongoing.has(candidate.plan.id)) { skipped++; continue; }
    try {
      const job = await store.schedule({ ...context, workflowId: candidate.plan.workflow_id, followUpPlanId: candidate.plan.id,
        leadId: candidate.plan.lead_id ?? candidate.snapshot!.envelope.leadId, jobType: "reply_check", maxAttempts: 3,
        scheduledFor: new Date(bucket * REPLY_CHECK_BUCKET_MS).toISOString(), idempotencyKey: `reply-check:${candidate.plan.id}:${bucket}`,
        input: { planId: candidate.plan.id } });
      if (!ongoingStatuses.includes(job.status)) { skipped++; continue; }
      await dispatch(job); scheduled++; ongoing.add(candidate.plan.id);
    } catch { failed++; } // A cancelled or changed plan is rechecked by the checked scheduling/claim RPCs.
  }
  return { scheduled, skipped, failed };
}

async function readReplyCandidates(db: ServerSupabase, limit: number, workspaceId?: string): Promise<ReplyCheckCandidate[]> {
  let plansQuery = db.from("follow_up_plans").select("id,workspace_id,workflow_id,parent_attempt_id,lead_id,status,automation_status,last_reply_at")
    .eq("status", "planned").in("automation_status", [...eligiblePlanStatuses]).is("last_reply_at", null);
  if (workspaceId) plansQuery = plansQuery.eq("workspace_id", workspaceId);
  const plansResponse = await plansQuery.order("last_checked_at", { ascending: true, nullsFirst: true }).order("created_at").limit(limit);
  if (plansResponse.error) throw new AppError("database");
  const plans = z.array(planSchema).parse(plansResponse.data);
  if (!plans.length) return [];
  const workspaces = [...new Set(plans.map((plan) => plan.workspace_id))];
  const parentsResponse = await db.from("execution_attempts").select("id,workspace_id,workflow_id,snapshot_id,connection_id,status,result")
    .in("workspace_id", workspaces).in("id", plans.map((plan) => plan.parent_attempt_id)).eq("status", "succeeded");
  if (parentsResponse.error) throw new AppError("database");
  const parents = z.array(parentSchema).parse(parentsResponse.data);
  if (!parents.length) return [];
  const [snapshotsResponse, connectionsResponse] = await Promise.all([
    db.from("action_approval_snapshots").select("id,workspace_id,workflow_id,approved_by,envelope").in("workspace_id", workspaces).in("id", parents.map((parent) => parent.snapshot_id)).eq("action_type", "send_email"),
    db.from("integration_connections").select("id,workspace_id,provider,status,generation,provider_identity,scopes").in("workspace_id", workspaces).eq("provider", "gmail").eq("status", "connected"),
  ]);
  if (snapshotsResponse.error || connectionsResponse.error) throw new AppError("database");
  const snapshots = z.array(snapshotSchema).parse(snapshotsResponse.data);
  const connections = z.array(connectionSchema).parse(connectionsResponse.data);
  return plans.map((plan) => {
    const parent = parents.find((item) => item.id === plan.parent_attempt_id) ?? null;
    const snapshot = snapshots.find((item) => item.id === parent?.snapshot_id) ?? null;
    return { plan, parent, snapshot, connection: connections.find((item) => item.id === snapshot?.envelope.connection.id) ?? null };
  });
}

export function createReplyScheduleStore(db: ServerSupabase, repository: Pick<AutomationRepository, "schedule">): ReplyScheduleStore {
  return {
    async isOwner(context) {
      const { data, error } = await db.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", context.userId).eq("role", "owner").maybeSingle();
      if (error) throw new AppError("database");
      return Boolean(data);
    },
    candidates: (context, limit) => readReplyCandidates(db, limit, context.workspaceId),
    async ongoingPlanIds(context, planIds) {
      if (!planIds.length) return [];
      const { data, error } = await db.from("automation_jobs").select("follow_up_plan_id").eq("workspace_id", context.workspaceId)
        .eq("job_type", "reply_check").in("follow_up_plan_id", planIds).in("status", ongoingStatuses).limit(100);
      if (error) throw new AppError("database");
      return z.array(z.object({ follow_up_plan_id: z.uuid() })).parse(data).map((job) => job.follow_up_plan_id);
    },
    schedule: (input) => repository.schedule(input),
  };
}

/** Retains monitoring contexts after due-time preparation completes, without browser identifiers. */
export async function discoverReplyContexts(db: ServerSupabase): Promise<AutomationContext[]> {
  const candidates = await readReplyCandidates(db, 40);
  const eligible = candidates.filter((candidate) => candidate.snapshot && eligibleReplyCandidate(candidate,
    { workspaceId: candidate.plan.workspace_id, userId: candidate.snapshot.approved_by }));
  if (!eligible.length) return [];
  const { data, error } = await db.from("workspace_members").select("workspace_id,user_id").eq("role", "owner")
    .in("workspace_id", [...new Set(eligible.map(({ plan }) => plan.workspace_id))])
    .in("user_id", [...new Set(eligible.map(({ snapshot }) => snapshot!.approved_by))]).limit(40);
  if (error) throw new AppError("database");
  const members = new Set(z.array(z.object({ workspace_id: z.uuid(), user_id: z.uuid() })).parse(data).map((member) => `${member.workspace_id}:${member.user_id}`));
  const contexts = new Map<string, AutomationContext>();
  for (const candidate of eligible) {
    const actor = candidate.snapshot!.approved_by; const key = `${candidate.plan.workspace_id}:${actor}`;
    if (members.has(key)) contexts.set(key, { workspaceId: candidate.plan.workspace_id, userId: actor });
  }
  return [...contexts.values()].slice(0, REPLY_CHECK_LIMIT);
}
