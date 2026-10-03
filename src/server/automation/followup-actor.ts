import "server-only";
import { z } from "zod";
import { followUpEnvelopeSchema } from "@/lib/validation/execution";
import type { AutomationContext, AutomationFollowUp } from "@/types/automation";
import type { ServerSupabase } from "../auth/context";
import { AppError } from "../errors";
import { canMonitorReplies } from "../integrations/gmail-monitor";

type ActorPlan = Pick<AutomationFollowUp, "id" | "workspace_id" | "workflow_id" | "action_id" | "snapshot_id" | "parent_attempt_id">;
const actorSnapshotSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), workflow_id: z.uuid(), action_id: z.uuid(),
  approved_by: z.uuid(), action_type: z.literal("schedule_follow_up"), envelope: followUpEnvelopeSchema });
const memberSchema = z.object({ workspace_id: z.uuid(), user_id: z.uuid(), role: z.enum(["owner", "member"]) });
type ActorSnapshot = z.infer<typeof actorSnapshotSchema>;
type ActorMember = z.infer<typeof memberSchema>;

/** Activation requester and unrelated workspace activity never choose a plan's worker actor. */
export function selectFollowupActor(plan: ActorPlan, snapshot: ActorSnapshot | null, member: ActorMember | null, readAvailable: boolean): AutomationContext | null {
  if (!snapshot || !member || snapshot.id !== plan.snapshot_id || snapshot.workspace_id !== plan.workspace_id || snapshot.workflow_id !== plan.workflow_id
    || snapshot.action_id !== plan.action_id || snapshot.envelope.workspaceId !== plan.workspace_id || snapshot.envelope.workflowId !== plan.workflow_id
    || snapshot.envelope.actionId !== plan.action_id || snapshot.envelope.parentAttemptId !== plan.parent_attempt_id
    || member.workspace_id !== plan.workspace_id || member.user_id !== snapshot.approved_by || (readAvailable && member.role !== "owner")) return null;
  return { workspaceId: plan.workspace_id, userId: snapshot.approved_by };
}

export async function resolveFollowupActor(db: ServerSupabase, plan: ActorPlan): Promise<AutomationContext | null> {
  const snapshotResponse = await db.from("action_approval_snapshots").select("id,workspace_id,workflow_id,action_id,approved_by,action_type,envelope")
    .eq("workspace_id", plan.workspace_id).eq("workflow_id", plan.workflow_id).eq("id", plan.snapshot_id).eq("action_id", plan.action_id).eq("action_type", "schedule_follow_up").maybeSingle();
  if (snapshotResponse.error) throw new AppError("database");
  if (!snapshotResponse.data) return null;
  const snapshot = actorSnapshotSchema.parse(snapshotResponse.data);
  const [memberResponse, parentResponse] = await Promise.all([
    db.from("workspace_members").select("workspace_id,user_id,role").eq("workspace_id", plan.workspace_id).eq("user_id", snapshot.approved_by).maybeSingle(),
    db.from("execution_attempts").select("connection_id").eq("workspace_id", plan.workspace_id).eq("workflow_id", plan.workflow_id).eq("id", plan.parent_attempt_id).eq("status", "succeeded").maybeSingle(),
  ]);
  if (memberResponse.error || parentResponse.error) throw new AppError("database");
  if (!memberResponse.data || !parentResponse.data) return null;
  const member = memberSchema.parse(memberResponse.data);
  const parent = z.object({ connection_id: z.uuid().nullable() }).parse(parentResponse.data);
  let readAvailable = false;
  if (parent.connection_id) {
    const connectionResponse = await db.from("integration_connections").select("scopes").eq("workspace_id", plan.workspace_id).eq("id", parent.connection_id).eq("provider", "gmail").maybeSingle();
    if (connectionResponse.error) throw new AppError("database");
    if (connectionResponse.data) readAvailable = canMonitorReplies(z.object({ scopes: z.array(z.string()) }).parse(connectionResponse.data).scopes);
  }
  return selectFollowupActor(plan, snapshot, member, readAvailable);
}
