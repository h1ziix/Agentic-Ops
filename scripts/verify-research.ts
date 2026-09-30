import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { createRuntimeClient } from "../src/lib/supabase/admin";
import { researchOutputSchema, validateResearchAnalysis } from "../src/lib/validation/research";
import { ResearchRepository, SupabaseResearchCache } from "../src/server/repositories/research-repository";
import { AgentEventRepository } from "../src/server/repositories/agent-repositories";
import { AgentRunService } from "../src/server/services/agent-run-service";
import { EventService } from "../src/server/services/event-service";
import { AgentRuntime } from "../src/server/agents/agent-runtime";
import { ResearchAgent } from "../src/server/agents/research-agent";
import { ResearchOrchestrator } from "../src/server/agents/research-orchestrator";
import { GeminiProvider } from "../src/server/agents/gemini-provider";
import { TavilyProvider } from "../src/server/agents/tavily-provider";
import { getResearchModel } from "../src/server/agents/config";

async function verify() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const argument = (name: string) => args[args.indexOf(name) + 1];
  if (!args.includes("--workspace") || !args.includes("--user")) throw new Error("Provide --workspace UUID and --user UUID for the authorized workspace member.");
  const workspaceId = z.uuid().parse(argument("--workspace"));
  const userId = z.uuid().parse(argument("--user"));
  for (const key of ["GEMINI_API_KEY", "TAVILY_API_KEY"]) assert.ok(process.env[key]?.trim(), `${key} must be configured on the server`);
  const admin = createRuntimeClient();
  const membership = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).single();
  if (membership.error || !membership.data) throw new Error("The verification user must belong to the selected workspace.");
  const goal = "Research Linear using its public website evidence, score its fit for AI workflow automation and prepare personalized outreach for human approval.";
  const existingWorkflowId = args.includes("--workflow") ? z.uuid().parse(argument("--workflow")) : null;
  const workflow = existingWorkflowId ? await admin.from("workflows").select("id,goal,title").eq("id", existingWorkflowId).eq("workspace_id", workspaceId).single()
    : await admin.from("workflows").insert({ workspace_id: workspaceId, created_by: userId,
      title: "Linear — live research verification", goal, status: "running", target_companies: 1, current_step: "Company supplied for live research verification" }).select("id,goal,title").single();
  if (workflow.error || !workflow.data) throw new Error("Could not create the verification workflow.");
  assert.equal(workflow.data.goal, goal); assert.equal(workflow.data.title, "Linear — live research verification");
  const workflowId = z.uuid().parse(workflow.data.id);
  const model = getResearchModel();
  console.log(JSON.stringify({ stage: "live_research_started", workflowId, model, company: "Linear", website: "https://linear.app" }));
  const events = new EventService(new AgentEventRepository(admin));
  if (!existingWorkflowId) await events.record({ workspaceId, workflowId, eventType: "workflow_created", summary: "Linear supplied for the requested live research verification", metadata: { source: "manual_verification" } });
  const agent = new ResearchAgent(new TavilyProvider(), new GeminiProvider(), new SupabaseResearchCache(admin, workspaceId));
  const orchestrator = new ResearchOrchestrator(new AgentRunService(new ResearchRepository(admin)), events, new AgentRuntime(null, undefined, agent));
  const result = await orchestrator.researchCompany({ userId, workspaceId, workflowId }, { name: "Linear", website: "https://linear.app", goal,
    icp: { description: "B2B SaaS product teams that could benefit from AI workflow automation; prioritize software tools with integrations and evidence of repeatable team workflows.",
      offering: "Agentic Ops provides evidence-based AI sales research and personalized outreach drafts with human approval before outbound actions." } }, model);
  assert.equal(result.status, "awaiting_approval");
  const [run, company, lead, approval, actions, savedWorkflow, savedEvents] = await Promise.all([
    admin.from("agent_runs").select("*").eq("id", result.runId).single(),
    admin.from("companies").select("*").eq("workflow_id", workflowId).single(),
    admin.from("leads").select("*").eq("workflow_id", workflowId).single(),
    admin.from("approvals").select("*").eq("workflow_id", workflowId).single(),
    admin.from("proposed_actions").select("*").eq("workflow_id", workflowId),
    admin.from("workflows").select("status").eq("id", workflowId).single(),
    admin.from("agent_events").select("event_type,summary,metadata,created_at").eq("workflow_id", workflowId).order("created_at"),
  ]);
  for (const response of [run, company, lead, approval, actions, savedWorkflow, savedEvents]) assert.equal(response.error, null);
  const output = researchOutputSchema.parse(run.data?.output); validateResearchAnalysis(output.analysis, output.sources);
  const liveQueries = savedEvents.data?.filter((event) => event.event_type === "tool_completed" && event.metadata.tool_name === "tavily_search" && event.metadata.cached === 0);
  assert.ok(liveQueries?.length, "Live verification requires actual Tavily searches in this workflow's trace");
  assert.ok(output.sources.length > 0); assert.ok(output.budget.modelRequests > 0);
  assert.deepEqual(company.data?.source_urls, output.sources.map((source) => source.url));
  assert.equal(lead.data?.score, output.analysis.lead.score); assert.equal(lead.data?.outreach_status, "waiting_approval");
  assert.equal(approval.data?.status, "pending"); assert.equal(savedWorkflow.data?.status, "waiting_for_approval");
  assert.equal(actions.data?.length, 1); assert.equal(actions.data?.[0].status, "waiting_for_approval"); assert.equal(actions.data?.[0].executed_at, null);
  assert.equal(actions.data?.[0].payload.body, output.analysis.outreach.body);
  const before = savedEvents.data?.length;
  const replay = await orchestrator.researchCompany({ userId, workspaceId, workflowId }, { name: "Linear", website: "https://linear.app", goal,
    icp: { description: "B2B SaaS product teams that could benefit from AI workflow automation; prioritize software tools with integrations and evidence of repeatable team workflows.",
      offering: "Agentic Ops provides evidence-based AI sales research and personalized outreach drafts with human approval before outbound actions." } }, model);
  assert.equal(replay.runId, result.runId);
  const replayEvents = await admin.from("agent_events").select("id", { count: "exact", head: true }).eq("workflow_id", workflowId);
  assert.equal(replayEvents.count, before, "Idempotent replay must not call providers or append events");
  const report = { verifiedAt: new Date().toISOString(), workflowId, runId: result.runId, model, ...output,
    tavilyQueriesPerformed: liveQueries?.map((event) => event.metadata.query), resumedFromCachedEvidence: Boolean(existingWorkflowId),
    savedCompany: company.data, savedLead: lead.data, approvalId: approval.data?.id, approvalStatus: approval.data?.status,
    workflowStatus: savedWorkflow.data?.status, actionStatus: actions.data?.[0].status, executedAt: actions.data?.[0].executed_at,
    metrics: { durationMs: run.data?.duration_ms, totalTokens: run.data?.total_tokens, retries: run.data?.retry_count },
    idempotentReplayVerified: true, events: savedEvents.data };
  const directory = path.resolve("output/research"); await mkdir(directory, { recursive: true });
  const file = path.join(directory, "linear-verification.json"); await writeFile(file, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ stage: "live_research_verified", report: file, model, queries: output.queries, sources: output.sources.map((source) => source.url),
    company: output.analysis.company, icp: output.analysis.icp, lead: output.analysis.lead, outreach: output.analysis.outreach,
    approvalStatus: report.approvalStatus, workflowStatus: report.workflowStatus, budget: output.budget, metrics: report.metrics, idempotentReplayVerified: true }, null, 2));
}

verify().catch((error: unknown) => {
  // Never print raw provider, auth or database responses.
  console.error("Live research verification failed", { code: error instanceof Error && "code" in error ? error.code : "verification_failed",
    message: error instanceof Error ? error.message : "Verification could not be completed" });
  process.exitCode = 1;
});
