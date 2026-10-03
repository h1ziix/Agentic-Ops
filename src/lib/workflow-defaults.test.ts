import assert from "node:assert/strict";
import test from "node:test";
import { workflowDefaults } from "./workflow-defaults";
import type { IdealCustomerProfile, StrategyLibrary, WorkflowTemplate } from "../types/strategy";

const timestamps = { workspace_id: "workspace", created_by: "owner", created_at: "2026-10-01T08:00:00Z", updated_at: "2026-10-01T08:00:00Z", archived_at: null };
const icp = (id: string, count: number): IdealCustomerProfile => ({ ...timestamps, id, name: `${id} profile`, description: "",
  industries: [], locations: [], company_size_min: null, company_size_max: null, business_models: [], required_signals: [],
  preferred_signals: [], excluded_signals: [], automation_focus: [], minimum_lead_score: 60, default_company_count: count });
const template = (id: string, icpId: string | null): WorkflowTemplate => ({ ...timestamps, id, name: `${id} template`, description: "",
  category: "Research", default_goal: `Research ${id} companies and qualify their opportunities.`, task_strategy: "Use public evidence",
  default_icp_id: icpId, default_company_count: 5, approval_required: true, followup_enabled: false });
const library: StrategyLibrary = { icps: [icp("fintech", 8), icp("saas", 10), icp("chosen", 12)], templates: [template("first", "fintech"), template("second", "saas")] };

test("switching templates follows their current default profile when no explicit ICP was selected", () => {
  assert.equal(workflowDefaults(library, "first").icpId, "fintech");
  const second = workflowDefaults(library, "second");
  assert.equal(second.icpId, "saas"); assert.equal(second.goal, library.templates[1].default_goal);
  assert.equal(second.targetCompanies, "5");
});

test("an explicit profile override survives template changes while the template supplies guidance defaults", () => {
  assert.equal(workflowDefaults(library, "first", "chosen").icpId, "chosen");
  assert.equal(workflowDefaults(library, "second", "chosen").icpId, "chosen");
  assert.equal(workflowDefaults(library, undefined, "chosen").targetCompanies, "12");
});

test("removing a template clears its inherited criteria but preserves an explicit profile", () => {
  assert.equal(workflowDefaults(library).icpId, ""); assert.equal(workflowDefaults(library).goal, "");
  const explicit = workflowDefaults(library, undefined, "chosen");
  assert.equal(explicit.icpId, "chosen"); assert.match(explicit.goal, /chosen profile/);
});

test("archived sources are never silently selected as workflow defaults", () => {
  const archived: StrategyLibrary = { ...library, icps: library.icps.map((profile) => ({ ...profile, archived_at: "2026-10-03T08:00:00Z" })) };
  assert.equal(workflowDefaults(archived, "first").icpId, "");
  const archivedTemplate: StrategyLibrary = { ...library, templates: library.templates.map((item) => ({ ...item, archived_at: "2026-10-03T08:00:00Z" })) };
  assert.equal(workflowDefaults(archivedTemplate, "first").templateId, ""); assert.equal(workflowDefaults(archivedTemplate, "first").icpId, "");
});
