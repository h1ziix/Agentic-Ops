import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { recordIdSchema } from "@/lib/validation/workflow";
import { workspaceRowSchema } from "@/lib/validation/rows";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "../repositories/parse";
import type { WorkspaceRow } from "@/types/persistence";

export type ServerSupabase = Awaited<ReturnType<typeof createServerClient>>;

export interface UserContext {
  supabase: ServerSupabase;
  user: User;
}

export interface WorkspaceContext extends UserContext {
  workspace: WorkspaceRow;
}

/** Server-side verified identity; never trusts a session cookie's embedded user. */
export async function requireUser(): Promise<UserContext> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AppError("unauthenticated");
  return { supabase, user: data.user };
}

export async function requireWorkspace(workspaceId?: string): Promise<WorkspaceContext> {
  const context = await requireUser();
  let id = workspaceId;

  if (id) {
    const parsed = recordIdSchema.safeParse(id);
    if (!parsed.success) throw new AppError("validation");
    id = parsed.data;
  } else {
    const { data, error } = await context.supabase.rpc("bootstrap_workspace");
    if (error) throw fromDatabaseError("bootstrap_workspace", error);
    const parsed = recordIdSchema.safeParse(data);
    if (!parsed.success) throw new AppError("database");
    id = parsed.data;
  }

  const { data, error } = await context.supabase.from("workspaces").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDatabaseError("get_workspace", error);
  if (!data) throw new AppError("unauthorized");
  return { ...context, workspace: parseDatabaseResult(workspaceRowSchema, data, "get_workspace") };
}
