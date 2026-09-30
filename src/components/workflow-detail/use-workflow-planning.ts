"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useDemoStore } from "@/components/app/demo-store";
import type { Workflow, WorkspaceViewData } from "@/types/domain";

const errorResponseSchema = z.object({ error: z.string() });
const planningResponseSchema = z.object({ status: z.enum(["completed", "in_progress"]), runId: z.uuid() });

export function useWorkflowPlanning(workflow: Workflow | undefined) {
  const { mode, updateWorkflow, workflowTasks } = useDemoStore();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const started = useRef<string | null>(null);
  const requestRunning = useRef(false);
  const latestUpdate = useRef(updateWorkflow);
  useEffect(() => { latestUpdate.current = updateWorkflow; }, [updateWorkflow]);

  const refreshStatus = useCallback(async (id: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/workflows/${id}/status`, { cache: "no-store", signal });
    if (!response.ok) {
      const body = errorResponseSchema.safeParse(await response.json());
      throw new Error(body.success ? body.data.error : "Workflow status could not be loaded. Refresh to try again.");
    }
    const view: WorkspaceViewData = await response.json();
    latestUpdate.current(view);
    return view.workflows[0];
  }, []);

  const start = useCallback(async (id: string) => {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setPending(true);
    setError("");
    try {
      // This request runs independently of navigation and polling. No client-side secrets.
      const response = await fetch(`/api/workflows/${id}/plan`, { method: "POST" });
      const body: unknown = await response.json();
      const parsed = planningResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const failure = errorResponseSchema.safeParse(body);
        throw new Error(failure.success ? failure.data.error : "Planning could not be started. Please retry planning.");
      }
      await refreshStatus(id);
      setError("");
      if (parsed.data.status === "completed") router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Planning could not be started. Please retry planning.");
      try {
        const saved = await refreshStatus(id);
        if (saved?.status === "running") setError("");
      } catch { /* Keep the actionable request error. */ }
    } finally {
      requestRunning.current = false;
      setPending(false);
    }
  }, [refreshStatus, router]);

  const id = workflow?.id;
  const status = workflow?.status;
  const hasTasks = workflowTasks.some((task) => task.workflowId === id);
  useEffect(() => {
    if (mode !== "live" || !id || status !== "planning" || hasTasks || started.current === id) return;
    started.current = id;
    void start(id);
  }, [mode, id, status, hasTasks, start]);

  useEffect(() => {
    if (mode !== "live" || !id || (status !== "planning" && !pending) || error) return;
    const abort = new AbortController();
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || document.hidden) return;
      polling = true;
      try { await refreshStatus(id, abort.signal); }
      catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Planning progress could not be loaded. Refresh to reconnect.");
      } finally { polling = false; }
    }, 1_500);
    return () => { clearInterval(timer); abort.abort(); };
  }, [mode, id, status, error, pending, refreshStatus]);

  return { error, pending, retry: () => id && void start(id) };
}
