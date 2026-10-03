import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { icpInputSchema, templateInputSchema, icpSnapshotSchema, icpAgentContext } from "@/lib/validation/strategy";
import { newWorkflowSchema } from "@/lib/validation/workflow";
import { matchedExcludedSignals, strategyReviewBlockers, icpQualificationThreshold } from "@/lib/strategy-eligibility";
import type { IcpInput, TemplateInput, IdealCustomerProfile, WorkflowTemplate } from "@/types/strategy";
import type { WorkspaceContext } from "../auth/context";
import type { StrategyStore } from "../repositories/strategy-repository";
import { StrategyService } from "./strategy-service";
import { AppError } from "../errors";
import { outreachFixture } from "../agents/testing/outreach-fixtures";
import { validateReviewerOutput, reviewInputFromResearch } from "@/lib/validation/outreach";
import { plannerInputSchema } from "@/lib/validation/planner";
import { researchInputSchema, workflowResearchInputSchema } from "@/lib/validation/research";

const workspace = randomUUID(); const otherWorkspace = randomUUID(); const creator = randomUUID();
const now = "2026-10-03T10:00:00.000Z";
const input = icpInputSchema.parse({ name: "Kazakhstan Fintech", industries: ["FinTech"], locations: ["Kazakhstan"],
  preferredSignals: ["digital products"], excludedSignals: ["gambling"], automationFocus: ["customer support"], minimumLeadScore: 75 });
const templateInput = templateInputSchema.parse({ name: "Fintech Opportunity Research", defaultGoal: "Research fintech companies for evidence-backed automation opportunities.",
  taskStrategy: "Prioritize first-party product evidence." });
function icpRow(values: IcpInput): IdealCustomerProfile {
  return { id: randomUUID(), workspace_id: workspace, name: values.name, description: values.description, industries: values.industries,
    locations: values.locations, company_size_min: values.companySizeMin, company_size_max: values.companySizeMax, business_models: values.businessModels,
    required_signals: values.requiredSignals, preferred_signals: values.preferredSignals, excluded_signals: values.excludedSignals,
    automation_focus: values.automationFocus, minimum_lead_score: values.minimumLeadScore, default_company_count: values.defaultCompanyCount,
    created_by: creator, created_at: now, updated_at: now, archived_at: null };
}
function templateRow(values: TemplateInput): WorkflowTemplate {
  return { id: randomUUID(), workspace_id: workspace, name: values.name, description: values.description, category: values.category,
    default_goal: values.defaultGoal, task_strategy: values.taskStrategy, default_icp_id: values.defaultIcpId,
    default_company_count: values.defaultCompanyCount, approval_required: values.approvalRequired, followup_enabled: values.followupEnabled,
    created_by: creator, created_at: now, updated_at: now, archived_at: null };
}
function serviceFixture() {
  const icps = [icpRow(input), { ...icpRow(input), workspace_id: otherWorkspace }];
  const templates = [templateRow(templateInput)];
  let writes = 0;
  const store: StrategyStore = {
    listIcps: async (ws, archived) => icps.filter((row) => row.workspace_id === ws && (archived || !row.archived_at)),
    listTemplates: async (ws, archived) => templates.filter((row) => row.workspace_id === ws && (archived || !row.archived_at)),
    mutateIcp: async (ws, operation, id, values) => {
      writes++;
      if (operation === "create") { const row = icpRow(values!); icps.push(row); return row; }
      const row = icps.find((entry) => entry.workspace_id === ws && entry.id === id);
      if (!row) throw new AppError("not_found");
      if (row.archived_at && operation !== "archive") throw new AppError("validation");
      if (operation === "archive") { row.archived_at = now; return row; }
      if (operation === "duplicate") { const copy = { ...structuredClone(row), id: randomUUID(), name: `${row.name} (copy)` }; icps.push(copy); return copy; }
      const updated = { ...icpRow(values!), id: row.id }; Object.assign(row, updated); return row;
    },
    mutateTemplate: async (ws, operation, id, values) => {
      writes++;
      if (operation === "create") { const row = templateRow(values!); templates.push(row); return row; }
      const row = templates.find((entry) => entry.workspace_id === ws && entry.id === id);
      if (!row) throw new AppError("not_found");
      if (row.archived_at && operation !== "archive") throw new AppError("validation");
      if (operation === "archive") { row.archived_at = now; return row; }
      if (operation === "duplicate") { const copy = { ...structuredClone(row), id: randomUUID(), name: `${row.name} (copy)` }; templates.push(copy); return copy; }
      Object.assign(row, { ...templateRow(values!), id: row.id }); return row;
    },
  };
  const context = { workspace: { id: workspace } } as WorkspaceContext;
  return { service: new StrategyService(context, store), icps, templates, writes: () => writes };
}

