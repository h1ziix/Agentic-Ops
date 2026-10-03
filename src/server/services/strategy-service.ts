import "server-only";
import { icpInputSchema, templateInputSchema } from "@/lib/validation/strategy";
import { recordIdSchema } from "@/lib/validation/workflow";
import { requireWorkspace, type WorkspaceContext } from "../auth/context";
import { AppError } from "../errors";
import { StrategyRepository, type StrategyStore } from "../repositories/strategy-repository";

/** Auth context is supplied by server code only; mutation RPCs repeat membership and archive checks. */
export class StrategyService {
  constructor(private readonly context: WorkspaceContext, private readonly store: StrategyStore) {}
  async list(includeArchived = false) {
    const [icps, templates] = await Promise.all([
      this.store.listIcps(this.context.workspace.id, includeArchived), this.store.listTemplates(this.context.workspace.id, includeArchived),
    ]);
    return { icps, templates };
  }
  private id(id: string) {
    const parsed = recordIdSchema.safeParse(id);
    if (!parsed.success) throw new AppError("validation");
    return parsed.data;
  }
  saveIcp(input: unknown, id?: string) {
    const parsed = icpInputSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message);
    return this.store.mutateIcp(this.context.workspace.id, id ? "update" : "create", id ? this.id(id) : null, parsed.data);
  }
  duplicateIcp(id: string) { return this.store.mutateIcp(this.context.workspace.id, "duplicate", this.id(id)); }
  archiveIcp(id: string) { return this.store.mutateIcp(this.context.workspace.id, "archive", this.id(id)); }
  saveTemplate(input: unknown, id?: string) {
    const parsed = templateInputSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message);
    return this.store.mutateTemplate(this.context.workspace.id, id ? "update" : "create", id ? this.id(id) : null, parsed.data);
  }
  duplicateTemplate(id: string) { return this.store.mutateTemplate(this.context.workspace.id, "duplicate", this.id(id)); }
  archiveTemplate(id: string) { return this.store.mutateTemplate(this.context.workspace.id, "archive", this.id(id)); }
}

export async function strategyService(context?: WorkspaceContext) {
  const authorized = context ?? await requireWorkspace();
  return new StrategyService(authorized, new StrategyRepository(authorized.supabase));
}
export async function listStrategy(includeArchived = false, context?: WorkspaceContext) {
  return (await strategyService(context)).list(includeArchived);
}
