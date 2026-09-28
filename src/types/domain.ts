/** Stage 1 domain contracts. IDs and timestamps are deliberately serializable. */
export type WorkflowStatus =
  | "draft"
  | "planning"
  | "running"
  | "waiting_for_approval"
  | "ready_for_execution"
  | "needs_revision"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus = "completed" | "running" | "waiting" | "failed";
export type TaskStatus = "completed" | "running" | "pending" | "failed";
export type AgentName =
  | "Planner Agent"
  | "Research Agent"
  | "Reviewer Agent"
  | "Executor Agent";

export interface Workspace {
  id: string;
  name: string;
  initials: string;
  plan: string;
  mode: "demo";
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
}

export type CompanyResearchStatus =
  | "queued"
  | "researching"
  | "researched"
  | "failed";

export interface Company {
  id: string;
  workflowId: string;
  name: string;
  website: string;
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
  score: number;
  scoreReason: string;
  opportunity: string;
  confidence: "high" | "medium" | "low";
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
  | "executed";

export interface ProposedAction {
  id: string;
  leadId: string;
  companyId: string;
  actionType: "send_email";
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
  actionType: "send_email";
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

export type AgentEventType =
  | "agent_started"
  | "reasoning_summary"
  | "tool_called"
  | "tool_completed"
  | "task_started"
  | "task_completed"
  | "lead_qualified"
  | "approval_requested"
  | "approval_received"
  | "workflow_completed"
  | "error"
  | "retry"
  | "agent_completed";

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
