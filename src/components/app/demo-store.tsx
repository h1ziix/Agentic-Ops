"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createWorkflowAction } from "@/app/actions/workflows";
import { resolveApprovalAction } from "@/app/actions/approvals";
import type { ActionContentEdit } from "@/lib/validation/approval";
import { newWorkflowSchema, type NewWorkflowInput } from "@/lib/validation/workflow";
import { agentActivity, approvals as seedApprovals, companies as seedCompanies, demoWorkspace, leads as seedLeads, workflowStages as seedStages, workflowTasks as seedTasks, workflows as seedWorkflows } from "@/lib/mock-data";
import type { AgentEvent, Approval, ApprovalStatus, Company, Lead, PlannerRun, ResearchRun, Workflow, WorkflowStage, WorkflowTask, Workspace, WorkspaceViewData } from "@/types/domain";

export { newWorkflowSchema } from "@/lib/validation/workflow";

const storageKey = "agentic-ops-demo-v1";

const storedWorkflowSchema = z.object({
  id: z.string(), title: z.string(), goal: z.string(), status: z.enum(["draft", "planning", "running", "waiting_for_approval", "paused", "ready_for_execution", "needs_revision", "completed", "failed", "cancelled"]),
  progress: z.number(), currentStep: z.string(), targetCompanies: z.number(), companyCount: z.number(), qualifiedLeadCount: z.number(), pendingApprovalCount: z.number(),
  createdAt: z.string(), updatedAt: z.string(), startedAt: z.string().optional(), completedAt: z.string().optional(), errorSummary: z.string().optional(),
});
const storageSchema = z.object({
  createdWorkflows: z.array(storedWorkflowSchema),
  approvalDecisions: z.record(z.string(), z.object({ status: z.enum(["approved", "rejected"]), decidedAt: z.string() })),
});
type ApprovalDecision = { status: "approved" | "rejected"; decidedAt: string };

type DemoStore = {
  workspace: Workspace;
  mode: "demo" | "live";
  hydrated: boolean;
  storageAvailable: boolean;
  workflows: Workflow[];
  workflowStages: WorkflowStage[];
  workflowTasks: WorkflowTask[];
  companies: Company[];
  leads: Lead[];
  approvals: Approval[];
  activity: AgentEvent[];
  plannerRuns: PlannerRun[];
  researchRuns: ResearchRun[];
  updateWorkflow: (view: WorkspaceViewData) => void;
  createWorkflow: (input: NewWorkflowInput) => Promise<string>;
  setApprovalStatus: (id: string, status: "approved" | "rejected", edits?: ActionContentEdit[], actionIds?: string[]) => Promise<void>;
  preparationRuns: NonNullable<WorkspaceViewData["preparationRuns"]>;
};

const DemoStoreContext = createContext<DemoStore | null>(null);

function titleFromGoal(goal: string) {
  const firstClause = goal.trim().split(/[!?\n]|\.(?:\s|$)/)[0].trim();
  const concise = firstClause.split(/\s+(?:that|where|which|and prepare|and draft|and generate)\b/i)[0];
  if (concise.length <= 76) return concise;
  return `${concise.slice(0, 72).replace(/\s+\S*$/, "").trimEnd()}…`;
}

const stageLabels = ["Planning", "Company Discovery", "Research", "Qualification", "Outreach", "Approval", "Execution"];
const taskTemplates = [
  ["Define target profile", "Planner Agent"],
  ["Discover candidate companies", "Research Agent"],
  ["Research company context", "Research Agent"],
  ["Qualify and score opportunities", "Reviewer Agent"],
  ["Prepare outreach for review", "Research Agent"],
  ["Request human approval", "Executor Agent"],
] as const;

