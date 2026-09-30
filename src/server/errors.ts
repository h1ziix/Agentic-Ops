export type AppErrorCode =
  | "unauthenticated"
  | "unauthorized"
  | "not_found"
  | "invalid_transition"
  | "validation"
  | "database"
  | "ai_configuration" | "ai_quota_exhausted" | "ai_unavailable" | "ai_timeout" | "ai_invalid_output" | "ai_refused"
  | "runtime_configuration";

const messages: Record<AppErrorCode, string> = {
  unauthenticated: "Please sign in to continue.",
  unauthorized: "You do not have access to this workspace.",
  not_found: "The requested record was not found.",
  invalid_transition: "This status change is not allowed.",
  validation: "Please check the supplied information.",
  database: "The requested change could not be saved. Please try again.",
  ai_configuration: "Planning is not configured.",
  ai_quota_exhausted: "The planning provider's API credit or spending limit has been reached.",
  ai_unavailable: "The planning provider is unavailable.",
  ai_timeout: "Planning timed out.",
  ai_invalid_output: "The Planner returned an invalid plan.",
  ai_refused: "The Planner could not process this goal.",
  runtime_configuration: "Planning persistence is unavailable. Ask your workspace administrator to configure the server's Supabase secret key.",
};

export class AppError extends Error {
  constructor(public readonly code: AppErrorCode, message = messages[code]) {
    super(message);
    this.name = "AppError";
  }
}

type DatabaseErrorLike = { code?: string; message?: string };

export function fromDatabaseError(operation: string, error: DatabaseErrorLike): AppError {
  console.error("Database operation failed", { operation, code: error.code ?? "unknown" });
  if (error.code === "42501") return new AppError("unauthorized");
  if (error.code === "22023") {
    return new AppError(operation.startsWith("transition_") || operation === "resolve_approval" ? "invalid_transition" : "validation");
  }
  if (error.code === "PGRST116" || error.code === "P0002") return new AppError("not_found");
  return new AppError("database");
}
