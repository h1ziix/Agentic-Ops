import "server-only";
import { createHash } from "node:crypto";
import type { ExecutableEnvelope } from "@/lib/validation/execution";
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Undefined envelope value");
  return serialized;
}
export const envelopeDigest = (value: ExecutableEnvelope) => createHash("sha256").update(canonicalJson(value)).digest("hex");
