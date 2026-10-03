import assert from "node:assert/strict";
import test from "node:test";
import type { Approval, WorkflowStage, WorkflowTask } from "../../types/domain";
import { pipelineStatus, recordedTotal, tasksForStage } from "./pipeline-state";

const stage: WorkflowStage = { id: "research", workflowId: "one", label: "Research", order: 3, status: "waiting" };
const blocked: WorkflowTask = { id: "task", workflowId: "one", title: "Research company", description: "Evidence needed", order: 1, status: "blocked", agent: "Research Agent", type: "research_companies" };

test("blocked saved tasks remain distinct from pending stages and other workflow failures", () => {
  assert.equal(pipelineStatus(stage, [blocked, { ...blocked, id: "other", workflowId: "two", status: "failed" }], []), "blocked");
  assert.deepEqual(tasksForStage(stage, [blocked, { ...blocked, workflowId: "two" }]).map((task) => task.id), ["task"]);
});

test("an unresolved human proposal overrides a completed approval stage", () => {
  const approval: Approval = { id: "approval", workflowId: "one", title: "Review", description: "Review saved draft", actionType: "send_email", status: "pending", requestedBy: "Outreach Agent", requestedAt: "2026-10-03T00:00:00Z", riskLabel: "External", recipientCount: 1,
    proposedActions: [{ id: "action", leadId: "lead", companyId: "company", actionType: "send_email", recipientName: "Test", recipientEmail: "test@example.com", subject: "Sample", body: "Sample draft", status: "waiting_for_approval" }] };
  assert.equal(pipelineStatus({ ...stage, label: "Approval", status: "completed" }, [], [approval]), "waiting");
  assert.equal(pipelineStatus({ ...stage, label: "Execution", status: "completed" }, [], [approval]), "waiting");
});

test("partial or absent telemetry never becomes a measured zero", () => {
  assert.equal(recordedTotal([]), null);
  assert.equal(recordedTotal([100, null]), null);
  assert.equal(recordedTotal([undefined]), null);
  assert.equal(recordedTotal([0]), 0);
  assert.equal(recordedTotal([100, 200]), 300);
});
