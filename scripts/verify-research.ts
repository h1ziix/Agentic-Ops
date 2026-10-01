import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { createRuntimeClient } from "../src/lib/supabase/admin";
import { researchOutputSchema, calculateLeadScore, validateResearchAnalysis } from "../src/lib/validation/research";
import { normalizeDomain } from "../src/lib/company-identity";

async function verify() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  if (!args.includes("--workflow")) throw new Error("Create a real workflow from the UI, then provide --workflow UUID to verify persisted execution.");
  const workflowId = z.uuid().parse(args[args.indexOf("--workflow") + 1]);
  const admin = createRuntimeClient();
  const workflow = await admin.from("workflows").select("*").eq("id", workflowId).single();
  assert.equal(workflow.error, null);
  const workspaceId = z.uuid().parse(workflow.data?.workspace_id);
  const [tasks, runs, companies, leads, approvals, actions, events] = await Promise.all([
    admin.from("workflow_tasks").select("*").eq("workflow_id", workflowId).order("position"),
    admin.from("agent_runs").select("*").eq("workflow_id", workflowId).order("created_at"),
    admin.from("workflow_companies").select("*,companies(*)").eq("workflow_id", workflowId),
    admin.from("leads").select("*").eq("workflow_id", workflowId),
    admin.from("approvals").select("id").eq("workflow_id", workflowId),
    admin.from("proposed_actions").select("id").eq("workflow_id", workflowId),
    admin.from("agent_events").select("*").eq("workflow_id", workflowId).order("created_at"),
  ]);
  for (const response of [tasks, runs, companies, leads, approvals, actions, events]) assert.equal(response.error, null);
  assert.ok(runs.data?.some((run) => run.agent_type === "planner" && run.status === "completed"));
  const researchRuns = runs.data?.filter((run) => run.agent_type === "researcher") ?? [];
  assert.ok(researchRuns.length);
  const results = researchRuns.flatMap((run) => {
    if (run.status !== "completed" || !run.output?.result) return [];
    const result = researchOutputSchema.parse(run.output.result);
    validateResearchAnalysis(result.analysis, result.sources);
    assert.equal(result.analysis.lead.score, calculateLeadScore(result.analysis.lead.components));
    return [{ companyId: run.input.companyId, result }];
  });
  assert.ok(results.length, "Expected real persisted company research");
  assert.ok(events.data?.some((event) => event.event_type === "tool_completed" && event.metadata.tool_name === "tavily_search" && event.metadata.cached === 0), "Expected real web research, not only cached evidence");
  const supported = ["define_target_profile", "discover_companies", "research_companies", "identify_opportunities", "score_leads"];
  assert.ok(tasks.data?.filter((task) => supported.includes(task.type)).every((task) => task.status === "completed"));
  const preparationRequested = tasks.data?.some((task) => task.type === "generate_outreach");
  if (!preparationRequested) {
    assert.equal(approvals.data?.length, 0); assert.equal(actions.data?.length, 0);
  }
  assert.ok(leads.data?.length, "Expected at least one real qualified lead");
  assert.ok(["running", "paused", "waiting_for_approval", "ready_for_execution", "completed"].includes(workflow.data?.status));
  assert.equal(workflow.data?.progress, Math.floor(100 * (tasks.data?.filter((task) => task.status === "completed").length ?? 0) / (tasks.data?.length ?? 1)));
  for (const lead of leads.data ?? []) {
    assert.equal(lead.workspace_id, workspaceId); assert.ok(["qualified", "waiting_approval", "outreach_ready"].includes(lead.status));
    if (!preparationRequested) assert.equal(lead.outreach_status, "not_started");
    assert.ok(lead.score >= 0 && lead.score <= 100); assert.ok(lead.score_reason); assert.ok(lead.confidence); assert.ok(lead.opportunity);
    assert.equal(lead.score, calculateLeadScore(lead.score_components));
  }
  assert.equal(new Set((leads.data ?? []).map((lead) => lead.company_id)).size, leads.data?.length);
  for (const { companyId, result } of results) {
    const company = companies.data?.find((item) => item.company_id === companyId)?.companies;
    assert.ok(company); assert.equal(company.research_status, "researched");
    // Workspace company summaries can change during another workflow. The run is the immutable evidence record.
    assert.ok(result.sources.length); assert.ok(company.last_researched_at);
  }
  const domains = (companies.data ?? []).filter((item) => item.companies.website)
    .map((item) => normalizeDomain(item.companies.website));
  assert.equal(new Set(domains).size, domains.length);
  const report = { verifiedAt: new Date().toISOString(), workflow: workflow.data, tasks: tasks.data,
    companies: companies.data, leads: leads.data, runs: runs.data, events: events.data,
    checks: { sourcesPersisted: true, rubricVerified: true, researchOnlyGoalProtected: !preparationRequested,
      domainDeduplication: true, actualTaskProgress: true } };
  await mkdir("output/research", { recursive: true });
  await writeFile("output/research/stage4-verification.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ workflowId, researched: results.length, qualifiedLeads: leads.data?.length,
    progress: workflow.data?.progress, status: workflow.data?.status, researchRuns: researchRuns.length, checks: report.checks }));
}
verify().catch((error: unknown) => { console.error("Stage 4 verification failed", { message: error instanceof Error ? error.message : "Verification failed" }); process.exitCode = 1; });
