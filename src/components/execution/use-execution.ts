"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoStore } from "@/components/app/demo-store";
import type { ProposedAction } from "@/types/domain";
import { attemptRowSchema } from "@/lib/validation/execution";
export function useExecution(workflowId: string) {
  const { updateWorkflow, mode } = useDemoStore(); const router = useRouter(); const [pending, setPending] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const mounted = useRef(true); const executing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function refresh() {
    const response = await fetch(`/api/workflows/${workflowId}/status`, { cache: "no-store" });
    if (!response.ok) throw new Error("Connection to saved status was lost. Refresh before deciding what to do next.");
    updateWorkflow(await response.json()); router.refresh();
  }
  async function execute(actions: ProposedAction[], retry = false) {
    if (mode !== "live" || executing.current || pending || actions.length === 0 || actions.length > 20) return;
    executing.current = true;
    setError(""); setNotice(""); setPending(actions[0]?.id ?? "batch");
    try {
      for (const action of actions) {
        // Navigation stops subsequent dispatch; the current bounded request may still finish.
        if (!mounted.current || document.visibilityState !== "visible") break;
        setPending(action.id);
        const response = await fetch(`/api/workflows/${workflowId}/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: action.id, expectedSnapshotId: action.snapshot?.id, retry }) });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Execution blocked.");
        const result = attemptRowSchema.parse(body);
        await refresh();
        if (result.status !== "succeeded") { setNotice(`Saved ${result.status.replaceAll("_", " ")}. Inspect the attempt before continuing.`); break; }
        setNotice(result.verification_method === "user_confirmed" ? "Operator confirmation saved." : action.actionType === "send_email" ? "Gmail accepted the message. This does not confirm delivery or reading." : action.actionType === "schedule_follow_up" ? "Plan saved. Automatic execution will appear in Release 0.7." : "Approved CRM fields saved.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Request interrupted. Refresh to inspect saved status; do not resend."); try { await refresh(); } catch { /* keep the original uncertainty visible */ } }
    finally { executing.current = false; if (mounted.current) setPending(""); }
  }
  async function reconcile(input: unknown) {
    if (mode !== "live" || executing.current || pending) return;
    executing.current = true;
    setPending("reconcile"); setError("");
    try {
      const r = await fetch(`/api/workflows/${workflowId}/execution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); const body = await r.json();
      if (!r.ok) throw new Error(body.error); await refresh(); setNotice("Saved outcome record. Review the persisted verification method.");
    } catch (e) { setError(e instanceof Error ? e.message : "Reconciliation unavailable."); } finally { executing.current = false; if (mounted.current) setPending(""); }
  }
  return { execute, reconcile, pending, error, notice };
}
