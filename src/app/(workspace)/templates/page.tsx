import { StrategyWorkspace } from "@/components/strategy/strategy-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listStrategy } from "@/server/services/strategy-service";

export default async function TemplatesPage() {
  if (!isSupabaseConfigured()) return <StrategyWorkspace kind="templates" library={{ icps: [], templates: [] }} />;
  let library = { icps: [], templates: [] } as Awaited<ReturnType<typeof listStrategy>>; let loadError: string | undefined;
  try { library = await listStrategy(true); }
  catch { loadError = "Templates could not be loaded. Check the strategy migrations and refresh this page."; }
  return <StrategyWorkspace kind="templates" library={library} loadError={loadError} />;
}
