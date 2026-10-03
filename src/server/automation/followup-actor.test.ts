import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { selectFollowupActor } from "./followup-actor";

function fixture() {
  const actor = randomUUID(); const plan = { id: randomUUID(), workspace_id: randomUUID(), workflow_id: randomUUID(), action_id: randomUUID(), snapshot_id: randomUUID(), parent_attempt_id: randomUUID() };
  const snapshot = { id: plan.snapshot_id, workspace_id: plan.workspace_id, workflow_id: plan.workflow_id, action_id: plan.action_id, approved_by: actor,
    action_type: "schedule_follow_up" as const, envelope: { schemaVersion: 2 as const, actionType: "schedule_follow_up" as const, workspaceId: plan.workspace_id,
      workflowId: plan.workflow_id, actionId: plan.action_id, snapshotId: plan.snapshot_id, lineageId: plan.action_id, revision: 1,
      parentAttemptId: plan.parent_attempt_id, parentActionId: randomUUID(), dueAt: "2026-10-02T00:00:00Z", timezone: "UTC", note: null } };
  const member = { workspace_id: plan.workspace_id, user_id: actor, role: "owner" as const };
  return { plan, snapshot, member, actor };
}
test("the immutable internal-plan approver chooses the worker actor", () => {
  const f = fixture();
  assert.deepEqual(selectFollowupActor(f.plan, f.snapshot, f.member, true), { workspaceId: f.plan.workspace_id, userId: f.actor });
  assert.equal(selectFollowupActor(f.plan, f.snapshot, { ...f.member, user_id: randomUUID() }, false), null);
});
test("plan actor selection rejects foreign snapshots and unrelated parent lineage", () => {
  const f = fixture();
  for (const patch of [{ id: randomUUID() }, { workspace_id: randomUUID() }, { workflow_id: randomUUID() }, { action_id: randomUUID() }])
    assert.equal(selectFollowupActor(f.plan, { ...f.snapshot, ...patch }, f.member, false), null);
  assert.equal(selectFollowupActor(f.plan, { ...f.snapshot, envelope: { ...f.snapshot.envelope, parentAttemptId: randomUUID() } }, f.member, false), null);
});
test("current membership is required and read-capable connections require current ownership", () => {
  const f = fixture();
  assert.equal(selectFollowupActor(f.plan, f.snapshot, null, false), null);
  assert.equal(selectFollowupActor(f.plan, f.snapshot, { ...f.member, workspace_id: randomUUID() }, false), null);
  assert.equal(selectFollowupActor(f.plan, f.snapshot, { ...f.member, role: "member" }, true), null);
  assert.deepEqual(selectFollowupActor(f.plan, f.snapshot, { ...f.member, role: "member" }, false), { workspaceId: f.plan.workspace_id, userId: f.actor });
});
