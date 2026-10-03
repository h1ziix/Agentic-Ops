import { z } from "zod";
import { companyRowSchema, leadRowSchema } from "@/lib/validation/rows";
import type { CompanyRow, LeadRow } from "@/types/persistence";
import type { ServerSupabase } from "../auth/context";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export class CompanyRepository {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkflowAssociations(workspaceId: string) {
    const { data, error } = await this.supabase.from("workflow_companies").select("workflow_id,company_id,research_status").eq("workspace_id", workspaceId);
    if (error) throw fromDatabaseError("list_company_workflows", error);
    return parseDatabaseResult(z.array(z.object({ workflow_id: z.uuid(), company_id: z.uuid(), research_status: companyRowSchema.shape.research_status })), data, "list_company_workflows");
  }

  async listWorkspaceCompanies(workspaceId: string, workflowId?: string): Promise<CompanyRow[]> {
    if (workflowId) {
      const { data, error } = await this.supabase.from("workflow_companies").select("research_status,companies(*)")
        .eq("workspace_id", workspaceId).eq("workflow_id", workflowId).order("created_at");
      if (error) throw fromDatabaseError("list_workflow_companies", error);
      const rows = parseDatabaseResult(z.array(z.object({ research_status: companyRowSchema.shape.research_status, companies: companyRowSchema })), data, "list_workflow_companies");
      return rows.map((row) => ({ ...row.companies, workflow_id: workflowId, research_status: row.research_status }));
    }
    const query = this.supabase.from("companies").select("*").eq("workspace_id", workspaceId);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_companies", error);
    return parseDatabaseResult(z.array(companyRowSchema), data, "list_companies");
  }
}

export class LeadRepository {
  constructor(private readonly supabase: ServerSupabase) {}

  /** Historical positive observations are durable facts; absence never proves no reply. */
  async listDetectedReplyLeadIds(workspaceId: string, workflowId?: string): Promise<string[]> {
    let query = this.supabase.from("reply_observations").select("lead_id").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("detected_at", { ascending: false });
    if (error) throw fromDatabaseError("list_detected_reply_leads", error);
    const rows = parseDatabaseResult(z.array(z.object({ lead_id: z.uuid() })), data, "list_detected_reply_leads");
    return [...new Set(rows.map((row) => row.lead_id))];
  }

  async listWorkspaceLeads(workspaceId: string, workflowId?: string): Promise<LeadRow[]> {
    let query = this.supabase.from("leads").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_leads", error);
    return parseDatabaseResult(z.array(leadRowSchema), data, "list_leads");
  }
}
