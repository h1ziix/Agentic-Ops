import type { StrategyLibrary } from "../types/strategy";

/** An explicit profile overrides a template default; an inherited profile follows its template. */
export function workflowDefaults(library: StrategyLibrary, templateId?: string, explicitIcpId?: string) {
  const template = library.templates.find((item) => item.id === templateId && !item.archived_at);
  const profile = library.icps.find((item) => item.id === (explicitIcpId || template?.default_icp_id) && !item.archived_at);
  return {
    icpId: profile?.id ?? "", templateId: template?.id ?? "",
    targetCompanies: String(template?.default_company_count ?? profile?.default_company_count ?? 20),
    goal: template?.default_goal || (profile ? `Research and qualify companies matching ${profile.name}. Identify evidence-backed AI automation opportunities. Do not send anything without approval.` : ""),
  };
}
