import "server-only";
import { z } from "zod";
import { publicWebsiteSchema, type ResearchSource } from "@/lib/validation/research";
import { RESEARCH_LIMITS, ResearchError } from "./research-budget";
import { providerJson } from "./provider-http";

export interface SearchProvider { search(query: string, domain: string, timeoutMs: number): Promise<ResearchSource[]> }
export const TAVILY_SEARCH_OPTIONS = Object.freeze({ search_depth: "basic", topic: "general", max_results: RESEARCH_LIMITS.resultsPerSearch,
  include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false, include_usage: true });

const responseSchema = z.object({ results: z.array(z.object({ url: z.string(), title: z.string(), content: z.string(), score: z.number().min(0).max(1) })).max(20) });

export function normalizeTavilySources(response: unknown): ResearchSource[] {
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) throw new ResearchError("ai_invalid_output", "tavily");
  const seen = new Set<string>();
  return parsed.data.results.flatMap((result) => {
    if (!publicWebsiteSchema.safeParse(result.url).success || !result.content.trim()) return [];
    const canonical = new URL(result.url); canonical.hash = "";
    if (seen.has(canonical.href)) return [];
    seen.add(canonical.href);
    return [{ id: `source_${seen.size}`, url: result.url, title: (result.title.trim() || canonical.hostname).slice(0, 500),
      content: result.content.trim().slice(0, RESEARCH_LIMITS.sourceCharacters), relevance: result.score, retrievedAt: new Date().toISOString() }];
  }).slice(0, RESEARCH_LIMITS.resultsPerSearch);
}

export class TavilyProvider implements SearchProvider {
  async search(query: string, domain: string, timeoutMs: number) {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new ResearchError("ai_configuration", "tavily");
    const response = await providerJson("tavily", "https://api.tavily.com/search", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...TAVILY_SEARCH_OPTIONS, query, include_domains: [domain] }),
    }, Math.min(timeoutMs, 20_000));
    return normalizeTavilySources(response);
  }
}
