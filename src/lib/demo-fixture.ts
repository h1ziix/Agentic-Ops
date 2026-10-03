import type { AgentEvent, Approval, Company, Lead, PlannerRun, ResearchRun, Workflow, WorkflowStage, WorkflowTask, Workspace } from "@/types/domain";

/** Versioned fictional fixtures. Never insert these into a real workspace. */
export const demoWorkflowId = "kazakhstan-fintech";
export const demoWorkspace: Workspace = { id: "demo-workspace", name: "Demo Workspace", initials: "DM", plan: "Portfolio sample", mode: "demo" };
const startedAt = "2026-10-02T09:00:00Z";
const updatedAt = "2026-10-02T09:08:00Z";
export const workflows: Workflow[] = [{ id: demoWorkflowId, title: "Kazakhstan · support automation opportunities",
  goal: "Find Kazakhstan B2B SaaS and fintech companies where AI automation could improve customer support or internal operations. Qualify opportunities, prepare personalized outreach, and hold every external action for human approval.",
  status: "waiting_for_approval", progress: 75, currentStep: "2 sample messages await your review", targetCompanies: 3, companyCount: 3, qualifiedLeadCount: 3, pendingApprovalCount: 2,
  createdAt: startedAt, startedAt, updatedAt }];
const stages = ["Planning", "Company Discovery", "Research", "Qualification", "Lead Review", "Outreach", "Approval", "Execution"];
export const workflowStages: WorkflowStage[] = stages.map((label, index) => ({ id: `sample-stage-${index}`, workflowId: demoWorkflowId, label, order: index + 1,
  status: index < 6 ? "completed" : "waiting", ...(index < 6 ? { completedAt: updatedAt } : {}) }));
export const workflowTasks: WorkflowTask[] = stages.map((title, index) => ({ id: `sample-task-${index}`, workflowId: demoWorkflowId, title, order: index + 1,
  type: ["define_target_profile", "discover_companies", "research_companies", "qualify_opportunities", "review_qualified_leads", "generate_outreach", "request_approval", "execute_approved_actions"][index],
  status: index < 6 ? "completed" : "pending", agent: index === 0 ? "Planner Agent" : index < 4 ? "Research Agent" : index === 4 ? "Reviewer Agent" : index === 5 ? "Outreach Agent" : index === 6 ? "Workspace" : "Executor Agent",
  description: ["Define the Kazakhstan market and preserve the approval requirement.", "Discover three fictional companies with illustrative sources.", "Retain product context, evidence and uncertainties.", "Qualify three specific operations opportunities.", "Accept supported claims and reject unverified efficiency promises.", "Draft messages from accepted sample evidence.", "Wait for a human decision. Approval alone never sends.", "Historical simulation only. No provider can execute in this demo."][index],
  ...(index < 6 ? { completedAt: updatedAt } : {}) }));
const profiles = [
  { id: "orda-finance", name: "Orda Finance", industry: "Digital lending", location: "Almaty, Kazakhstan", score: 86, scoreComponents: { icpFit: 23, automationPotential: 27, operationalSignals: 17, evidenceQuality: 12, reachability: 7 }, opportunity: "Route application-status questions", description: "Fictional mobile lending service with digital applications and account support.", quote: "Customers check application status in the mobile app and contact support for help." },
  { id: "qadam-cloud", name: "Qadam Cloud", industry: "Workflow SaaS", location: "Astana, Kazakhstan", score: 90, scoreComponents: { icpFit: 24, automationPotential: 28, operationalSignals: 18, evidenceQuality: 13, reachability: 7 }, opportunity: "Guide onboarding and triage implementation questions", description: "Fictional workflow software with guided onboarding and a shared help center.", quote: "Our onboarding team helps customers configure workflows and integrations." },
  { id: "aqsha-pay", name: "Aqsha Pay", industry: "Payments", location: "Almaty, Kazakhstan", score: 82, scoreComponents: { icpFit: 22, automationPotential: 25, operationalSignals: 16, evidenceQuality: 12, reachability: 7 }, opportunity: "Classify merchant settlement inquiries", description: "Fictional payments platform with checkout and merchant settlement products.", quote: "Merchants track settlement status and submit questions to merchant support." },
];
export const companies: Company[] = profiles.map((profile) => ({ ...profile, workflowId: demoWorkflowId, website: `https://${profile.id}.example`, employeeEstimate: "51–200 · sample",
  sourceUrls: [`https://${profile.id}.example/about`, `https://${profile.id}.example/support`], sources: [{ url: `https://${profile.id}.example/about`, title: "Illustrative profile · fictional source", type: "search_result", accessedAt: startedAt }],
  researchSummary: `${profile.description} Sample evidence: “${profile.quote}” The opportunity is a hypothesis; inquiry volume and purchasing intent are unknown. Companies, contacts and sources are fictional.`,
  scoreReason: "Specific product context and an operations use case; volume and buyer intent are unverified.", researchStatus: "researched", qualificationConfidence: "medium", lastResearchedAt: updatedAt, createdAt: startedAt, updatedAt }));
