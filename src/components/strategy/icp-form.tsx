"use client";

import { useState, type FormEvent } from "react";
import { saveIcpAction } from "@/app/actions/strategy";
import { icpInputSchema } from "@/lib/validation/strategy";
import type { IdealCustomerProfile } from "@/types/strategy";
import { Button } from "@/components/ui/button";
import { StrategyField, splitCriteria } from "./strategy-field";

export function IcpForm({ profile, onSaved, onCancel, onBusyChange }: { profile?: IdealCustomerProfile; onSaved: () => void; onCancel: () => void; onBusyChange: (busy: boolean) => void }) {
  const [values, setValues] = useState({
    name: profile?.name ?? "", description: profile?.description ?? "",
    industries: profile?.industries.join("\n") ?? "", locations: profile?.locations.join("\n") ?? "",
    companySizeMin: profile?.company_size_min?.toString() ?? "", companySizeMax: profile?.company_size_max?.toString() ?? "",
    businessModels: profile?.business_models.join("\n") ?? "", requiredSignals: profile?.required_signals.join("\n") ?? "",
    preferredSignals: profile?.preferred_signals.join("\n") ?? "", excludedSignals: profile?.excluded_signals.join("\n") ?? "",
    automationFocus: profile?.automation_focus.join("\n") ?? "", minimumLeadScore: String(profile?.minimum_lead_score ?? 60),
    defaultCompanyCount: String(profile?.default_company_count ?? 10),
  });
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState("");
  const [saving, setSaving] = useState(false);
  const field = (name: keyof typeof values, label: string, options: { multiline?: boolean; type?: string; min?: number; max?: number; help?: string } = {}) => <StrategyField key={name} name={name} label={label} value={values[name]} onChange={(value) => { setValues((current) => ({ ...current, [name]: value })); setInvalid(""); }} invalid={invalid === name} {...options} />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = icpInputSchema.safeParse({ ...values,
      industries: splitCriteria(values.industries), locations: splitCriteria(values.locations), businessModels: splitCriteria(values.businessModels),
      requiredSignals: splitCriteria(values.requiredSignals), preferredSignals: splitCriteria(values.preferredSignals), excludedSignals: splitCriteria(values.excludedSignals), automationFocus: splitCriteria(values.automationFocus),
      companySizeMin: values.companySizeMin.trim() ? Number(values.companySizeMin) : null, companySizeMax: values.companySizeMax.trim() ? Number(values.companySizeMax) : null,
      minimumLeadScore: values.minimumLeadScore.trim() ? Number(values.minimumLeadScore) : NaN, defaultCompanyCount: values.defaultCompanyCount.trim() ? Number(values.defaultCompanyCount) : NaN,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the profile criteria."); setInvalid(String(parsed.error.issues[0]?.path[0] ?? "")); return; }
    setSaving(true); onBusyChange(true); setError("");
    try { const result = await saveIcpAction(parsed.data, profile?.id); if (result.error) setError(result.error); else onSaved(); }
    catch { setError("The profile could not be saved. Please retry."); }
    finally { setSaving(false); onBusyChange(false); }
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-6">
    <fieldset className="flex min-w-0 flex-col gap-4"><legend className="mb-3 section-label">Basic information</legend>{field("name", "Profile name")}{field("description", "Description", { multiline: true })}</fieldset>
    <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-3 section-label">Company criteria</legend>{field("industries", "Industries", { multiline: true, help: "One criterion per line. Blank means unrestricted." })}{field("locations", "Locations", { multiline: true, help: "Countries, regions or cities, one per line." })}{field("companySizeMin", "Minimum employees", { type: "number", min: 1 })}{field("companySizeMax", "Maximum employees", { type: "number", min: 1 })}<div className="sm:col-span-2">{field("businessModels", "Business models", { help: "For example: B2B SaaS; payments" })}</div></fieldset>
    <fieldset className="flex min-w-0 flex-col gap-4"><legend className="mb-3 section-label">Signals & automation strategy</legend>{field("requiredSignals", "Required signals", { multiline: true })}{field("preferredSignals", "Preferred signals", { multiline: true })}{field("excludedSignals", "Excluded signals", { multiline: true, help: "Exclusions hold outreach for review when evidence conflicts." })}{field("automationFocus", "Automation focus", { multiline: true })}</fieldset>
    <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-3 section-label">Qualification & defaults</legend>{field("minimumLeadScore", "Minimum lead score", { type: "number", min: 0, max: 100, help: "Existing evidence safeguards keep an effective minimum score of 60." })}{field("defaultCompanyCount", "Default company target", { type: "number", min: 1, max: 20, help: "The current research limit is 20 companies." })}</fieldset>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button></div>
  </form>;
}
