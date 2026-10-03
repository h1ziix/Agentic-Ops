"use client";

import { Bot, ChevronRight, GitBranch, Globe, LockKeyhole, Monitor, Plug, ShieldCheck, Workflow } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ThemeSelector } from "@/components/app/theme-selector";
import { useDemoStore } from "@/components/app/demo-store";
import { IntegrationSettings } from "@/components/integrations/integration-settings";
import { AutomationSettings } from "@/components/automation/automation-settings";
import { cn } from "@/lib/utils";

const settingsSections = [
  { id: "workspace", label: "Workspace", icon: Workflow },
  { id: "appearance", label: "Appearance", icon: Monitor },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "automation", label: "Automation", icon: GitBranch },
  { id: "guardrails", label: "Guardrails", icon: ShieldCheck },
] as const;
const agentRoles = [
  { title: "Planner", role: "Turns a goal into a sequence of tasks", code: "PL" },
  { title: "Research", role: "Discovers companies and prepares context", code: "RE" },
  { title: "Reviewer", role: "Qualifies opportunities and evaluates fit", code: "RV" },
  { title: "Executor", role: "Carries out actions after human approval", code: "EX" },
];

export default function SettingsPage() {
  const { workspace, mode } = useDemoStore();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Workspace" title="Settings" description="Your workspace, preferences, and operating guardrails." actions={<span className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">{mode === "live" ? "Persistent workspace" : "Local preview"}</span>} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[168px_minmax(0,1fr)] xl:gap-12">
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-8">
          <p className="section-label mb-3 hidden px-2 lg:block">Configuration</p>
          <div className="flex gap-1 overflow-x-auto border-b border-border pb-3 lg:flex-col lg:border-0 lg:pb-0">
            {settingsSections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className="interactive-row group flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><Icon className="size-3.5" /><span className="flex-1">{label}</span><ChevronRight className="hidden size-3 opacity-0 group-hover:opacity-100 lg:block" /></a>)}
          </div>
        </nav>
        <div className="flex min-w-0 flex-col gap-10 pb-10">
          <section id="workspace" className="scroll-mt-8">
            <SectionHeading title="Workspace" description="A shared environment for your sales operations." />
            <div className="mt-5 flex items-center gap-3.5"><div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-xs font-semibold">{workspace.initials}</div><div><p className="text-sm font-semibold">{workspace.name}</p><p className="mt-1 text-xs text-muted-foreground">{workspace.plan} · {mode === "live" ? "Authenticated workspace" : "Sample workspace"}</p></div></div>
            <div className="mt-5 border-y border-border"><InfoRow label="Workspace ID" value={workspace.id} mono /><InfoRow label="Data location" value={mode === "live" ? "Supabase PostgreSQL" : "This browser"} /><InfoRow label="Environment" value={mode === "live" ? "Persistent · exact approvals required" : "Demo · no external connections"} last /></div>
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><Globe className="mt-0.5 size-3.5 shrink-0" />{mode === "live" ? "Workflows, generated plans, activity, and approval decisions are saved to this workspace." : "New workflows, approval decisions, and edited drafts are stored locally. Sample company research is included."}</p>
          </section>
          <section id="appearance" className="scroll-mt-8">
            <SectionHeading title="Appearance" description="Make this workspace comfortable for the way you work." />
            <div className="flex items-center justify-between gap-4 border-b border-border py-5"><div><p className="text-[13px] font-medium">Interface theme</p><p className="mt-1 text-xs text-muted-foreground">Choose light, dark, or follow your system.</p></div><ThemeSelector /></div>
          </section>
          <section id="agents" className="scroll-mt-8">
            <SectionHeading title="Agent team" description="Four focused roles, with a visible record of their work." />
            <div className="mt-1">
              {agentRoles.map((agent) => <div key={agent.code} className="flex items-center gap-3 border-b border-border py-4"><span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card font-mono text-[10px] text-muted-foreground">{agent.code}</span><div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{agent.title} Agent</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{agent.role}</p></div><span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{mode === "live" ? "Available" : "Future stage"}</span></div>)}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{mode === "live" ? "Planning, research and preparation retain their AI provenance. The deterministic Executor performs separately approved typed actions." : "This browser preview uses sample data. Connect a workspace to run the Planner."}</p>
          </section>
          <section id="integrations" className="scroll-mt-8">
            <SectionHeading title="Integrations" description="Connect approved execution to your mailbox and CRM." />
            <IntegrationSettings />
          </section>
          <section id="automation" className="scroll-mt-8">
            <SectionHeading title="Automation" description="Durable background work with visible approvals and recovery." />
            <AutomationSettings />
          </section>
          <section id="guardrails" className="scroll-mt-8">
            <SectionHeading title="Operating guardrails" description="Keep human judgment at the center of every external action." />
            <div className="flex items-start gap-3 border-b border-border py-5"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--success-fg)]" /><div className="min-w-0 flex-1"><p className="text-[13px] font-medium">Approval before execution</p><p className="mt-1 max-w-xl text-xs leading-6 text-muted-foreground">Review the exact recipient, account, evidence and content. Email, CRM and internal follow-up plans have independent approvals and explicit Execute.</p></div><span className="rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-1 text-[10px] font-medium text-[var(--success-fg)]">Required</span></div>
            <div className="flex items-start gap-3 border-b border-border py-5"><GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-[13px] font-medium">Schedules, retries, and follow-ups</p><p className="mt-1 text-xs leading-6 text-muted-foreground">Safe preparation retries are bounded. External action retries require a definitive retryable failure and retain the exact approved snapshot. Unknown outcomes block resend. Due follow-ups create drafts for new approval; Calendar requires a separate future integration.</p></div></div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-[15px] font-semibold tracking-tight">{title}</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p></div>;
}
function InfoRow({ label, value, last = false, mono = false }: { label: string; value: string; last?: boolean; mono?: boolean }) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 py-3.5 text-xs", !last && "border-b border-border")}><span className="text-muted-foreground">{label}</span><span className={cn("break-all font-medium", mono && "font-mono text-[11px]")}>{value}</span></div>;
}
