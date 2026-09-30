import type { ResearchAnalysis, ResearchInput, ResearchSource } from "@/lib/validation/research";
export const researchInput: ResearchInput = { name: "Fixture SaaS", website: "https://fixture.example.com",
  goal: "Research this company and qualify its AI automation opportunities.",
  icp: { description: "B2B SaaS companies evaluating AI workflow automation.", offering: "AI automation for suitable customer and operational workflows." } };
export const researchSources: ResearchSource[] = [{ id: "source_1", url: "https://fixture.example.com/product", title: "Product",
  content: "Our product helps software teams manage their projects. It integrates with team tools.", relevance: 0.9, retrievedAt: "2026-09-30T12:00:00.000Z" }];
export const researchAnalysis: ResearchAnalysis = { company: { description: "Project management software for software teams.", industry: "B2B SaaS",
  location: null, employeeEstimate: null, researchSummary: "Project management software; sales automation is a hypothesis to verify." },
  facts: [{ claim: "Supports software teams", sourceId: "source_1", quote: "helps software teams manage their projects" },
    { claim: "Offers tool integrations", sourceId: "source_1", quote: "It integrates with team tools" }],
  automationOpportunities: [{ category: "operations", title: "Workflow triage", explanation: "Explore AI assistance for project intake; workload is unverified.", sourceIds: ["source_1"] }],
  lead: { score: 68, scoreReason: "Fit 20, potential 22, operational signals 12, evidence 8, public context 6. Buying intent unknown.", opportunity: "Explore workflow triage automation.",
    confidence: "low", sourceIds: ["source_1"], components: { icpFit: 20, automationPotential: 22, operationalSignals: 12, evidenceQuality: 8, reachability: 6 } },
  uncertainties: ["No decision maker or buying intent is established."] };
