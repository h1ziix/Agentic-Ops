import { ArrowUpRight } from "lucide-react";
import type { Company } from "@/types/domain";
import { websiteHostname } from "@/lib/format";

export function ResearchSources({ company }: { company: Company }) {
  const sources = company.sources?.length ? company.sources : company.sourceUrls.map((url) => ({ url, title: null, type: "other", accessedAt: null }));
  if (!sources.length) return <p className="text-xs leading-5 text-muted-foreground">Sources appear when useful public evidence has been collected.</p>;
  return <ul className="flex flex-col divide-y divide-border rounded-md border border-border">{sources.map((source, index) => <li key={source.url}>
    <a href={source.url} target="_blank" rel="noreferrer" className="interactive-row flex items-start gap-3 px-3 py-3 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded bg-muted font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-medium leading-5">{source.title ?? websiteHostname(source.url)}</span><span className="mt-1 block break-all text-[11px] text-muted-foreground">{source.url}</span><span className="mt-1 block text-[10px] text-muted-foreground">{source.type.replaceAll("_", " ")}{source.accessedAt ? ` · Accessed ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Qyzylorda" }).format(new Date(source.accessedAt))}` : ""}</span></span>
      <ArrowUpRight aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
    </a>
  </li>)}</ul>;
}
