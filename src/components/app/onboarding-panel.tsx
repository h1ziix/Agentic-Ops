"use client";

import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { useState } from "react";
import { ArrowRight, FileStack, LockKeyhole, Target, Workflow } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { useDemoStore } from "@/components/app/demo-store";

export function OnboardingPanel() {
  const { mode } = useDemoStore();
  const [target, setTarget] = useState("B2B SaaS and fintech companies in Kazakhstan");
  const goal = `Find 3 ${target.trim() || "companies matching my target profile"} with specific customer support or internal operations automation opportunities. Research sources, qualify leads and prepare drafts for human review. Do not send without approval.`;
  return <section className="mx-auto flex w-full max-w-3xl flex-col gap-6" aria-labelledby="onboarding-title"><header><p className="section-label">Your first operation</p><h1 id="onboarding-title" className="mt-3 text-2xl font-semibold tracking-tight">Give your agents a clear target.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">One goal becomes a visible plan, researched companies and reviewable proposals. Start small, inspect the evidence, then decide what happens next.</p></header>
    <div className="panel flex flex-col gap-5 p-5 sm:p-6"><label htmlFor="onboarding-target" className="flex flex-col gap-2.5 text-xs font-semibold"><span className="flex items-center gap-2"><Target className="size-4 text-[var(--brand-accent)]" />Which companies are you targeting?</span><Input id="onboarding-target" value={target} maxLength={220} onChange={(event) => setTarget(event.target.value)} placeholder="Industry, region and company size" /><span className="font-normal leading-5 text-muted-foreground">For example: fintech teams in Kazakhstan with a customer support operation.</span></label>
    <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-2"><div><h2 className="flex items-center gap-2 text-xs font-semibold"><Target className="size-3.5" />Use a customer profile</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Choose an existing ICP when you review your goal, or start with these targeting criteria.</p></div><div><h2 className="flex items-center gap-2 text-xs font-semibold"><FileStack className="size-3.5" />Choose a workflow template</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Templates guide the Planner. Your explicit goal always takes priority.</p></div></div>
    <div className="flex items-start gap-3 text-xs leading-6"><LockKeyhole className="mt-1 size-4 shrink-0 text-[var(--success-fg)]" /><p><strong>Research can proceed autonomously.</strong> Every external action requires your review, approval of the exact revision, and a separate Execute. Follow-ups need fresh approval.</p></div>
    <div className="flex flex-wrap items-center gap-4"><NewWorkflowButton key={target} initialGoal={goal} initialTarget={3} label={mode === "live" ? "Review your first workflow" : "Create a local draft"} /><span className="text-[11px] text-muted-foreground">{mode === "live" ? "Review goal, profile and template, then open the saved workflow." : "Demo drafts do not run AI or external tools."}</span></div></div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><Link href="/demo/workflows/kazakhstan-fintech" className="flex items-center gap-2 font-medium text-[var(--brand-accent)] hover:underline"><Workflow className="size-3.5" />Inspect the safe showcase<ArrowRight className="size-3" /></Link><Link href="/dashboard" className="text-muted-foreground hover:underline">Back to overview</Link></div>
  </section>;
}
