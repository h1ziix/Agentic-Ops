import { z } from "zod";
import { companyRowSchema, leadRowSchema } from "@/lib/validation/rows";
import type { CompanyRow, LeadRow } from "@/types/persistence";
import type { ServerSupabase } from "../auth/context";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export class CompanyRepository {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkspaceCompanies(workspaceId: string, workflowId?: string): Promise<CompanyRow[]> {
    let query = this.supabase.from("companies").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_companies", error);
    return parseDatabaseResult(z.array(companyRowSchema), data, "list_companies");
  }
}

export class LeadRepository {
  constructor(private readonly supabase: ServerSupabase) {}

  async listWorkspaceLeads(workspaceId: string, workflowId?: string): Promise<LeadRow[]> {
    let query = this.supabase.from("leads").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw fromDatabaseError("list_leads", error);
    return parseDatabaseResult(z.array(leadRowSchema), data, "list_leads");
  }
}
