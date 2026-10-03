import { z } from "zod";
import { publicWebsiteSchema, normalizeDomain } from "../company-identity";
import { icpAgentContextSchema } from "./strategy";
export { publicWebsiteSchema } from "../company-identity";

const text = z.string().trim().min(1);
const sourceIds = z.array(z.string().regex(/^source_\d+$/)).min(1).max(8);
export const icpSchema = z.object({ description: text.min(10).max(2000), offering: text.min(10).max(1000) }).strict();
export const researchRequestSchema = z.object({ retry: z.boolean().optional() }).strict();
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export const targetProfileSchema = z.object({
  targetMarket: text.max(500), location: text.max(240).nullable(), industry: text.max(240).nullable(),
  icp: icpSchema, queries: z.array(text.max(500)).min(2).max(3),
}).strict();
export type TargetProfile = z.infer<typeof targetProfileSchema>;
export const workflowResearchInputSchema = z.object({
  workflowId: z.uuid(), taskId: z.uuid(), goal: text.min(24).max(4000),
  requestedCompanyCount: z.number().int().min(1).max(20),
  plannerContext: z.object({ objective: text.max(1000), expectedOutput: text.max(1000) }).strict(),
  existingCompanies: z.array(z.object({ name: text.max(240), website: publicWebsiteSchema.nullable() }).strict()).max(1000),
  icpContext: icpAgentContextSchema.optional(),
}).strict();
export type WorkflowResearchInput = z.infer<typeof workflowResearchInputSchema>;
export const researchInputSchema = z.object({
  name: text.max(240), website: publicWebsiteSchema.nullable(), goal: text.min(10).max(4000), icp: icpSchema,
  location: text.max(240).nullable().optional(),
  icpContext: icpAgentContextSchema.optional(),
}).strict();
export type ResearchInput = z.infer<typeof researchInputSchema>;
export const researchSourceSchema = z.object({
  id: z.string().regex(/^source_\d+$/), url: publicWebsiteSchema,
  title: text.max(500), content: text.max(3500), relevance: z.number().min(0).max(1), retrievedAt: z.iso.datetime(),
}).strict();
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export const storedSourceSchema = z.object({ url: publicWebsiteSchema, title: text.max(500).nullable(),
  type: z.enum(["company_website", "search_result", "news", "directory", "other"]), accessedAt: z.iso.datetime() }).strict();
export const scoreComponentsSchema = z.object({
  icpFit: z.number().int().min(0).max(25), automationPotential: z.number().int().min(0).max(30),
  operationalSignals: z.number().int().min(0).max(20), evidenceQuality: z.number().int().min(0).max(15),
  reachability: z.number().int().min(0).max(10),
}).strict();
export function calculateLeadScore(components: z.infer<typeof scoreComponentsSchema>): number {
  return Object.values(scoreComponentsSchema.parse(components)).reduce((sum, value) => sum + value, 0);
}
export const automationOpportunitySchema = z.object({ category: text.max(100), title: text.max(240),
  explanation: text.max(2000), sourceIds }).strict();
