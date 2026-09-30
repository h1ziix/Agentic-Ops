import type { PlannerInput, PlannerOutput } from "@/lib/validation/planner";

export const examplePlannerInput: PlannerInput = {
  goal: "Find 20 SaaS companies in Kazakhstan that could benefit from AI automation and prepare personalized outreach. Do not send anything without approval.",
  targetMarket: null, location: null, requestedLeadCount: 20,
  context: { title: "Find SaaS companies in Kazakhstan", approvalRequired: true },
};

export const examplePlan: PlannerOutput = {
  summary: "Plan discovery and qualification of 20 SaaS companies in Kazakhstan, then prepare outreach for human review.",
  assumptions: ["Only public, attributable company information will be used. Contact availability will be verified during research."],
  tasks: [
    ["define_target_profile", "Define ideal customer profile", "Document SaaS fit, Kazakhstan location, and relevant operations signals."],
    ["discover_companies", "Discover target companies", "Create a candidate list with public sources and deduplicate it."],
    ["research_companies", "Research company websites", "Capture products, operations context, and cited evidence."],
    ["identify_opportunities", "Identify automation opportunities", "Connect each opportunity to verified company context."],
    ["score_leads", "Score and qualify leads", "Rank the 20 most suitable leads using transparent criteria."],
    ["generate_outreach", "Prepare personalized outreach", "Draft messages based on verified research without sending them."],
    ["request_approval", "Request human approval", "Present proposed outreach for approval. Hold all external actions."],
  ].map(([type, title, description], index, tasks) => ({
    id: type, type: type as PlannerOutput["tasks"][number]["type"], title, description,
    objective: description, expectedOutput: `A reviewed deliverable for: ${title}`,
    dependencies: index ? [tasks[index - 1][0]] : [],
  })),
};
