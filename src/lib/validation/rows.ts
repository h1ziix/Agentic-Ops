import { z } from "zod";
import { taskStatusSchema, workflowStatusSchema } from "./workflow";
import { agentStatusSchema, agentTypeSchema } from "./agent";
import { storedSourceSchema, automationOpportunitySchema, scoreComponentsSchema } from "./research";
import { reviewerOutputSchema } from "./outreach";

const id = z.uuid();
const timestamp = z.string();
const nullableTimestamp = timestamp.nullable();
const jsonObject = z.record(z.string(), z.unknown());

export const workspaceRowSchema = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  created_by: id,
  is_personal: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const workflowRowSchema = z.object({
  id,
  workspace_id: id,
  created_by: id.nullable(),
  title: z.string(),
  goal: z.string(),
  status: workflowStatusSchema,
  progress: z.number(),
  current_step: z.string(),
  target_companies: z.number(),
  created_at: timestamp,
  updated_at: timestamp,
  started_at: nullableTimestamp,
  completed_at: nullableTimestamp,
  failed_at: nullableTimestamp,
});

export const workflowTaskRowSchema = z.object({
  id,
  workspace_id: id,
  workflow_id: id,
  type: z.string(),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  position: z.number(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.unknown().nullable(),
  started_at: nullableTimestamp,
  completed_at: nullableTimestamp,
  created_at: timestamp,
  updated_at: timestamp,
});

export const companyRowSchema = z.object({
  id,
  workspace_id: id,
  workflow_id: id.nullable(),
  name: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  employee_estimate: z.string().nullable(),
  research_summary: z.string().nullable(),
  research_status: z.enum(["queued", "researching", "researched", "failed"]),
  source_urls: z.array(z.string()),
  sources: z.array(storedSourceSchema).optional(),
  automation_opportunities: z.array(automationOpportunitySchema.extend({ evidence: z.array(z.string()).optional() })).optional(),
  qualification: z.unknown().nullable().optional(),
  normalized_domain: z.string().nullable().optional(),
  normalized_name: z.string().nullable().optional(),
  last_researched_at: nullableTimestamp,
  created_at: timestamp,
  updated_at: timestamp,
});

export const leadRowSchema = z.object({
  id,
  workspace_id: id,
  company_id: id,
  workflow_id: id,
  status: z.enum(["new", "qualified", "outreach_ready", "waiting_approval", "contacted", "responded", "converted", "rejected"]),
  score: z.number().nullable(),
  score_reason: z.string().nullable(),
  opportunity: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  outreach_status: z.enum(["not_started", "reviewing", "drafting", "draft_ready", "drafted", "waiting_approval", "approved", "rejected", "needs_more_research", "blocked_missing_recipient", "failed", "sent"]),
  review_metadata: reviewerOutputSchema.nullable().optional(),
  research_run_id: id.nullable().optional(),
  score_components: scoreComponentsSchema.nullable().optional(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const agentRunRowSchema = z.object({
  id,
  workspace_id: id,
  workflow_id: id,
  workflow_task_id: id.nullable(),
  agent_type: agentTypeSchema,
  status: agentStatusSchema,
  model: z.string().nullable(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.unknown().nullable(),
  started_at: nullableTimestamp,
  completed_at: nullableTimestamp,
  created_at: timestamp,
  duration_ms: z.number().nullable().optional(),
  retry_count: z.number().optional(),
  task_count: z.number().optional(),
  input_tokens: z.number().nullable().optional(),
  output_tokens: z.number().nullable().optional(),
  total_tokens: z.number().nullable().optional(),
});

export const agentEventTypeSchema = z.enum([
  "workflow_planning_started", "model_request_started", "plan_generated", "plan_validation_failed", "task_created",
  "workflow_created", "workflow_started", "workflow_paused", "workflow_resumed", "workflow_completed", "workflow_failed", "workflow_cancelled", "workflow_ready_for_execution", "workflow_needs_revision",
  "agent_started", "agent_completed", "agent_failed", "reasoning_summary",
  "task_started", "task_completed", "task_failed",
  "tool_called", "tool_completed", "tool_failed",
  "company_discovered", "company_researched", "lead_scored",
  "research_started", "company_research_started", "company_research_failed", "lead_qualified", "lead_rejected",
  "approval_requested", "approval_approved", "approval_rejected",
  "review_started", "review_completed", "lead_approved_for_outreach", "lead_rejected_for_outreach", "lead_requires_more_research",
  "outreach_draft_created", "outreach_draft_failed", "proposed_action_edited", "proposed_action_approved", "proposed_action_rejected",
  "execution_started", "execution_completed", "execution_failed", "error", "retry",
]);

export const agentEventRowSchema = z.object({
  id,
  workspace_id: id,
  workflow_id: id,
  agent_run_id: id.nullable(),
  workflow_task_id: id.nullable(),
  event_type: agentEventTypeSchema,
  summary: z.string(),
  metadata: jsonObject,
  created_at: timestamp,
});

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled", "executed"]);
export const approvalDecisionSchema = z.enum(["approved", "rejected"]);

export const approvalRowSchema = z.object({
  id,
  workspace_id: id,
  workflow_id: id,
  requested_by_agent_run_id: id.nullable(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  status: approvalStatusSchema,
  risk_level: z.string(),
  created_at: timestamp,
  resolved_at: nullableTimestamp,
  resolved_by: id.nullable(),
});

export const proposedActionRowSchema = z.object({
  id,
  workspace_id: id,
  workflow_id: id,
  approval_id: id,
  action_type: z.string(),
  target: jsonObject,
  payload: jsonObject,
  status: z.enum(["draft", "ready_for_review", "pending_approval", "waiting_for_approval", "approved", "rejected", "cancelled", "executed", "failed"]),
  dedupe_key: z.string().nullable().optional(),
  revision: z.number().int().optional(),
  risk_level: z.string(),
  created_at: timestamp,
  executed_at: nullableTimestamp,
  error: z.unknown().nullable(),
});
