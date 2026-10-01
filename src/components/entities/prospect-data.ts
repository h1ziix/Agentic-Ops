"use client";

import { useMemo } from "react";
import { useDemoStore } from "@/components/app/demo-store";
import type { Company, Lead, OutreachStatus } from "@/types/domain";

export const entityDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "Asia/Almaty" });

export function outreachLabel(status: OutreachStatus) {
  const labels: Record<OutreachStatus, string> = { not_started: "Not started", reviewing: "Reviewing evidence", drafting: "Drafting", draft_ready: "Draft ready", drafted: "Drafted", waiting_approval: "Needs review", approved: "Approved", rejected: "Rejected", needs_more_research: "More research needed", blocked_missing_recipient: "Recipient missing", failed: "Preparation failed", sent: "Sent" };
  return labels[status];
}

export function useProspectData() {
  const store = useDemoStore();
  const companyById = useMemo(() => new Map(store.companies.map((company) => [company.id, company])), [store.companies]);
  return { ...store, companyById };
}

function csvCell(value: string | number) {
  const content = String(value);
  const safe = /^[=+@\-\t\r]/.test(content) ? `'${content}` : content;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportLeadCsv(leads: Lead[], companies: Company[]) {
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const rows: (string | number)[][] = [["Company", "Industry", "Location", "Fit score", "Stage", "Outreach", "Opportunity", "Confidence"]];
  for (const lead of leads) {
    const company = companyById.get(lead.companyId);
    rows.push([company?.name ?? lead.companyId, company?.industry ?? "", company?.location ?? "", lead.score ?? "", lead.status, outreachLabel(lead.outreachStatus), lead.opportunity, lead.confidence ?? ""]);
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "agentic-ops-leads.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
