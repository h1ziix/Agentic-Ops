import { AgentEventRepository, AgentRunRepository } from "../repositories/agent-repositories";
import { ApprovalRepository } from "../repositories/approval-repository";
import { CompanyRepository, LeadRepository } from "../repositories/entity-repositories";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { requireWorkspace } from "../auth/context";
import type { WorkspaceSnapshot } from "@/types/persistence";
import { ExecutionRepository } from "../repositories/execution-repository";
import { IntegrationRepository } from "../repositories/integration-repository";
import { displayHistoryWindow, type ReadWindow } from "../repositories/read-window";

/** Request-scoped workspace data for the current Stage 1-compatible UI adapter. */
export async function getWorkspaceSnapshot(workspaceId?: string, history?: { agentRuns?: ReadWindow; events?: ReadWindow }): Promise<WorkspaceSnapshot> {
  const runWindow = displayHistoryWindow(history?.agentRuns ?? { offset: 0, limit: 200 });
  const eventWindow = displayHistoryWindow(history?.events ?? { offset: 0, limit: 300 });
  const { supabase, workspace } = await requireWorkspace(workspaceId);
  const workflowRepository = new WorkflowRepository(supabase);
  const companyRepository = new CompanyRepository(supabase);
  const leadRepository = new LeadRepository(supabase);
  const runRepository = new AgentRunRepository(supabase);
  const eventRepository = new AgentEventRepository(supabase);
  const approvalRepository = new ApprovalRepository(supabase);

  const [workflows, tasks, companies, leads, agentRuns, events, approvals, proposedActions, workflowCompanies, repliedLeadIds] = await Promise.all([
    workflowRepository.listWorkspaceWorkflows(workspace.id),
    workflowRepository.listWorkflowTasks(workspace.id),
    companyRepository.listWorkspaceCompanies(workspace.id),
    leadRepository.listWorkspaceLeads(workspace.id),
    runRepository.listWorkspaceRuns(workspace.id, undefined, { ...runWindow, limit: Math.min(runWindow.limit + 1, 1000) }),
    eventRepository.listWorkspaceEvents(workspace.id, undefined, { ...eventWindow, limit: Math.min(eventWindow.limit + 1, 1000) }),
    approvalRepository.listWorkspaceApprovals(workspace.id),
    approvalRepository.listWorkspaceProposedActions(workspace.id),
    companyRepository.listWorkflowAssociations(workspace.id),
    leadRepository.listDetectedReplyLeadIds(workspace.id),
  ]);

  const [execution, integrationConnections] = await Promise.all([new ExecutionRepository(supabase).list(workspace.id), new IntegrationRepository(supabase).list(workspace.id)]);
  return { workspace, workflows, tasks, companies, leads, agentRuns: agentRuns.slice(0, runWindow.limit), events: events.slice(0, eventWindow.limit), approvals, proposedActions, workflowCompanies, repliedLeadIds, ...execution, integrationConnections,
    historyWindows: { agentRuns: { ...runWindow, hasMore: agentRuns.length > runWindow.limit }, events: { ...eventWindow, hasMore: events.length > eventWindow.limit }, execution: { limit: 200 } } };
}
