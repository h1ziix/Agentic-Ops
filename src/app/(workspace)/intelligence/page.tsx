import { IntelligenceWorkspace } from "@/components/intelligence/intelligence-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { loadIntelligence } from "@/server/analytics/analytics-service";
import { AppError } from "@/server/errors";
import { intelligenceFilterSchema } from "@/types/intelligence";

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (!isSupabaseConfigured()) return <IntelligenceWorkspace configured={false} />;
  const parsed = intelligenceFilterSchema.safeParse(Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "" && value !== undefined)));
  if (!parsed.success) return <IntelligenceWorkspace error={parsed.error.issues[0]?.message ?? "Check the filters."} />;
  let data: Awaited<ReturnType<typeof loadIntelligence>> | undefined; let loadError: string | undefined;
  try { data = await loadIntelligence(query); }
  catch (error) { loadError = error instanceof AppError && error.code === "validation" ? "Check the selected filters." : "Analytics could not be loaded. Apply the Release 0.8 migrations and retry."; }
  return <IntelligenceWorkspace data={data} filters={parsed.data} error={loadError} />;
}
