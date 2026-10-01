import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { reviewerOutputSchema, validateReviewerOutput, composeOutreach, outreachOutputSchema, validateOutreachOutput,
  proposedEmailActionSchema, outreachDedupeKey } from "@/lib/validation/outreach";
import { approvalMessageSchema, saveActionEditSchema } from "@/lib/validation/approval";
import { ReviewerAgent, OutreachAgent, type StructuredPreparationProvider } from "./outreach-agents";
import { AgentRuntime } from "./agent-runtime";
import { ResearchError } from "./research-budget";
import { outreachFixture } from "./testing/outreach-fixtures";

test("Reviewer contract is strict and supports all three verdicts", () => {
  const { review } = outreachFixture();
  for (const decision of ["approve_for_outreach", "reject_for_outreach", "needs_more_research"]) assert.ok(reviewerOutputSchema.safeParse({ ...review, decision }).success);
  assert.equal(reviewerOutputSchema.safeParse({ ...review, hiddenReasoning: "private" }).success, false);
  assert.equal(reviewerOutputSchema.safeParse({ ...review, decision: "send" }).success, false);
});
test("score alone cannot approve weak evidence, low confidence or uncertain identity", () => {
  const { input, review } = outreachFixture();
  for (const weak of [{ ...input, score: 99, confidence: "low" as const },
    { ...input, score: 99, scoreBreakdown: { ...input.scoreBreakdown, evidenceQuality: 6 } },
    { ...input, company: { ...input.company, website: "https://other.example.com" } }]) {
    assert.equal(validateReviewerOutput(review, weak).decision, "needs_more_research");
  }
  assert.equal(validateReviewerOutput({ ...review, usableEvidence: [], allowedPersonalizationClaims: [], outreachAngle: { ...review.outreachAngle, supportingEvidence: [] } }, input).decision, "needs_more_research");
});
test("Reviewer cannot invent, rewrite, misattribute or duplicate evidence", () => {
  const { input, review } = outreachFixture();
  assert.equal(validateReviewerOutput(review, input).decision, "approve_for_outreach");
  for (const field of ["claim", "quote", "sourceUrl"] as const) {
    const changed = structuredClone(review); changed.usableEvidence[0][field] = field === "sourceUrl" ? "https://invented.example.com" : "Fabricated fact";
    assert.throws(() => validateReviewerOutput(changed, input));
  }
  assert.throws(() => validateReviewerOutput({ ...review, usableEvidence: [review.usableEvidence[0], review.usableEvidence[0]] }, input));
  assert.throws(() => validateReviewerOutput({ ...review, allowedPersonalizationClaims: ["Unsupported fact"] }, input));
});
test("First-party investor and product subdomains count; lookalike domains do not", () => {
  const { input, review } = outreachFixture();
  for (const hostname of ["ir.example.com", "help.example.com", "example.com.attacker.com", "fakeexample.com"]) {
    const evidence = input.evidence.map((fact) => ({ ...fact, sourceUrl: `https://${hostname}/product` }));
    const result = validateReviewerOutput({ ...review, usableEvidence: evidence }, { ...input, company: { ...input.company, website: "https://example.com" }, evidence });
    assert.equal(result.decision, hostname.endsWith(".example.com") ? "approve_for_outreach" : "needs_more_research");
  }
});
test("Rejected and more-research verdicts prevent Outreach Agent invocation", async () => {
  const { input, review, recipient } = outreachFixture();
  for (const decision of ["reject_for_outreach", "needs_more_research"] as const) {
    assert.equal(validateReviewerOutput({ ...review, decision }, input).decision, decision);
    assert.throws(() => composeOutreach({ evidenceIndexes: [0], callToAction: "share_example", generationSummary: "Evidence selected" }, input, { ...review, decision }, recipient));
  }
});
test("Outreach contract produces an evidence-grounded draft with missing recipient blocked", () => {
  const { input, review, recipient } = outreachFixture();
  const draft = composeOutreach({ evidenceIndexes: [0, 1], callToAction: "share_example", generationSummary: "Accepted product facts selected" }, input, review, recipient);
  assert.ok(outreachOutputSchema.safeParse(draft).success);
  assert.equal(draft.recipient.email, null); assert.equal(draft.executionReadiness, "blocked_missing_recipient");
  assert.equal(draft.status, "ready_for_review"); assert.ok(draft.warnings.length);
  assert.ok(draft.body.includes("opportunity hypothesis"));
  for (const fact of draft.personalization.claimsUsed) assert.ok(draft.body.includes(fact.claim));
  assert.equal(outreachOutputSchema.safeParse({ ...draft, execute: true }).success, false);
});
test("Unsupported factual text, fabricated contacts and unknown evidence fail before persistence", () => {
  const { input, review, recipient } = outreachFixture();
  const draft = composeOutreach({ evidenceIndexes: [0], callToAction: "brief_conversation", generationSummary: "Evidence selected" }, input, review, recipient);
  assert.throws(() => validateOutreachOutput({ ...draft, body: draft.body + " Your support team handles 1000 tickets daily." }, input, review, recipient));
  assert.throws(() => validateOutreachOutput({ ...draft, recipient: { ...recipient, email: "invented@example.com" } }, input, review, recipient));
  assert.throws(() => composeOutreach({ evidenceIndexes: [9], callToAction: "share_example", generationSummary: "Evidence selected" }, input, review, recipient));
  assert.throws(() => composeOutreach({ evidenceIndexes: [0, 0], callToAction: "share_example", generationSummary: "Evidence selected" }, input, review, recipient));
});
test("Proposed email target and payload are strict, typed and deterministic", () => {
  const { input, review, recipient } = outreachFixture();
  const draft = composeOutreach({ evidenceIndexes: [0], callToAction: "share_example", generationSummary: "Evidence selected" }, input, review, recipient);
  const taskId = randomUUID();
  const key = outreachDedupeKey(input.workflowId, input.leadId, taskId);
  assert.equal(key, outreachDedupeKey(input.workflowId, input.leadId, taskId));
  assert.notEqual(key, outreachDedupeKey(input.workflowId, input.leadId, randomUUID()));
  const action = { action_type: "send_email", risk_level: "medium", dedupe_key: key,
    target: { leadId: input.leadId, companyId: input.companyId, recipientName: null, recipientEmail: null },
    payload: { subject: draft.subject, body: draft.body, personalization: draft.personalization, evidenceReferences: draft.personalization.claimsUsed,
      warnings: draft.warnings, executionReadiness: draft.executionReadiness, generationMetadata: { researchRunId: input.researchRunId,
        reviewerRunId: randomUUID(), outreachRunId: randomUUID(), taskId, version: 1, model: "mock-model", review, company: input.company,
        leadScore: input.score, scoreBreakdown: input.scoreBreakdown, researchUncertainties: input.uncertainties, generationSummary: draft.generationSummary } } };
  assert.ok(proposedEmailActionSchema.safeParse(action).success);
  assert.equal(proposedEmailActionSchema.safeParse({ ...action, target: { ...action.target, recipientEmail: "invalid" } }).success, false);
  assert.equal(proposedEmailActionSchema.safeParse({ ...action, payload: { ...action.payload, execute: true } }).success, false);
});
test("Editing validates content and revision, without accepting authorization fields", () => {
  const edit = { actionId: randomUUID(), subject: "A focused pilot", body: "Would a short conversation be useful?", revision: 0 };
  assert.ok(saveActionEditSchema.safeParse(edit).success);
  assert.equal(saveActionEditSchema.safeParse({ ...edit, status: "approved" }).success, false);
  assert.equal(approvalMessageSchema.safeParse({ ...edit, subject: "Subject\r\nBCC: forged@example.com" }).success, false);
});
test("AgentRuntime records real Reviewer/Outreach calls and usage using mocked providers", async () => {
  const { input, review, recipient } = outreachFixture();
  const systems: string[] = [];
  const provider: StructuredPreparationProvider = { generateStructured: async (schema, system) => {
    systems.push(system); return { output: schema === reviewerOutputSchema ? review : { evidenceIndexes: [0], callToAction: "share_example", generationSummary: "Evidence selected" },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } };
  } };
  const runtime = new AgentRuntime(null, async () => {}, undefined, new ReviewerAgent(provider), new OutreachAgent(provider));
  const metrics = { durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null as number | null, outputTokens: null as number | null, totalTokens: null as number | null };
  const reviewed = await runtime.review(input, "mock-model", async () => {}, metrics);
  await runtime.draft(input, reviewed, recipient, "mock-model", async () => {}, metrics);
  assert.equal(metrics.totalTokens, 60); assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes("untrusted data")));
});
test("Preparation retries only bounded transient failures; validation never regenerates", async () => {
  const { input, review } = outreachFixture(); let calls = 0;
  const provider: StructuredPreparationProvider = { generateStructured: async () => { calls++; if (calls === 1) throw new ResearchError("ai_unavailable", "gemini", true); return { output: review, usage: null }; } };
  const runtime = new AgentRuntime(null, async () => {}, undefined, new ReviewerAgent(provider));
  const metrics = { durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null, outputTokens: null, totalTokens: null };
  await runtime.review(input, "mock-model", async () => {}, metrics); assert.equal(calls, 2); assert.equal(metrics.retryCount, 1);
  calls = 0; provider.generateStructured = async () => { calls++; return { output: { ...review, unsupported: true }, usage: null }; };
  await assert.rejects(runtime.review(input, "mock-model", async () => {}, metrics), { code: "ai_invalid_output" }); assert.equal(calls, 1);
});
test("Invalid preparation output retains observed token usage without leaking raw model text", async () => {
  const { input, review } = outreachFixture();
  const provider: StructuredPreparationProvider = { generateStructured: async () => ({ output: { ...review, hiddenReasoning: "private provider text" }, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }) };
  const runtime = new AgentRuntime(null, async () => {}, undefined, new ReviewerAgent(provider));
  const metrics = { durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null, outputTokens: null, totalTokens: null };
  await assert.rejects(runtime.review(input, "mock-model", async () => {}, metrics), { code: "ai_invalid_output", message: "Preparation failed evidence validation. Other successful drafts are retained." });
  assert.equal(metrics.totalTokens, 30); assert.equal(metrics.retryCount, 0);
});
