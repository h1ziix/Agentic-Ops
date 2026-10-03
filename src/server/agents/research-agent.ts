import { researchInputSchema, researchOutputSchema, targetProfileSchema, validateDiscovery, validateResearchAnalysis, workflowResearchInputSchema, type WorkflowResearchInput, type TargetProfile, type ResearchInput, type ResearchOutput, type ResearchSource } from "@/lib/validation/research";
import { deduplicateCompanies, normalizeWebsite } from "@/lib/company-identity";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { RuntimeEvent } from "./agent-runtime";
import type { AnalysisProvider, ResearchPlanningProvider } from "./gemini-provider";
import type { SearchProvider } from "./tavily-provider";
import { RESEARCH_LIMITS, ResearchBudget, ResearchError, type ResearchProvider } from "./research-budget";
import type { TokenUsage } from "./planner-agent";
import { recordTokenUsage } from "../observability/runtime-telemetry";

export interface ResearchCache {
  get(query: string, domain: string): Promise<ResearchSource[] | null>;
  set(query: string, domain: string, sources: ResearchSource[]): Promise<void>;
}

/** Typed research execution; workflow writes remain owned by the orchestrator. */
export class ResearchAgent {
  constructor(private readonly search: SearchProvider, private readonly analysis: AnalysisProvider, private readonly cache: ResearchCache,
    private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), private readonly planning?: ResearchPlanningProvider) {}

  private usage(metrics: AgentMetrics, usage: TokenUsage | null, model: string) {
    recordTokenUsage(metrics, usage, model);
  }

  private async bounded<T>(budget: ResearchBudget, provider: ResearchProvider, record: RuntimeEvent, metrics: AgentMetrics, execute: () => Promise<T>, model?: string): Promise<T> {
    for (;;) {
      budget.reserve(provider);
      try { return await execute(); }
      catch (error) {
        if (provider === "gemini" && model) this.usage(metrics, error instanceof ResearchError ? error.usage : null, model);
        if (provider === "tavily") await record("tool_failed", "Search request failed safely", { tool_name: "tavily_search", provider,
          error_code: error instanceof ResearchError ? error.code : "internal" });
        if (!(error instanceof ResearchError) || !budget.retry(error)) throw error;
        metrics.retryCount = budget.retryCount;
        await record("retry", `Retrying ${provider} within the research budget`, { provider, delay_ms: error.retryAfterMs });
        await this.wait(error.retryAfterMs);
      }
    }
  }

  async profile(raw: WorkflowResearchInput, model: string, record: RuntimeEvent, metrics: AgentMetrics) {
    const input = workflowResearchInputSchema.parse(raw);
    if (!this.planning) throw new ResearchError("ai_configuration", "gemini");
    const budget = new ResearchBudget();
    await record("model_request_started", "Defining the target profile and focused discovery queries", { model });
    const result = await this.bounded(budget, "gemini", record, metrics, () => this.planning!.profile(input, model, budget.remainingMs()), model);
    this.usage(metrics, result.usage, model);
    return targetProfileSchema.parse(result.output);
  }

  async discover(raw: WorkflowResearchInput, profile: TargetProfile, model: string, record: RuntimeEvent, metrics: AgentMetrics) {
    const input = workflowResearchInputSchema.parse(raw);
    if (!this.planning) throw new ResearchError("ai_configuration", "gemini");
    const budget = new ResearchBudget();
    const sources: ResearchSource[] = [];
    for (const query of [...new Set(targetProfileSchema.parse(profile).queries)]) {
      await record("tool_called", "Searching the target market for candidate companies", { tool_name: "tavily_search", query });
      let results = await this.cache.get(query, "");
      const cached = results !== null;
      if (!results) {
        results = await this.bounded(budget, "tavily", record, metrics, () => this.search.search(query, null, budget.remainingMs()));
        await this.cache.set(query, "", results);
      }
      for (const source of results) {
        if (sources.length < 30 && !sources.some((prior) => prior.url === source.url)) sources.push({ ...source, id: `source_${sources.length + 1}` });
      }
      await record("tool_completed", "Discovery search evidence collected", { tool_name: "tavily_search", source_count: results.length, cached: cached ? 1 : 0 });
    }
    if (!sources.length) throw new ResearchError("ai_invalid_output", "tavily");
    await record("model_request_started", "Extracting companies supported by discovery sources", { model, source_count: sources.length });
    const result = await this.bounded(budget, "gemini", record, metrics, () => this.planning!.discover(input, profile, sources, model, budget.remainingMs()), model);
    this.usage(metrics, result.usage, model);
    const valid = validateDiscovery(result.output, sources);
    const candidates = deduplicateCompanies(valid.candidates.map((company) => ({ ...company, website: company.website ? normalizeWebsite(company.website) : null })))
      .slice(0, input.requestedCompanyCount);
    await record("reasoning_summary", "Discovery candidates checked against public source evidence", { candidate_count: candidates.length, source_count: sources.length });
    if (!candidates.length) throw new ResearchError("ai_invalid_output", "gemini");
    return { summary: valid.summary, candidates, sources };
  }

  async research(rawInput: ResearchInput, model: string, record: RuntimeEvent, metrics: AgentMetrics): Promise<ResearchOutput> {
    const input = researchInputSchema.parse(rawInput);
    const budget = new ResearchBudget();
    const call = async <T>(provider: ResearchProvider, execute: () => Promise<T>): Promise<T> => {
      for (;;) {
        budget.reserve(provider);
        try { return await execute(); }
        catch (error) {
          if (provider === "gemini") this.usage(metrics, error instanceof ResearchError ? error.usage : null, model);
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
    let website = input.website;
    if (!website) {
      if (!this.planning) throw new ResearchError("ai_configuration", "gemini");
      const query = `"${input.name.replace(/[\r\n"]/g, " ")}" ${input.location ?? ""} official website`;
      await record("tool_called", "Resolving the company's official website from public search evidence", { tool_name: "tavily_search", query });
      let found = await this.cache.get(query, "resolve");
      const cached = found !== null;
      if (!found) {
        found = await call("tavily", () => this.search.search(query, null, budget.remainingMs()));
        await this.cache.set(query, "resolve", found);
      } else budget.cacheHits++;
      await record("tool_completed", "Official website search completed", { tool_name: "tavily_search", source_count: found.length, cached: cached ? 1 : 0 });
      await record("model_request_started", "Resolving company identity from public website evidence", { model, source_count: found.length });
      const result = await call("gemini", () => this.planning!.resolve(input, found, model, budget.remainingMs()));
      this.usage(metrics, result.usage, model);
      try { website = validateDiscovery(result.output, found).candidates.find((candidate) => candidate.website)?.website ?? null; }
      catch { throw new ResearchError("ai_invalid_output", "gemini"); }
      await record("reasoning_summary", "Official website candidates validated against search sources", { supported_website: website ? 1 : 0 });
      if (!website) throw new ResearchError("ai_invalid_output", "gemini");
      website = normalizeWebsite(website);
    }
    const domain = new URL(website).hostname.replace(/^www\./, "");
    const name = input.name.replace(/[\r\n"]/g, " ");
    const queries = [`site:${domain} ${name} product customers features`, `site:${domain} ${name} integrations automation AI workflows`];
    const sources: ResearchSource[] = [];
    const trace: ResearchOutput["queries"] = [];
    for (const query of queries.slice(0, input.website ? RESEARCH_LIMITS.searches : 1)) {
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
    const analysisResult = await call("gemini", async () => {
      await record("model_request_started", "Analyzing website evidence and qualifying the automation opportunity", { model, source_count: sources.length });
      return this.analysis.analyze({ ...input, website }, sources, model, budget.remainingMs());
    });
    this.usage(metrics, analysisResult.usage, model);
    const analysis = await (async () => {
      try { return validateResearchAnalysis(analysisResult.output, sources); }
      catch (error) {
        const reason = error instanceof Error && ["Unsupported evidence citation", "Unknown evidence source", "Score components must sum to the score", "Unsupported employee estimate"].includes(error.message)
          ? error.message : "Invalid structured assessment";
        await record("error", `Company assessment rejected: ${reason.toLowerCase()}.`, { validation_reason: reason });
        throw new ResearchError("ai_invalid_output", "gemini");
      }
    })();
    metrics.taskCount = 1;
    await record("reasoning_summary", "Company facts and opportunity citations validated against public evidence", {
      source_count: sources.length, lead_score: analysis.lead.score,
      search_requests: budget.searchRequests, cache_hits: budget.cacheHits,
    });
    return researchOutputSchema.parse({ company: { name: input.name, website }, sources, analysis,
      queries: trace, budget: budget.snapshot(), researchOnly: true });
  }
}
