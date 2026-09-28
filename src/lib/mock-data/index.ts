import type {
  AgentEvent,
  Approval,
  Company,
  DashboardMetrics,
  Lead,
  LeadStatus,
  OutreachStatus,
  StepStatus,
  Workflow,
  WorkflowStage,
  WorkflowTask,
  Workspace,
} from "../../types/domain";

/** Curated, fictional records for the Stage 1 product demonstration. */
export const demoWorkspace: Workspace = {
  id: "northstar-ops",
  name: "Northstar Operations",
  initials: "NO",
  plan: "Demo workspace",
  mode: "demo",
};

export const dashboardMetrics: DashboardMetrics = {
  activeWorkflows: 3,
  companiesResearched: 148,
  qualifiedLeads: 42,
  pendingApprovals: 18,
  companiesChange: "+23 this month",
  leadsChange: "+9 this month",
  periodLabel: "Last 30 days",
  agentRunsThisWeek: 36,
  averageRunDuration: "4m 12s",
  successfulRuns: 34,
};

export const workflows: Workflow[] = [
  {
    id: "kazakhstan-fintech",
    title: "Find AI automation opportunities in Kazakhstan fintech",
    goal: "Identify fintech companies in Kazakhstan where AI could improve customer support or internal operations, qualify the best opportunities and prepare personalized outreach. Do not send anything without approval.",
    status: "running",
    progress: 57,
    currentStep: "Qualifying companies",
    targetCompanies: 20,
    companyCount: 12,
    qualifiedLeadCount: 8,
    pendingApprovalCount: 0,
    createdAt: "2026-09-27T08:42:00Z",
    updatedAt: "2026-09-28T15:12:00Z",
    startedAt: "2026-09-27T08:45:00Z",
  },
  {
    id: "central-asia-saas",
    title: "Research B2B SaaS companies in Central Asia",
    goal: "Find growing B2B SaaS companies across Central Asia, qualify operational AI opportunities and prepare specific first-contact messages for review.",
    status: "waiting_for_approval",
    progress: 86,
    currentStep: "Review 14 outreach messages",
    targetCompanies: 30,
    companyCount: 26,
    qualifiedLeadCount: 19,
    pendingApprovalCount: 14,
    createdAt: "2026-09-24T09:20:00Z",
    updatedAt: "2026-09-28T15:02:00Z",
    startedAt: "2026-09-24T09:23:00Z",
  },
  {
    id: "ecommerce-support",
    title: "Find ecommerce support automation opportunities",
    goal: "Research ecommerce operators with growing support volume and identify where automation can shorten response times.",
    status: "completed",
    progress: 100,
    currentStep: "Workflow complete",
    targetCompanies: 25,
    companyCount: 25,
    qualifiedLeadCount: 11,
    pendingApprovalCount: 0,
    createdAt: "2026-09-19T11:10:00Z",
    updatedAt: "2026-09-25T13:12:00Z",
    startedAt: "2026-09-19T11:12:00Z",
    completedAt: "2026-09-25T13:12:00Z",
  },
  {
    id: "logistics-operations",
    title: "Identify logistics teams with manual operations",
    goal: "Research regional logistics providers, score the potential for document and support automation, and draft outreach for the strongest fits.",
    status: "waiting_for_approval",
    progress: 85,
    currentStep: "Review 4 outreach messages",
    targetCompanies: 15,
    companyCount: 14,
    qualifiedLeadCount: 7,
    pendingApprovalCount: 4,
    createdAt: "2026-09-22T07:30:00Z",
    updatedAt: "2026-09-28T14:36:00Z",
    startedAt: "2026-09-22T07:33:00Z",
  },
  {
    id: "manufacturing-exporters",
    title: "Map manufacturing exporters in Almaty",
    goal: "Identify export-focused manufacturers in Almaty and evaluate AI opportunities in sales operations.",
    status: "failed",
    progress: 38,
    currentStep: "Research paused after source error",
    targetCompanies: 20,
    companyCount: 7,
    qualifiedLeadCount: 2,
    pendingApprovalCount: 0,
    createdAt: "2026-09-21T12:04:00Z",
    updatedAt: "2026-09-22T08:12:00Z",
    startedAt: "2026-09-21T12:06:00Z",
    errorSummary: "Two company sources could not be verified. Research stopped before scoring.",
  },
  {
    id: "healthcare-providers",
    title: "Explore patient intake automation for clinics",
    goal: "Find private clinic groups with high patient intake volume and assess where intake automation may help.",
    status: "draft",
    progress: 0,
    currentStep: "Awaiting start",
    targetCompanies: 20,
    companyCount: 0,
    qualifiedLeadCount: 0,
    pendingApprovalCount: 0,
    createdAt: "2026-09-28T14:05:00Z",
    updatedAt: "2026-09-28T14:05:00Z",
  },
];