export const leads: Lead[] = companies.map((company, index) => ({ id: `lead-${company.id}`, companyId: company.id, workflowId: demoWorkflowId,
  status: index === 0 ? "contacted" : "waiting_approval", outreachStatus: index === 0 ? "sent" : "waiting_approval", score: company.score, scoreReason: company.scoreReason!, opportunity: company.opportunity,
  scoreComponents: company.scoreComponents, confidence: "medium", replyStatus: "unavailable", createdAt: startedAt, updatedAt, researchContext: company,
  review: { decision: "approve_for_outreach", confidence: "medium", summary: "Sample review accepted product context; support volume is unverified.", strengths: ["Specific operations use case"], concerns: ["Fictional evidence; no live verification", "Budget and volume unknown"],
    usableEvidence: [{ claim: company.description, quote: profiles[index].quote, sourceUrl: company.sourceUrls[0] }], allowedPersonalizationClaims: [company.description], rejectedClaims: ["Guaranteed savings"],
    outreachAngle: { primaryProblem: company.opportunity, proposedValue: "Explore a small pilot with human review", supportingEvidence: [company.description], isHypothesis: true } } }));
function action(company: Company, index: number): Approval["proposedActions"][number] {
  return { id: `sample-email-${company.id}`, companyId: company.id, leadId: `lead-${company.id}`, actionType: "send_email", recipientName: `Sample contact · ${company.name}`, recipientEmail: `demo@${company.id}.example`,
    subject: `An operations idea for ${company.name}`, body: `Hello,\n\nYour illustrative profile says: “${profiles[index].quote}”\n\nOne idea to explore: ${company.opportunity.toLowerCase()}. A small pilot could triage repetitive questions while your team reviews exceptions. Support volume and budget have not been verified.\n\nWould a discovery conversation be useful?\n\nDemo Operations\n\nSAMPLE DRAFT — fictional contact. This message cannot be sent.`,
    status: index === 0 ? "executed" : "waiting_for_approval", executionReadiness: "ready", blockers: ["Demo mode disables external execution."], evidenceReferences: [{ claim: company.description, quote: profiles[index].quote, sourceUrl: company.sourceUrls[0] }], warnings: ["Fictional sample; no delivery occurred."] };
}
export const approvals: Approval[] = [
  { id: "sample-pending-approval", workflowId: demoWorkflowId, title: "Review 2 sample outreach drafts", description: "Inspect evidence and content; record a browser-only demo decision.", actionType: "send_email", status: "pending", requestedBy: "Outreach Agent", requestedAt: updatedAt, riskLabel: "Sample communication", recipientCount: 2, proposedActions: companies.slice(1).map((company, index) => action(company, index + 1)) },
  { id: "sample-historical-approval", workflowId: demoWorkflowId, title: "Historical simulated approval", description: "Fictional approval and execution history. No email was delivered.", actionType: "send_email", status: "executed", requestedBy: "Outreach Agent", requestedAt: startedAt, riskLabel: "Simulation only", recipientCount: 1, proposedActions: [action(companies[0], 0)] },
];
const story: Pick<AgentEvent, "title" | "description" | "agent" | "eventType" | "category">[] = [
  { title: "Planner created 8 tasks", description: "The sample goal became a plan with a required approval gate.", agent: "Planner Agent", eventType: "plan_generated", category: "agent" },
  { title: "3 fictional companies discovered", description: "Illustrative .example sources were retained with each profile.", agent: "Research Agent", eventType: "tool_completed", category: "tool" },
  { title: "3 opportunities qualified", description: "Product context informs sample scores. Volume and budget remain unknown.", agent: "Research Agent", eventType: "task_completed", category: "agent" },
  { title: "Reviewer accepted sample evidence", description: "Supported claims retained; guaranteed efficiency claims rejected.", agent: "Reviewer Agent", eventType: "task_completed", category: "agent" },
  { title: "3 sample drafts prepared", description: "Messages reference accepted context and disclose uncertainty.", agent: "Outreach Agent", eventType: "task_completed", category: "agent" },
  { title: "Human approved a historical sample", description: "Simulated permission recorded separately from execution.", agent: "Workspace", eventType: "approval_approved", category: "approval" },
  { title: "Executor recorded a simulated result", description: "Historical illustration only. No real messages or provider requests.", agent: "Executor Agent", eventType: "tool_completed", category: "workflow" },
  { title: "Follow-up preparation awaits review", description: "The sample timer grants no send permission. Reply monitoring is unavailable.", agent: "Workspace", eventType: "followup_due", category: "workflow" },
  { title: "2 sample drafts ready for your review", description: "Demo decisions remain in this browser. Nothing can be sent.", agent: "Outreach Agent", eventType: "approval_requested", category: "approval" },
];
export const agentActivity: AgentEvent[] = story.map((event, index) => ({ ...event, id: `sample-event-${index}`, workflowId: demoWorkflowId, timestamp: `2026-10-02T09:${String(index).padStart(2, "0")}:00Z`, status: index === story.length - 1 ? "waiting" : "completed" }));
const run = { workflowId: demoWorkflowId, status: "completed" as const, model: "Sample model · no API call", startedAt, completedAt: updatedAt, durationMs: 12000, retryCount: 0, taskCount: 1, totalTokens: null };
export const plannerRuns: PlannerRun[] = [{ ...run, id: "sample-planner", summary: "Eight-stage sample plan with explicit approval.", assumptions: ["Companies and evidence are fictional."], taskCount: 8 }];
export const researchRuns: ResearchRun[] = [{ ...run, id: "sample-research", taskId: "sample-task-2", summary: "3 fictional profiles researched and qualified.", taskCount: 3 }];
export const preparationRuns = [{ ...run, id: "sample-reviewer", taskId: "sample-task-4", agent: "Reviewer Agent" as const }, { ...run, id: "sample-outreach", taskId: "sample-task-5", agent: "Outreach Agent" as const }];
