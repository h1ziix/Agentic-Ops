"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@base-ui/react/field";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ArrowRight, Check, GitBranch, LockKeyhole, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDemoStore } from "@/components/app/demo-store";
import { newWorkflowSchema } from "@/lib/validation/workflow";

const exampleGoal = "Find 20 SaaS companies in Kazakhstan that could benefit from AI automation and prepare personalized outreach.";

export function NewWorkflowButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [targetCompanies, setTargetCompanies] = useState("20");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { createWorkflow, hydrated, mode } = useDemoStore();
  const router = useRouter();
  const reduced = useReducedMotion();
  const formId = useId();
  const goalId = `${formId}-goal`;
  const targetId = `${formId}-target`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const parsed = newWorkflowSchema.safeParse({ goal, targetCompanies: Number(targetCompanies) });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setInvalidField(String(issue?.path[0] ?? "goal"));
      setError(issue?.path[0] === "targetCompanies" ? "Choose a whole number between 5 and 100 companies." : issue?.message ?? "Please check the workflow details.");
      return;
    }
    setCreating(true);
    try {
      const id = await createWorkflow(parsed.data);
      setError(""); setInvalidField(null); setGoal(""); setTargetCompanies("20"); setOpen(false);
      router.push(`/workflows/${id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "The workflow could not be created. Please try again."); }
    finally { setCreating(false); }
  }

  return <>
    <Button size={compact ? "sm" : "default"} onClick={() => setOpen(true)} aria-label={compact ? "New workflow" : undefined}><Plus data-icon="inline-start" /><span className={compact ? "hidden sm:inline" : undefined}>New workflow</span></Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setError(""); setInvalidField(null); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(620px,calc(100vw-2rem))] max-w-none overflow-y-auto p-0 sm:max-w-none">
        <form onSubmit={submit} noValidate>
          <DialogHeader className="border-b border-border px-6 py-6">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground"><GitBranch className="size-4 text-[var(--brand-accent)]" /> New operation</div>
            <DialogTitle>Create a workflow</DialogTitle>
            <DialogDescription>Start with an outcome. Give your agents a clear direction.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-6 px-6 py-6">
            <Field.Root invalid={invalidField === "goal"} className="flex flex-col gap-2.5">
              <Field.Label htmlFor={goalId} className="text-xs font-semibold">What do you want to accomplish?</Field.Label>
              <Textarea id={goalId} value={goal} onChange={(event) => { setGoal(event.target.value); setError(""); setInvalidField(null); }} placeholder="Find companies that match your ideal customer profile, then prepare outreach for review..." rows={5} maxLength={1000} className="min-h-32 resize-y" autoFocus aria-invalid={invalidField === "goal"} aria-describedby={error ? `${formId}-error` : `${formId}-goal-help`} />
              <div className="flex items-center justify-between gap-3"><button type="button" onClick={() => { setGoal(exampleGoal); setError(""); setInvalidField(null); }} className="text-[11px] font-medium text-[var(--brand-accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Use example goal <ArrowRight className="ml-1 inline size-3" /></button><span className="font-mono text-[10px] tabular-nums text-muted-foreground">{goal.length}/1,000</span></div>
              <Field.Description id={`${formId}-goal-help`} className="text-[11px] leading-5 text-muted-foreground">Include an industry, region, and the outcome you are looking for.</Field.Description>
            </Field.Root>
            <div className="flex flex-wrap items-end gap-6 border-t border-border pt-5">
              <Field.Root invalid={invalidField === "targetCompanies"} className="flex w-36 flex-col gap-2"><Field.Label htmlFor={targetId} className="text-xs font-semibold">Target companies</Field.Label><Input id={targetId} type="number" min={5} max={100} value={targetCompanies} onChange={(event) => { setTargetCompanies(event.target.value); setError(""); setInvalidField(null); }} aria-invalid={invalidField === "targetCompanies"} aria-describedby={`${formId}-target-help`} /><Field.Description id={`${formId}-target-help`} className="text-[11px] text-muted-foreground">Between 5 and 100</Field.Description></Field.Root>
              <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1"><span className="section-label">Your workflow</span><div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span>Plan</span><ArrowRight className="size-3" /><span>Research</span><ArrowRight className="size-3" /><span>Score</span><ArrowRight className="size-3" /><span>Review</span></div><span className="text-[11px] text-muted-foreground">One goal, an auditable sequence of tasks.</span></div>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-border bg-[var(--surface-quiet)] p-3.5"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--warning-fg)]" /><div><p className="text-xs font-medium">You stay in control</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{mode === "live" ? "The Planner will generate an execution plan from your goal. Research and sending are not available yet." : "This preview creates a local plan. Research and sending are unavailable."} Future external actions will require your approval.</p></div></div>
            <AnimatePresence>{error && <motion.p id={`${formId}-error`} role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.15 }} className="text-xs text-destructive">{error}</motion.p>}</AnimatePresence>
          </div>
          <DialogFooter className="m-0 items-stretch rounded-b-lg px-6 py-4 sm:items-center"><span className="mr-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><Check className="size-3 text-[var(--success-fg)]" /> {mode === "live" ? "Saved to workspace" : "Local preview"}</span><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={creating || !hydrated}>{creating ? "Creating..." : "Create workflow"}<ArrowRight data-icon="inline-end" /></Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
