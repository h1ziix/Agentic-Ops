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
        {index < stages.length - 1 && <span aria-hidden className={cn("absolute left-[26px] right-0 top-[11px] h-px", done ? "bg-[#557e70]" : "bg-border")} />}
        <div className={cn("relative z-10 flex size-[23px] items-center justify-center rounded-full border", done ? "border-[#547c66] bg-[#234232] text-[#9bd9aa]" : stage.status === "running" ? "border-[#5ba997] bg-[#24473e] text-[#99dbc9] shadow-[0_0_0_4px_#1a2b29]" : stage.status === "failed" ? "border-[#a86262] bg-[#4a2929] text-[#e6a2a2]" : "border-[#3b4148] bg-[#1b1f24] text-[#69747c]")}>{done ? <Check className="size-3" /> : stage.status === "running" ? <LoaderCircle className="size-3 animate-spin [animation-duration:3s]" /> : stage.status === "failed" ? <CircleAlert className="size-3" /> : stage.label === "Approval" ? <ShieldCheck className="size-3" /> : <Circle className="size-2" />}</div>
        <p className={cn("mt-3 text-[11px] font-medium leading-4", current ? "text-foreground" : done ? "text-[#c2d1ca]" : "text-[#818c94]")}>{stage.label}</p>
        <p className={cn("mt-1 text-[10px]", stage.status === "running" ? "text-[#77d3bf]" : stage.status === "failed" ? "text-[#e48787]" : "text-[#7e8991]")}>{stage.status === "completed" ? "Complete" : stage.status === "running" ? "In progress" : stage.status === "failed" ? "Needs attention" : "Waiting"}</p>
      </li>;
    })}</ol></div>
  </div>;
}
