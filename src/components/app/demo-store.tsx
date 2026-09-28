"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { agentActivity, approvals as seedApprovals, workflowStages as seedStages, workflowTasks as seedTasks, workflows as seedWorkflows } from "@/lib/mock-data";
import type { AgentEvent, Approval, ApprovalStatus, Workflow, WorkflowStage, WorkflowTask } from "@/types/domain";

const storageKey = "agentic-ops-demo-v1";
export const newWorkflowSchema = z.object({
  goal: z.string().trim().min(24, "Describe the outcome in at least 24 characters.").max(1000, "Keep the goal under 1,000 characters."),
  targetCompanies: z.number().int().min(5).max(100),
});
export type NewWorkflowInput = z.infer<typeof newWorkflowSchema>;

const storedWorkflowSchema = z.object({
  id: z.string(), title: z.string(), goal: z.string(), status: z.enum(["draft", "planning", "running", "waiting_for_approval", "ready_for_execution", "needs_revision", "completed", "failed", "cancelled"]),
  progress: z.number(), currentStep: z.string(), targetCompanies: z.number(), companyCount: z.number(), qualifiedLeadCount: z.number(), pendingApprovalCount: z.number(),
  createdAt: z.string(), updatedAt: z.string(), startedAt: z.string().optional(), completedAt: z.string().optional(), errorSummary: z.string().optional(),
});
const storageSchema = z.object({
  createdWorkflows: z.array(storedWorkflowSchema).max(30),
  approvalDecisions: z.record(z.string(), z.object({ status: z.enum(["approved", "rejected"]), decidedAt: z.string() })),
});
type ApprovalDecision = { status: "approved" | "rejected"; decidedAt: string };

type DemoStore = {
  hydrated: boolean;
  workflows: Workflow[];
  workflowStages: WorkflowStage[];
  workflowTasks: WorkflowTask[];
  approvals: Approval[];
  activity: AgentEvent[];
  createWorkflow: (input: NewWorkflowInput) => string;
  setApprovalStatus: (id: string, status: "approved" | "rejected") => void;
};

const DemoStoreContext = createContext<DemoStore | null>(null);

function titleFromGoal(goal: string) {
  const firstClause = goal.trim().split(/[.!?\n]/)[0].trim();
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

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [createdWorkflows, setCreatedWorkflows] = useState<Workflow[]>([]);
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, ApprovalDecision>>({});
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Rehydrate the browser-only demo workspace after server rendering. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = storageSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          setCreatedWorkflows(parsed.data.createdWorkflows);
          setApprovalDecisions(parsed.data.approvalDecisions);
        }
      }
    } catch { /* Corrupt demo storage falls back to the seeded workspace. */ }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ createdWorkflows, approvalDecisions }));
  }, [createdWorkflows, approvalDecisions, hydrated]);

  const value = useMemo<DemoStore>(() => {
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
      id: `${workflow.id}-created`, workflowId: workflow.id, category: "workflow", eventType: "task_started", agent: "Planner Agent",
      title: "Workflow created", description: "Demo plan prepared from the goal. No AI or external tools were called.", timestamp: workflow.createdAt, status: "running",
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
    return {
      hydrated,
      workflows: [...createdWorkflows, ...resolvedWorkflows],
      workflowStages: [...createdStages, ...resolvedStages],
      workflowTasks: [...createdTasks, ...resolvedTasks],
      approvals,
      activity: [...createdEvents, ...decisionEvents, ...agentActivity].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      createWorkflow: (input) => {
        const valid = newWorkflowSchema.parse(input);
        const now = new Date().toISOString();
        const id = `demo-${crypto.randomUUID()}`;
        const workflow: Workflow = { id, title: titleFromGoal(valid.goal), goal: valid.goal, status: "planning", progress: 8,
          currentStep: "Preparing workflow plan", targetCompanies: valid.targetCompanies, companyCount: 0, qualifiedLeadCount: 0,
          pendingApprovalCount: 0, createdAt: now, updatedAt: now, startedAt: now };
        setCreatedWorkflows((current) => [workflow, ...current]);
        return id;
      },
      setApprovalStatus: (id, status) => {
        if (!seedApprovals.some((approval) => approval.id === id)) return;
        setApprovalDecisions((current) => current[id] ? current : { ...current, [id]: { status, decidedAt: new Date().toISOString() } });
      },
    };
  }, [createdWorkflows, approvalDecisions, hydrated]);

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore() {
  const store = useContext(DemoStoreContext);
  if (!store) throw new Error("useDemoStore must be used inside DemoStoreProvider");
  return store;
}
