import { Check, Circle, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import type { WorkflowStage } from "@/types/domain";
import { cn } from "@/lib/utils";

export function WorkflowProgress({ stages }: { stages: WorkflowStage[] }) {
  return <div className="panel overflow-hidden">
    <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Execution pipeline</h2><p className="mt-0.5 text-xs text-muted-foreground">A visible record of what has finished and what is next</p></div><span className="section-label hidden sm:block">7 stages</span></div>
    <div className="overflow-x-auto px-5 py-5"><ol className="grid min-w-[760px] grid-cols-7 gap-0" aria-label="Workflow stages">{stages.map((stage, index) => {
      const done = stage.status === "completed";
      const current = stage.status === "running" || stage.status === "failed";
      return <li key={stage.id} className="relative min-w-0 pr-2 last:pr-0">
        {index < stages.length - 1 && <span aria-hidden className={cn("absolute left-[26px] right-0 top-[11px] h-px", done ? "bg-[var(--success-border)]" : "bg-border")} />}
        <div className={cn("relative z-10 flex size-[23px] items-center justify-center rounded-full border", done ? "border-[var(--success-border)] bg-[var(--success-bg-strong)] text-[var(--success-fg)]" : stage.status === "running" ? "border-[var(--success-border)] bg-[var(--success-bg-strong)] text-[var(--success-fg)] shadow-[0_0_0_4px_var(--success-shadow)]" : stage.status === "failed" ? "border-[var(--danger-border)] bg-[var(--danger-bg-strong)] text-[var(--danger-fg)]" : "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--icon-muted)]")}>{done ? <Check className="size-3" /> : stage.status === "running" ? <LoaderCircle className="size-3 animate-spin [animation-duration:3s]" /> : stage.status === "failed" ? <CircleAlert className="size-3" /> : stage.label === "Approval" ? <ShieldCheck className="size-3" /> : <Circle className="size-2" />}</div>
        <p className={cn("mt-3 text-[11px] font-medium leading-4", current ? "text-foreground" : done ? "text-[var(--success-muted-fg)]" : "text-[var(--text-faint)]")}>{stage.label}</p>
        <p className={cn("mt-1 text-[10px]", stage.status === "running" ? "text-[var(--success-fg)]" : stage.status === "failed" ? "text-[var(--danger-fg)]" : "text-[var(--text-faint)]")}>{stage.status === "completed" ? "Complete" : stage.status === "running" ? "In progress" : stage.status === "failed" ? "Needs attention" : "Waiting"}</p>
      </li>;
    })}</ol></div>
  </div>;
}
