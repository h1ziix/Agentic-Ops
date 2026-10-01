import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { createRuntimeClient } from "../src/lib/supabase/admin";
import { agentRunRowSchema, proposedActionRowSchema, leadRowSchema, workflowTaskRowSchema } from "../src/lib/validation/rows";
import { reviewerInputSchema, validateReviewerOutput, validateOutreachOutput, emailActionPayloadSchema, outreachDedupeKey } from "../src/lib/validation/outreach";

async function verify() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const workflowId = z.uuid().parse(args[args.indexOf("--workflow") + 1]);
  const admin = createRuntimeClient();
  const [workflow, tasksResponse, runsResponse, leadsResponse, actionsResponse, approvals, events] = await Promise.all([
    admin.from("workflows").select("*").eq("id", workflowId).single(),
    admin.from("workflow_tasks").select("*").eq("workflow_id", workflowId),
    admin.from("agent_runs").select("*").eq("workflow_id", workflowId),
    admin.from("leads").select("*").eq("workflow_id", workflowId),
    admin.from("proposed_actions").select("*").eq("workflow_id", workflowId),
    admin.from("approvals").select("*").eq("workflow_id", workflowId),
    admin.from("agent_events").select("*").eq("workflow_id", workflowId),
  ]);
  for (const response of [workflow, tasksResponse, runsResponse, leadsResponse, actionsResponse, approvals, events]) assert.equal(response.error, null);
  const tasks = z.array(workflowTaskRowSchema).parse(tasksResponse.data);
  const runs = z.array(agentRunRowSchema).parse(runsResponse.data);
  const leads = z.array(leadRowSchema).parse(leadsResponse.data);
  const actions = z.array(proposedActionRowSchema).parse(actionsResponse.data);
  const reviewed = runs.filter((run) => run.agent_type === "reviewer" && run.status === "completed");
  const drafted = runs.filter((run) => run.agent_type === "outreach" && run.status === "completed");
  assert.ok(reviewed.length, "Expected real Reviewer runs");
  assert.ok(drafted.length, "Expected accepted evidence and real Outreach runs");
  for (const run of reviewed) {
    const output = z.object({ leadId: z.uuid(), reviewInput: reviewerInputSchema, review: z.unknown() }).parse(run.output);
    validateReviewerOutput(output.review, output.reviewInput);
    assert.equal(output.reviewInput.workflowId, workflowId);
    assert.ok(runs.some((research) => research.id === output.reviewInput.researchRunId && research.agent_type === "researcher" && research.status === "completed"));
    assert.ok(run.completed_at); assert.ok(run.duration_ms !== null); assert.ok(run.total_tokens !== null);
  }
  for (const run of drafted) {
    const output = z.object({ leadId: z.uuid(), reviewInput: reviewerInputSchema, review: z.unknown(), reviewerRunId: z.uuid(), draft: z.unknown() }).parse(run.output);
    const review = validateReviewerOutput(output.review, output.reviewInput);
    assert.equal(review.decision, "approve_for_outreach");
    assert.ok(reviewed.some((reviewer) => reviewer.id === output.reviewerRunId));
    validateOutreachOutput(output.draft, output.reviewInput, review, { name: null, email: null, role: null, companyName: output.reviewInput.company.name });
    assert.ok(run.duration_ms !== null); assert.ok(run.total_tokens !== null);
  }
  assert.equal(actions.length, drafted.length);
  assert.equal(new Set(actions.map((action) => action.dedupe_key)).size, actions.length);
  for (const action of actions) {
    const payload = emailActionPayloadSchema.parse(action.payload);
    const lead = leads.find((lead) => lead.id === action.target.leadId);
    assert.ok(lead); assert.equal(lead.company_id, action.target.companyId);
    assert.equal(action.target.recipientEmail, null); assert.equal(payload.executionReadiness, "blocked_missing_recipient");
    assert.equal(action.dedupe_key, outreachDedupeKey(workflowId, lead.id, payload.generationMetadata.taskId));
    assert.ok(approvals.data?.some((approval) => approval.id === action.approval_id));
    assert.ok(drafted.some((run) => run.id === payload.generationMetadata.outreachRunId));
    assert.notEqual(action.status, "executed");
    if (action.revision) assert.ok(events.data?.some((event) => event.event_type === "proposed_action_edited" && event.metadata.action_id === action.id));
    if (action.status === "approved") assert.equal(lead.outreach_status, "blocked_missing_recipient");
  }
  assert.ok(["waiting_for_approval", "ready_for_execution", "completed"].includes(workflow.data?.status));
  assert.equal(runs.filter((run) => run.agent_type === "executor").length, 0);
  const execution = tasks.find((task) => task.type === "execute_approved_actions");
  assert.ok(execution); assert.ok(["pending", "cancelled"].includes(execution.status));
  assert.equal(workflow.data?.progress, Math.floor(100 * tasks.filter((task) => task.status === "completed").length / tasks.length));
  for (const eventType of ["review_started", "review_completed", "outreach_draft_created", "approval_requested"]) assert.ok(events.data?.some((event) => event.event_type === eventType));
  const report = { verifiedAt: new Date().toISOString(), workflowId, status: workflow.data?.status,
    reviewerRuns: reviewed.length, outreachRuns: drafted.length, actions: actions.length,
    edited: actions.filter((action) => action.revision).length, authorized: actions.filter((action) => action.status === "approved").length,
    rejected: actions.filter((action) => action.status === "rejected").length,
    checks: { groundedEvidence: true, immutableResearchLinks: true, noFabricatedContacts: true, uniqueLinkedActions: true,
      independentDraftEdits: true, executionPending: execution.status === "pending", noExternalExecution: true, actualTaskProgress: true } };
  await mkdir("output/outreach", { recursive: true });
  await writeFile(`output/outreach/${workflowId}-verification.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
verify().catch((error: unknown) => { console.error("Stage 5 verification failed", { message: error instanceof Error ? error.message : "Verification failed" }); process.exitCode = 1; });
