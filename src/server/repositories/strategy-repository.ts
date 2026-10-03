import { z } from "zod";
import { icpRowSchema, templateRowSchema } from "@/lib/validation/strategy";
import type { IdealCustomerProfile, IcpInput, TemplateInput, WorkflowTemplate } from "@/types/strategy";
import type { ServerSupabase } from "../auth/context";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export interface StrategyStore {
  listIcps(workspaceId: string, includeArchived: boolean): Promise<IdealCustomerProfile[]>;
  listTemplates(workspaceId: string, includeArchived: boolean): Promise<WorkflowTemplate[]>;
  mutateIcp(workspaceId: string, operation: "create" | "update" | "duplicate" | "archive", id: string | null, input?: IcpInput): Promise<IdealCustomerProfile>;
  mutateTemplate(workspaceId: string, operation: "create" | "update" | "duplicate" | "archive", id: string | null, input?: TemplateInput): Promise<WorkflowTemplate>;
}

export class StrategyRepository implements StrategyStore {
  constructor(private readonly supabase: ServerSupabase) {}
  async listIcps(workspaceId: string, includeArchived = false) {
    let query = this.supabase.from("ideal_customer_profiles").select("*").eq("workspace_id", workspaceId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_icps", error);
    return parseDatabaseResult(z.array(icpRowSchema), data, "list_icps");
  }
  async listTemplates(workspaceId: string, includeArchived = false) {
    let query = this.supabase.from("workflow_templates").select("*").eq("workspace_id", workspaceId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_templates", error);
    return parseDatabaseResult(z.array(templateRowSchema), data, "list_templates");
  }
  private async mutate(workspaceId: string, kind: "icp" | "template", operation: "create" | "update" | "duplicate" | "archive", id: string | null, input: Record<string, unknown>) {
    const { data, error } = await this.supabase.rpc("mutate_sales_strategy", {
      p_workspace: workspaceId, p_kind: kind, p_operation: operation, p_id: id, p_input: input,
    });
    if (error) throw fromDatabaseError(`mutate_${kind}`, error);
    return data;
  }
  async mutateIcp(workspaceId: string, operation: "create" | "update" | "duplicate" | "archive", id: string | null, input?: IcpInput) {
    const fields = input ? { name: input.name, description: input.description, industries: input.industries, locations: input.locations,
      company_size_min: input.companySizeMin, company_size_max: input.companySizeMax, business_models: input.businessModels,
      required_signals: input.requiredSignals, preferred_signals: input.preferredSignals, excluded_signals: input.excludedSignals,
      automation_focus: input.automationFocus, minimum_lead_score: input.minimumLeadScore, default_company_count: input.defaultCompanyCount } : {};
    return parseDatabaseResult(icpRowSchema, await this.mutate(workspaceId, "icp", operation, id, fields), "mutate_icp");
  }
  async mutateTemplate(workspaceId: string, operation: "create" | "update" | "duplicate" | "archive", id: string | null, input?: TemplateInput) {
    const fields = input ? { name: input.name, description: input.description, category: input.category, default_goal: input.defaultGoal,
      task_strategy: input.taskStrategy, default_icp_id: input.defaultIcpId, default_company_count: input.defaultCompanyCount,
      approval_required: input.approvalRequired, followup_enabled: input.followupEnabled } : {};
    return parseDatabaseResult(templateRowSchema, await this.mutate(workspaceId, "template", operation, id, fields), "mutate_template");
  }
}
