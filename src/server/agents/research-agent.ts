import { researchInputSchema, researchOutputSchema, validateResearchAnalysis, type ResearchInput, type ResearchOutput, type ResearchSource } from "@/lib/validation/research";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { RuntimeEvent } from "./agent-runtime";
import type { AnalysisProvider } from "./gemini-provider";
import type { SearchProvider } from "./tavily-provider";
import { RESEARCH_LIMITS, ResearchBudget, ResearchError, type ResearchProvider } from "./research-budget";

export interface ResearchCache {
  get(query: string, domain: string): Promise<ResearchSource[] | null>;
  set(query: string, domain: string, sources: ResearchSource[]): Promise<void>;
}

/** Typed research execution; workflow writes remain owned by the orchestrator. */
export class ResearchAgent {
  constructor(private readonly search: SearchProvider, private readonly analysis: AnalysisProvider, private readonly cache: ResearchCache,
    private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))) {}

  async research(rawInput: ResearchInput, model: string, record: RuntimeEvent, metrics: AgentMetrics): Promise<ResearchOutput> {
    const input = researchInputSchema.parse(rawInput);
    const budget = new ResearchBudget();
    const call = async <T>(provider: ResearchProvider, execute: () => Promise<T>): Promise<T> => {
      for (;;) {
        budget.reserve(provider);
        try { return await execute(); }
        catch (error) {
          if (error instanceof ResearchError) await record(provider === "tavily" ? "tool_failed" : "error", `${provider} request failed safely`, {
            provider, error_code: error.code, http_status: error.httpStatus ?? 0, retry_after_ms: error.retryAfterMs,
          });
          if (!(error instanceof ResearchError) || !budget.retry(error)) throw error;
          metrics.retryCount = budget.retryCount;
          await record("retry", `Retrying ${provider} within the shared research budget`, { provider, delay_ms: error.retryAfterMs });
          await this.wait(error.retryAfterMs);
        }
      }
    };
    const domain = new URL(input.website).hostname.replace(/^www\./, "");
    const name = input.name.replace(/[\r\n"]/g, " ");
    const queries = [`site:${domain} ${name} product customers features`, `site:${domain} ${name} integrations automation AI workflows`];
    const sources: ResearchSource[] = [];
    const trace: ResearchOutput["queries"] = [];
    for (const query of queries.slice(0, RESEARCH_LIMITS.searches)) {
      await record("tool_called", "Research requested Tavily evidence", { tool_name: "tavily_search", query, search_depth: "basic" });
      let results = await this.cache.get(query, domain);
      const cached = results !== null;
      if (results) budget.cacheHits++;
      else {
        results = await call("tavily", () => this.search.search(query, domain, budget.remainingMs()));
        // Persist immediately: retrying Gemini must not spend search credits again.
        await this.cache.set(query, domain, results);
      }
      trace.push({ query, cached, sourceCount: results.length });
      for (const result of results) {
        const url = new URL(result.url); url.hash = "";
        const prior = sources.find((source) => { const previous = new URL(source.url); previous.hash = ""; return previous.href === url.href; });
        if (!prior && sources.length < RESEARCH_LIMITS.sources) sources.push({ ...result, id: `source_${sources.length + 1}` });
      }
      await record("tool_completed", "Tavily evidence normalized", { tool_name: "tavily_search", query, cached: cached ? 1 : 0, source_count: results.length });
    }
    if (!sources.length) throw new ResearchError("ai_invalid_output", "tavily");
    const analysis = await call("gemini", async () => {
      await record("model_request_started", "Gemini analyzing Tavily evidence and drafting outreach for review", { model, source_count: sources.length });
      const result = await this.analysis.analyze(input, sources, model, budget.remainingMs());
      if (result.usage) {
        metrics.inputTokens = (metrics.inputTokens ?? 0) + result.usage.inputTokens;
        metrics.outputTokens = (metrics.outputTokens ?? 0) + result.usage.outputTokens;
        metrics.totalTokens = (metrics.totalTokens ?? 0) + result.usage.totalTokens;
      }
      try { return validateResearchAnalysis(result.output, sources); }
      catch { throw new ResearchError("ai_invalid_output", "gemini"); }
    });
    metrics.taskCount = 1;
    await record("reasoning_summary", "Evidence validation passed; scores and outreach proposal await human review", {
      source_count: sources.length, icp_score: analysis.icp.score, lead_score: analysis.lead.score,
      search_requests: budget.searchRequests, cache_hits: budget.cacheHits,
    });
    return researchOutputSchema.parse({ company: { name: input.name, website: input.website }, sources, analysis,
      queries: trace, budget: budget.snapshot(), approvalRequired: true });
  }
}
