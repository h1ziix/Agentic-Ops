"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Building2, CornerDownLeft, FileSearch, LayoutGrid, Search, Settings2, ShieldCheck, UsersRound, Workflow, Activity } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { companies, leads } from "@/lib/mock-data";
import { useDemoStore } from "./demo-store";
const pages = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid }, { label: "Workflows", href: "/workflows", icon: Workflow },
  { label: "Leads", href: "/leads", icon: UsersRound }, { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck }, { label: "Activity", href: "/activity", icon: Activity }, { label: "Settings", href: "/settings", icon: Settings2 },
];
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const resultsRef = useRef<HTMLDivElement>(null);
  const { workflows } = useDemoStore();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setQuery(""); onOpenChange(!open); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = [
      ...pages.map(page => ({ ...page, kind: "Navigate" })),
      ...workflows.map(workflow => ({ label: workflow.title, href: "/workflows/" + workflow.id, icon: Workflow, kind: "Workflow" })),
      ...companies.map(company => ({ label: company.name, href: "/companies?company=" + company.id, icon: Building2, kind: "Company" })),
      ...leads.map(lead => ({ label: companies.find(company => company.id === lead.companyId)?.name ?? lead.id, href: "/leads?lead=" + lead.id, icon: UsersRound, kind: "Lead" })),
    ];
    return (needle ? all.filter(item => (item.label + " " + item.kind).toLowerCase().includes(needle)) : all.slice(0, 7)).slice(0, 12);
  }, [query, workflows]);
  const navigate = (href: string) => { onOpenChange(false); setQuery(""); router.push(href); };
  return <Dialog open={open} onOpenChange={value => { onOpenChange(value); if (!value) setQuery(""); }}>
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
      <DialogTitle className="sr-only">Search workspace</DialogTitle><DialogDescription className="sr-only">Find pages, workflows, companies and leads. Use arrow keys to move through results.</DialogDescription>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3"><Search className="size-4 shrink-0 text-muted-foreground" /><Input id="workspace-command-search" aria-label="Search pages, workflows and companies" placeholder="Search anything in your workspace…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); resultsRef.current?.querySelector("button")?.focus(); } if (event.key === "Enter" && results[0]) navigate(results[0].href); }} className="border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0" /><DialogClose aria-label="Close search" className="rounded border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted">Esc</DialogClose></div>
      <div className="max-h-[min(55vh,400px)] overflow-y-auto p-2" ref={resultsRef} onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(resultsRef.current?.querySelectorAll("button") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}><p className="px-2 py-2 text-[10px] font-medium text-muted-foreground">{query ? results.length + " results" : "Jump to"}</p>{results.map(({ label, href, kind, icon: Icon }) => <button type="button" key={href} onClick={() => navigate(href)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-muted focus:bg-muted focus:outline-none"><Icon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-xs">{label}</span><span className="text-[10px] text-muted-foreground">{kind}</span><ArrowUpRight className="size-3 text-muted-foreground" /></button>)}{!results.length && <div className="flex flex-col items-center gap-2 px-5 py-10"><FileSearch className="size-6 text-muted-foreground" /><p className="text-sm font-medium">No matching records</p><p className="text-xs text-muted-foreground">Try a company name or a different keyword.</p></div>}</div>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-[10px] text-muted-foreground"><span>Search this demo workspace</span><span className="flex items-center gap-1"><CornerDownLeft className="size-3" />to open</span></div>
    </DialogContent>
  </Dialog>;
}
