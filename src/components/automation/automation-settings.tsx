"use client";

import Link from "next/link";
import { useDemoStore } from "@/components/app/demo-store";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { useAutomation } from "./use-automation";

export function AutomationSettings() {
  const { mode } = useDemoStore();
  const { data, loading, error } = useAutomation();
  if (mode === "demo") return <p className="mt-4 text-xs leading-6 text-muted-foreground">Background execution is available in a configured authenticated workspace.</p>;
  return <div className="mt-4 flex flex-col gap-4">{loading ? <Skeleton className="h-16" /> : <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div><p className="text-[13px] font-medium">Background preparation</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{data?.enabled ? "Research and preparation can continue after you leave a workflow." : data?.providerConfigured ? "Worker configuration is present. Background automation is paused." : "Connect the background worker in server configuration to enable durable scheduling."}</p></div><StatusBadge status={data?.enabled ? "running" : "paused"} label={data?.enabled ? "Enabled" : "Setup required"} /></div>}<p className="text-xs leading-6 text-muted-foreground">Follow-ups prepare a new draft for human review. Every future message requires its own exact approval and separate Execute. Unknown external outcomes remain blocked for reconciliation.</p><Link href="/automation" className="w-fit text-xs font-medium underline underline-offset-4">Inspect scheduled work and follow-ups</Link>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
