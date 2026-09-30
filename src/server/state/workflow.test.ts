import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../errors";
import { actionContentEditsSchema } from "@/lib/validation/approval";
import { assertApprovalDecision, assertTaskTransition, assertWorkflowTransition } from "./workflow";

test("workflow transitions allow the intended lifecycle", () => {
  assert.doesNotThrow(() => assertWorkflowTransition("draft", "planning"));
  assert.doesNotThrow(() => assertWorkflowTransition("planning", "running"));
  assert.doesNotThrow(() => assertWorkflowTransition("running", "waiting_for_approval"));
  assert.doesNotThrow(() => assertWorkflowTransition("waiting_for_approval", "ready_for_execution"));
  assert.doesNotThrow(() => assertWorkflowTransition("ready_for_execution", "running"));
  assert.doesNotThrow(() => assertWorkflowTransition("running", "completed"));
});

test("workflow transitions reject skipped, repeated, and terminal changes", () => {
  for (const [current, next] of [["draft", "completed"], ["running", "running"], ["completed", "running"], ["failed", "cancelled"]] as const) {
    assert.throws(() => assertWorkflowTransition(current, next), (error) => error instanceof AppError && error.code === "invalid_transition");
  }
});

test("task transitions require an active workflow to start work", () => {
  assert.doesNotThrow(() => assertTaskTransition("pending", "running", "running"));
  assert.throws(() => assertTaskTransition("pending", "running", "planning"), AppError);
  assert.doesNotThrow(() => assertTaskTransition("running", "completed", "running"));
  assert.doesNotThrow(() => assertTaskTransition("blocked", "pending", "paused"));
  assert.throws(() => assertTaskTransition("completed", "running", "running"), AppError);
});

test("approval decisions can resolve pending requests once", () => {
  assert.doesNotThrow(() => assertApprovalDecision("pending", "approved"));
  assert.doesNotThrow(() => assertApprovalDecision("pending", "rejected"));
  assert.throws(() => assertApprovalDecision("approved", "rejected"), AppError);
});

test("approval edits reject duplicate action IDs and incomplete messages", () => {
  const actionId = "00000000-0000-4000-8000-000000000001";
  const valid = { actionId, subject: "A specific proposal", body: "A researched message for review." };
  assert.equal(actionContentEditsSchema.safeParse([valid]).success, true);
  assert.equal(actionContentEditsSchema.safeParse([valid, valid]).success, false);
  assert.equal(actionContentEditsSchema.safeParse([{ ...valid, body: "short" }]).success, false);
});
