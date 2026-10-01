import "server-only";
export class IntegrationError extends Error {
  constructor(public readonly code: string, public readonly disposition: "blocked" | "retryable" | "terminal" | "unknown", public readonly retryAfterSeconds = 0) {
    super(code); this.name = "IntegrationError";
  }
}
export type IntegrationFetch = typeof fetch;
/** No redirects with bearer credentials, no implicit mutation retries. */
export async function providerFetch(url: string, init: RequestInit, transport: IntegrationFetch = fetch) {
  if (!["gmail.googleapis.com", "oauth2.googleapis.com", "openidconnect.googleapis.com", "api.hubapi.com", "api.hubspot.com"].includes(new URL(url).hostname) || new URL(url).protocol !== "https:") throw new IntegrationError("invalid_provider_host", "blocked");
  try { return await transport(url, { ...init, redirect: "error", signal: init.signal ?? AbortSignal.timeout(30_000), cache: "no-store" }); }
  catch { throw new IntegrationError("transport_uncertain", "unknown"); }
}
export async function safeJson(response: Response): Promise<unknown> {
  try {
    if (!response.body) throw new Error();
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1_000_000) { await reader.cancel(); throw new Error(); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  catch { throw new IntegrationError("invalid_provider_response", "unknown"); }
}