export function DemoStoreProvider({ children, initialData }: { children: ReactNode; initialData?: WorkspaceViewData }) {
  const router = useRouter();
  const [createdWorkflows, setCreatedWorkflows] = useState<Workflow[]>([]);
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, ApprovalDecision>>({});
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [workflowUpdates, setWorkflowUpdates] = useState<Record<string, WorkspaceViewData>>({});

  /* eslint-disable react-hooks/set-state-in-effect -- Rehydrate the browser-only demo workspace after server rendering. */
  useEffect(() => {
    if (initialData) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = storageSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          setCreatedWorkflows(parsed.data.createdWorkflows);
          setApprovalDecisions(parsed.data.approvalDecisions);
        }
      }
    } catch { setStorageAvailable(false); }
    setHydrated(true);
  }, [initialData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- Reflect unavailable browser storage without crashing the workspace. */
  useEffect(() => {
    if (initialData) return;
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ createdWorkflows, approvalDecisions }));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
  }, [createdWorkflows, approvalDecisions, hydrated, initialData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const value = useMemo<DemoStore>(() => {
    if (initialData) {
      // Poll responses update just one workflow; a newer RSC snapshot wins after navigation.
      const updates = Object.values(workflowUpdates).filter((view) => {
        const updated = view.workflows[0];
        const server = initialData.workflows.find((workflow) => workflow.id === updated?.id);
        return updated && (!server || updated.updatedAt >= server.updatedAt);
      });
      const ids = new Set(updates.flatMap((view) => view.workflows.map((workflow) => workflow.id)));
      const updatedCompanies = new Map(initialData.companies.map((company) => [company.id, company]));
      for (const company of updates.flatMap((view) => view.companies)) {
        const previous = updatedCompanies.get(company.id);
        updatedCompanies.set(company.id, { ...previous, ...company,
          workflowResearchStatuses: { ...previous?.workflowResearchStatuses, ...company.workflowResearchStatuses } });
      }
      return {
      ...initialData,
      workflows: [...updates.flatMap((view) => view.workflows), ...initialData.workflows.filter((row) => !ids.has(row.id))],
      workflowTasks: [...updates.flatMap((view) => view.workflowTasks), ...initialData.workflowTasks.filter((row) => !ids.has(row.workflowId))],
      workflowStages: [...updates.flatMap((view) => view.workflowStages), ...initialData.workflowStages.filter((row) => !ids.has(row.workflowId))],
      activity: [...updates.flatMap((view) => view.activity), ...initialData.activity.filter((row) => !ids.has(row.workflowId))].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      plannerRuns: [...updates.flatMap((view) => view.plannerRuns ?? []), ...(initialData.plannerRuns ?? []).filter((row) => !ids.has(row.workflowId))],
      researchRuns: [...updates.flatMap((view) => view.researchRuns ?? []), ...(initialData.researchRuns ?? []).filter((row) => !ids.has(row.workflowId))],
      preparationRuns: [...updates.flatMap((view) => view.preparationRuns ?? []), ...(initialData.preparationRuns ?? []).filter((row) => !ids.has(row.workflowId))],
      companies: [...updatedCompanies.values()],
      leads: [...updates.flatMap((view) => view.leads), ...initialData.leads.filter((row) => !ids.has(row.workflowId))],
      approvals: [...updates.flatMap((view) => view.approvals), ...initialData.approvals.filter((row) => !ids.has(row.workflowId))],
      updateWorkflow: (view) => setWorkflowUpdates((current) => ({ ...current, [view.workflows[0].id]: view })),
      mode: "live",
      hydrated: true,
      storageAvailable: true,
      createWorkflow: async (input) => {
        const result = await createWorkflowAction(input);
        if (!result.id) throw new Error(result.error);
        router.refresh();
        return result.id;
      },
      setApprovalStatus: async (id, status, edits = [], actionIds) => {
        const result = await resolveApprovalAction(id, status, edits, actionIds);
        if (!result.ok) throw new Error(result.error);
        router.refresh();
      },
    }; }
    const resolvedWorkflows = seedWorkflows.map((workflow): Workflow => {
      const workflowApprovals = seedApprovals.filter((approval) => approval.workflowId === workflow.id);
      if (workflow.status !== "waiting_for_approval" || !workflowApprovals.length || workflowApprovals.some((approval) => !approvalDecisions[approval.id])) return workflow;
      const rejected = workflowApprovals.some((approval) => approvalDecisions[approval.id].status === "rejected");
      const latestDecision = workflowApprovals.map((approval) => approvalDecisions[approval.id].decidedAt).sort().at(-1) ?? workflow.updatedAt;
      return { ...workflow, status: rejected ? "needs_revision" : "ready_for_execution", progress: rejected ? workflow.progress : 92,
        currentStep: rejected ? "Outreach rejected — revise proposal" : "Approved in demo — execution unavailable",
        pendingApprovalCount: 0, updatedAt: latestDecision };
    });
    const resolvedStages = seedStages.map((stage): WorkflowStage => {
      const decision = seedApprovals.find((approval) => approval.workflowId === stage.workflowId && approvalDecisions[approval.id]);
      if (stage.label !== "Approval" || !decision) return stage;
      return { ...stage, status: approvalDecisions[decision.id].status === "approved" ? "completed" : "failed", completedAt: approvalDecisions[decision.id].decidedAt };
    });
    const resolvedTasks = seedTasks.map((task): WorkflowTask => {
      const decision = seedApprovals.find((approval) => approval.workflowId === task.workflowId && approvalDecisions[approval.id]);
      if (!decision || task.title !== "Request approval") return task;
      return { ...task, status: approvalDecisions[decision.id].status === "approved" ? "completed" : "failed", completedAt: approvalDecisions[decision.id].decidedAt };
    });
    const createdStages: WorkflowStage[] = createdWorkflows.flatMap((workflow) => stageLabels.map((label, index) => ({
      id: `${workflow.id}-stage-${index + 1}`, workflowId: workflow.id, label, order: index + 1, status: index === 0 ? "running" : "waiting",
    })));
    const createdTasks: WorkflowTask[] = createdWorkflows.flatMap((workflow) => taskTemplates.map(([title, agent], index) => ({
      id: `${workflow.id}-task-${index + 1}`, workflowId: workflow.id, order: index + 1, title,
      description: index === 0 ? "A deterministic demo plan is ready. Live execution is introduced in a later stage." : "Queued until this workflow advances.",
      agent, status: index === 0 ? "running" : "pending",
    })));
    const createdEvents: AgentEvent[] = createdWorkflows.map((workflow) => ({
      id: `${workflow.id}-created`, workflowId: workflow.id, category: "workflow", eventType: "workflow_created", agent: "Workspace",
      title: "Workflow created", description: "Demo plan prepared from the goal. No AI or external tools were called.", timestamp: workflow.createdAt, status: "completed",
    }));
    const decisionEvents: AgentEvent[] = Object.entries(approvalDecisions).flatMap(([id, decision]) => {
      const approval = seedApprovals.find((item) => item.id === id);
      if (!approval) return [];
      return [{ id: `${id}-${decision.status}`, workflowId: approval.workflowId, category: "approval" as const, eventType: "approval_received" as const,
        title: decision.status === "approved" ? "Outreach approved in demo" : "Outreach rejected in demo",
        description: decision.status === "approved" ? "Approval recorded. No emails were sent." : "Proposed messages were declined. No emails were sent.",
        timestamp: decision.decidedAt, status: "completed" as const }];
    });
    const approvals: Approval[] = seedApprovals.map((approval) => {
      const decision = approvalDecisions[approval.id];
      if (!decision) return approval;
      return { ...approval, status: decision.status as ApprovalStatus, proposedActions: approval.proposedActions.map((action) => ({ ...action, status: decision.status })) };
    });
    const leads: Lead[] = seedLeads.map((lead) => {
      const approval = approvals.find((item) => item.proposedActions.some((action) => action.leadId === lead.id));
      if (approval?.status === "approved") return { ...lead, status: "outreach_ready", outreachStatus: "approved" };
      if (approval?.status === "rejected") return { ...lead, status: "qualified", outreachStatus: "drafted" };
      if (approval?.status === "executed") return { ...lead, status: "contacted", outreachStatus: "sent" };
      return lead;
    });
    return {
      workspace: demoWorkspace,
      mode: "demo",
      hydrated,
      storageAvailable,
      workflows: [...createdWorkflows, ...resolvedWorkflows],
      workflowStages: [...createdStages, ...resolvedStages],
      workflowTasks: [...createdTasks, ...resolvedTasks],
      companies: seedCompanies,
      leads,
      approvals,
      activity: [...createdEvents, ...decisionEvents, ...agentActivity].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      plannerRuns: [],
      researchRuns: [],
      preparationRuns: [],
      updateWorkflow: () => {},
      createWorkflow: async (input) => {
        const valid = newWorkflowSchema.parse(input);
        const now = new Date().toISOString();
        const id = `demo-${crypto.randomUUID()}`;
        const workflow: Workflow = { id, title: titleFromGoal(valid.goal), goal: valid.goal, status: "planning", progress: 8,
          currentStep: "Preparing workflow plan", targetCompanies: valid.targetCompanies, companyCount: 0, qualifiedLeadCount: 0,
          pendingApprovalCount: 0, createdAt: now, updatedAt: now, startedAt: now };
        setCreatedWorkflows((current) => [workflow, ...current]);
        return id;
      },
      setApprovalStatus: async (id, status) => {
        if (!seedApprovals.some((approval) => approval.id === id)) return;
        setApprovalDecisions((current) => current[id] ? current : { ...current, [id]: { status, decidedAt: new Date().toISOString() } });
      },
    };
  }, [createdWorkflows, approvalDecisions, hydrated, storageAvailable, initialData, router, workflowUpdates]);

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore() {
  const store = useContext(DemoStoreContext);
  if (!store) throw new Error("useDemoStore must be used inside DemoStoreProvider");
  return store;
}
