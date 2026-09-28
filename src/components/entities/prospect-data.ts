"use client";

import { useMemo } from "react";
import { useDemoStore } from "@/components/app/demo-store";
import { companies, leads as seedLeads } from "@/lib/mock-data";
import type { Lead, OutreachStatus } from "@/types/domain";

export const companyById = new Map(companies.map((company) => [company.id, company]));
export const entityDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function outreachLabel(status: OutreachStatus) {
  const labels: Record<OutreachStatus, string> = { not_started: "Not started", drafted: "Drafted", waiting_approval: "Needs review", approved: "Approved", sent: "Sent" };
  return labels[status];
}

export function useProspectData() {
  const store = useDemoStore();
  const leads = useMemo(() => seedLeads.map((lead): Lead => {
    const approval = store.approvals.find((item) => item.proposedActions.some((action) => action.leadId === lead.id));
    if (approval?.status === "approved") return { ...lead, status: "outreach_ready", outreachStatus: "approved" };
    if (approval?.status === "rejected") return { ...lead, status: "qualified", outreachStatus: "drafted" };
    if (approval?.status === "executed") return { ...lead, status: "contacted", outreachStatus: "sent" };
    return lead;
  }), [store.approvals]);
  return { ...store, leads };
}

function csvCell(value: string | number) {
  const content = String(value);
  const safe = /^[=+@\-\t\r]/.test(content) ? `'${content}` : content;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportLeadCsv(leads: Lead[]) {
  const rows: (string | number)[][] = [["Company", "Industry", "Location", "Fit score", "Stage", "Outreach", "Opportunity", "Confidence"]];
  for (const lead of leads) {
    const company = companyById.get(lead.companyId);
    rows.push([company?.name ?? lead.companyId, company?.industry ?? "", company?.location ?? "", lead.score, lead.status, outreachLabel(lead.outreachStatus), lead.opportunity, lead.confidence]);
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
