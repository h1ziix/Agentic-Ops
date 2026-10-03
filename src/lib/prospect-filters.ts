import { normalizeIndustry, normalizeOpportunity } from "./intelligence-normalization";
import type { Company, Lead, LeadStatus, OutreachStatus, Workflow } from "../types/domain";

export type LeadView = "all" | "high_fit" | "needs_review";
export type LeadSort = "score" | "updated" | "company";
export interface LeadFilters {
  query: string;
  view: LeadView;
  status: "all" | LeadStatus;
  sort: LeadSort;
  workflow: string;
  icp: string;
  confidence: "all" | "high" | "medium" | "low" | "unknown";
  minScore: number | null;
  maxScore: number | null;
  industry: string;
  opportunity: string;
  outreach: "all" | OutreachStatus;
  reply: "all" | "detected" | "none_detected" | "unavailable";
  from: string;
  to: string;
}

const stages = ["all", "new", "qualified", "outreach_ready", "waiting_approval", "contacted", "responded", "converted", "rejected"] as const;
const outreach = ["all", "not_started", "reviewing", "drafting", "draft_ready", "rejected", "needs_more_research", "blocked_missing_recipient", "failed", "drafted", "waiting_approval", "approved", "sent"] as const;
export const leadFilterKeys = ["q", "view", "stage", "sort", "workflow", "icp", "confidence", "minScore", "maxScore", "industry", "opportunity", "outreach", "reply", "from", "to"] as const;

function choice<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}
function score(value: string | null): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const number = Number(value);
  return number >= 0 && number <= 100 ? number : null;
}
function date(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : "";
}

export function readLeadFilters(params: Pick<URLSearchParams, "get">): LeadFilters {
  return {
    query: (params.get("q") ?? "").slice(0, 200),
    view: choice(params.get("view"), ["all", "high_fit", "needs_review"], "all"),
    status: choice(params.get("stage"), stages, "all"),
    sort: choice(params.get("sort"), ["score", "updated", "company"], "score"),
    workflow: params.get("workflow") ?? "all", icp: params.get("icp") ?? "all",
    confidence: choice(params.get("confidence"), ["all", "high", "medium", "low", "unknown"], "all"),
    minScore: score(params.get("minScore")), maxScore: score(params.get("maxScore")),
    industry: params.get("industry") ?? "all", opportunity: params.get("opportunity") ?? "all",
    outreach: choice(params.get("outreach"), outreach, "all"),
    reply: choice(params.get("reply"), ["all", "detected", "none_detected", "unavailable"], "all"),
    from: date(params.get("from")), to: date(params.get("to")),
  };
}

/** All list and drawer changes preserve other query parameters. Paths are application-owned. */
export function prospectUrl(path: "/leads" | "/companies", current: string, changes: Record<string, string | null>): string {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function leadIndustry(lead: Lead, company: Company | undefined): string {
  return normalizeIndustry(lead.researchContext?.industry ?? company?.industry);
}

export function leadMatchesFilters(lead: Lead, company: Company | undefined, workflow: Workflow | undefined, filters: LeadFilters): boolean {
  const term = filters.query.trim().toLowerCase();
  const context = lead.researchContext ?? company;
  if (term && ![company?.name ?? "", context?.industry ?? "", context?.location ?? "", lead.opportunity].some((value) => value.toLowerCase().includes(term))) return false;
  if (filters.view === "high_fit" && (lead.score === null || lead.score < 80)) return false;
  if (filters.view === "needs_review" && lead.outreachStatus !== "waiting_approval") return false;
  if (filters.status !== "all" && lead.status !== filters.status) return false;
  if (filters.workflow !== "all" && lead.workflowId !== filters.workflow) return false;
  if (filters.icp !== "all" && workflow?.icpId !== filters.icp) return false;
  if (filters.confidence !== "all" && (lead.confidence ?? "unknown") !== filters.confidence) return false;
  if (filters.minScore !== null && (lead.score === null || lead.score < filters.minScore)) return false;
  if (filters.maxScore !== null && (lead.score === null || lead.score > filters.maxScore)) return false;
  if (filters.industry !== "all" && leadIndustry(lead, company) !== filters.industry) return false;
  if (filters.opportunity !== "all" && normalizeOpportunity(lead.opportunity) !== filters.opportunity) return false;
  if (filters.outreach !== "all" && lead.outreachStatus !== filters.outreach) return false;
  if (filters.reply !== "all" && (lead.replyStatus ?? "unavailable") !== filters.reply) return false;
  if (filters.from || filters.to) {
    const timestamp = lead.createdAt ? Date.parse(lead.createdAt) : NaN;
    if (!Number.isFinite(timestamp)) return false;
    const createdDate = new Date(timestamp).toISOString().slice(0, 10);
    if (filters.from && createdDate < filters.from || filters.to && createdDate > filters.to) return false;
  }
  return true;
}

export interface CompanyIntelligence {
  workflowCount: number;
  latestScore: number | null;
  confidence: Lead["confidence"];
  opportunity: string;
  sourceCount: number;
}

/** A new unknown assessment stays unknown; editing an older lead cannot make it the latest assessment. */
export function companyIntelligence(company: Company, leads: readonly Lead[]): CompanyIntelligence {
  const related = leads.filter((lead) => lead.companyId === company.id);
  const workflowIds = new Set([
    ...Object.keys(company.workflowResearchStatuses ?? {}),
    ...(company.workflowId ? [company.workflowId] : []),
    ...related.map((lead) => lead.workflowId),
  ]);
  const latest = [...related].sort((a, b) => Date.parse(b.createdAt ?? b.updatedAt) - Date.parse(a.createdAt ?? a.updatedAt))[0];
  return { workflowCount: workflowIds.size, latestScore: latest ? latest.score : company.score,
    confidence: latest ? latest.confidence : company.qualificationConfidence ?? null,
    opportunity: normalizeOpportunity(latest?.opportunity ?? company.opportunity), sourceCount: new Set(company.sourceUrls).size };
}
