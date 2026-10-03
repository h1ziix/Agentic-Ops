import type { z } from "zod";
import type {
  agentEventRowSchema, agentEventTypeSchema, agentRunRowSchema, approvalDecisionSchema,
  approvalRowSchema, companyRowSchema, leadRowSchema, proposedActionRowSchema,
  workflowRowSchema, workflowTaskRowSchema, workspaceRowSchema,
} from "@/lib/validation/rows";
import type { taskStatusSchema, workflowStatusSchema } from "@/lib/validation/workflow";

export type WorkspaceRow = z.infer<typeof workspaceRowSchema>;
export type WorkflowRow = z.infer<typeof workflowRowSchema>;
export type WorkflowTaskRow = z.infer<typeof workflowTaskRowSchema>;
export type CompanyRow = z.infer<typeof companyRowSchema>;
export type LeadRow = z.infer<typeof leadRowSchema>;
export type AgentRunRow = z.infer<typeof agentRunRowSchema>;
export type AgentEventRow = z.infer<typeof agentEventRowSchema>;
export type ApprovalRow = z.infer<typeof approvalRowSchema>;
export type ProposedActionRow = z.infer<typeof proposedActionRowSchema>;
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type AgentEventType = z.infer<typeof agentEventTypeSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export interface WorkspaceSnapshot {
  repliedLeadIds?: string[];
  integrationConnections?: import("@/lib/validation/execution").IntegrationConnection[];
  actionSnapshots?: import("@/lib/validation/execution").ApprovalSnapshot[];
  executionAttempts?: import("@/lib/validation/execution").ExecutionAttempt[];
  followUpPlans?: import("@/lib/validation/execution").FollowUpPlan[];
  workspace: WorkspaceRow;
  workflows: WorkflowRow[];
  tasks: WorkflowTaskRow[];
  companies: CompanyRow[];
  workflowCompanies?: { workflow_id: string; company_id: string; research_status: CompanyRow["research_status"] }[];
  leads: LeadRow[];
  agentRuns: AgentRunRow[];
  events: AgentEventRow[];
  approvals: ApprovalRow[];
  proposedActions: ProposedActionRow[];
}

export interface WorkflowDetailSnapshot {
  repliedLeadIds?: string[];
  integrationConnections?: import("@/lib/validation/execution").IntegrationConnection[];
  actionSnapshots?: import("@/lib/validation/execution").ApprovalSnapshot[];
  executionAttempts?: import("@/lib/validation/execution").ExecutionAttempt[];
  followUpPlans?: import("@/lib/validation/execution").FollowUpPlan[];
  workflow: WorkflowRow;
  tasks: WorkflowTaskRow[];
  companies: CompanyRow[];
  leads: LeadRow[];
  agentRuns: AgentRunRow[];
  events: AgentEventRow[];
  approvals: ApprovalRow[];
  proposedActions: ProposedActionRow[];
}
