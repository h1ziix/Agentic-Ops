import { z } from "zod";

const name = z.string().trim().min(2, "Use at least two characters for the name.").max(120);
const notes = z.string().trim().max(2000).default("");
const criteria = z.array(z.string().trim().min(1).max(120)).max(10).default([])
  .transform((items) => [...new Map(items.map((item) => [item.toLowerCase(), item])).values()]);
const count = z.number().int().min(1).max(20).default(10);

export const icpInputSchema = z.object({
  name, description: notes, industries: criteria, locations: criteria,
  companySizeMin: z.number().int().min(1).max(1000000).nullable().default(null),
  companySizeMax: z.number().int().min(1).max(1000000).nullable().default(null),
  businessModels: criteria, requiredSignals: criteria, preferredSignals: criteria, excludedSignals: criteria,
  automationFocus: criteria, minimumLeadScore: z.number().int().min(0).max(100).default(60),
  defaultCompanyCount: count,
}).strict().superRefine((input, context) => {
  if (input.companySizeMin !== null && input.companySizeMax !== null && input.companySizeMax < input.companySizeMin) {
    context.addIssue({ code: "custom", path: ["companySizeMax"], message: "Maximum company size must be at least the minimum." });
  }
  const exclusions = new Set(input.excludedSignals.map((signal) => signal.toLowerCase()));
  if (input.requiredSignals.some((signal) => exclusions.has(signal.toLowerCase()))) {
    context.addIssue({ code: "custom", path: ["excludedSignals"], message: "A signal cannot be both required and excluded." });
  }
});

export const templateInputSchema = z.object({
  name, description: notes, category: z.string().trim().max(120).default("Sales research"),
  defaultGoal: z.string().trim().min(24, "Describe the template goal in at least 24 characters.").max(1000),
  taskStrategy: z.string().trim().max(2000).default(""), defaultIcpId: z.uuid().nullable().default(null),
  defaultCompanyCount: count, approvalRequired: z.literal(true).default(true), followupEnabled: z.boolean().default(false),
}).strict();

const base = { id: z.uuid(), workspace_id: z.uuid(), name, description: z.string(),
  created_by: z.uuid().nullable(), created_at: z.string(), updated_at: z.string(), archived_at: z.string().nullable() };
export const icpRowSchema = z.object({ ...base, industries: z.array(z.string()), locations: z.array(z.string()),
  company_size_min: z.number().nullable(), company_size_max: z.number().nullable(), business_models: z.array(z.string()),
  required_signals: z.array(z.string()), preferred_signals: z.array(z.string()), excluded_signals: z.array(z.string()),
  automation_focus: z.array(z.string()), minimum_lead_score: z.number().int().min(0).max(100),
  default_company_count: z.number().int().min(1).max(20),
});
export const templateRowSchema = z.object({ ...base, category: z.string(), default_goal: z.string(), task_strategy: z.string(),
  default_icp_id: z.uuid().nullable(), default_company_count: z.number().int().min(1).max(20),
  approval_required: z.literal(true), followup_enabled: z.boolean(),
});

// Historical contracts deliberately contain only strategy, never mutable ownership or archive state.
export const icpSnapshotSchema = icpRowSchema.omit({ workspace_id: true, created_by: true, created_at: true, archived_at: true });
export const templateSnapshotSchema = templateRowSchema.omit({ workspace_id: true, created_by: true, created_at: true, archived_at: true });
export const icpAgentContextSchema = icpSnapshotSchema.omit({ id: true, name: true, description: true, updated_at: true, default_company_count: true });

export const qualificationSnapshotSchema = z.object({ minimumLeadScore: z.number().int().min(0).max(100),
  score: z.number().nullable(), qualified: z.boolean(), icpId: z.uuid().nullable(), icpName: z.string().nullable(),
  exclusionMatches: z.array(z.string()), components: z.unknown().nullable() });

export function icpAgentContext(snapshot: unknown) {
  const parsed = icpSnapshotSchema.safeParse(snapshot);
  return parsed.success ? icpAgentContextSchema.parse(parsed.data) : undefined;
}
