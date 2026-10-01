import { z } from "zod";

export const plannerTaskTypeSchema = z.enum([
  "define_target_profile", "discover_companies", "research_companies",
  "identify_opportunities", "score_leads", "review_qualified_leads", "generate_outreach", "request_approval",
]);

const taskKey = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
export const plannerTaskSchema = z.object({
  id: taskKey.describe("Stable task key used by dependencies, not a database UUID"),
  type: plannerTaskTypeSchema,
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(2000),
  objective: z.string().min(1).max(1000),
  dependencies: z.array(taskKey).max(9),
  expectedOutput: z.string().min(1).max(1000),
}).strict();

// Keep refinements separate: the provider receives only supported JSON Schema constraints.
export const plannerOutputSchema = z.object({
  summary: z.string().min(1).max(2000),
  assumptions: z.array(z.string().min(1).max(500)).max(10),
  tasks: z.array(plannerTaskSchema).min(5).max(10),
}).strict();

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export const validatedPlannerOutputSchema = plannerOutputSchema.superRefine((plan, context) => {
  const seen = new Set<string>();
  const titles = new Set<string>();
  const ancestors = new Map<string, Set<string>>();
  for (const [index, task] of plan.tasks.entries()) {
    const reject = (message: string) => context.addIssue({ code: "custom", path: ["tasks", index], message });
    if (seen.has(task.id) || titles.has(task.title.trim().toLowerCase())) reject("Task IDs and titles must be unique.");
    if ([task.title, task.description, task.objective, task.expectedOutput].some((value) => !value.trim())) reject("Task text must not be blank.");
    if (new Set(task.dependencies).size !== task.dependencies.length) reject("Dependencies must be unique.");
    if (task.dependencies.some((dependency) => !seen.has(dependency))) reject("Dependencies must refer to earlier tasks; cycles and missing references are forbidden.");
    const inherited = new Set(task.dependencies.flatMap((dependency) => [dependency, ...ancestors.get(dependency) ?? []]));
    ancestors.set(task.id, inherited);
    seen.add(task.id);
    titles.add(task.title.trim().toLowerCase());
  }
  if (!plan.summary.trim() || plan.assumptions.some((value) => !value.trim())) context.addIssue({ code: "custom", message: "Summary and assumptions must not be blank." });
  if (plan.tasks[0]?.type !== "define_target_profile") context.addIssue({ code: "custom", message: "The plan must start by defining the target profile." });
  for (const type of ["discover_companies", "research_companies", "score_leads"] as const) {
    if (!plan.tasks.some((task) => task.type === type)) context.addIssue({ code: "custom", message: `The plan must include ${type}.` });
  }
  const approvals = plan.tasks.filter((task) => task.type === "request_approval");
  const last = plan.tasks.at(-1);
  if (approvals.length !== 1 || last?.type !== "request_approval") context.addIssue({ code: "custom", message: "Exactly one human approval gate must be the final task." });
  if (last && plan.tasks.slice(0, -1).some((task) => !ancestors.get(last.id)?.has(task.id))) context.addIssue({ code: "custom", message: "The approval gate must depend on every prior task, directly or transitively." });
});

export const plannerInputSchema = z.object({
  goal: z.string().min(24).max(4000),
  targetMarket: z.string().max(240).nullable(),
  location: z.string().max(240).nullable(),
  requestedLeadCount: z.number().int().min(1).max(1000),
  context: z.object({ title: z.string().max(240), approvalRequired: z.literal(true) }).strict(),
}).strict();
export type PlannerInput = z.infer<typeof plannerInputSchema>;

export function mapPlannerTasks(plan: PlannerOutput) {
  return validatedPlannerOutputSchema.parse(plan).tasks.map((task, index) => ({
    type: task.type,
    title: task.title.trim(),
    description: task.description.trim(),
    position: index + 1,
    input: {
      planTaskId: task.id,
      objective: task.objective.trim(),
      dependencies: task.dependencies,
      expectedOutput: task.expectedOutput.trim(),
    },
  }));
}

export const plannerTaskContextSchema = z.object({
  planTaskId: taskKey,
  objective: z.string(),
  dependencies: z.array(taskKey),
  expectedOutput: z.string(),
});