const stageNames = [
  "Planning",
  "Company Discovery",
  "Research",
  "Qualification",
  "Outreach",
  "Approval",
  "Execution",
] as const;

const stageStatuses: Record<string, StepStatus[]> = {
  "kazakhstan-fintech": [
    "completed", "completed", "completed", "running", "waiting", "waiting", "waiting",
  ],
  "central-asia-saas": [
    "completed", "completed", "completed", "completed", "completed", "waiting", "waiting",
  ],
  "ecommerce-support": [
    "completed", "completed", "completed", "completed", "completed", "completed", "completed",
  ],
  "logistics-operations": [
    "completed", "completed", "completed", "completed", "completed", "waiting", "waiting",
  ],
  "manufacturing-exporters": [
    "completed", "completed", "failed", "waiting", "waiting", "waiting", "waiting",
  ],
  "healthcare-providers": [
    "waiting", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting",
  ],
};

export const workflowStages: WorkflowStage[] = workflows.flatMap((workflow) =>
  stageNames.map((label, order) => ({
    id: `${workflow.id}-stage-${order + 1}`,
    workflowId: workflow.id,
    label,
    order: order + 1,
    status: stageStatuses[workflow.id][order],
    ...(stageStatuses[workflow.id][order] === "completed"
      ? { completedAt: workflow.updatedAt }
      : {}),
  })),
);

export const workflowTasks: WorkflowTask[] = [
  {
    id: "fintech-task-1", workflowId: "kazakhstan-fintech", order: 1,
    title: "Define ideal customer profile",
    description: "Set the fintech market, company size and support operations signals.",
    status: "completed", agent: "Planner Agent", completedAt: "2026-09-27T08:49:00Z",
  },
  {
    id: "fintech-task-2", workflowId: "kazakhstan-fintech", order: 2,
    title: "Discover fintech companies",
    description: "Build a candidate list from public company and product sources.",
    status: "completed", agent: "Research Agent", completedAt: "2026-09-27T09:34:00Z",
  },
  {
    id: "fintech-task-3", workflowId: "kazakhstan-fintech", order: 3,
    title: "Research company websites",
    description: "Extract products, customer channels and possible operations bottlenecks.",
    status: "completed", agent: "Research Agent", completedAt: "2026-09-28T14:51:00Z",
  },
  {
    id: "fintech-task-4", workflowId: "kazakhstan-fintech", order: 4,
    title: "Evaluate automation opportunities",
    description: "Review evidence and identify specific support or internal workflow use cases.",
    status: "running", agent: "Reviewer Agent",
  },
  {
    id: "fintech-task-5", workflowId: "kazakhstan-fintech", order: 5,
    title: "Score leads",
    description: "Score each researched company and record a concise reason.",
    status: "pending", agent: "Reviewer Agent",
  },
  {
    id: "fintech-task-6", workflowId: "kazakhstan-fintech", order: 6,
    title: "Generate personalized outreach",
    description: "Draft messages grounded in the company research.",
    status: "pending", agent: "Research Agent",
  },
  {
    id: "fintech-task-7", workflowId: "kazakhstan-fintech", order: 7,
    title: "Request user approval",
    description: "Queue every proposed external message for human review.",
    status: "pending", agent: "Executor Agent",
  },
  ...workflows.filter((workflow) => workflow.id !== "kazakhstan-fintech").flatMap((workflow) => {
    const statusFor = (index: number): WorkflowTask["status"] => {
      const status = stageStatuses[workflow.id][index];
      if (status === "completed") return "completed";
      if (status === "running") return "running";
      if (status === "failed") return "failed";
      return "pending";
    };
    return [
      { title: "Define target profile", description: "Set market and qualification criteria.", agent: "Planner Agent" as const, stageIndex: 0 },
      { title: "Discover companies", description: "Find candidate companies and record source links.", agent: "Research Agent" as const, stageIndex: 1 },
      { title: "Research companies", description: "Extract products, operations signals and source evidence.", agent: "Research Agent" as const, stageIndex: 2 },
      { title: "Qualify opportunities", description: "Score specific opportunities against the target profile.", agent: "Reviewer Agent" as const, stageIndex: 3 },
      { title: "Prepare outreach", description: "Draft researched messages for review.", agent: "Research Agent" as const, stageIndex: 4 },
      { title: "Request approval", description: "Hold external actions for a human decision.", agent: "Executor Agent" as const, stageIndex: 5 },
    ].map((task, order) => ({
      id: `${workflow.id}-task-${order + 1}`,
      workflowId: workflow.id,
      order: order + 1,
      title: task.title,
      description: task.description,
      agent: task.agent,
      status: statusFor(task.stageIndex),
      ...(statusFor(task.stageIndex) === "completed" ? { completedAt: workflow.updatedAt } : {}),
    }));
  }),
];

