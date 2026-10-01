import "server-only";
import { z } from "zod";
import { connectionRowSchema } from "@/lib/validation/execution";
import type { ServerSupabase } from "../auth/context";
import { fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";
export const credentialSchema = z.object({ connection_id: z.uuid(), workspace_id: z.uuid(), provider: z.string(), generation: z.number(), encrypted_tokens: z.string(),
  expires_at: z.string(), version: z.number(), refresh_claim: z.uuid().nullable(), refresh_lease: z.string().nullable() });
export class IntegrationRepository {
  constructor(private readonly db: ServerSupabase) {}
  async list(workspace: string) {
    const { data, error } = await this.db.from("integration_connections").select("*").eq("workspace_id", workspace).order("provider");
    if (error) throw fromDatabaseError("integration_list", error);
    return parseDatabaseResult(z.array(connectionRowSchema), data, "integration_list");
  }
  async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw fromDatabaseError(name, error);
    return data as unknown;
  }
  async credentials(workspace: string, id: string) {
    const { data, error } = await this.db.from("integration_credentials").select("*").eq("workspace_id", workspace).eq("connection_id", id).maybeSingle();
    if (error) throw fromDatabaseError("integration_credentials", error);
    return data ? credentialSchema.parse(data) : null;
  }
}
