import { test } from "node:test";
import assert from "node:assert/strict";
import { approvals, companies, demoWorkspace, leads, plannerRuns, preparationRuns, researchRuns, workflows, workflowStages } from "./demo-fixture";
import { workspaceHref, workspacePathname } from "./workspace-path";

test("showcase records have coherent counts, fictional contacts and no executable approval capability", () => {
  assert.equal(demoWorkspace.mode, "demo");
  assert.equal(workflows.length, 1);
  const workflow = workflows[0];
  assert.equal(workflow.companyCount, companies.length);
  assert.equal(workflow.qualifiedLeadCount, leads.length);
  assert.equal(workflow.pendingApprovalCount, approvals.filter((approval) => approval.status === "pending").reduce((sum, approval) => sum + approval.recipientCount, 0));
  for (const company of companies) assert.ok(company.website?.endsWith(".example"));
  for (const approval of approvals) for (const action of approval.proposedActions) {
    assert.ok(action.recipientEmail.endsWith(".example"));
    assert.equal(action.envelope, undefined); assert.equal(action.snapshot, undefined);
    assert.ok(action.blockers?.includes("Demo mode disables external execution."));
  }
  assert.ok(workflowStages.every((stage) => stage.status !== "running"));
  assert.ok([...plannerRuns, ...researchRuns, ...preparationRuns].every((run) => run.status === "completed" && run.totalTokens === null));
});
test("demo navigation stays in an explicit namespace without changing auth, APIs, external or similarly named paths", () => {
  assert.equal(workspaceHref("/companies?company=sample", "/demo/dashboard"), "/demo/companies?company=sample");
  assert.equal(workspaceHref("/workflows/sample", "/dashboard"), "/workflows/sample");
  for (const href of ["/api/workflows/sample/execute", "/sign-in", "https://example.com", "/demo/dashboard", "/workflows-evil"]) assert.equal(workspaceHref(href, "/demo/dashboard"), href);
  assert.equal(workspacePathname("/demo/workflows/sample"), "/workflows/sample");
});
