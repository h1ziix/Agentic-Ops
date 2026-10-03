"use client";

import { useId, useRef, useState, type FormEvent } from "react";
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
import { listStrategyAction } from "@/app/actions/strategy";
import { workflowDefaults } from "@/lib/workflow-defaults";
import type { StrategyLibrary } from "@/types/strategy";

const exampleGoal = "Find 10 SaaS or fintech companies in Kazakhstan that could benefit from AI automation. Research them and qualify the best leads. Do not generate or send outreach yet.";

export function NewWorkflowButton({ compact = false, label, variant, initialIcpId, initialTemplateId, library: suppliedLibrary }: { compact?: boolean; label?: string; variant?: "outline"; initialIcpId?: string; initialTemplateId?: string; library?: StrategyLibrary }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [targetCompanies, setTargetCompanies] = useState("20");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [library, setLibrary] = useState<StrategyLibrary>(suppliedLibrary ?? { icps: [], templates: [] });
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [strategyError, setStrategyError] = useState("");
  const [icpId, setIcpId] = useState(initialIcpId ?? "");
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const goalEdited = useRef(false); const targetEdited = useRef(false);
  const icpEdited = useRef(Boolean(initialIcpId)); const strategyRequest = useRef(0);
  const { createWorkflow, hydrated, mode } = useDemoStore();
  const router = useRouter();
  const reduced = useReducedMotion();
  const formId = useId();
  const goalId = `${formId}-goal`;
  const targetId = `${formId}-target`;

  const selectedTemplate = library.templates.find((item) => item.id === templateId);
  const missingTemplateProfile = Boolean(selectedTemplate?.default_icp_id && !icpId);
  function applyDefaults(data: StrategyLibrary, selectedTemplate?: string, selectedIcp?: string) {
    const defaults = workflowDefaults(data, selectedTemplate, selectedIcp);
    setIcpId(defaults.icpId); setTemplateId(defaults.templateId);
    if (!targetEdited.current) setTargetCompanies(defaults.targetCompanies);
    if (!goalEdited.current) setGoal(defaults.goal);
  }
  function closeDialog() {
    if (creating) return;
    strategyRequest.current += 1;
    setOpen(false); setLoadingStrategy(false); setError(""); setInvalidField(null);
  }
  async function openDialog() {
    if (creating) return;
    const request = ++strategyRequest.current;
    setOpen(true); setStrategyError("");
    if (mode !== "live") return;
    const explicitIcp = icpEdited.current ? icpId : undefined;
    if (suppliedLibrary) { setLibrary(suppliedLibrary); applyDefaults(suppliedLibrary, templateId, explicitIcp); return; }
    setLoadingStrategy(true);
    try {
      const result = await listStrategyAction();
      if (request !== strategyRequest.current) return;
      if (result.error) setStrategyError(result.error); else if (result.data) { setLibrary(result.data); applyDefaults(result.data, templateId, explicitIcp); }
    }
    catch { if (request === strategyRequest.current) setStrategyError("Saved strategy could not be loaded. You can still start from a goal."); }
    finally { if (request === strategyRequest.current) setLoadingStrategy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || loadingStrategy || missingTemplateProfile) return;
    const parsed = newWorkflowSchema.safeParse({ goal, targetCompanies: Number(targetCompanies), icpId: icpId || undefined, templateId: templateId || undefined });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setInvalidField(String(issue?.path[0] ?? "goal"));
      setError(issue?.path[0] === "targetCompanies" ? "Choose a whole number between 1 and 20 companies." : issue?.message ?? "Please check the workflow details.");
      return;
    }
    setCreating(true);
    try {
      const id = await createWorkflow(parsed.data);
      setError(""); setInvalidField(null); setGoal(""); setTargetCompanies("20"); setIcpId(initialIcpId ?? ""); setTemplateId(initialTemplateId ?? ""); setOpen(false);
      goalEdited.current = false; targetEdited.current = false; icpEdited.current = Boolean(initialIcpId);
      router.push(`/workflows/${id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "The workflow could not be created. Please try again."); }
    finally { setCreating(false); }
  }

  return <>
    <Button size={compact ? "sm" : "default"} variant={variant} onClick={openDialog} disabled={creating} aria-label={compact && !label ? "New workflow" : undefined}><Plus data-icon="inline-start" /><span className={compact && !label ? "hidden sm:inline" : undefined}>{label ?? "New workflow"}</span></Button>
    <Dialog open={open} onOpenChange={(next) => { if (creating) return; if (!next) closeDialog(); else setOpen(true); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(620px,calc(100vw-2rem))] max-w-none overflow-y-auto p-0 sm:max-w-none">
        <form onSubmit={submit} noValidate>
          <DialogHeader className="border-b border-border px-6 py-6">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground"><GitBranch className="size-4 text-[var(--brand-accent)]" /> New operation</div>
            <DialogTitle>Create a workflow</DialogTitle>
            <DialogDescription>Start with an outcome. Give your agents a clear direction.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-6 px-6 py-6">
            {mode === "live" && <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 section-label">Start from a goal, template or saved ICP</legend>
              <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold" htmlFor={`${formId}-template`}>Workflow template<select id={`${formId}-template`} disabled={loadingStrategy || creating} value={templateId} onChange={(event) => {
                const id = event.target.value; applyDefaults(library, id, icpEdited.current ? icpId : undefined);
              }} className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring"><option value="">Start from goal</option>{library.templates.filter((item) => !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold" htmlFor={`${formId}-icp`}>Ideal customer profile<select id={`${formId}-icp`} disabled={loadingStrategy || creating} value={icpId} onChange={(event) => { icpEdited.current = true; applyDefaults(library, templateId || undefined, event.target.value || undefined); }} className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring"><option value="" disabled={Boolean(library.templates.find((item) => item.id === templateId)?.default_icp_id)}>{library.templates.find((item) => item.id === templateId)?.default_icp_id ? "This template requires its default ICP or an override" : "No saved profile"}</option>{library.icps.filter((item) => !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <p className="text-[11px] leading-5 text-muted-foreground sm:col-span-2">{loadingStrategy ? "Loading saved strategy…" : "Your goal takes priority. Selected criteria and guidance are saved with this workflow."}</p>
              {strategyError && <p role="status" className="text-xs text-[var(--warning-fg)] sm:col-span-2">{strategyError}</p>}
              {missingTemplateProfile && <p role="alert" className="text-xs text-[var(--warning-fg)] sm:col-span-2">This template has an archived default ICP. Choose an active profile or update the template before starting.</p>}
            </fieldset>}
            <Field.Root invalid={invalidField === "goal"} className="flex flex-col gap-2.5">
              <Field.Label htmlFor={goalId} className="text-xs font-semibold">What do you want to accomplish?</Field.Label>
              <Textarea id={goalId} value={goal} disabled={creating} onChange={(event) => { goalEdited.current = true; setGoal(event.target.value); setError(""); setInvalidField(null); }} placeholder="Find companies that match your ideal customer profile and research their automation opportunities..." rows={5} maxLength={1000} className="min-h-32 resize-y" aria-invalid={invalidField === "goal"} aria-describedby={error ? `${formId}-error` : `${formId}-goal-help`} />
              <div className="flex items-center justify-between gap-3"><button type="button" disabled={creating} onClick={() => { goalEdited.current = true; targetEdited.current = true; setGoal(exampleGoal); setTargetCompanies("10"); setError(""); setInvalidField(null); }} className="text-[11px] font-medium text-[var(--brand-accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">Use example goal <ArrowRight className="ml-1 inline size-3" /></button><span className="font-mono text-[10px] tabular-nums text-muted-foreground">{goal.length}/1,000</span></div>
              <Field.Description id={`${formId}-goal-help`} className="text-[11px] leading-5 text-muted-foreground">Include an industry, region, and the outcome you are looking for.</Field.Description>
            </Field.Root>
            <div className="flex flex-wrap items-end gap-6 border-t border-border pt-5">
              <Field.Root invalid={invalidField === "targetCompanies"} className="flex w-36 flex-col gap-2"><Field.Label htmlFor={targetId} className="text-xs font-semibold">Target companies</Field.Label><Input id={targetId} type="number" min={1} max={20} value={targetCompanies} disabled={creating} onChange={(event) => { targetEdited.current = true; setTargetCompanies(event.target.value); setError(""); setInvalidField(null); }} aria-invalid={invalidField === "targetCompanies"} aria-describedby={`${formId}-target-help`} /><Field.Description id={`${formId}-target-help`} className="text-[11px] text-muted-foreground">Between 1 and 20</Field.Description></Field.Root>
              <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1"><span className="section-label">Your workflow</span><div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span>Plan</span><ArrowRight className="size-3" /><span>Research</span><ArrowRight className="size-3" /><span>Score</span><ArrowRight className="size-3" /><span>Review</span></div><span className="text-[11px] text-muted-foreground">One goal, an auditable sequence of tasks.</span></div>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-border bg-[var(--surface-quiet)] p-3.5"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--warning-fg)]" /><div><p className="text-xs font-medium">You stay in control</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{mode === "live" ? "Agents research evidence and prepare drafts. Confirm the recipient and account, approve the exact revision, then Execute explicitly." : "This preview creates a local plan. Research and sending are unavailable."} Authorization is separate from execution.</p></div></div>
            <AnimatePresence>{error && <motion.p id={`${formId}-error`} role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.15 }} className="text-xs text-destructive">{error}</motion.p>}</AnimatePresence>
          </div>
          <DialogFooter className="m-0 items-stretch rounded-b-lg px-6 py-4 sm:items-center"><span className="mr-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><Check className="size-3 text-[var(--success-fg)]" /> {mode === "live" ? "Saved to workspace" : "Local preview"}</span><Button type="button" variant="outline" onClick={closeDialog} disabled={creating}>Cancel</Button><Button type="submit" disabled={creating || loadingStrategy || missingTemplateProfile || !hydrated}>{creating ? "Creating..." : "Create workflow"}<ArrowRight data-icon="inline-end" /></Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
