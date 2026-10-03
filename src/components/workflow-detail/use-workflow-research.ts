"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoStore } from "@/components/app/demo-store";
import type { Workflow, WorkspaceViewData } from "@/types/domain";
import { z } from "zod";
const responseSchema = z.object({ status: z.enum(["more", "in_progress", "research_complete", "failed", "waiting_for_approval", "preparation_complete"]), runId: z.uuid().optional() });
const failureSchema = z.object({ error: z.string() });

export function useWorkflowResearch(workflow: Workflow | undefined, backgroundAutomationEnabled?: boolean) {
  const { mode, plannerRuns, updateWorkflow, workflowTasks } = useDemoStore();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const started = useRef<string | null>(null);
  const executing = useRef(false);
  const visibleWorkflow = useRef(workflow?.id);
  const alive = useRef(true);
  const latestUpdate = useRef(updateWorkflow);
  useEffect(() => { latestUpdate.current = updateWorkflow; }, [updateWorkflow]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { visibleWorkflow.current = workflow?.id; started.current = null; }, [workflow?.id]);
  const refresh = useCallback(async (id: string) => {
    const response = await fetch(`/api/workflows/${id}/status`, { cache: "no-store" });
    if (!response.ok) throw new Error("Research progress could not be loaded. Refresh to reconnect.");
    const view: WorkspaceViewData = await response.json();
    if (alive.current) latestUpdate.current(view);
    return view.workflows[0];
  }, []);
  const start = useCallback(async (id: string, retry = false) => {
    if (executing.current) return;
    executing.current = true; setPending(true); setError("");
    try {
      // Each response commits one bounded task/company. Progress comes from persisted task states.
      while (alive.current && visibleWorkflow.current === id) {
        const response = await fetch(`/api/workflows/${id}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retry }) });
        retry = false;
        const body: unknown = await response.json();
        const result = responseSchema.safeParse(body);
        if (!response.ok || !result.success) {
          const failure = failureSchema.safeParse(body);
          throw new Error(failure.success ? failure.data.error : "Research could not continue. Resume after checking the trace.");
        }
        const saved = await refresh(id);
        if (backgroundAutomationEnabled && result.data.status === "in_progress") break;
        if (["research_complete", "waiting_for_approval", "preparation_complete"].includes(result.data.status) || saved?.status !== "running") break;
        if (result.data.status === "failed") throw new Error("A research task needs attention. Successful company results are retained.");
        if (result.data.status === "in_progress") await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }
      if (alive.current && visibleWorkflow.current === id) router.refresh();
    } catch (cause) {
      if (alive.current && visibleWorkflow.current === id) {
        setError(cause instanceof Error ? cause.message : "Research could not continue.");
        try { await refresh(id); } catch { /* Preserve the actionable request error. */ }
      }
    } finally { executing.current = false; if (alive.current) setPending(false); }
  }, [refresh, router, backgroundAutomationEnabled]);
  const id = workflow?.id;
  const ready = mode === "live" && backgroundAutomationEnabled === false && workflow?.status === "running" && plannerRuns.some((run) => run.workflowId === id && run.status === "completed");
  const failedTask = workflowTasks.some((task) => task.workflowId === id && task.status === "failed");
  useEffect(() => {
    if (!ready || !id || failedTask || pending || executing.current || started.current === id) return;
    started.current = id;
    void start(id);
  }, [ready, id, failedTask, pending, start]);
  useEffect(() => {
    if (mode !== "live" || !id || (!pending && !(backgroundAutomationEnabled && workflow?.status === "running"))) return;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || document.hidden) return;
      polling = true;
      try { await refresh(id); } catch { /* The dispatch request reports failures; polling reconnects next tick. */ }
      finally { polling = false; }
    }, backgroundAutomationEnabled ? 3000 : 1500);
    return () => clearInterval(timer);
  }, [mode, id, pending, refresh, backgroundAutomationEnabled, workflow?.status]);
  return { pending, error, retry: () => id && void start(id, true), resume: () => id && void start(id) };
}
