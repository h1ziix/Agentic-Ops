import type { ResearchAnalysis, ResearchInput, ResearchSource } from "@/lib/validation/research";

export const researchInput: ResearchInput = { name: "Fixture SaaS", website: "https://fixture.example.com",
  goal: "Research this company and prepare outreach for human approval.",
  icp: { description: "B2B SaaS companies evaluating AI workflow automation.", offering: "AI sales research with human-approved outreach." } };
export const researchSources: ResearchSource[] = [{ id: "source_1", url: "https://fixture.example.com/product", title: "Product",
  content: "Our product helps software teams manage their projects. It integrates with team tools.", relevance: 0.9, retrievedAt: "2026-09-30T12:00:00.000Z" }];
export const researchAnalysis: ResearchAnalysis = { company: { description: "Project management software for software teams.", industry: "B2B SaaS",
  location: null, employeeEstimate: null, researchSummary: "Project management software; sales automation is a hypothesis to verify." },
  facts: [{ claim: "Supports software teams", sourceId: "source_1", quote: "helps software teams manage their projects" }],
  icp: { score: 80, reason: "Market 35, offering 30, evidence 15.", sourceIds: ["source_1"], components: { marketFit: 35, offeringFit: 30, evidenceQuality: 15 } },
  lead: { score: 58, scoreReason: "Fit 40, opportunity 15, readiness 3; buying intent unknown.", opportunity: "Explore sales research automation.",
    confidence: "low", sourceIds: ["source_1"], components: { icpFit: 40, opportunity: 15, readiness: 3 } },
  outreach: { subject: "Explore research automation", body: "Hi Fixture SaaS team, would AI sales research support your team?", sourceIds: ["source_1"] },
  uncertainties: ["No decision maker or buying intent is established."] };
