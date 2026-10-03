import assert from "node:assert/strict";
import test from "node:test";
import { companyIntelligence, leadMatchesFilters, prospectUrl, readLeadFilters } from "./prospect-filters";
import type { Company, Lead, Workflow } from "../types/domain";

const company: Company = {
  id: "company", workflowId: "workflow", workflowResearchStatuses: { workflow: "researched", second: "researched" },
  name: "Payments Example", website: "https://example.com", industry: "Ecommerce", location: "Kazakhstan", description: "Recorded company",
  employeeEstimate: "Unknown", sourceUrls: ["https://example.com", "https://example.com"], researchSummary: "Recorded research",
  opportunity: "Customer support ticket classification", score: 90, researchStatus: "researched", lastResearchedAt: "2026-10-01T09:00:00Z",
  createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-01T09:00:00Z",
};
const lead: Lead = {
  id: "lead", companyId: company.id, workflowId: "workflow", status: "qualified", score: 72, scoreReason: "Recorded score",
  opportunity: "Support ticket automation", confidence: "medium", outreachStatus: "waiting_approval",
  createdAt: "2026-10-01T23:30:00-05:00", updatedAt: "2026-10-03T10:00:00Z",
  researchContext: { description: "Saved company", industry: "Payments", location: "Kazakhstan", employeeEstimate: "Unknown", researchSummary: "Saved research", sourceUrls: [] },
};
const workflow: Workflow = {
  id: "workflow", title: "Fintech research", goal: "Research fintech companies", status: "running", progress: 60,
  currentStep: "Research", targetCompanies: 5, companyCount: 1, qualifiedLeadCount: 1, pendingApprovalCount: 1,
  icpId: "original-icp", createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-03T10:00:00Z",
};
const filters = (query = "") => readLeadFilters(new URLSearchParams(query));

test("URL filters accept valid zero bounds and discard unsupported values without hiding every record", () => {
  const parsed = filters("view=unexpected&stage=admin&sort=chaos&confidence=very-high&minScore=0&maxScore=101&from=2026-02-30");
  assert.equal(parsed.view, "all"); assert.equal(parsed.status, "all"); assert.equal(parsed.sort, "score");
  assert.equal(parsed.confidence, "all"); assert.equal(parsed.minScore, 0); assert.equal(parsed.maxScore, null); assert.equal(parsed.from, "");
  assert.equal(leadMatchesFilters(lead, company, workflow, parsed), true);
});

test("combined workflow, original ICP, score, confidence and normalized historical industry filters match only saved criteria", () => {
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("workflow=workflow&icp=original-icp&confidence=medium&minScore=70&maxScore=80&industry=Fintech&opportunity=Customer+support&outreach=waiting_approval")), true);
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("industry=Ecommerce")), false);
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("icp=edited-icp")), false);
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("minScore=80&maxScore=70")), false);
  assert.equal(leadMatchesFilters({ ...lead, score: null }, company, workflow, filters("minScore=0")), false);
});

test("reply absence and a responded lead status remain unavailable unless a reply observation was persisted", () => {
  assert.equal(leadMatchesFilters({ ...lead, status: "responded" }, company, workflow, filters("reply=detected")), false);
  assert.equal(leadMatchesFilters({ ...lead, status: "responded" }, company, workflow, filters("reply=unavailable")), true);
  assert.equal(leadMatchesFilters({ ...lead, replyStatus: "detected" }, company, workflow, filters("reply=detected")), true);
  assert.equal(leadMatchesFilters({ ...lead, confidence: null }, company, workflow, filters("confidence=unknown")), true);
});

test("creation dates are inclusive UTC dates and never fall back to recently edited timestamps", () => {
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("from=2026-10-02&to=2026-10-02")), true);
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("to=2026-10-01")), false);
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("from=2026-10-03")), false);
  assert.equal(leadMatchesFilters({ ...lead, createdAt: undefined }, company, workflow, filters("from=2026-10-01")), false);
  assert.equal(leadMatchesFilters(lead, company, workflow, filters("from=2026-10-03&to=2026-10-01")), false);
});

test("opening and closing drawers preserve URL filters and encode an identifier as data", () => {
  const opened = prospectUrl("/leads", "workflow=workflow&minScore=70", { lead: "a&stage=rejected" });
  const params = new URLSearchParams(opened.split("?")[1]);
  assert.equal(params.get("lead"), "a&stage=rejected"); assert.equal(params.has("stage"), false);
  assert.equal(prospectUrl("/leads", params.toString(), { lead: null }), "/leads?workflow=workflow&minScore=70");
  assert.equal(prospectUrl("/companies", "company=company&industry=Fintech", { industry: "all" }), "/companies?company=company");
});

test("company latest score uses assessment creation, preserves a new unknown score and counts distinct associations", () => {
  const oldEdited = { ...lead, id: "old", score: 99, createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-03T20:00:00Z" };
  const newUnscored = { ...lead, id: "new", workflowId: "third", score: null, confidence: null, createdAt: "2026-10-02T08:00:00Z", updatedAt: "2026-10-02T08:00:00Z" };
  const summary = companyIntelligence(company, [oldEdited, newUnscored]);
  assert.equal(summary.latestScore, null); assert.equal(summary.confidence, null); assert.equal(summary.workflowCount, 3);
  assert.equal(summary.sourceCount, 1); assert.equal(summary.opportunity, "Customer support");
  assert.equal(companyIntelligence({ ...company, workflowId: null, workflowResearchStatuses: {} }, []).workflowCount, 0);
});
