/** Serializable presentation contracts backed by workspace records. */
export type WorkflowStatus =
  | "draft"
  | "planning"
  | "running"
  | "waiting_for_approval"
  | "paused"
  | "ready_for_execution"
  | "needs_revision"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus = "completed" | "running" | "waiting" | "failed";
export type TaskStatus = "completed" | "running" | "pending" | "blocked" | "failed" | "cancelled";
export type AgentName =
  | "Planner Agent"
  | "Research Agent"
  | "Reviewer Agent"
  | "Executor Agent"
  | "Unassigned"
  | "Workspace";

export interface Workspace {
  id: string;
  name: string;
  initials: string;
  plan: string;
  mode: "demo" | "live";
}

export interface Workflow {
  id: string;
  title: string;
  goal: string;
  status: WorkflowStatus;
  progress: number;
  currentStep: string;
  targetCompanies: number;
  companyCount: number;
  qualifiedLeadCount: number;
  pendingApprovalCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorSummary?: string;
}

export interface PlannerRun {
  id: string;
  workflowId: string;
  status: import("@/lib/validation/agent").AgentStatus;
  model: string | null;
  summary?: string;
  assumptions: string[];
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  taskCount: number;
  totalTokens: number | null;
  error?: string;
}

export interface WorkflowStage {
  id: string;
  workflowId: string;
  label: string;
  order: number;
  status: StepStatus;
  completedAt?: string;
}

export interface WorkflowTask {
  id: string;
  workflowId: string;
  title: string;
  description: string;
  order: number;
  status: TaskStatus;
  agent: AgentName;
  completedAt?: string;
  planTaskId?: string;
  objective?: string;
  dependencies?: string[];
  expectedOutput?: string;
}

export type CompanyResearchStatus =
  | "queued"
  | "researching"
  | "researched"
  | "failed";

export interface Company {
  id: string;
  workflowId: string | null;
  name: string;
  website: string | null;
  industry: string;
  location: string;
  description: string;
  employeeEstimate: string;
  sourceUrls: string[];
  researchSummary: string;
  opportunity: string;
  score: number | null;
  researchStatus: CompanyResearchStatus;
  lastResearchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "new"
  | "qualified"
  | "outreach_ready"
  | "waiting_approval"
  | "contacted"
  | "responded"
  | "converted"
  | "rejected";

export type OutreachStatus =
  | "not_started"
  | "drafted"
  | "waiting_approval"
  | "approved"
  | "sent";

export interface Lead {
  id: string;
  companyId: string;
  workflowId: string;
  status: LeadStatus;
  score: number | null;
  scoreReason: string;
  opportunity: string;
  confidence: "high" | "medium" | "low" | null;
  outreachStatus: OutreachStatus;
  updatedAt: string;
}

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "executed";

export type ProposedActionStatus =
  | "waiting_for_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "cancelled"
  | "failed";

export interface ProposedAction {
  id: string;
  leadId: string;
  companyId: string;
  actionType: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: ProposedActionStatus;
}

export interface Approval {
  id: string;
  workflowId: string;
  title: string;
  description: string;
  actionType: string;
  status: ApprovalStatus;
  requestedBy: AgentName;
  requestedAt: string;
  riskLabel: string;
  recipientCount: number;
  proposedActions: ProposedAction[];
}

export type ActivityCategory =
  | "agent"
  | "tool"
  | "workflow"
  | "approval"
  | "error";

export type AgentEventType = import("@/types/persistence").AgentEventType | "lead_qualified" | "approval_received";

export interface AgentEvent {
  id: string;
  workflowId: string;
  companyId?: string;
  leadId?: string;
  category: ActivityCategory;
  eventType: AgentEventType;
  agent?: AgentName;
  title: string;
  description: string;
  timestamp: string;
  status: "completed" | "running" | "failed" | "waiting";
  toolName?: string;
  durationMs?: number;
}

export interface DashboardMetrics {
  activeWorkflows: number;
  companiesResearched: number;
  qualifiedLeads: number;
  pendingApprovals: number;
  companiesChange: string;
  leadsChange: string;
  periodLabel: string;
  agentRunsThisWeek: number;
  averageRunDuration: string;
  successfulRuns: number;
}

export interface WorkspaceViewData {
  workspace: Workspace;
  workflows: Workflow[];
  workflowStages: WorkflowStage[];
  workflowTasks: WorkflowTask[];
  companies: Company[];
  leads: Lead[];
  approvals: Approval[];
  activity: AgentEvent[];
  plannerRuns?: PlannerRun[];
}
