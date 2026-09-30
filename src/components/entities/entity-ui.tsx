"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ArrowUpRight, Building2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const entitySelectClass = "h-9 max-w-full rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring";

export function CompanyMark({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  return <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 font-medium tracking-tight text-foreground", large ? "size-12 text-lg" : "size-8 text-xs")}>{initials}</span>;
}

export function ScoreRail({ score, detailed = false }: { score: number | null; detailed?: boolean }) {
  if (score === null) return <span className="text-xs text-muted-foreground">Unscored</span>;
  return (
    <div className={cn("flex items-center gap-2.5", detailed && "gap-4")} aria-label={`Fit score ${score} out of 100`}>
      <span className={cn("font-mono font-medium tabular-nums text-foreground", detailed ? "text-4xl tracking-[-0.07em]" : "text-[13px]")}>{score}<span className={cn("ml-0.5 font-sans text-muted-foreground", detailed ? "text-sm tracking-normal" : "sr-only")}>/100</span></span>
      <div className={cn("h-1 overflow-hidden rounded-full bg-muted", detailed ? "w-24" : "w-12")} aria-hidden="true">
        <div className={cn("h-full rounded-full", score >= 80 ? "bg-[var(--success-fg)]" : "bg-[var(--warning-fg)]/70")} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function EntityStats({ items }: { items: { label: string; value: string | number; note?: string; accent?: boolean }[] }) {
  return <dl className="grid grid-cols-2 gap-y-5 border-b border-border pb-6 md:grid-cols-4">{items.map((item, index) => (
    <div key={item.label} className={cn("min-w-0 px-4 first:pl-0 md:px-6", index === 2 && "pl-0 md:pl-6", index % 2 === 1 && "border-l border-border", index > 1 && "md:border-l md:border-border")}>
      <dt className="text-xs text-muted-foreground">{item.label}</dt>
      <dd className={cn("mt-1.5 font-mono text-2xl font-medium tracking-[-0.05em] tabular-nums", item.accent && "text-[var(--success-fg)]")}>{item.value}</dd>
      {item.note && <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">{item.note}</p>}
    </div>
  ))}</dl>;
}

export function EntitySection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="flex flex-col gap-3"><h3 className="flex items-center gap-2 text-xs font-medium text-foreground">{icon}{title}</h3>{children}</section>;
}

export function EntityResults({ children, resultKey }: { children: ReactNode; resultKey: string }) {
  const reduced = useReducedMotion();
  return <motion.div key={resultKey} initial={reduced ? false : { opacity: 0, transform: "translateY(4px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.18 }}>{children}</motion.div>;
}

export function RecordChevron() {
  return <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />;
}

export function EntityLoading({ title }: { title: string }) {
  return <div className="flex flex-col gap-6" aria-busy="true" aria-label={`Loading ${title}`}><Skeleton className="h-8 w-40" /><Skeleton className="h-20 w-full" /><div className="flex items-center gap-2 text-xs text-muted-foreground"><Search className="size-4" /><span>Loading {title.toLowerCase()}…</span></div><div className="rounded-lg border border-border bg-card p-4">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-4 border-b border-border py-4 last:border-0"><Skeleton className="size-8" /><Skeleton className="h-4 w-1/3" /><Skeleton className="ml-auto h-4 w-20" /></div>)}</div></div>;
}

export function DemoSourceNote() {
  return <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground"><Building2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />Review source references and verify any claim before external outreach. Seeded profiles are sample data.</p>;
}
