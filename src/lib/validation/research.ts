import { z } from "zod";

export const publicWebsiteSchema = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
    && !url.port && !url.hostname.includes(":") && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
    && url.hostname.includes(".") && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname);
}, "Use a public company website.");

export const icpSchema = z.object({
  description: z.string().trim().min(10).max(2000),
  offering: z.string().trim().min(10).max(1000),
}).strict();

export const researchRequestSchema = z.object({
  companyId: z.uuid().optional(),
  name: z.string().trim().min(1).max(240).optional(),
  website: publicWebsiteSchema.optional(),
  icp: icpSchema.optional(),
}).strict().refine((input) => Boolean(input.companyId || (input.name && input.website)), "Supply a company ID or name and website.")
  .refine((input) => !input.companyId || (!input.name && !input.website), "Company identity must come from the saved record.");
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

export const researchInputSchema = z.object({
  name: z.string().trim().min(1).max(240), website: publicWebsiteSchema,
  goal: z.string().trim().min(10).max(4000), icp: icpSchema,
}).strict();
export type ResearchInput = z.infer<typeof researchInputSchema>;

export const researchSourceSchema = z.object({
  id: z.string().regex(/^source_\d+$/), url: publicWebsiteSchema,
  title: z.string().min(1).max(500), content: z.string().min(1).max(3500),
  relevance: z.number().min(0).max(1), retrievedAt: z.iso.datetime(),
}).strict();
export type ResearchSource = z.infer<typeof researchSourceSchema>;

const sourceIds = z.array(z.string().regex(/^source_\d+$/)).min(1).max(8);
const text = z.string().trim().min(1);
export const researchAnalysisSchema = z.object({
  company: z.object({
    description: text.max(4000), industry: text.max(240), location: text.max(240).nullable(),
    employeeEstimate: text.max(100).nullable(), researchSummary: text.max(8000),
  }).strict(),
  facts: z.array(z.object({
    claim: text.max(500), sourceId: z.string().regex(/^source_\d+$/), quote: text.max(600),
  }).strict()).min(1).max(10),
  icp: z.object({ score: z.number().int().min(0).max(100), reason: text.max(2000), sourceIds,
    components: z.object({ marketFit: z.number().int().min(0).max(40), offeringFit: z.number().int().min(0).max(40), evidenceQuality: z.number().int().min(0).max(20) }).strict(),
  }).strict(),
  lead: z.object({
    score: z.number().int().min(0).max(100), scoreReason: text.max(4000), opportunity: text.max(2000),
    confidence: z.enum(["low", "medium", "high"]), sourceIds,
    components: z.object({ icpFit: z.number().int().min(0).max(50), opportunity: z.number().int().min(0).max(30), readiness: z.number().int().min(0).max(20) }).strict(),
  }).strict(),
  outreach: z.object({ subject: text.max(200), body: text.min(10).max(10000), sourceIds }).strict(),
  uncertainties: z.array(text.max(500)).max(10),
}).strict();
export type ResearchAnalysis = z.infer<typeof researchAnalysisSchema>;

export const researchOutputSchema = z.object({
  company: z.object({ name: text.max(240), website: publicWebsiteSchema }).strict(),
  sources: z.array(researchSourceSchema).min(1).max(8), analysis: researchAnalysisSchema,
  queries: z.array(z.object({ query: text.max(500), cached: z.boolean(), sourceCount: z.number().int().nonnegative() }).strict()).max(2),
  budget: z.object({
    searchRequests: z.number().int().min(0).max(3), searchCreditsReserved: z.number().int().min(0).max(3),
    modelRequests: z.number().int().min(0).max(2), cacheHits: z.number().int().min(0).max(2),
  }).strict(),
  approvalRequired: z.literal(true),
}).strict();
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export function validateResearchAnalysis(output: unknown, sources: ResearchSource[]): ResearchAnalysis {
  const parsed = researchAnalysisSchema.parse(output);
  const evidence = new Map(sources.map((source) => [source.id, source]));
  const normalize = (value: string) => value.replace(/\s+/g, " ").toLowerCase();
  for (const fact of parsed.facts) {
    const source = evidence.get(fact.sourceId);
    if (!source || !normalize(source.content).includes(normalize(fact.quote))) throw new Error("Unsupported evidence citation");
  }
  for (const ids of [parsed.icp.sourceIds, parsed.lead.sourceIds, parsed.outreach.sourceIds]) {
    if (new Set(ids).size !== ids.length || ids.some((id) => !evidence.has(id))) throw new Error("Unknown evidence source");
  }
  for (const score of [parsed.icp, parsed.lead]) {
    if (score.score !== Object.values(score.components).reduce((sum, value) => sum + value, 0)) throw new Error("Score components must sum to the score");
  }
  return parsed;
}