type CompanySeed = {
  id: string;
  name: string;
  workflowId: string;
  industry: string;
  location: string;
  description: string;
  opportunity: string;
  score: number | null;
  employees: string;
  status?: Company["researchStatus"];
};

const companySeeds: CompanySeed[] = [
  { id: "orda-finance", name: "Orda Finance", workflowId: "kazakhstan-fintech", industry: "Digital lending", location: "Almaty, Kazakhstan", description: "Mobile lending service with self-service applications and a growing borrower support team.", opportunity: "Automate application-status support", score: 86, employees: "51–200" },
  { id: "aqsha-pay", name: "Aqsha Pay", workflowId: "kazakhstan-fintech", industry: "Payments", location: "Astana, Kazakhstan", description: "Payment platform serving merchants through checkout and settlement products.", opportunity: "Triage merchant support requests", score: 82, employees: "51–200" },
  { id: "turan-ledger", name: "Turan Ledger", workflowId: "kazakhstan-fintech", industry: "Accounting fintech", location: "Almaty, Kazakhstan", description: "Cloud accounting tools for small businesses and finance teams.", opportunity: "Assist invoice and reconciliation workflows", score: 79, employees: "11–50" },
  { id: "steppe-credit", name: "Steppe Credit", workflowId: "kazakhstan-fintech", industry: "Consumer finance", location: "Shymkent, Kazakhstan", description: "Consumer finance provider with digital applications and regional service channels.", opportunity: "Reduce repetitive customer inquiries", score: 74, employees: "201–500" },
  { id: "atlas-remit", name: "Atlas Remit", workflowId: "kazakhstan-fintech", industry: "Cross-border payments", location: "Almaty, Kazakhstan", description: "Cross-border payment product with multilingual customer onboarding.", opportunity: "Automate onboarding documentation checks", score: 88, employees: "11–50" },
  { id: "nomad-wallet", name: "Nomad Wallet", workflowId: "kazakhstan-fintech", industry: "Digital wallet", location: "Astana, Kazakhstan", description: "Consumer wallet with card controls and account servicing features.", opportunity: "Improve account-help routing", score: null, employees: "51–200", status: "researching" },
  { id: "qadam-cloud", name: "Qadam Cloud", workflowId: "central-asia-saas", industry: "Workflow software", location: "Almaty, Kazakhstan", description: "Workflow platform for distributed commercial teams.", opportunity: "Automate customer onboarding guidance", score: 90, employees: "51–200" },
  { id: "beket-analytics", name: "Beket Analytics", workflowId: "central-asia-saas", industry: "Analytics SaaS", location: "Astana, Kazakhstan", description: "Reporting platform used by retail operations teams.", opportunity: "Generate first-line analytics support", score: 88, employees: "11–50" },
  { id: "silkroute-crm", name: "Silkroute CRM", workflowId: "central-asia-saas", industry: "Sales software", location: "Tashkent, Uzbekistan", description: "Regional CRM with multilingual sales workflows.", opportunity: "Assist implementation and migration support", score: 87, employees: "51–200" },
  { id: "aral-desk", name: "Aral Desk", workflowId: "central-asia-saas", industry: "Customer support SaaS", location: "Almaty, Kazakhstan", description: "Shared inbox and help center product for service teams.", opportunity: "Summarize and route complex tickets", score: 86, employees: "11–50" },
  { id: "kestelik", name: "Kestelik", workflowId: "central-asia-saas", industry: "Scheduling SaaS", location: "Bishkek, Kyrgyzstan", description: "Scheduling platform for field service businesses.", opportunity: "Automate appointment changes", score: 84, employees: "11–50" },
  { id: "meridian-billing", name: "Meridian Billing", workflowId: "central-asia-saas", industry: "Billing SaaS", location: "Almaty, Kazakhstan", description: "Subscription billing product for local digital businesses.", opportunity: "Resolve common billing questions", score: 83, employees: "11–50" },
  { id: "tumar-people", name: "Tumar People", workflowId: "central-asia-saas", industry: "HR software", location: "Astana, Kazakhstan", description: "HR operations platform for growing employers.", opportunity: "Streamline employee policy requests", score: 82, employees: "51–200" },
  { id: "uzspace", name: "Uzspace", workflowId: "central-asia-saas", industry: "Collaboration SaaS", location: "Tashkent, Uzbekistan", description: "Project collaboration product for local agencies.", opportunity: "Improve user onboarding assistance", score: 81, employees: "11–50" },
  { id: "altai-forms", name: "Altai Forms", workflowId: "central-asia-saas", industry: "Forms SaaS", location: "Almaty, Kazakhstan", description: "Digital intake forms for service organizations.", opportunity: "Classify incoming submissions", score: 80, employees: "11–50" },
  { id: "naryn-sign", name: "Naryn Sign", workflowId: "central-asia-saas", industry: "Document SaaS", location: "Bishkek, Kyrgyzstan", description: "Electronic document workflow for small teams.", opportunity: "Guide document completion", score: 79, employees: "11–50" },
  { id: "aqyl-stack", name: "Aqyl Stack", workflowId: "central-asia-saas", industry: "Developer tools", location: "Astana, Kazakhstan", description: "Developer deployment and monitoring tools for regional startups.", opportunity: "Summarize technical support cases", score: 78, employees: "11–50" },
  { id: "samal-inventory", name: "Samal Inventory", workflowId: "central-asia-saas", industry: "Inventory SaaS", location: "Almaty, Kazakhstan", description: "Inventory planning product for small retailers.", opportunity: "Automate stock discrepancy triage", score: 77, employees: "11–50" },
  { id: "daryn-learning", name: "Daryn Learning", workflowId: "central-asia-saas", industry: "Education SaaS", location: "Karaganda, Kazakhstan", description: "Learning management software for training providers.", opportunity: "Answer course administration questions", score: 75, employees: "51–200" },
  { id: "sfera-procure", name: "Sfera Procure", workflowId: "central-asia-saas", industry: "Procurement SaaS", location: "Tashkent, Uzbekistan", description: "Purchasing workflow software for mid-market teams.", opportunity: "Extract and route purchase requests", score: 74, employees: "11–50" },
  { id: "railpath", name: "Railpath", workflowId: "logistics-operations", industry: "Freight forwarding", location: "Almaty, Kazakhstan", description: "Regional freight forwarder coordinating cross-border shipments.", opportunity: "Automate shipment-status inquiries", score: 85, employees: "51–200" },
  { id: "zhetisu-cargo", name: "Zhetisu Cargo", workflowId: "logistics-operations", industry: "Logistics", location: "Taldykorgan, Kazakhstan", description: "Road transport operator serving manufacturers and wholesalers.", opportunity: "Classify shipping documents", score: 82, employees: "51–200" },
  { id: "transsteppe", name: "Transsteppe", workflowId: "logistics-operations", industry: "Supply chain", location: "Astana, Kazakhstan", description: "Supply-chain coordinator with multiple carrier partners.", opportunity: "Reduce manual carrier updates", score: 80, employees: "11–50" },
  { id: "kazbridge-logistics", name: "Kazbridge Logistics", workflowId: "logistics-operations", industry: "Warehousing", location: "Shymkent, Kazakhstan", description: "Warehouse and last-mile operations for regional commerce.", opportunity: "Automate delivery exception triage", score: 78, employees: "51–200" },
  { id: "bazaarline", name: "Bazaarline", workflowId: "ecommerce-support", industry: "Ecommerce", location: "Almaty, Kazakhstan", description: "Marketplace for independent local brands.", opportunity: "Answer order and return questions", score: 84, employees: "51–200" },
  { id: "tenge-market", name: "Tenge Market", workflowId: "ecommerce-support", industry: "Ecommerce", location: "Astana, Kazakhstan", description: "Online retailer with nationwide delivery.", opportunity: "Route delivery support issues", score: 81, employees: "201–500" },
  { id: "qonaq-home", name: "Qonaq Home", workflowId: "ecommerce-support", industry: "Home retail", location: "Almaty, Kazakhstan", description: "Home goods retailer with online ordering and installation support.", opportunity: "Coordinate post-purchase service", score: 76, employees: "51–200" },
  { id: "orda-outlet", name: "Orda Outlet", workflowId: "ecommerce-support", industry: "Retail", location: "Karaganda, Kazakhstan", description: "Regional discount retailer expanding online fulfillment.", opportunity: "Assist return eligibility checks", score: 72, employees: "51–200" },
];

