"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Database, Mail, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemoStore } from "@/components/app/demo-store";
import { connectionRowSchema, type IntegrationConnection } from "@/lib/validation/execution";
import { z } from "zod";
const settingsSchema = z.object({ connections: z.array(connectionRowSchema), owner: z.boolean(), configured: z.record(z.string(), z.boolean()) });
export function IntegrationSettings() {
  const { mode } = useDemoStore(); const router = useRouter();
  const [settings, setSettings] = useState<z.infer<typeof settingsSchema> | null>(null);
  const [error, setError] = useState(""); const [pending, setPending] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => {
    if (mode !== "live") return;
    const controller = new AbortController();
    fetch("/api/integrations", { cache: "no-store", signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Integration settings could not be loaded. Refresh to retry."); setSettings(settingsSchema.parse(await r.json())); })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Settings unavailable."); });
    const params = new URLSearchParams(window.location.search); const result = params.get("oauth");
    if (result) Promise.resolve().then(() => setNotice(result === "connected" ? "Connection saved. Reconnected accounts require new approvals for previous proposals." : `Connection not completed (${result.replaceAll("_", " ")}). Start connection again.`));
    return () => controller.abort();
  }, [mode]);
  async function connect(provider: string) {
    setPending(provider); setError("");
    try { const r = await fetch(`/api/integrations/${provider}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await r.json(); if (!r.ok) throw new Error(body.error); window.location.assign(z.string().url().parse(body.url));
    } catch (e) { setError(e instanceof Error ? e.message : "Connection could not be started."); setPending(""); }
  }
  async function disconnect(connection: IntegrationConnection) {
    setPending(connection.provider); setError("");
    try { const r = await fetch("/api/integrations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: connection.id }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error); setNotice(z.string().parse(body.instruction));
      const next = await fetch("/api/integrations", { cache: "no-store" }); if (next.ok) setSettings(settingsSchema.parse(await next.json())); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Disconnect could not be saved."); } finally { setPending(""); }
  }
  return <div className="flex min-w-0 flex-col">
    {notice && <p role="status" className="my-3 text-xs leading-6 text-muted-foreground">{notice}</p>}
    {error && <p role="alert" className="my-3 text-xs leading-6 text-destructive">{error}</p>}
    {mode === "live" && !settings && !error ? <Skeleton className="my-3 h-40" /> : ([{ provider: "gmail", title: "Gmail", Icon: Mail, description: "Send one approved plain-text email. No inbox access." },
      { provider: "hubspot", title: "HubSpot", Icon: Database, description: "Preview and execute separately approved contact field changes." }] as const).map(({ provider, title, Icon, description }) => {
      const connection = settings?.connections.find((c) => c.provider === provider); const configured = settings?.configured[provider];
      return <div key={provider} className="flex min-w-0 flex-wrap items-start gap-3 border-b border-border py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card"><Icon className="size-4 text-muted-foreground" /></div>
        <div className="min-w-0 flex-1"><h3 className="text-[13px] font-medium">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          <p className="mt-2 break-all text-xs font-medium">{connection?.status === "connected" ? connection.display_name : connection?.status.replaceAll("_", " ") ?? (mode === "demo" ? "Demo · real connections unavailable" : configured ? "Disconnected" : "Not configured")}</p>
          {connection && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Authorization generation {connection.generation} · {connection.provider_identity}</p>}
          {mode === "live" && !settings?.owner && <p className="mt-1 text-[11px] text-muted-foreground">Only the workspace owner can connect or disconnect.</p>}
          {mode === "live" && !configured && <p className="mt-1 text-[11px] text-muted-foreground">Server OAuth configuration is required before connecting.</p>}
        </div>
        {mode === "live" && settings?.owner && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={Boolean(pending) || !configured} onClick={() => connect(provider)}><RefreshCw data-icon="inline-start" />{pending === provider ? "Working…" : connection?.status === "connected" ? "Reconnect" : connection?.status === "reconnect_required" ? "Reconnect account" : "Connect"}</Button>
          {connection && connection.status !== "disconnected" && <Button size="sm" variant="ghost" disabled={Boolean(pending)} onClick={() => disconnect(connection)}><Unplug data-icon="inline-start" />Disconnect</Button>}
        </div>}
      </div>;
    })}
    <div className="flex items-start gap-3 py-5"><CalendarDays className="mt-1 size-4 text-muted-foreground" /><div><h3 className="text-[13px] font-medium">Google Calendar</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Release 0.7 · internal follow-up plans do not create calendar events.</p></div></div>
  </div>;
}
