"use client";

import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Activity, ArrowUpRight, BarChart3, Building2, CalendarClock, ChevronDown, ChevronRight, Command, FileStack, LayoutGrid, LogOut, Menu, Search, Settings2, ShieldCheck, Target, UsersRound, Workflow } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeSelector } from "@/components/app/theme-selector";
import { PixelMark } from "@/components/app/pixel-mark";
import { CommandMenu } from "@/components/app/command-menu";
import { MotionProvider, PageTransition, SignalDot } from "@/components/app/motion-system";
import { cn } from "@/lib/utils";
import { useDemoStore } from "@/components/app/demo-store";
import { workspacePathname } from "@/lib/workspace-path";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid, group: "Workspace" },
  { label: "Workflows", href: "/workflows", icon: Workflow, group: "Workspace" },
  { label: "Leads", href: "/leads", icon: UsersRound, group: "Workspace" },
  { label: "Companies", href: "/companies", icon: Building2, group: "Workspace" },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck, group: "Operations" },
  { label: "Automation", href: "/automation", icon: CalendarClock, group: "Operations" },
  { label: "Activity", href: "/activity", icon: Activity, group: "Operations" },
  { label: "Intelligence", href: "/intelligence", icon: BarChart3, group: "Strategy" },
  { label: "Customer profiles", href: "/icps", icon: Target, group: "Strategy" },
  { label: "Templates", href: "/templates", icon: FileStack, group: "Strategy" },
] as const;

