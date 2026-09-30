import "server-only";
import { z } from "zod";
import { ResearchError, type ResearchProvider } from "./research-budget";

export async function providerJson(provider: ResearchProvider, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      let retryMs = retry ? (/^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 1000;
      if (provider === "gemini" && response.status === 429) {
        const diagnostic = z.object({ error: z.object({ details: z.array(z.object({ retryDelay: z.string().optional(),
          violations: z.array(z.object({ quotaValue: z.string().optional() })).optional() })).optional() }) });
        const detail = diagnostic.safeParse(await response.json().catch(() => null));
        if (detail.success) {
          if (detail.data.error.details?.some((item) => item.violations?.some((violation) => violation.quotaValue === "0"))) throw new ResearchError("ai_quota_exhausted", provider, false, 1000, response.status);
          const delay = detail.data.error.details?.find((item) => item.retryDelay)?.retryDelay;
          if (delay && /^\d+(\.\d+)?s$/.test(delay)) retryMs = Math.max(retryMs, Number(delay.slice(0, -1)) * 1000);
        }
      }
      if ([432, 433].includes(response.status)) throw new ResearchError("ai_quota_exhausted", provider, false, 1000, response.status);
      if ([400, 401, 403, 404, 422].includes(response.status)) throw new ResearchError("ai_configuration", provider, false, 1000, response.status);
      throw new ResearchError("ai_unavailable", provider, response.status === 429 || response.status >= 500,
        Number.isFinite(retryMs) ? Math.max(1000, retryMs) : 1000, response.status);
    }
    if (Number(response.headers.get("content-length")) > 1_048_576) throw new ResearchError("ai_invalid_output", provider);
    const body = await response.text();
    if (body.length > 1_048_576) throw new ResearchError("ai_invalid_output", provider);
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new ResearchError("ai_timeout", provider, true);
    if (error instanceof SyntaxError) throw new ResearchError("ai_invalid_output", provider);
    throw new ResearchError("ai_unavailable", provider, true);
  }
}
