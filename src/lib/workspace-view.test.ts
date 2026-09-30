import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { toWorkspaceView } from "./workspace-view";
import { mapPlannerTasks } from "./validation/planner";
import { examplePlan } from "@/server/agents/testing/planner-fixtures";
import type { WorkspaceSnapshot } from "@/types/persistence";

function snapshot(): WorkspaceSnapshot {
  const workspaceId = randomUUID(); const workflowId = randomUUID(); const userId = randomUUID(); const runId = randomUUID();
  const now = new Date().toISOString();
  return {
    workspace: { id: workspaceId, name: "Test workspace", slug: "test-workspace", created_by: userId, is_personal: true, created_at: now, updated_at: now },
    workflows: [{ id: workflowId, workspace_id: workspaceId, created_by: userId, title: "Find target SaaS companies", goal: "Find 20 SaaS companies in Kazakhstan for reviewed outreach.", status: "running", progress: 0,
      current_step: "Plan ready; research awaits implementation", target_companies: 20, started_at: now, completed_at: null, failed_at: null, created_at: now, updated_at: now }],
    tasks: mapPlannerTasks(examplePlan).map((task) => ({ ...task, id: randomUUID(), workflow_id: workflowId, workspace_id: workspaceId,
      status: "pending", output: null, error: null, started_at: null, completed_at: null, created_at: now, updated_at: now })),
    agentRuns: [{ id: runId, workflow_id: workflowId, workspace_id: workspaceId, workflow_task_id: null, agent_type: "planner", status: "completed", model: "test-model", input: null, output: examplePlan,
      error: null, started_at: now, completed_at: now, created_at: now, duration_ms: 1200, retry_count: 1, task_count: 7, total_tokens: 200 }],
    events: [], companies: [], leads: [], approvals: [], proposedActions: [],
  };
}

test("presentation shows completed planning and pending task execution with safe plan context and metrics", () => {
  const view = toWorkspaceView(snapshot());
  assert.equal(view.workflowStages[0].status, "completed");
  assert.equal(view.workflowStages[1].status, "waiting");
  assert.ok(view.workflowTasks.every((task) => task.status === "pending"));
  assert.equal(view.workflowTasks[0].objective, examplePlan.tasks[0].objective);
  assert.deepEqual(view.workflowTasks[1].dependencies, [examplePlan.tasks[0].id]);
  assert.equal(view.plannerRuns?.[0].taskCount, 7);
  assert.equal(view.plannerRuns?.[0].totalTokens, 200);
  assert.equal(view.workflows[0].companyCount, 0);
});

test("failed planning displays an error stage and correctly categorizes workflow failures", () => {
  const data = snapshot();
  data.workflows[0].status = "failed";
  data.tasks = [];
  data.agentRuns[0].status = "failed";
  data.agentRuns[0].output = null;
  data.agentRuns[0].error = { code: "ai_timeout", message: "Planning timed out." };
  data.events.push({ id: randomUUID(), workspace_id: data.workspace.id, workflow_id: data.workflows[0].id, agent_run_id: data.agentRuns[0].id,
    workflow_task_id: null, event_type: "workflow_failed", summary: "Planning failed.", metadata: {}, created_at: data.workflows[0].created_at });
  const view = toWorkspaceView(data);
  assert.equal(view.workflowStages[0].status, "failed");
  assert.equal(view.activity[0].category, "error");
  assert.equal(view.plannerRuns?.[0].error, "Planning timed out.");
  assert.equal(view.workflows[0].errorSummary, "Planning failed.");
});

test("a canonical company belongs to every associated workflow after refresh", () => {
  const data = snapshot(); const companyId = randomUUID(); const originalWorkflow = randomUUID(); const now = data.workflows[0].created_at;
  data.companies.push({ id:companyId,workspace_id:data.workspace.id,workflow_id:originalWorkflow,name:"Canonical SaaS",website:"https://example.com",
    industry:null,location:null,description:null,employee_estimate:null,research_summary:null,research_status:"researched",source_urls:[],
    last_researched_at:now,created_at:now,updated_at:now });
  data.workflowCompanies = [{workflow_id:originalWorkflow,company_id:companyId,research_status:"researched"},
    {workflow_id:data.workflows[0].id,company_id:companyId,research_status:"failed"}];
  const view = toWorkspaceView(data);
  assert.equal(view.workflows[0].companyCount,1);
  assert.equal(view.companies.length,1);
  assert.equal(view.companies[0].workflowResearchStatuses?.[data.workflows[0].id],"failed");
  assert.equal(view.companies[0].workflowResearchStatuses?.[originalWorkflow],"researched");
});