function SidebarContent({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const pathname = workspacePathname(usePathname());
  const layoutId = useId();
  const { workflows, approvals, workspace, mode } = useDemoStore();
  const pending = approvals.filter((approval) => approval.status === "pending").length;
  const active = workflows.filter((workflow) => ["planning", "running"].includes(workflow.status)).length;
  return <div className="flex h-full flex-col overflow-y-auto bg-sidebar text-sidebar-foreground">
    <div className="flex h-[68px] shrink-0 items-center border-b border-sidebar-border px-5">
      <Link href="/dashboard" onClick={onNavigate} className="group flex items-center gap-2.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-label="Agentic Ops overview">
        <span className="flex size-8 items-center justify-center rounded-md bg-[var(--brand-mark-bg)] text-[var(--brand-mark-fg)] shadow-sm transition-transform duration-200 group-hover:-rotate-3"><PixelMark /></span>
        <span className="text-[17px] font-semibold tracking-[-0.055em]">agentic<span className="font-normal text-sidebar-foreground/50">/</span>ops<span className="ml-0.5 text-sidebar-primary">.</span></span>
      </Link>
    </div>
    <div className="px-3 pt-4">
      <Link href="/settings" onClick={onNavigate} className="workspace-switcher flex items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-2.5 hover:border-sidebar-ring/40">
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-semibold">{workspace.initials}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{workspace.name}</span><span className="mt-0.5 block text-[10px] text-sidebar-foreground/60">{mode === "live" ? "Workspace" : "Demo preview"}</span></span><ChevronDown className="size-3 text-sidebar-foreground/60" />
      </Link>
      <button type="button" onClick={onSearch} className="sidebar-action mt-3 flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-xs text-sidebar-foreground/65"><Search className="size-3.5" />Quick search<kbd className="ml-auto rounded border border-sidebar-border bg-white/5 px-1.5 py-0.5 font-sans text-[10px] text-sidebar-foreground/65">Ctrl K</kbd></button>
    </div>
    <nav className="flex flex-1 flex-col gap-6 px-3 pt-8" aria-label="Main navigation">
      {(["Workspace", "Operations", "Strategy"] as const).map(group => <div key={group}>
        <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/45">{group}</p>
        <div className="flex flex-col gap-1">{navigation.filter(item => item.group === group).map(({ label, href, icon: Icon }) => {
          const selected = pathname === href || pathname.startsWith(href + "/");
          return <Link key={href} href={href} onClick={onNavigate} aria-current={selected ? "page" : undefined} className={cn("nav-link relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", selected ? "font-semibold text-sidebar-foreground" : "text-sidebar-foreground/65")}>
            {selected && <motion.span layoutId={layoutId + "-navigation"} className="absolute inset-0 rounded-md border border-sidebar-ring/20 bg-sidebar-accent shadow-[inset_2px_0_0_var(--sidebar-primary)]" transition={{ type: "spring", duration: 0.3, bounce: 0 }} />}
            <Icon className={cn("relative size-[15px] shrink-0", selected && "text-sidebar-primary")} /><span className="relative flex-1">{label}</span>
            {label === "Approvals" && pending > 0 && <span className="relative min-w-5 rounded bg-[var(--warning-bg)] px-1.5 text-center font-mono text-[10px] leading-5 text-[var(--warning-fg)]">{pending}</span>}
          </Link>;
        })}</div>
      </div>)}
    </nav>
    <div className="mt-6 flex flex-col gap-3 p-3">
      <div className="rounded-md border border-sidebar-border bg-sidebar-accent/35 px-3 py-3">
        <div className="flex items-center gap-2 text-[10px] font-medium"><SignalDot active={active > 0} className="text-sidebar-primary" />{mode === "live" ? "Workspace activity" : "Local demo environment"}</div>
        <p className="mt-1.5 text-[10px] leading-4 text-sidebar-foreground/60">{active} workflow{active !== 1 ? "s" : ""} in progress<br />{mode === "live" ? "Exact approval → explicit Execute." : "Preview · external execution disabled."}</p>
      </div>
      <Link href="/settings" onClick={onNavigate} aria-current={pathname === "/settings" ? "page" : undefined} className="nav-link flex h-8 items-center gap-2.5 rounded-md px-2.5 text-xs text-sidebar-foreground/65"><Settings2 className="size-3.5" />Settings<ArrowUpRight className="ml-auto size-3" /></Link>
      <div className="flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-3"><span className="flex size-7 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-[10px] font-semibold">{workspace.initials}</span><span className="min-w-0 flex-1 truncate text-[11px] font-medium">{workspace.name}<span className="mt-0.5 block text-[10px] font-normal text-sidebar-foreground/55">{mode === "live" ? "Signed in" : "Preview mode"}</span></span>{mode === "live" && <form action={signOut}><button type="submit" title="Sign out" aria-label="Sign out" className="rounded p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring"><LogOut className="size-3.5" /></button></form>}</div>
    </div>
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { storageAvailable, workspace, mode, resetDemo } = useDemoStore();
  const [demoReset, setDemoReset] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = workspacePathname(usePathname());
  const current = navigation.find(({ href }) => pathname === href || pathname.startsWith(href + "/"))?.label ?? (pathname === "/onboarding" ? "Getting started" : "Settings");
  const openSearch = () => { setMobileOpen(false); setSearchOpen(true); };
  return <MotionProvider><div className="min-h-screen bg-background">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-sidebar-border lg:block"><SidebarContent onSearch={openSearch} /></aside>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent id="mobile-navigation" side="left" className="mobile-navigation gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground" showCloseButton={true}><SheetTitle className="sr-only">Navigation</SheetTitle><SidebarContent onNavigate={() => setMobileOpen(false)} onSearch={openSearch} /></SheetContent></Sheet>
    <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    <div className="workspace-canvas min-h-screen lg:pl-[232px]">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"><Button size="icon-sm" variant="ghost" className="-ml-1 lg:hidden" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu /></Button><span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] sm:inline">Workspace</span><ChevronRight className="hidden size-3 text-[var(--icon-muted)] sm:inline" /><Link href={pathname.startsWith("/workflows/") ? "/workflows" : pathname} className="interactive-link truncate font-semibold text-foreground">{current}</Link>{pathname.startsWith("/workflows/") && <><ChevronRight className="size-3" /><span className="truncate">Execution detail</span></>}</div>
        <div className="flex items-center gap-2 sm:gap-3"><span className="hidden items-center gap-1.5 rounded border border-border bg-muted/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-[var(--brand-accent)]" />{mode === "live" ? "Release 1.0 candidate" : "Demo preview"}</span><div className="mx-1 hidden h-4 border-l border-border sm:block" /><Button size="icon-sm" variant="ghost" aria-label="Search workspace" onClick={openSearch}><Search /></Button><ThemeSelector /><Link href="/settings" aria-label={`${workspace.name} settings`} className="header-avatar flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-[9px] font-semibold">{workspace.initials}</Link></div>
      </header>
      {mode === "demo" && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-2.5 text-[11px] text-[var(--warning-fg)] sm:px-6 lg:px-8"><span><strong>DEMO / SAMPLE</strong> · Fictional records. No AI calls, emails or CRM writes.</span><div className="flex items-center gap-3"><Link href="/demo/workflows/kazakhstan-fintech" className="underline underline-offset-4">Showcase workflow</Link><button type="button" onClick={() => { resetDemo(); setDemoReset(true); }} className="rounded px-1 underline underline-offset-4">Reset demo</button><Link href="/sign-in" className="underline underline-offset-4">Open workspace</Link></div>{demoReset && <span role="status" className="w-full">Demo decisions and local drafts reset.</span>}</div>}
      {!storageAvailable && <p role="status" className="border-b border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-2 text-xs text-[var(--warning-fg)] sm:px-6 lg:px-8">Browser storage is unavailable. Changes will last only for this visit.</p>}
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1536px] px-4 py-8 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-6 lg:px-8 lg:py-9"><PageTransition key={pathname}>{children}</PageTransition></main>
      <footer className="mx-4 mb-5 flex items-center justify-between gap-4 border-t border-border pt-3 text-[10px] text-muted-foreground sm:mx-6 lg:mx-8"><span className="flex items-center gap-1.5"><Command className="size-3" />Agentic Ops <span className="text-border">/</span> {mode === "live" ? workspace.name : "Workspace preview"}</span><span className="hidden sm:block">Human judgment. Agent momentum.</span></footer>
    </div>
  </div></MotionProvider>;
}
