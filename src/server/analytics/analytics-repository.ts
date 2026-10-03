import "server-only";
import { intelligenceDatabaseSchema, type IntelligenceFilters } from "@/types/intelligence";
import type { ServerSupabase } from "../auth/context";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "../repositories/parse";

export class AnalyticsRepository {
  constructor(private readonly supabase: ServerSupabase) {}
  async load(workspaceId: string, filters: IntelligenceFilters, period: { from: string | null; to: string; timeZone: string }) {
    const { data, error } = await this.supabase.rpc("intelligence_analytics_08", {
      p_workspace: workspaceId, p_from: period.from, p_to: period.to, p_timezone: period.timeZone, p_filters: filters,
    });
    if (error) throw fromDatabaseError("intelligence_analytics", error);
    return parseDatabaseResult(intelligenceDatabaseSchema, data, "intelligence_analytics");
  }
}
