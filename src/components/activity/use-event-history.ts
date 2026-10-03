"use client";

import { useEffect, useState } from "react";
import { useDemoStore } from "@/components/app/demo-store";
import { historyEventsPageSchema, type HistoryEventsPage } from "@/lib/validation/history";

/** Keep a single bounded history page; changing workflow never displays the previous scope. */
export function useEventHistory(workflowId: string, page: number) {
  const { mode, workspace } = useDemoStore();
  const [snapshot, setSnapshot] = useState<{ key: string; data?: HistoryEventsPage; error?: string }>();
  const [revision, setRevision] = useState(0);
  const key = `${workspace.id}:${workflowId}:${page}:${revision}`;
  useEffect(() => {
    if (mode !== "live") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind: "events", page: String(page) });
    if (workflowId !== "all") params.set("workflowId", workflowId);
    void (async () => {
      try {
        const response = await fetch(`/api/history?${params}`, { cache: "no-store", signal: controller.signal });
        const body: unknown = await response.json();
        const parsed = historyEventsPageSchema.safeParse(body);
        if (!response.ok || !parsed.success) throw new Error("Recorded history could not be loaded. Retry or choose another workflow.");
        if (!controller.signal.aborted) setSnapshot({ key, data: parsed.data });
      } catch {
        if (!controller.signal.aborted) setSnapshot({ key, error: "Recorded history could not be loaded. Retry or choose another workflow." });
      }
    })();
    return () => controller.abort();
  }, [mode, workflowId, page, key]);
  const current = snapshot?.key === key ? snapshot : undefined;
  return { data: current?.data, error: current?.error, loading: mode === "live" && !current, retry: () => setRevision((value) => value + 1) };
}
