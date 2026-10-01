import { randomUUID } from "node:crypto";
import { reviewInputFromResearch, type ReviewerOutput } from "@/lib/validation/outreach";
import { researchAnalysis, researchSources } from "./research-fixtures";
import type { ResearchOutput } from "@/lib/validation/research";

export function outreachFixture() {
  const research: ResearchOutput = { company: { name: "Fixture SaaS", website: "https://fixture.example.com" },
    sources: researchSources, analysis: { ...structuredClone(researchAnalysis), lead: { ...structuredClone(researchAnalysis.lead), confidence: "medium" } },
    queries: [], budget: { searchRequests: 0, searchCreditsReserved: 0, modelRequests: 0, cacheHits: 0 }, researchOnly: true };
  const ids = { workflowId: randomUUID(), companyId: randomUUID(), leadId: randomUUID(), researchRunId: randomUUID(),
    goal: "Find software companies and prepare human-reviewed personalized outreach." };
  const input = reviewInputFromResearch(ids, research);
  const review: ReviewerOutput = { decision: "approve_for_outreach", confidence: "medium", summary: "Published product evidence supports a specific workflow triage hypothesis.",
    strengths: ["First-party product evidence"], concerns: ["Internal needs remain unverified"], usableEvidence: input.evidence,
    allowedPersonalizationClaims: input.evidence.map((fact) => fact.claim), rejectedClaims: [],
    outreachAngle: { primaryProblem: "AI-assisted project intake triage", proposedValue: "an evidence-grounded intake assistant",
      supportingEvidence: input.evidence.map((fact) => fact.claim), isHypothesis: true } };
  const recipient = { name: null, email: null, role: null, companyName: input.company.name };
  return { input, review, research, recipient };
}
