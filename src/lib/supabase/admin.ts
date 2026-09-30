import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";
import { AppError } from "@/server/errors";
import { serverWebSocketTransport } from "./server-transport";

/** Server-only writer, constructed only after cookie-bound membership checks. */
export function createRuntimeClient() {
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new AppError("runtime_configuration");
  return createClient(getSupabaseEnv().url, key, {
    realtime: { transport: serverWebSocketTransport },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
