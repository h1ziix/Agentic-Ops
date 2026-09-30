import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { agentRunRowSchema, companyRowSchema } from "@/lib/validation/rows";
import { researchOutputSchema, researchSourceSchema, targetProfileSchema, validateResearchAnalysis, discoveryOutputSchema, type ResearchSource } from "@/lib/validation/research";
import { normalizeDomain, normalizeCompanyName, normalizeWebsite } from "@/lib/company-identity";
import type { ServerSupabase } from "../auth/context";
import type { AgentRunWriter, CompleteRunInput, StartRunInput } from "../services/agent-run-service";
import type { ResearchCache } from "../agents/research-agent";
import type { ResearchExecutionStore } from "../agents/research-orchestrator";
import { CompanyRepository } from "./entity-repositories";
import { RESEARCH_LIMITS } from "../agents/research-budget";
import { TAVILY_SEARCH_OPTIONS } from "../agents/tavily-provider";
import { fromDatabaseError, AppError } from "../errors";
import { parseDatabaseResult } from "./parse";

export class ResearchRepository implements AgentRunWriter, ResearchExecutionStore {
  constructor(private readonly supabase: ServerSupabase) {}
  listCompanies(workspaceId: string) { return new CompanyRepository(this.supabase).listWorkspaceCompanies(workspaceId); }
  async listItems(workspaceId: string, workflowId: string) {
    const { data, error } = await this.supabase.from("workflow_companies").select("research_status,companies(*)")
      .eq("workspace_id", workspaceId).eq("workflow_id", workflowId).order("created_at");
    if (error) throw fromDatabaseError("list_research_items", error);
    const rows = parseDatabaseResult(z.array(z.object({ research_status: z.enum(["queued", "researching", "researched", "failed"]), companies: companyRowSchema })), data, "list_research_items");
    return rows.map((row) => ({ company: row.companies, status: row.research_status }));
  }
  async start(input: StartRunInput) {
    if (input.agentType !== "researcher" || !input.workflowTaskId) throw new AppError("validation");
    const { data, error } = await this.supabase.rpc("start_research_task_run", { p_run_id: input.runId, p_user_id: input.userId,
      p_workspace_id: input.workspaceId, p_workflow_id: input.workflowId, p_task_id: input.workflowTaskId, p_model: input.model, p_input: input.input });
    if (error) throw fromDatabaseError("start_research_task_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "start_research_task_run");
  }
  async complete(input: CompleteRunInput) {
    const output = input.status === "completed" ? z.object({ kind: z.string() }).passthrough().parse(input.output) : null;
    let payload = input.output;
    if (output?.kind === "define_target_profile") payload = { kind: output.kind, profile: targetProfileSchema.parse(output.profile) };
    if (output?.kind === "discover_companies") {
      const discovery = discoveryOutputSchema.parse({ summary: output.summary, candidates: output.candidates });
      const sources = z.array(researchSourceSchema).max(30).parse(output.sources);
      payload = { kind: output.kind, summary: discovery.summary, candidates: discovery.candidates.map((company) => {
        const source = sources.find((entry) => entry.id === company.sourceId);
        if (!source) throw new AppError("validation");
        return { ...company, website: company.website ? normalizeWebsite(company.website) : null, normalizedDomain: company.website ? normalizeDomain(company.website) : null,
          normalizedName: normalizeCompanyName(company.name), source: { url: source.url, title: source.title, type: "search_result", accessedAt: source.retrievedAt } };
      }) };
    }
    if (output?.kind === "research_companies" && output.result) {
      const result = researchOutputSchema.parse(output.result);
      result.analysis = validateResearchAnalysis(result.analysis, result.sources);
      // Store only sources actually cited by facts or opportunity/qualification assessments.
      const cited = new Set([...result.analysis.facts.map((fact) => fact.sourceId), ...result.analysis.lead.sourceIds,
        ...result.analysis.automationOpportunities.flatMap((opportunity) => opportunity.sourceIds)]);
      result.sources = result.sources.filter((source) => cited.has(source.id));
      payload = { kind: output.kind, companyId: z.uuid().parse(output.companyId), result };
    }
    const { data, error } = await this.supabase.rpc("complete_research_task_run", {
      p_run_id: input.runId, p_status: input.status, p_output: payload ?? null, p_error: input.error ?? null, p_metrics: input.metrics,
    });
    if (error) throw fromDatabaseError("complete_research_task_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "complete_research_task_run");
  }
  async finishBoundary(workspaceId: string, workflowId: string, userId: string) {
    const { error } = await this.supabase.rpc("finish_research_workflow", { p_workspace_id: workspaceId, p_workflow_id: workflowId, p_user_id: userId });
    if (error) throw fromDatabaseError("finish_research_workflow", error);
  }
}

/** Workspace-scoped, bounded, 24-hour evidence cache; never exposed as a browser table. */
export class SupabaseResearchCache implements ResearchCache {
  constructor(private readonly supabase: ServerSupabase, private readonly workspaceId: string) {}
  private key(query: string, domain: string) {
    return createHash("sha256").update(JSON.stringify({ version: 2, query, domain, options: TAVILY_SEARCH_OPTIONS })).digest("hex");
  }
  async get(query: string, domain: string) {
    const { data, error } = await this.supabase.from("research_cache").select("sources")
      .eq("workspace_id", this.workspaceId).eq("cache_key", this.key(query, domain)).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw fromDatabaseError("get_research_cache", error);
    return data ? parseDatabaseResult(z.array(researchSourceSchema).max(12), data.sources, "get_research_cache") : null;
  }
  async set(query: string, domain: string, sources: ResearchSource[]) {
    const { error } = await this.supabase.from("research_cache").upsert({ workspace_id: this.workspaceId,
      cache_key: this.key(query, domain), sources, expires_at: new Date(Date.now() + RESEARCH_LIMITS.cacheTtlMs).toISOString(),
    }, { onConflict: "workspace_id,cache_key" });
    if (error) throw fromDatabaseError("save_research_cache", error);
  }
}
