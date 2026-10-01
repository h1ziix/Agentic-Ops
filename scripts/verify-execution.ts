/** Read-only Release 0.6 verifier. Never imports a provider transport or executes a mutation RPC. */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { createRuntimeClient } from "../src/lib/supabase/admin";
import { proposedActionRowSchema, workflowRowSchema, workflowTaskRowSchema, agentRunRowSchema, agentEventRowSchema, approvalRowSchema, leadRowSchema } from "../src/lib/validation/rows";
import { executableEnvelopeSchema } from "../src/lib/validation/execution";
import { ExecutionRepository } from "../src/server/repositories/execution-repository";
import { IntegrationRepository } from "../src/server/repositories/integration-repository";
import { envelopeDigest } from "../src/server/execution/digest";

async function verify() {
  loadEnvConfig(process.cwd()); const args=process.argv.slice(2);
  const workflowId=z.uuid().parse(args[args.indexOf("--workflow")+1]); const actionId=args.includes("--action") ? z.uuid().parse(args[args.indexOf("--action")+1]) : null;
  const legacy=args.includes("--mode") && args[args.indexOf("--mode")+1]==="legacy";
  if (args.includes("--mode") && !["legacy","executable"].includes(args[args.indexOf("--mode")+1])) throw new Error("Invalid mode");
  const admin=createRuntimeClient(); const workflowResponse=await admin.from("workflows").select("*").eq("id",workflowId).single(); assert.equal(workflowResponse.error,null,"Workflow read failed");
  const workflow=workflowRowSchema.parse(workflowResponse.data); const workspace=workflow.workspace_id;
  async function read(table: string) { const r=await admin.from(table).select("*").eq("workspace_id",workspace).eq("workflow_id",workflowId); assert.equal(r.error,null,`${table} read failed`); return r.data as unknown; }
  const [rawActions,rawTasks,rawRuns,rawEvents,rawApprovals,rawLeads,execution,connections]=await Promise.all([read("proposed_actions"),read("workflow_tasks"),read("agent_runs"),read("agent_events"),read("approvals"),read("leads"),new ExecutionRepository(admin).list(workspace,workflowId),new IntegrationRepository(admin).list(workspace)]);
  const actions=z.array(proposedActionRowSchema).parse(rawActions); const tasks=z.array(workflowTaskRowSchema).parse(rawTasks); const runs=z.array(agentRunRowSchema).parse(rawRuns);
  const events=z.array(agentEventRowSchema).parse(rawEvents); const approvals=z.array(approvalRowSchema).parse(rawApprovals); const leads=z.array(leadRowSchema).parse(rawLeads);
  const selected=actions.filter((a) => !actionId || a.id===actionId); assert.ok(selected.length,"No selected actions");
  if (!legacy) assert.ok(selected.some((a) => a.schema_version===2),"Executable mode requires a v2 action; use --mode legacy to check historical execution blocking");
  assert.equal(new Set(execution.executionAttempts.map((a) => a.operation_key)).size,execution.executionAttempts.length,"Operation key uniqueness");
  assert.ok(execution.executionAttempts.filter((a) => ["claimed","dispatching"].includes(a.status)).length<=1,"Only one active workflow action");
  for (const a of selected) {
    const attempts=execution.executionAttempts.filter((t) => t.action_id===a.id);
    if (a.schema_version!==2) { assert.equal(attempts.length,0,"Legacy actions cannot execute"); assert.equal(execution.actionSnapshots.filter((s) => s.action_id===a.id).length,0,"Legacy authorization is content only"); continue; }
    const e=executableEnvelopeSchema.parse(a.executable_envelope); assert.equal(e.actionId,a.id); assert.equal(e.workspaceId,workspace); assert.equal(e.workflowId,workflowId); assert.equal(e.revision,a.revision);
    const snapshot=execution.actionSnapshots.find((s) => s.action_id===a.id && s.revision===a.revision);
    if (["approved","executed"].includes(a.status) || attempts.length) {
      assert.ok(snapshot,"Missing immutable approval snapshot"); assert.equal(snapshot.id,e.snapshotId); assert.equal(snapshot.digest,envelopeDigest(e)); assert.equal(snapshot.digest,envelopeDigest(snapshot.envelope));
      assert.ok(snapshot.approved_by); assert.ok(snapshot.approved_at);
      if (e.actionType!=="schedule_follow_up") { assert.equal(snapshot.connection_id,e.connection.id); assert.equal(snapshot.authorization_generation,e.connection.generation);
        const c=connections.find((c) => c.id===e.connection.id); assert.ok(c,"Connection history missing"); assert.equal(c.workspace_id,workspace);
        // A later reconnect may legitimately invalidate history. Report readiness without substituting identity.
        if (c.generation===e.connection.generation) { assert.equal(c.provider_identity,e.connection.identity); assert.equal(c.provider,e.connection.provider); }
      }
    }
    assert.ok(attempts.length<=3,"Attempt ceiling"); assert.ok(attempts.filter((t) => t.status==="succeeded").length<=1,"One successful snapshot operation");
    for (const t of attempts) {
      assert.equal(t.snapshot_id,e.snapshotId); assert.equal(t.workspace_id,workspace); assert.equal(t.workflow_id,workflowId);
      const run=runs.find((r) => r.id===t.executor_run_id); assert.ok(run); assert.equal(run.agent_type,"executor"); assert.equal(run.model,null); assert.equal(run.total_tokens,null); assert.equal(run.input_tokens,null); assert.equal(run.output_tokens,null);
      assert.ok(events.some((v) => v.event_type==="execution_claimed" && v.metadata.attempt_id===t.id),"Claim audit missing");
      if (t.dispatched_at) assert.ok(events.some((v) => v.event_type==="execution_started" && v.metadata.attempt_id===t.id),"Dispatch audit missing");
      if (t.status==="succeeded") {
        assert.equal(a.status,"executed"); assert.ok(t.completed_at); assert.ok(t.duration_ms!==null || t.verification_method==="user_confirmed");
        if (e.actionType==="send_email") { if (t.verification_method==="provider_response") assert.ok(t.result?.messageId,"Gmail acceptance ID missing"); else { assert.equal(t.verification_method,"user_confirmed"); assert.ok(t.reconciled_by && t.reconciled_at && t.reconciliation_note); }
          assert.equal(leads.find((l) => l.id===e.leadId)?.status,"contacted");
        } else if (e.actionType==="upsert_crm_contact") { assert.ok(t.result?.contactId); if (t.verification_method==="provider_read") assert.ok(t.reconciled_by && t.reconciliation_note); }
        else { assert.equal(t.verification_method,"internal_transaction"); assert.equal(execution.followUpPlans.filter((p) => p.action_id===a.id).length,1); }
      }
      if (t.status==="outcome_unknown") { assert.equal(t.retry_eligible,false); assert.ok(t.dispatched_at); assert.ok(events.some((v) => v.event_type==="execution_outcome_unknown" && v.metadata.attempt_id===t.id));
        if (t.verification_method!=="closed_for_replacement") assert.ok(!attempts.some((later) => later.attempt_number>t.attempt_number),"Unresolved unknown must never resend");
      }
    }
  }
  for (const p of execution.followUpPlans) { const parent=execution.executionAttempts.find((t) => t.id===p.parent_attempt_id); assert.equal(parent?.status,"succeeded"); assert.equal(actions.find((a) => a.id===parent?.action_id)?.action_type,"send_email");
    assert.ok(events.some((e) => e.event_type==="follow_up_planned" && e.metadata.action_id===p.action_id)); if (p.status==="cancelled") assert.ok(events.some((e) => e.event_type==="follow_up_cancelled" && e.metadata.plan_id===p.id)); }
  for (const approval of approvals.filter((a) => a.status==="executed")) assert.ok(actions.filter((a) => a.approval_id===approval.id).every((a) => ["executed","rejected","cancelled"].includes(a.status)),"Group executed with incomplete authorized actions");
  const required=actions.filter((a) => !a.is_auxiliary && !a.superseded_by_id && ["approved","pending_approval","waiting_for_approval"].includes(a.status));
  if (workflow.status==="completed") assert.equal(required.length,0,"Completed core has unresolved primary action");
  assert.equal(workflow.progress,Math.floor(100*tasks.filter((t) => t.status==="completed").length/Math.max(tasks.length,1)),"Progress must reflect persisted tasks");
  if (required.length) assert.ok(workflow.progress<100,"Unresolved required work cannot show 100%");
  const report={ verifiedAt:new Date().toISOString(),mode:legacy ? "legacy" : "executable",readOnly:true,workflowId,actionId,status:workflow.status,
    selectedActions:selected.length,snapshots:execution.actionSnapshots.length,attempts:execution.executionAttempts.length,successful:execution.executionAttempts.filter((a) => a.status==="succeeded").length,
    unknown:execution.executionAttempts.filter((a) => a.status==="outcome_unknown").length,auxiliary:actions.filter((a) => a.is_auxiliary).length,followUpPlans:execution.followUpPlans.length,
    authorizationIdentity:execution.actionSnapshots.map((s) => ({ actionId:s.action_id,snapshotId:s.id,revision:s.revision,digest:s.digest,connectionId:s.connection_id,generation:s.authorization_generation })),
    verificationMethods:execution.executionAttempts.map((a) => ({ attemptId:a.id,status:a.status,method:a.verification_method,messageId:a.result?.messageId,contactId:a.result?.contactId })),
    note:"Checks persisted records only. Does not independently establish provider delivery, Sent content or CRM state; performs no provider calls." };
  await mkdir("output/execution",{ recursive:true }); await writeFile(`output/execution/${workflowId}-verification.json`,JSON.stringify(report,null,2)+"\n"); console.log(JSON.stringify(report));
}
verify().catch(() => { console.error("Execution verification failed: selected records did not pass the read-only consistency checks."); process.exitCode=1; });
