import "server-only";
import { z } from "zod";
import { AppError } from "../errors";
import { appOrigin } from "../integrations/config";
import { IntegrationError } from "../integrations/http";
export async function mutationBody(request: Request, maxBytes = 32_768): Promise<unknown> {
  if (request.headers.get("origin") !== appOrigin() || new URL(request.url).origin !== appOrigin()) throw new AppError("unauthorized");
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AppError("validation");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); throw new AppError("validation"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try { return body ? JSON.parse(body) : {}; } catch { throw new AppError("validation"); }
}
export function mutationError(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Check the request fields.", code: "validation" }, { status: 400 });
  if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.code === "unauthenticated" ? 401 : error.code === "unauthorized" ? 403
    : error.code === "not_found" ? 404 : error.code === "validation" ? 400 : ["conflict", "execution_blocked", "invalid_transition"].includes(error.code) ? 409 : 503 });
  if (error instanceof IntegrationError) return Response.json({ error: "Integration needs attention. No verified success was recorded.", code: error.code }, { status: 409 });
  return Response.json({ error: "The operation could not be saved. Refresh to inspect persisted state.", code: "unavailable" }, { status: 503 });
}