export const companies: Company[] = companySeeds.map((seed, index) => {
  const website = `https://${seed.id}.example`;
  const researchedAt = `2026-09-${String(28 - (index % 5)).padStart(2, "0")}T${String(14 - (index % 5)).padStart(2, "0")}:30:00Z`;
  return {
    id: seed.id,
    workflowId: seed.workflowId,
    name: seed.name,
    website,
    industry: seed.industry,
    location: seed.location,
    description: seed.description,
    employeeEstimate: seed.employees,
    sourceUrls: [website, `${website}/about`],
    researchSummary: `${seed.description} Identified opportunity: ${seed.opportunity}. This is a fictional demo profile; source links are illustrative.`,
    opportunity: seed.opportunity,
    score: seed.score,
    researchStatus: seed.status ?? "researched",
    lastResearchedAt: seed.status === "researching" ? null : researchedAt,
    createdAt: "2026-09-24T09:30:00Z",
    updatedAt: researchedAt,
  };
});

function leadState(company: Company): { status: LeadStatus; outreachStatus: OutreachStatus } {
  if (company.workflowId === "central-asia-saas" || company.workflowId === "logistics-operations") {
    return { status: "waiting_approval", outreachStatus: "waiting_approval" };
  }
  if (company.workflowId === "ecommerce-support") {
    return company.id === "bazaarline"
      ? { status: "responded", outreachStatus: "sent" }
      : { status: "contacted", outreachStatus: "sent" };
  }
  return company.score !== null && company.score >= 80
    ? { status: "qualified", outreachStatus: "not_started" }
    : { status: "new", outreachStatus: "not_started" };
}

