import "server-only";
import { intelligenceFilterSchema, type IntelligenceData } from "@/types/intelligence";
import { requireWorkspace } from "../auth/context";
import { AppError } from "../errors";
import { AnalyticsRepository } from "./analytics-repository";
import { analyticsPeriod } from "./time-range";
import { buildLeadFunnel, deriveInsights } from "./metric-definitions";

export async function loadIntelligence(query: Record<string, string | string[] | undefined> = {}, now = new Date()): Promise<IntelligenceData> {
  const input = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = intelligenceFilterSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation");
  const { supabase, workspace } = await requireWorkspace();
  const period = analyticsPeriod(parsed.data.range, now, process.env.WORKSPACE_TIMEZONE ?? "Asia/Qyzylorda");
  const data = await new AnalyticsRepository(supabase).load(workspace.id, parsed.data, period);
  return { ...data, filters: parsed.data, period, funnel: buildLeadFunnel(data.summary), insights: deriveInsights(data) };
}
