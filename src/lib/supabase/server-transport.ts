import "server-only";
import { WebSocket } from "ws";
import type { SupabaseClientOptions } from "@supabase/supabase-js";

// ws implements the browser event interface used by Realtime. Its Node overloads
// differ from the SDK's DOM constructor type. This keeps Node 20 server clients usable.
export const serverWebSocketTransport = WebSocket as unknown as NonNullable<SupabaseClientOptions<"public">["realtime"]>["transport"];