export const leads: Lead[] = companies
  .filter((company): company is Company & { score: number } => company.score !== null)
  .map((company) => {
    const state = leadState(company);
    return {
      id: `lead-${company.id}`,
      companyId: company.id,
      workflowId: company.workflowId,
      ...state,
      score: company.score,
      scoreReason: `${company.description} Identified opportunity: ${company.opportunity}. This gives the team a specific starting point for discovery.`,
      opportunity: company.opportunity,
      confidence: company.score >= 82 ? "high" : company.score >= 75 ? "medium" : "low",
      updatedAt: company.updatedAt,
    };
  });

function outreachProposal(company: Company, index: number): Approval["proposedActions"][number] {
  const firstName = ["Amina", "Daniyar", "Madina", "Timur", "Aigerim", "Arman", "Malika"][index % 7];
  return {
    id: `proposed-email-${company.id}`,
    leadId: `lead-${company.id}`,
    companyId: company.id,
    actionType: "send_email",
    recipientName: `${firstName} — ${company.name}`,
    recipientEmail: `${firstName.toLowerCase()}@${company.id}.example`,
    subject: `A focused automation idea for ${company.name}`,
    body: `Hi ${firstName},\n\nI came across ${company.name} while researching ${company.industry.toLowerCase()} teams in the region. One use case I would explore first: ${company.opportunity.toLowerCase()}.\n\nThis is an initial idea based on the company profile. A small AI workflow could handle repetitive cases while your team keeps control of exceptions. Would you be open to a 15-minute conversation to see whether this fits your operations?\n\nBest,\nNorthstar Operations`,
    status: "waiting_for_approval",
  };
}

const saasRecipients = companies.filter((company) => company.workflowId === "central-asia-saas");
const logisticsRecipients = companies.filter((company) => company.workflowId === "logistics-operations");

export const approvals: Approval[] = [
  {
    id: "approval-saas-outreach",
    workflowId: "central-asia-saas",
    title: "Send personalized outreach",
    description: "Research-grounded introduction emails for qualified B2B SaaS opportunities.",
    actionType: "send_email",
    status: "pending",
    requestedBy: "Research Agent",
    requestedAt: "2026-09-28T15:02:00Z",
    riskLabel: "External email communication",
    recipientCount: saasRecipients.length,
    proposedActions: saasRecipients.map(outreachProposal),
  },
  {
    id: "approval-logistics-outreach",
    workflowId: "logistics-operations",
    title: "Send logistics outreach",
    description: "Four tailored messages proposing operational automation discovery calls.",
    actionType: "send_email",
    status: "pending",
    requestedBy: "Research Agent",
    requestedAt: "2026-09-28T14:36:00Z",
    riskLabel: "External email communication",
    recipientCount: logisticsRecipients.length,
    proposedActions: logisticsRecipients.map(outreachProposal),
  },
];

