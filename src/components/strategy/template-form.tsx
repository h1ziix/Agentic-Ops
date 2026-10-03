"use client";

import { useState, type FormEvent } from "react";
import { saveTemplateAction } from "@/app/actions/strategy";
import { templateInputSchema } from "@/lib/validation/strategy";
import type { IdealCustomerProfile, WorkflowTemplate } from "@/types/strategy";
import { Button } from "@/components/ui/button";
import { StrategyField } from "./strategy-field";

export function TemplateForm({ template, icps, onSaved, onCancel, onBusyChange }: { template?: WorkflowTemplate; icps: IdealCustomerProfile[]; onSaved: () => void; onCancel: () => void; onBusyChange: (busy: boolean) => void }) {
  const [values, setValues] = useState({ name: template?.name ?? "", description: template?.description ?? "", category: template?.category ?? "", defaultGoal: template?.default_goal ?? "", taskStrategy: template?.task_strategy ?? "", defaultIcpId: template?.default_icp_id ?? "", defaultCompanyCount: String(template?.default_company_count ?? 10), followupEnabled: template?.followup_enabled ?? false });
  const [error, setError] = useState(""); const [invalid, setInvalid] = useState(""); const [saving, setSaving] = useState(false);
  const field = (name: "name" | "description" | "category" | "defaultGoal" | "taskStrategy" | "defaultCompanyCount", label: string, options: { multiline?: boolean; type?: string; min?: number; max?: number; help?: string } = {}) => <StrategyField name={name} label={label} value={values[name]} invalid={invalid === name} onChange={(value) => { setValues((current) => ({ ...current, [name]: value })); setInvalid(""); }} {...options} />;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    const parsed = templateInputSchema.safeParse({ ...values, defaultIcpId: values.defaultIcpId || null, defaultCompanyCount: values.defaultCompanyCount.trim() ? Number(values.defaultCompanyCount) : NaN, approvalRequired: true });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check template details."); setInvalid(String(parsed.error.issues[0]?.path[0] ?? "")); return; }
    setSaving(true); onBusyChange(true); setError("");
    try { const result = await saveTemplateAction(parsed.data, template?.id); if (result.error) setError(result.error); else onSaved(); }
    catch { setError("The template could not be saved. Please retry."); } finally { setSaving(false); onBusyChange(false); }
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-5">
    {field("name", "Template name")}{field("description", "Description", { multiline: true })}{field("category", "Category")}
    {field("defaultGoal", "Default goal", { multiline: true, help: "A starting point. Your explicit workflow goal takes priority." })}
    {field("taskStrategy", "Research & outreach guidance", { multiline: true, help: "The Planner uses this guidance to create a real plan." })}
    <label className="flex flex-col gap-2 text-xs font-medium">Default ICP<select name="defaultIcpId" value={values.defaultIcpId} onChange={(event) => setValues((current) => ({ ...current, defaultIcpId: event.target.value }))} className="h-9 rounded-md border border-input bg-card px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring"><option value="">No default profile</option>{icps.filter((profile) => profile.id === values.defaultIcpId && profile.archived_at).map((profile) => <option key={profile.id} value={profile.id} disabled>{profile.name} (archived — select a replacement)</option>)}{icps.filter((profile) => !profile.archived_at).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
    {field("defaultCompanyCount", "Default company target", { type: "number", min: 1, max: 20 })}
    <fieldset className="flex flex-col gap-3 border-t border-border pt-4"><legend className="section-label">Execution policy</legend><p className="text-xs leading-5 text-muted-foreground">Human approval is required for every external action. Execution remains a separate step.</p><label className="flex items-start gap-2.5 text-xs leading-5"><input type="checkbox" name="followupEnabled" className="mt-1 accent-[var(--brand-accent)]" checked={values.followupEnabled} onChange={(event) => setValues((current) => ({ ...current, followupEnabled: event.target.checked }))} /><span>Suggest follow-up after an approved send<span className="block text-[11px] text-muted-foreground">Planning preference. Every follow-up needs a fresh approval.</span></span></label></fieldset>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save template"}</Button></div>
  </form>;
}
