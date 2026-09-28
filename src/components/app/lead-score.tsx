import { cn } from "@/lib/utils";

export function LeadScore({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const tone = score >= 80 ? "text-[#8bce9a]" : score >= 65 ? "text-[#e8b766]" : "text-muted-foreground";
  return <span className={cn("font-mono text-[13px] font-semibold tabular-nums", tone, className)}>{score}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/100</span></span>;
}
