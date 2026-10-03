import { StrategyWorkspace } from "@/components/strategy/strategy-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listStrategy } from "@/server/services/strategy-service";

export default async function IcpPage() {
  if (!isSupabaseConfigured()) return <StrategyWorkspace kind="icps" library={{ icps: [], templates: [] }} />;
  let library = { icps: [], templates: [] } as Awaited<ReturnType<typeof listStrategy>>; let loadError: string | undefined;
  try { library = await listStrategy(true); }
  catch { loadError = "Profiles could not be loaded. Check the strategy migrations and refresh this page."; }
  return <StrategyWorkspace kind="icps" library={library} loadError={loadError} />;
}
