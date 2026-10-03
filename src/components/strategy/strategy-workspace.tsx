"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, FileStack, Pencil, Plus, Target } from "lucide-react";
import { archiveIcpAction, archiveTemplateAction, duplicateIcpAction, duplicateTemplateAction } from "@/app/actions/strategy";
import { useDemoStore } from "@/components/app/demo-store";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { NewWorkflowButton } from "@/components/app/new-workflow-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { IdealCustomerProfile, StrategyLibrary, WorkflowTemplate } from "@/types/strategy";
import { IcpForm } from "./icp-form";
import { TemplateForm } from "./template-form";

export function StrategyWorkspace({ kind, library, loadError }: { kind: "icps" | "templates"; library: StrategyLibrary; loadError?: string }) {
  const { mode } = useDemoStore(); const router = useRouter();
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<IdealCustomerProfile | WorkflowTemplate>();
  const [showArchived, setShowArchived] = useState(false); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const isIcp = kind === "icps"; const rows = (isIcp ? library.icps : library.templates).filter((row) => showArchived ? Boolean(row.archived_at) : !row.archived_at);
  const saved = () => { setOpen(false); setEditing(undefined); router.refresh(); };
  async function mutate(id: string, action: "duplicate" | "archive") {
    if (busy) return; setBusy(id); setError("");
    try {
      const run = isIcp ? action === "archive" ? archiveIcpAction : duplicateIcpAction : action === "archive" ? archiveTemplateAction : duplicateTemplateAction;
      const result = await run(id); if (result.error) setError(result.error); else router.refresh();
    } catch { setError("The change could not be saved. Please retry."); } finally { setBusy(""); }
  }
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Strategy / Reusable configuration" title={isIcp ? "Ideal customer profiles" : "Workflow templates"} description={isIcp ? "Save the company criteria, signals and qualification rules behind your campaigns." : "Reuse research and outreach guidance. The Planner turns each goal into a fresh plan."} actions={<Button disabled={mode !== "live" || Boolean(loadError)} onClick={() => { setEditing(undefined); setOpen(true); }}><Plus data-icon="inline-start" />{isIcp ? "New profile" : "New template"}</Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><p className="text-xs text-muted-foreground">{rows.length} {showArchived ? "archived" : "active"} {isIcp ? "profiles" : "templates"} · workspace owned</p><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-[var(--brand-accent)]" />Show archived</label></div>
    {(error || loadError) && <p role="alert" className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-xs text-destructive">{error || loadError}</p>}
    {mode !== "live" && <p className="text-xs leading-5 text-muted-foreground">Connect Supabase to save reusable strategy. This local preview contains no persisted profiles or templates.</p>}
    {!rows.length ? <EmptyState icon={isIcp ? Target : FileStack} title={showArchived ? "No archived configuration" : isIcp ? "Define who you want to reach" : "Save a strategy worth repeating"} description={showArchived ? "Archived configuration remains in historical workflow snapshots." : isIcp ? "Create a profile once, then combine it with any workflow goal or template." : "Keep a default goal and research guidance ready for your next campaign."} action={mode === "live" && !loadError && !showArchived ? <Button variant="outline" onClick={() => { setEditing(undefined); setOpen(true); }}>{isIcp ? "Create profile" : "Create template"}</Button> : undefined} /> : <div className="overflow-hidden rounded-lg border border-border bg-card">
      {rows.map((row) => {
        const profile = isIcp ? row as IdealCustomerProfile : undefined; const template = !isIcp ? row as WorkflowTemplate : undefined;
        const linkedProfile = template ? library.icps.find((item) => item.id === template.default_icp_id) : undefined;
        return <article key={row.id} className="flex flex-col gap-4 border-b border-border px-5 py-5 last:border-b-0 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2.5">{isIcp ? <Target className="size-4 text-muted-foreground" /> : <FileStack className="size-4 text-muted-foreground" />}<h2 className="text-sm font-semibold">{row.name}</h2>{row.archived_at && <span className="text-[10px] text-muted-foreground">Archived</span>}</div><p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{row.description || (profile ? "Company criteria for a reusable campaign." : "Reusable planning guidance.")}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted-foreground">{profile ? <><div><dt className="inline">Industry </dt><dd className="inline text-foreground">{profile.industries.join(", ") || "Unrestricted"}</dd></div><div><dt className="inline">Location </dt><dd className="inline text-foreground">{profile.locations.join(", ") || "Unrestricted"}</dd></div><div><dt className="inline">Effective minimum score </dt><dd className="inline font-mono text-foreground">{Math.max(60, profile.minimum_lead_score)}</dd></div></> : <><div><dt className="inline">ICP </dt><dd className="inline text-foreground">{linkedProfile?.name ?? "None"}{linkedProfile?.archived_at ? " (archived)" : ""}</dd></div><div><dt className="inline">Approval </dt><dd className="inline text-foreground">Required</dd></div><div><dt className="inline">Follow-up guidance </dt><dd className="inline text-foreground">{template?.followup_enabled ? "Enabled · fresh approval" : "Off"}</dd></div></>}<div><dt className="inline">Company target </dt><dd className="inline font-mono text-foreground">{row.default_company_count}</dd></div></dl>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">{!row.archived_at && <><NewWorkflowButton compact label="Use in workflow" variant="outline" initialIcpId={profile?.id} initialTemplateId={template?.id} library={library} /><Button size="icon-sm" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => { setEditing(row); setOpen(true); }} disabled={Boolean(busy)}><Pencil /></Button><Button size="icon-sm" variant="ghost" aria-label={`Duplicate ${row.name}`} onClick={() => mutate(row.id, "duplicate")} disabled={Boolean(busy)}><Copy /></Button><Button size="icon-sm" variant="ghost" aria-label={`Archive ${row.name}`} onClick={() => mutate(row.id, "archive")} disabled={Boolean(busy)}><Archive /></Button></>}{busy === row.id && <span role="status" className="self-center text-[11px] text-muted-foreground">Saving…</span>}</div>
        </article>;
      })}
    </div>}
    <p className="border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">Each workflow saves its own configuration snapshot. Editing or archiving a source preserves the strategy used by previous workflows.</p>
    <Dialog open={open} onOpenChange={(next) => { if (!formBusy) setOpen(next); }}><DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(680px,calc(100vw-2rem))] max-w-none overflow-y-auto sm:max-w-none"><DialogHeader><DialogTitle>{editing ? "Edit" : "Create"} {isIcp ? "customer profile" : "workflow template"}</DialogTitle><DialogDescription>{isIcp ? "Required and excluded signals guide research and outreach eligibility." : "Templates provide context to the Planner. Approval stays required."}</DialogDescription></DialogHeader>{isIcp ? <IcpForm key={editing?.id ?? "new"} profile={editing as IdealCustomerProfile | undefined} onBusyChange={setFormBusy} onSaved={saved} onCancel={() => setOpen(false)} /> : <TemplateForm key={editing?.id ?? "new"} template={editing as WorkflowTemplate | undefined} icps={library.icps} onBusyChange={setFormBusy} onSaved={saved} onCancel={() => setOpen(false)} />}</DialogContent></Dialog>
  </div>;
}
