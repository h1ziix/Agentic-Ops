import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { agentRunRowSchema, companyRowSchema } from "@/lib/validation/rows";
import { researchOutputSchema, researchSourceSchema, validateResearchAnalysis, type ResearchSource } from "@/lib/validation/research";
import type { ServerSupabase } from "../auth/context";
import type { AgentRunWriter, CompleteRunInput, StartRunInput } from "../services/agent-run-service";
import type { ResearchCache } from "../agents/research-agent";
import { RESEARCH_LIMITS } from "../agents/research-budget";
import { TAVILY_SEARCH_OPTIONS } from "../agents/tavily-provider";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export class ResearchRepository implements AgentRunWriter {
  constructor(private readonly supabase: ServerSupabase) {}
  async getCompany(workspaceId: string, companyId: string) {
    const { data, error } = await this.supabase.from("companies").select("*").eq("workspace_id", workspaceId).eq("id", companyId).maybeSingle();
    if (error) throw fromDatabaseError("get_research_company", error);
    return data ? parseDatabaseResult(companyRowSchema, data, "get_research_company") : null;
  }
  async start(input: StartRunInput) {
    const { data, error } = await this.supabase.rpc("start_research_run", { p_run_id: input.runId, p_user_id: input.userId,
      p_workspace_id: input.workspaceId, p_workflow_id: input.workflowId, p_model: input.model, p_input: input.input });
    if (error) throw fromDatabaseError("start_research_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "start_research_run");
  }
  async complete(input: CompleteRunInput) {
    const output = input.status === "completed" ? researchOutputSchema.parse(input.output) : null;
    if (output) validateResearchAnalysis(output.analysis, output.sources);
    const { data, error } = await this.supabase.rpc("complete_research_run", {
      p_run_id: input.runId, p_status: input.status, p_output: output, p_error: input.error ?? null, p_metrics: input.metrics,
    });
    if (error) throw fromDatabaseError("complete_research_run", error);
    return parseDatabaseResult(agentRunRowSchema, data, "complete_research_run");
  }
}

/** Workspace-scoped, bounded, 24-hour evidence cache; never exposed as a browser table. */
export class SupabaseResearchCache implements ResearchCache {
  constructor(private readonly supabase: ServerSupabase, private readonly workspaceId: string) {}
  private key(query: string, domain: string) {
    return createHash("sha256").update(JSON.stringify({ version: 1, query, domain, options: TAVILY_SEARCH_OPTIONS })).digest("hex");
  }
  async get(query: string, domain: string) {
    const { data, error } = await this.supabase.from("research_cache").select("sources")
      .eq("workspace_id", this.workspaceId).eq("cache_key", this.key(query, domain)).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw fromDatabaseError("get_research_cache", error);
    return data ? parseDatabaseResult(z.array(researchSourceSchema).max(4), data.sources, "get_research_cache") : null;
  }
  async set(query: string, domain: string, sources: ResearchSource[]) {
    const { error } = await this.supabase.from("research_cache").upsert({ workspace_id: this.workspaceId,
      cache_key: this.key(query, domain), sources, expires_at: new Date(Date.now() + RESEARCH_LIMITS.cacheTtlMs).toISOString(),
    }, { onConflict: "workspace_id,cache_key" });
    if (error) throw fromDatabaseError("save_research_cache", error);
  }
}