test("ICP validation supplies bounded defaults, deduplicates criteria and rejects contradictory size/signals", () => {
  assert.equal(icpInputSchema.parse({ name: "Minimal ICP" }).defaultCompanyCount, 10);
  assert.equal(icpInputSchema.parse({ name: "Minimal ICP" }).minimumLeadScore, 60);
  assert.deepEqual(icpInputSchema.parse({ name: "Clean ICP", industries: [" FinTech ", "fintech"] }).industries, ["fintech"]);
  for (const change of [{ companySizeMin: 200, companySizeMax: 50 }, { minimumLeadScore: 101 }, { defaultCompanyCount: 21 },
    { requiredSignals: ["gambling"], excludedSignals: ["Gambling"] }, { workspaceId: otherWorkspace }, { industries: [""] }]) {
    assert.equal(icpInputSchema.safeParse({ name: "Invalid ICP", ...change }).success, false);
  }
});
test("template validation keeps approval mandatory and strategy declarative", () => {
  assert.equal(templateInput.approvalRequired, true); assert.equal(templateInput.followupEnabled, false);
  assert.equal(templateInputSchema.safeParse({ ...templateInput, approvalRequired: false }).success, false);
  assert.equal(templateInputSchema.safeParse({ ...templateInput, defaultIcpId: "other" }).success, false);
  assert.equal(templateInputSchema.safeParse({ ...templateInput, defaultGoal: "short" }).success, false);
});
test("strategy service scopes reads and mutations to authorized server workspace and validates before writes", async () => {
  const state = serviceFixture(); assert.equal((await state.service.list()).icps.length, 1);
  assert.throws(() => state.service.saveIcp({ ...input, workspaceId: otherWorkspace }), AppError);
  assert.throws(() => state.service.saveTemplate({ ...templateInput, approvalRequired: false }), AppError);
  assert.equal(state.writes(), 0);
  await assert.rejects(() => state.service.archiveIcp(state.icps[1].id), AppError);
  assert.equal(state.icps[1].archived_at, null);
});
test("ICP create/edit/duplicate/archive retain old immutable strategy values and hide archived sources by default", async () => {
  const state = serviceFixture(); const saved = await state.service.saveIcp(input);
  const snapshot = icpSnapshotSchema.parse(structuredClone(saved));
  await state.service.saveIcp({ ...input, minimumLeadScore: 85 }, saved.id);
  assert.equal(snapshot.minimum_lead_score, 75);
  const copy = await state.service.duplicateIcp(saved.id); assert.notEqual(copy.id, saved.id); assert.equal(copy.minimum_lead_score, 85);
  await state.service.archiveIcp(saved.id);
  assert.equal((await state.service.list()).icps.some((row) => row.id === saved.id), false);
  assert.equal((await state.service.list(true)).icps.some((row) => row.id === saved.id), true);
  await assert.rejects(() => state.service.duplicateIcp(saved.id), AppError);
});
test("template create/edit/duplicate/archive use the same workspace-bound mutation lifecycle", async () => {
  const state = serviceFixture(); const saved = await state.service.saveTemplate(templateInput);
  await state.service.saveTemplate({ ...templateInput, taskStrategy: "Use published product sources and review uncertainties." }, saved.id);
  const copy = await state.service.duplicateTemplate(saved.id); assert.notEqual(copy.id, saved.id);
  assert.equal(copy.task_strategy, "Use published product sources and review uncertainties.");
  await state.service.archiveTemplate(saved.id); assert.equal((await state.service.list()).templates.some((row) => row.id === saved.id), false);
  await assert.rejects(() => state.service.saveTemplate(templateInput, saved.id), AppError);
});
test("new workflow accepts strategy references while refusing supplied ownership or forged snapshots", () => {
  const goal = "Explicitly research Kazakhstan payment companies using public product evidence.";
  const parsed = newWorkflowSchema.parse({ goal, targetCompanies: 5, templateId: randomUUID(), icpId: randomUUID() });
  assert.equal(parsed.goal, goal);
  for (const extra of [{ icp_snapshot: input }, { workspaceId: otherWorkspace }, { approvalRequired: false }, { icpId: "not-an-id" }]) {
    assert.equal(newWorkflowSchema.safeParse({ goal, targetCompanies: 5, ...extra }).success, false);
  }
});
test("compact immutable strategy is accepted by Planner and Research without passing unrelated template objects", () => {
  const context = icpAgentContext(icpSnapshotSchema.parse(icpRow(input)))!;
  const goal = "Research Kazakhstan fintech companies and prepare reviewed outreach.";
  const planner = plannerInputSchema.parse({ goal, targetMarket: null, location: null, requestedLeadCount: 5,
    context: { title: "Strategy workflow", approvalRequired: true, icp: context,
      template: { name: templateInput.name, category: templateInput.category, taskStrategy: templateInput.taskStrategy, followupEnabled: false } } });
  assert.equal(planner.context.icp?.minimum_lead_score, 75); assert.equal(planner.goal, goal);
  assert.equal("workspace_id" in context, false); assert.equal("default_goal" in context, false);
  const research = workflowResearchInputSchema.parse({ goal, workflowId: randomUUID(), taskId: randomUUID(), requestedCompanyCount: 5,
    plannerContext: { objective: "Find public sources", expectedOutput: "Cited candidates" }, existingCompanies: [], icpContext: context });
  assert.deepEqual(research.icpContext?.locations, ["Kazakhstan"]);
  assert.equal(researchInputSchema.parse({ name: "Candidate", website: null, goal,
    icp: { description: "Fintech companies with digital products.", offering: "Evidence-backed AI automation services." }, icpContext: context }).icpContext?.minimum_lead_score, 75);
});
test("Reviewer deterministic gate applies saved threshold and supported positive exclusions, preserving score weights", () => {
  const fixture = outreachFixture(); const context = icpAgentContext(icpSnapshotSchema.parse(icpRow(input)))!;
  const saved = reviewInputFromResearch({ ...fixture.input, icpContext: context }, fixture.research);
  assert.equal(validateReviewerOutput(fixture.review, saved).decision, "reject_for_outreach");
  assert.equal(icpQualificationThreshold({ ...context, minimum_lead_score: 20 }), 60);
  assert.deepEqual(matchedExcludedSignals(["gambling"], ["The company operates gambling products."]), ["gambling"]);
  assert.deepEqual(matchedExcludedSignals(["gambling"], ["Company does not offer gambling.", "It may offer gambling."]), []);
  assert.deepEqual(matchedExcludedSignals(["азартные игры"], ["Компания не предлагает азартные игры"]), []);
  assert.deepEqual(matchedExcludedSignals(["bank"], ["Public banking tools"]), []);
  assert.equal(strategyReviewBlockers({ ...context, minimum_lead_score: 60 }, 90, ["Offers gambling products"])[0], "Cited evidence matches saved ICP exclusion: gambling.");
  assert.deepEqual(fixture.input.scoreBreakdown, saved.scoreBreakdown);
});
