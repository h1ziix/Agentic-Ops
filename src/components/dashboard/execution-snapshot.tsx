"use client";
import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { useDemoStore } from "@/components/app/demo-store";
import { cn } from "@/lib/utils";
export function ExecutionSnapshot() {
  const { workflows } = useDemoStore();
  const groups = [
    { label: "In progress", value: workflows.filter(w => ["running", "planning"].includes(w.status)).length, color: "bg-[var(--brand-accent)]" },
    { label: "Awaiting review", value: workflows.filter(w => w.status === "waiting_for_approval").length, color: "bg-[var(--warning-fg)]" },
    { label: "Completed", value: workflows.filter(w => w.status === "completed").length, color: "bg-[var(--success-border)]" },
    { label: "Other states", value: workflows.filter(w => !["running", "planning", "waiting_for_approval", "completed"].includes(w.status)).length, color: "bg-[var(--border-strong)]" },
  ];
  const failed = workflows.find(w => w.status === "failed");
  return <section className="min-w-0" aria-labelledby="execution-title"><div className="mb-4 flex items-center justify-between"><h2 id="execution-title" className="text-[14px] font-semibold tracking-[-0.02em]">Workflow health</h2><span className="font-mono text-[9px] text-muted-foreground">{workflows.length} TOTAL</span></div>
    <div className="border-y border-border py-5"><div className="flex h-2 gap-1 overflow-hidden rounded-sm" aria-hidden="true">{groups.filter(g => g.value > 0).map(g => <span key={g.label} className={cn("h-full rounded-[1px]", g.color)} style={{ flex: g.value }} />)}</div><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">{groups.map(g => <div key={g.label} className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className={cn("size-1.5 rounded-[1px]",g.color)} /><span className="flex-1">{g.label}</span><span className="font-mono text-foreground">{g.value}</span></div>)}</div>
    </div>
    {failed && <Link href={"/workflows/" + failed.id} className="group mt-4 flex items-start gap-2.5 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)]/50 p-3 text-[var(--danger-fg)] transition-colors hover:bg-[var(--danger-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><div className="min-w-0 flex-1"><p className="text-[11px] font-medium">One workflow needs attention</p><p className="mt-1 text-[10px] leading-4 opacity-80">{failed.currentStep}</p></div><ArrowUpRight className="size-3 shrink-0 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" /></Link>}
  </section>;
}