export const agentActivity: AgentEvent[] = [
  {
    id: "event-1", workflowId: "kazakhstan-fintech", companyId: "orda-finance",
    category: "agent", eventType: "reasoning_summary", agent: "Research Agent",
    title: "Analyzed Orda Finance company profile",
    description: "Captured lending products, support channels and public company context.",
    timestamp: "2026-09-28T15:12:00Z", status: "completed", durationMs: 18400,
  },
  {
    id: "event-2", workflowId: "kazakhstan-fintech", companyId: "aqsha-pay", leadId: "lead-aqsha-pay",
    category: "agent", eventType: "lead_qualified", agent: "Reviewer Agent",
    title: "Qualified Aqsha Pay at 82/100",
    description: "Merchant support triage is a specific, evidence-backed opportunity.",
    timestamp: "2026-09-28T15:10:00Z", status: "completed", durationMs: 9200,
  },
  {
    id: "event-3", workflowId: "kazakhstan-fintech",
    category: "workflow", eventType: "task_completed", agent: "Planner Agent",
    title: "Created 7 workflow tasks",
    description: "Plan covers discovery, research, qualification, outreach and approval.",
    timestamp: "2026-09-28T15:05:00Z", status: "completed",
  },
  {
    id: "event-4", workflowId: "central-asia-saas",
    category: "approval", eventType: "approval_requested", agent: "Research Agent",
    title: "14 outreach messages ready for review",
    description: "All proposed emails are held until a human approves them.",
    timestamp: "2026-09-28T15:02:00Z", status: "waiting",
  },
  {
    id: "event-5", workflowId: "kazakhstan-fintech", companyId: "atlas-remit",
    category: "tool", eventType: "tool_completed", agent: "Research Agent",
    title: "Company website extraction completed",
    description: "Extracted product and onboarding details from a demo source.",
    timestamp: "2026-09-28T14:54:00Z", status: "completed", toolName: "website_extract", durationMs: 12600,
  },
  {
    id: "event-6", workflowId: "kazakhstan-fintech",
    category: "agent", eventType: "task_started", agent: "Reviewer Agent",
    title: "Evaluating automation opportunities",
    description: "Reviewer is comparing research findings with qualification criteria.",
    timestamp: "2026-09-28T14:52:00Z", status: "running",
  },
  {
    id: "event-7", workflowId: "kazakhstan-fintech",
    category: "tool", eventType: "tool_called", agent: "Research Agent",
    title: "Called web_search",
    description: "Queried public fintech company directories for Kazakhstan.",
    timestamp: "2026-09-28T14:47:00Z", status: "completed", toolName: "web_search",
  },
  {
    id: "event-8", workflowId: "logistics-operations",
    category: "approval", eventType: "approval_requested", agent: "Research Agent",
    title: "4 logistics messages ready for review",
    description: "Drafts are queued; no external message has been sent.",
    timestamp: "2026-09-28T14:36:00Z", status: "waiting",
  },
  {
    id: "event-9", workflowId: "ecommerce-support",
    category: "workflow", eventType: "workflow_completed", agent: "Executor Agent",
    title: "Ecommerce research workflow completed",
    description: "25 companies reviewed and 11 opportunities qualified in this demo run.",
    timestamp: "2026-09-25T13:12:00Z", status: "completed",
  },
  {
    id: "event-10", workflowId: "manufacturing-exporters",
    category: "error", eventType: "error", agent: "Research Agent",
    title: "Source verification failed",
    description: "Two company sources could not be verified, so scoring stopped for this workflow.",
    timestamp: "2026-09-22T08:12:00Z", status: "failed", toolName: "website_extract",
  },
  {
    id: "event-11", workflowId: "kazakhstan-fintech",
    category: "agent", eventType: "agent_started", agent: "Research Agent",
    title: "Research Agent started",
    description: "Collecting company profiles for the Kazakhstan fintech target market.",
    timestamp: "2026-09-27T08:50:00Z", status: "completed",
  },
];

export function getWorkflowById(id: string): Workflow | undefined {
  return workflows.find((workflow) => workflow.id === id);
}

export function getCompanyById(id: string): Company | undefined {
  return companies.find((company) => company.id === id);
}

export function getLeadByCompanyId(companyId: string): Lead | undefined {
  return leads.find((lead) => lead.companyId === companyId);
}
