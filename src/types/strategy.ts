import type { z } from "zod";
import type { icpInputSchema, templateInputSchema, icpRowSchema, templateRowSchema, icpSnapshotSchema,
  templateSnapshotSchema, icpAgentContextSchema } from "@/lib/validation/strategy";

export type IcpInput = z.infer<typeof icpInputSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type IdealCustomerProfile = z.infer<typeof icpRowSchema>;
export type WorkflowTemplate = z.infer<typeof templateRowSchema>;
export type IcpSnapshot = z.infer<typeof icpSnapshotSchema>;
export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>;
export type IcpAgentContext = z.infer<typeof icpAgentContextSchema>;
export interface StrategyLibrary { icps: IdealCustomerProfile[]; templates: WorkflowTemplate[] }
export type StrategyResult<T> = { data: T; error?: never } | { data?: never; error: string };