export const researchAnalysisSchema = z.object({
  company: z.object({ description: text.max(4000), industry: text.max(240).nullable(), location: text.max(240).nullable(),
    employeeEstimate: text.max(100).nullable(), researchSummary: text.max(8000) }).strict(),
  facts: z.array(z.object({ claim: text.max(500), sourceId: z.string().regex(/^source_\d+$/), quote: text.max(600) }).strict()).min(2).max(10),
  automationOpportunities: z.array(automationOpportunitySchema).min(1).max(5),
  lead: z.object({ score: z.number().int().min(0).max(100), scoreReason: text.max(4000), opportunity: text.max(2000),
    confidence: z.enum(["low", "medium", "high"]), sourceIds, components: scoreComponentsSchema }).strict(),
  uncertainties: z.array(text.max(500)).max(10),
}).strict();
export type ResearchAnalysis = z.infer<typeof researchAnalysisSchema>;
export const researchOutputSchema = z.object({
  company: z.object({ name: text.max(240), website: publicWebsiteSchema }).strict(),
  sources: z.array(researchSourceSchema).min(1).max(8), analysis: researchAnalysisSchema,
  queries: z.array(z.object({ query: text.max(500), cached: z.boolean(), sourceCount: z.number().int().nonnegative() }).strict()).max(2),
  budget: z.object({ searchRequests: z.number().int().min(0).max(3), searchCreditsReserved: z.number().int().min(0).max(3),
    modelRequests: z.number().int().min(0).max(2), cacheHits: z.number().int().min(0).max(2) }).strict(),
  researchOnly: z.literal(true),
}).strict();
export type ResearchOutput = z.infer<typeof researchOutputSchema>;
export function validateResearchAnalysis(output: unknown, sources: ResearchSource[]): ResearchAnalysis {
  const parsed = researchAnalysisSchema.parse(output);
  const evidence = new Map(sources.map((source) => [source.id, researchSourceSchema.parse(source)]));
  const normalize = (value: string) => value.replace(/\s+/g, " ").toLowerCase();
  for (const fact of parsed.facts) {
    const source = evidence.get(fact.sourceId);
    if (!source || !normalize(source.content).includes(normalize(fact.quote))) throw new Error("Unsupported evidence citation");
  }
  for (const ids of [parsed.lead.sourceIds, ...parsed.automationOpportunities.map((opportunity) => opportunity.sourceIds)]) {
    if (new Set(ids).size !== ids.length || ids.some((id) => !evidence.has(id))) throw new Error("Unknown evidence source");
  }
  if (parsed.lead.score !== calculateLeadScore(parsed.lead.components)) throw new Error("Score components must sum to the score");
  const citedFacts = new Set(parsed.facts.map((fact) => fact.sourceId));
  const strongSources = sources.filter((source) => citedFacts.has(source.id) && source.content.length >= 200 && source.relevance >= .5);
  if (parsed.company.employeeEstimate && !parsed.facts.some((fact) => normalize(fact.quote).includes(normalize(parsed.company.employeeEstimate!)))) {
    throw new Error("Unsupported employee estimate");
  }
  if (parsed.lead.confidence === "high" && (strongSources.length < 2 || parsed.facts.length < 3 || parsed.lead.components.evidenceQuality < 12)) {
    parsed.lead.confidence = strongSources.length ? "medium" : "low";
  }
  if (parsed.lead.components.evidenceQuality < 7) parsed.lead.confidence = "low";
  return parsed;
}
export function isQualified(analysis: ResearchAnalysis): boolean {
  return calculateLeadScore(analysis.lead.components) >= 60 && analysis.lead.components.icpFit >= 15 && analysis.lead.components.evidenceQuality >= 7;
}
export const discoveryCandidateSchema = z.object({ name: text.max(240), website: publicWebsiteSchema.nullable(),
  sourceId: z.string().regex(/^source_\d+$/), quote: text.max(600) }).strict();
export const discoveryOutputSchema = z.object({ summary: text.max(2000), candidates: z.array(discoveryCandidateSchema).max(30) }).strict();
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;
export function validateDiscovery(output: unknown, sources: ResearchSource[]) {
  const parsed = discoveryOutputSchema.parse(output);
  const normalize = (value: string) => value.replace(/\s+/g, " ").toLowerCase();
  return { ...parsed, candidates: parsed.candidates.filter((candidate) => {
    const source = sources.find((entry) => entry.id === candidate.sourceId);
    if (!source || !normalize(source.content).includes(normalize(candidate.quote))) return false;
    if (!candidate.website) return normalize(candidate.quote).includes(normalize(candidate.name));
    const domain = normalizeDomain(candidate.website);
    const mentionedDomains = source.content.toLowerCase().match(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\.[a-z]{2,})?/g) ?? [];
    return normalizeDomain(source.url) === domain || mentionedDomains.some((mentioned) => mentioned.replace(/^www\./, "") === domain);
  }) };
}
