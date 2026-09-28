import {
  Bot,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  DatabaseZap,
  LockKeyhole,
  Mail,
  Plug,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { demoWorkspace } from "@/lib/mock-data";

const settingsSections = [
  { id: "workspace", label: "Workspace", icon: Workflow },
  { id: "ai", label: "AI & agents", icon: Bot },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "automation", label: "Automation", icon: Clock3 },
] as const;

const integrations = [
  {
    name: "Gmail",
    description: "Send approved outreach from a connected mailbox.",
    icon: Mail,
  },
  {
    name: "Google Calendar",
    description: "Schedule meetings and approved follow-ups.",
    icon: CalendarDays,
  },
  {
    name: "HubSpot",
    description: "Sync companies, contacts, and outreach history.",
    icon: DatabaseZap,
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="Manage your workspace and see what is available in this demo environment."
      />

      <div className="grid items-start gap-8 lg:grid-cols-[184px_minmax(0,1fr)] xl:gap-12">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Configuration
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:block">
            {settingsSections.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-9 pb-10">
          <section id="workspace" className="scroll-mt-8">
            <SectionHeading
              title="Workspace"
              description="The environment used for this product preview."
            />
            <div className="panel mt-4 overflow-hidden">
              <div className="flex items-center gap-4 border-b border-border px-5 py-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/70 text-xs font-bold tracking-tight">
                  {demoWorkspace.initials}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{demoWorkspace.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sample workspace · local preview
                  </p>
                </div>
                <span className="ml-auto hidden rounded border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                  {demoWorkspace.plan}
                </span>
              </div>
              <InfoRow label="Workspace ID" value={demoWorkspace.id} />
              <InfoRow label="Data source" value="Sample data in this browser" />
              <InfoRow label="External actions" value="Approval required" last />
            </div>
          </section>

          <section id="ai" className="scroll-mt-8">
            <SectionHeading
              title="AI & agents"
              description="Agent roles are represented in the demo activity stream."
            />
            <div className="panel mt-4 overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <Bot aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Agent runtime</p>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                      Planner, Research, Reviewer, and Executor activity is currently illustrated with sample events. Live agent execution is planned for a later stage.
                    </p>
                  </div>
                </div>
                <span className="w-fit shrink-0 rounded border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  Preview
                </span>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <CompactSetting icon={Check} title="Structured outputs" detail="Planned for agent-generated results" />
                <CompactSetting icon={ShieldCheck} title="Human review" detail="Required before external actions" />
              </div>
            </div>
          </section>

          <section id="integrations" className="scroll-mt-8">
            <SectionHeading
              title="Integrations"
              description="Connections will become available when approved execution is added."
            />
            <div className="panel mt-4 overflow-hidden">
              {integrations.map(({ name, description, icon: Icon }, index) => (
                <div
                  key={name}
                  className={`flex flex-wrap items-center gap-3 px-5 py-4 sm:flex-nowrap ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                    <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                  </div>
                  <span className="ml-12 rounded border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground sm:ml-0">
                    Not connected
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <CircleHelp aria-hidden="true" className="size-3.5" />
              Connections are not available in this Stage 1 demo.
            </p>
          </section>

          <section id="automation" className="scroll-mt-8">
            <SectionHeading
              title="Automation"
              description="Guardrails for future workflow execution."
            />
            <div className="panel mt-4 overflow-hidden">
              <div className="flex gap-3 border-b border-border px-5 py-5">
                <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Approval before external actions</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    Email sends, CRM writes, and calendar changes require a person to review and approve the proposed action.
                  </p>
                </div>
                <span className="hidden h-fit rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-medium text-emerald-300 sm:inline-block">
                  Required
                </span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-medium text-foreground">Schedules and follow-ups</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Scheduled runs, retries, and follow-up automation are planned for a later stage.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-border pb-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13px] ${last ? "" : "border-b border-border"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function CompactSetting({ icon: Icon, title, detail }: { icon: typeof Check; title: string; detail: string }) {
  return (
    <div className="flex gap-3 border-t border-border px-5 py-4 md:first:border-r">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
