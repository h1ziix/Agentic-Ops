"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useDemoStore } from "@/components/app/demo-store";
import { automationSnapshotSchema } from "@/lib/validation/automation";
import type { AutomationSnapshot } from "@/types/automation";
import type { WorkspaceObservability } from "@/types/observability";

export interface AutomationResponse {
  ok: true;
  automation: AutomationSnapshot;
  enabled: boolean;
  providerConfigured: boolean;
  testJobsAllowed?: boolean;
  observability?: WorkspaceObservability;
}

const responseSchema = z.object({ ok: z.literal(true), automation: automationSnapshotSchema, enabled: z.boolean(), providerConfigured: z.boolean(), testJobsAllowed: z.boolean().optional(), observability: z.custom<WorkspaceObservability>().optional() });
const errorSchema = z.object({ error: z.string() });
// Share overlapping reads only. Settled responses are never retained between requests.
const inFlightReads = new Map<string, Promise<AutomationResponse>>();

function loadAutomation(endpoint: string, key: string): Promise<AutomationResponse> {
  const existing = inFlightReads.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body: unknown = await response.json();
    const parsed = responseSchema.safeParse(body);
    if (!response.ok || !parsed.success) { const failure = errorSchema.safeParse(body); throw new Error(failure.success ? failure.data.error : "Automation could not be loaded."); }
    return parsed.data;
  })();
  inFlightReads.set(key, pending);
  void pending.then(() => { if (inFlightReads.get(key) === pending) inFlightReads.delete(key); }, () => { if (inFlightReads.get(key) === pending) inFlightReads.delete(key); });
  return pending;
}

export function useAutomation(workflowId?: string) {
  const { mode, workspace } = useDemoStore();
  const router = useRouter();
  const endpoint = `/api/automation${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ""}`;
  const readKey = `${workspace.id}:${endpoint}`;
  const [snapshot, setSnapshot] = useState<{ key: string; response: AutomationResponse } | null>(null);
  const data = mode === "live" && snapshot?.key === readKey ? snapshot.response : null;
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const alive = useRef(false);
  const request = useRef(0);
  const snapshotVersion = useRef("");
  const refresh = useCallback(async () => {
    if (mode !== "live") return;
    const sequence = ++request.current;
    try {
      const loaded = await loadAutomation(endpoint, readKey);
      if (alive.current && sequence === request.current) {
        const version = JSON.stringify({ workflowId, jobs: loaded.automation.jobs.map((job) => [job.id, job.status, job.updated_at]), plans: loaded.automation.followUps.map((plan) => [plan.id, plan.automation_status, plan.updated_at]), replies: loaded.automation.replies.map((reply) => reply.id) });
        const changed = Boolean(snapshotVersion.current && snapshotVersion.current !== version);
        snapshotVersion.current = version;
        setSnapshot({ key: readKey, response: loaded }); setError("");
        if (changed) router.refresh();
      }
    } catch (cause) {
      if (alive.current && sequence === request.current) setError(cause instanceof Error ? cause.message : "Automation could not be loaded.");
    } finally {
      if (alive.current && sequence === request.current) setLoading(false);
    }
  }, [mode, workflowId, router, endpoint, readKey]);

  useEffect(() => {
    alive.current = true;
    const requestCounter = request;
    if (mode !== "live") return () => { alive.current = false; requestCounter.current++; };
    void Promise.resolve().then(refresh);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 10_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive.current = false; requestCounter.current++; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [mode, refresh]);

  const mutate = useCallback(async (path: string, operation: string, id: string, parameters?: Record<string, string>) => {
    if (pending) return false;
    setPending(id); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, ...parameters }) });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "This operation could not be saved.");
      // A read begun before the mutation must not satisfy its confirmation refresh.
      inFlightReads.delete(readKey);
      await refresh();
      return true;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "This operation could not be saved.");
      return false;
    } finally { if (alive.current) setPending(""); }
  }, [pending, refresh, readKey]);

  return { data, loading, error, pending, refresh,
    jobOperation: (id: string, operation: "retry" | "cancel") => mutate(`/api/automation/jobs/${encodeURIComponent(id)}`, operation, id),
    followUpOperation: (id: string, operation: "cancel" | "test_due") => mutate(`/api/automation/followups/${encodeURIComponent(id)}`, operation, id),
    workflowOperation: (id: string, operation: "continue" | "health_check" | "recover") => mutate(`/api/workflows/${encodeURIComponent(id)}/automation`, operation, id),
    activateFollowUps: () => mutate("/api/automation", "activate_followups", "activate", workflowId ? { workflowId } : undefined),
    retryExecution: (id: string, actionId: string, expectedSnapshotId: string) => mutate(`/api/workflows/${encodeURIComponent(id)}/automation`, "retry_execution", actionId, { actionId, expectedSnapshotId }),
  };
}
