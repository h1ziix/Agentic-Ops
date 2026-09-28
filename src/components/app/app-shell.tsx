"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity, ArrowUpRight, Building2, ChevronDown, CircleHelp, GitBranch,
  LayoutGrid, Menu, Settings2, ShieldCheck, UsersRound, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { cn } from "@/lib/utils";
import { demoWorkspace } from "@/lib/mock-data";
import { useDemoStore } from "@/components/app/demo-store";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Workflows", href: "/workflows", icon: Workflow },
  { label: "Leads", href: "/leads", icon: UsersRound },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings2 },
] as const;

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Agentic Ops dashboard">
      <span className="flex size-7 items-center justify-center rounded-md bg-[#dfe7e6] text-[#0c1718]"><GitBranch className="size-[17px] stroke-[2.3]" /></span>
      <span className="text-[15px] font-semibold tracking-[-0.045em] text-foreground">Agentic <span className="text-[#9ca8a9]">Ops</span></span>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { workflows, approvals } = useDemoStore();
  const pendingCount = approvals.filter((approval) => approval.status === "pending").reduce((total, approval) => total + approval.recipientCount, 0);
  const executingCount = workflows.filter((workflow) => ["planning", "running"].includes(workflow.status)).length;
  const waitingCount = workflows.filter((workflow) => workflow.status === "waiting_for_approval").length;
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-[60px] items-center border-b border-sidebar-border px-4"><Brand /></div>
      <div className="px-3 pt-4">
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-sidebar-border bg-[#111519] px-2.5 py-2 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-[#25352f] text-[10px] font-bold text-[#a2d8bc]">{demoWorkspace.initials}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-sidebar-foreground">{demoWorkspace.name}</span><span className="block text-[10px] text-muted-foreground">Demo workspace</span></span>
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-border bg-popover p-1 shadow-xl">
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Current workspace</div>
            <Link onClick={onNavigate} href="/settings" className="flex items-center gap-2 rounded px-2 py-2 text-xs text-foreground hover:bg-accent">{demoWorkspace.name} <ArrowUpRight className="ml-auto size-3 text-muted-foreground" /></Link>
          </div>
        </details>
      </div>
      <div className="px-3 pt-7"><p className="section-label px-2.5">Workspace</p></div>
      <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Main navigation">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href === "/workflows" && pathname.startsWith("/workflows/"));
          return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-[#20252a] font-medium text-[#f2f4f5]" : "text-[#929ca5] hover:bg-[#171b20] hover:text-[#d9dee1]")}><Icon className={cn("size-[15px] shrink-0", active ? "text-[#c8d1d1]" : "text-[#77818b]")} /><span className="flex-1">{label}</span>{label === "Approvals" && pendingCount > 0 && <span className="rounded border border-[#6b5330] bg-[#34291b] px-1.5 font-mono text-[10px] leading-4 text-[#e8b766]">{pendingCount}</span>}</Link>;
        })}
      </nav>
      <div className="space-y-3 border-t border-sidebar-border p-3">
        <div className="rounded-md border border-sidebar-border bg-[#111519] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#dce4e3]"><span className="size-1.5 rounded-full bg-[#77d3bf] shadow-[0_0_0_3px_#21423b]" />Workspace pulse</div>
          <p className="mt-1.5 pl-3.5 text-[11px] leading-4 text-muted-foreground">{executingCount} executing · {waitingCount} at approval gate</p>
        </div>
        <Link href="/settings" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"><span className="flex size-7 items-center justify-center rounded-full bg-[#2e3942] text-[11px] font-semibold text-[#dce3e8]">{demoWorkspace.initials}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{demoWorkspace.name}</span><span className="block text-[11px] text-muted-foreground">Workspace owner</span></span><CircleHelp className="size-3.5 text-muted-foreground" /></Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const current = navigation.find(({ href }) => pathname === href || (href === "/workflows" && pathname.startsWith("/workflows/")))?.label ?? "Dashboard";
  const showGlobalCta = pathname !== "/dashboard" && pathname !== "/workflows";
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-sidebar-border lg:block"><SidebarContent /></aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 gap-0 border-sidebar-border bg-sidebar p-0" showCloseButton={false}><SheetTitle className="sr-only">Navigation</SheetTitle><SidebarContent onNavigate={() => setMobileOpen(false)} /></SheetContent>
      </Sheet>
      <div className="lg:pl-56">
        <div className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur-sm lg:px-8">
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground"><Button size="icon-sm" variant="ghost" className="-ml-1 lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu className="size-4" /></Button><span className="hidden sm:inline">{demoWorkspace.name}</span><span className="hidden text-[#59636b] sm:inline">/</span><span className="truncate font-medium text-[#dce1e3]">{current}</span></div>
          <div className="flex items-center gap-3"><span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex"><span className="size-1.5 rounded-full bg-[#77d3bf]" />Demo environment</span>{showGlobalCta && <NewWorkflowButton compact />}</div>
        </div>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
