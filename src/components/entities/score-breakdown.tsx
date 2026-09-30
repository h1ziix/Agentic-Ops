import type { z } from "zod";
import type { scoreComponentsSchema } from "@/lib/validation/research";
const dimensions = [
  ["icpFit", "ICP fit", 25], ["automationPotential", "Automation potential", 30], ["operationalSignals", "Operational signals", 20],
  ["evidenceQuality", "Evidence quality", 15], ["reachability", "Public context", 10],
] as const;
export function ScoreBreakdown({ components }: { components?: z.infer<typeof scoreComponentsSchema> }) {
  if (!components) return null;
  return <dl className="flex flex-col gap-2.5 border-t border-border pt-4 text-[11px]">{dimensions.map(([key, label, max]) => <div key={key} className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="flex items-center gap-3"><span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-[var(--success-fg)]" style={{ width: `${components[key] / max * 100}%` }} /></span><span className="w-10 text-right font-mono tabular-nums">{components[key]}/{max}</span></dd></div>)}</dl>;
}
