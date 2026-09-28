"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newWorkflowSchema, useDemoStore } from "@/components/app/demo-store";

const exampleGoal = "Find 20 SaaS companies in Kazakhstan that could benefit from AI automation and prepare personalized outreach.";

export function NewWorkflowButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [targetCompanies, setTargetCompanies] = useState("20");
  const [error, setError] = useState("");
  const { createWorkflow } = useDemoStore();
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = newWorkflowSchema.safeParse({ goal, targetCompanies: Number(targetCompanies) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Please check the workflow details."); return; }
    const id = createWorkflow(parsed.data);
    setError(""); setGoal(""); setTargetCompanies("20"); setOpen(false);
    router.push(`/workflows/${id}`);
  }

  return <>
    <Button size={compact ? "sm" : "default"} onClick={() => setOpen(true)} aria-label={compact ? "New workflow" : undefined}><Plus className="size-4" /><span className={compact ? "hidden sm:inline" : undefined}>New workflow</span></Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(""); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[min(560px,calc(100vw-2rem))] max-w-none overflow-y-auto p-0 sm:max-w-none">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-border px-6 pb-5 pt-6">
            <div className="mb-2 flex size-8 items-center justify-center rounded-md border border-border bg-card"><Sparkles className="size-4 text-[var(--success-muted-fg)]" /></div>
            <DialogTitle className="text-lg tracking-tight">Create a workflow</DialogTitle>
            <DialogDescription>Describe the outcome. Agentic Ops will prepare a demo plan for review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div>
              <label htmlFor="workflow-goal" className="mb-2 block text-xs font-medium text-foreground">What should Agentic Ops accomplish?</label>
              <Textarea id="workflow-goal" value={goal} onChange={(event) => { setGoal(event.target.value); setError(""); }} placeholder={exampleGoal} rows={5} className="min-h-28 resize-y text-[13px] leading-6" autoFocus />
              <button type="button" onClick={() => { setGoal(exampleGoal); setError(""); }} className="mt-2 text-xs text-[var(--success-muted-fg)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline">Use example goal</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="company-target" className="mb-2 block text-xs font-medium">Target companies</label><Input id="company-target" type="number" min={5} max={100} value={targetCompanies} onChange={(event) => setTargetCompanies(event.target.value)} /></div>
              <div className="rounded-md border border-border bg-[var(--surface-quiet)] px-3 py-2.5"><span className="block text-[11px] text-muted-foreground">Execution mode</span><span className="mt-0.5 block text-xs font-medium">Demo planning only</span></div>
            </div>
            <div className="flex gap-2.5 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg-strong)] px-3 py-3 text-xs leading-5 text-[var(--warning-muted)]"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Any future external action will wait for your approval. This demo does not run research or send messages.</p></div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="m-0 rounded-b-lg border-t border-border bg-[var(--surface-quiet)] px-6 py-4"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create workflow <ArrowRight className="size-3.5" /></Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
