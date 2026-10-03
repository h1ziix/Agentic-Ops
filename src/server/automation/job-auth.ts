import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const dispatchPayloadSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("dispatch"), jobId: z.uuid(), providerRunId: z.string().min(1).max(240) }).strict(),
  z.object({ operation: z.literal("sweep"), providerRunId: z.string().min(1).max(240) }).strict(),
]);
export function signJobBody(body: string, timestamp: string, secret: string) {
  if (secret.length < 32) throw new Error("Job authentication is not configured.");
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
export function verifyJobBody(body: string, timestamp: string | null, signature: string | null, secret: string | undefined, now = Date.now()) {
  if (!secret || secret.length < 32 || !timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)
    || Math.abs(now - Number(timestamp)) > 60_000 || Buffer.byteLength(body, "utf8") > 4096) return false;
  return timingSafeEqual(Buffer.from(signJobBody(body, timestamp, secret), "hex"), Buffer.from(signature, "hex"));
}
