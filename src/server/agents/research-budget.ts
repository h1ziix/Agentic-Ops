import { AppError } from "../errors";
import type { TokenUsage } from "./planner-agent";

export const RESEARCH_LIMITS = Object.freeze({ searches: 2, searchRequests: 3, modelRequests: 2, retries: 1,
  sources: 8, resultsPerSearch: 4, sourceCharacters: 3500, outputTokens: 6000, durationMs: 170_000, cacheTtlMs: 86_400_000 });
export type ResearchProvider = "tavily" | "gemini";

export class ResearchError extends AppError {
  constructor(public override readonly code: "ai_configuration" | "ai_quota_exhausted" | "ai_unavailable" | "ai_timeout" | "ai_invalid_output" | "validation",
    public readonly provider: ResearchProvider, public readonly retryable = false, public readonly retryAfterMs = 1000, public readonly httpStatus?: number,
    public readonly usage: TokenUsage | null = null) {
    super(code, ({ ai_configuration: `${provider} is not configured or accessible. Check the server credentials and model access.`,
      ai_quota_exhausted: `${provider} quota is exhausted. Check provider billing before retrying.`,
      ai_unavailable: `${provider} is temporarily unavailable or rate limited. Please retry later.`,
      ai_timeout: `${provider} research request timed out. Please retry later.`,
      ai_invalid_output: `${provider} returned invalid or unsupported research evidence. Please review the failed item before retrying.`,
      validation: "The research budget was exhausted. No outbound action was performed.", })[code]);
  }
}

export function researchCompanyLimit(requested: number): number {
  const override = Number(process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW ?? 20);
  const ceiling = Number.isInteger(override) && override > 0 ? Math.min(override, 20) : 20;
  return Math.min(requested, ceiling);
}

/** Conservative credit reservations include failed requests and retries. */
export class ResearchBudget {
  private readonly started = Date.now();
  searchRequests = 0;
  modelRequests = 0;
  cacheHits = 0;
  retryCount = 0;

  remainingMs() { return Math.max(0, RESEARCH_LIMITS.durationMs - (Date.now() - this.started)); }
  reserve(provider: ResearchProvider) {
    if (!this.remainingMs()) throw new ResearchError("ai_timeout", provider);
    if (provider === "tavily") {
      if (this.searchRequests >= RESEARCH_LIMITS.searchRequests) throw new ResearchError("validation", provider);
      this.searchRequests++;
    } else {
      if (this.modelRequests >= RESEARCH_LIMITS.modelRequests) throw new ResearchError("validation", provider);
      this.modelRequests++;
    }
  }
  retry(error: ResearchError) {
    if (!error.retryable || this.retryCount >= RESEARCH_LIMITS.retries || error.retryAfterMs > 15_000
      || error.retryAfterMs >= this.remainingMs()) return false;
    this.retryCount++;
    return true;
  }
  snapshot() { return { searchRequests: this.searchRequests, searchCreditsReserved: this.searchRequests,
    modelRequests: this.modelRequests, cacheHits: this.cacheHits }; }
}
