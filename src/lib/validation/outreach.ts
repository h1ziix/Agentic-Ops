import { z } from "zod";
import { publicWebsiteSchema, normalizeDomain } from "../company-identity";
import { scoreComponentsSchema, researchOutputSchema, validateResearchAnalysis, type ResearchOutput } from "./research";
import { approvalMessageSchema } from "./approval";

const text = z.string().trim().min(1);
export const confidenceSchema = z.enum(["low", "medium", "high"]);
export const evidenceReferenceSchema = z.object({
  claim: text.max(500), sourceUrl: publicWebsiteSchema, quote: text.max(600),
}).strict();
export const reviewerOutputSchema = z.object({
  decision: z.enum(["approve_for_outreach", "reject_for_outreach", "needs_more_research"]),
  confidence: confidenceSchema, summary: text.max(2000),
  strengths: z.array(text.max(500)).max(10), concerns: z.array(text.max(500)).max(10),
  usableEvidence: z.array(evidenceReferenceSchema).max(10),
  allowedPersonalizationClaims: z.array(text.max(500)).max(10), rejectedClaims: z.array(text.max(500)).max(10),
  outreachAngle: z.object({ primaryProblem: text.max(500), proposedValue: text.max(500),
    supportingEvidence: z.array(text.max(500)).max(10), isHypothesis: z.literal(true) }).strict(),
}).strict();
export type ReviewerOutput = z.infer<typeof reviewerOutputSchema>;
export const reviewerInputSchema = z.object({
  workflowId: z.uuid(), leadId: z.uuid(), companyId: z.uuid(), researchRunId: z.uuid(), goal: text.max(4000),
  company: z.object({ name: text.max(240), website: publicWebsiteSchema, description: text.max(4000),
    researchSummary: text.max(8000) }).strict(),
  score: z.number().int().min(0).max(100), scoreBreakdown: scoreComponentsSchema,
  opportunity: text.max(2000), confidence: confidenceSchema,
  uncertainties: z.array(text.max(500)).max(10), evidence: z.array(evidenceReferenceSchema).max(10),
}).strict();
export type ReviewerInput = z.infer<typeof reviewerInputSchema>;

/** Review the workflow's immutable research result, never the workspace's latest company summary. */
export function reviewInputFromResearch(ids: Pick<ReviewerInput, "workflowId" | "leadId" | "companyId" | "researchRunId" | "goal">, saved: ResearchOutput): ReviewerInput {
  const result = researchOutputSchema.parse(saved);
  const analysis = validateResearchAnalysis(result.analysis, result.sources);
  return reviewerInputSchema.parse({ ...ids, company: { ...result.company, description: analysis.company.description,
    researchSummary: analysis.company.researchSummary }, score: analysis.lead.score, scoreBreakdown: analysis.lead.components,
    opportunity: analysis.lead.opportunity, confidence: analysis.lead.confidence, uncertainties: analysis.uncertainties,
    evidence: analysis.facts.map((fact) => ({ claim: fact.claim, quote: fact.quote,
      sourceUrl: result.sources.find((source) => source.id === fact.sourceId)!.url })) });
}
const sameEvidence = (a: z.infer<typeof evidenceReferenceSchema>, b: z.infer<typeof evidenceReferenceSchema>) =>
  a.claim === b.claim && a.sourceUrl === b.sourceUrl && a.quote === b.quote;

export function validateReviewerOutput(output: unknown, input: ReviewerInput): ReviewerOutput {
  const parsed = reviewerOutputSchema.parse(output);
  if (new Set(parsed.usableEvidence.map((fact) => fact.claim)).size !== parsed.usableEvidence.length
    || new Set(parsed.allowedPersonalizationClaims).size !== parsed.allowedPersonalizationClaims.length) throw new Error("Duplicate reviewer evidence");
  if (parsed.usableEvidence.some((fact) => !input.evidence.some((original) => sameEvidence(fact, original)))
    || parsed.allowedPersonalizationClaims.some((claim) => !parsed.usableEvidence.some((fact) => fact.claim === claim))
    || parsed.outreachAngle.supportingEvidence.some((claim) => !parsed.allowedPersonalizationClaims.includes(claim))
    || parsed.allowedPersonalizationClaims.some((claim) => parsed.rejectedClaims.includes(claim))) throw new Error("Unsupported reviewer claim");
  if (parsed.decision === "approve_for_outreach") {
    const companyDomain = normalizeDomain(input.company.website);
    const firstParty = parsed.usableEvidence.some((fact) => {
      const sourceDomain = normalizeDomain(fact.sourceUrl);
      return sourceDomain === companyDomain || sourceDomain.endsWith(`.${companyDomain}`);
    });
    if (input.score < 60 || input.scoreBreakdown.icpFit < 15 || input.scoreBreakdown.evidenceQuality < 7
      || input.confidence === "low" || parsed.confidence === "low" || parsed.usableEvidence.length < 2
      || !firstParty || !parsed.allowedPersonalizationClaims.length || !parsed.outreachAngle.supportingEvidence.length) {
      return { ...parsed, decision: "needs_more_research", confidence: "low",
        summary: "More research is required before outreach: the score alone does not establish reliable personalization.",
        concerns: [...parsed.concerns, "Insufficient direct evidence or confidence for personalized outreach."].slice(0, 10) };
    }
  }
  return parsed;
}

export const verifiedRecipientSchema = z.object({ name: text.max(240).nullable(), email: z.email().max(320).nullable(),
  role: text.max(240).nullable(), companyName: text.max(240) }).strict();
export const outreachOutputSchema = z.object({
  channel: z.literal("email"), recipient: verifiedRecipientSchema,
  subject: approvalMessageSchema.shape.subject, body: approvalMessageSchema.shape.body,
  personalization: z.object({ angle: text.max(500), isHypothesis: z.literal(true),
    claimsUsed: z.array(evidenceReferenceSchema).min(1).max(3) }).strict(),
  valueProposition: text.max(500), callToAction: text.max(500), generationSummary: text.max(2000),
  warnings: z.array(text.max(500)).max(10), executionReadiness: z.enum(["ready", "blocked_missing_recipient"]),
  status: z.literal("ready_for_review"),
}).strict();
export type OutreachOutput = z.infer<typeof outreachOutputSchema>;

/** Model chooses evidence and message structure. Only accepted factual text reaches the email. */
export const outreachCompositionSchema = z.object({ evidenceIndexes: z.array(z.number().int().min(0).max(9)).min(1).max(2),
  callToAction: z.enum(["brief_conversation", "share_example"]), generationSummary: text.max(2000) }).strict();
export type OutreachComposition = z.infer<typeof outreachCompositionSchema>;
const callsToAction = {
  brief_conversation: "Would a brief conversation about a small pilot be useful?",
  share_example: "Would it be useful to share a short example of this approach?",
} as const;
function draftContent(input: ReviewerInput, review: ReviewerOutput, recipient: z.infer<typeof verifiedRecipientSchema>,
  claimsUsed: z.infer<typeof evidenceReferenceSchema>[], callToAction: string) {
  return {
    subject: `Exploring AI automation at ${input.company.name}`.slice(0, 200),
    body: `Hello ${recipient.name ?? `${input.company.name} team`},\n\nYour public materials describe the following: ${claimsUsed.map((fact) => fact.claim.replace(/[.]+$/, "")).join("; ")}.\n\nOne possible area to explore is ${review.outreachAngle.primaryProblem.replace(/[.]+$/, "")}. This is an opportunity hypothesis; we have not verified your internal needs.\n\nWe could explore ${review.outreachAngle.proposedValue.replace(/[.]+$/, "")} through a small, human-reviewed pilot.\n\n${callToAction}\n\nAgentic Ops`,
  };
}
export function composeOutreach(output: unknown, input: ReviewerInput, review: ReviewerOutput,
  recipient: z.infer<typeof verifiedRecipientSchema>): OutreachOutput {
  const choice = outreachCompositionSchema.parse(output);
  if (review.decision !== "approve_for_outreach" || new Set(choice.evidenceIndexes).size !== choice.evidenceIndexes.length)
    throw new Error("Outreach requires an accepted review and unique evidence");
  const claimsUsed = choice.evidenceIndexes.map((index) => review.usableEvidence[index]);
  if (claimsUsed.some((fact) => !fact || !review.allowedPersonalizationClaims.includes(fact.claim))) throw new Error("Unsupported outreach claim");
  const angle = review.outreachAngle.primaryProblem;
  const valueProposition = review.outreachAngle.proposedValue;
  const callToAction = callsToAction[choice.callToAction];
  const { subject, body } = draftContent(input, review, recipient, claimsUsed, callToAction);
  return validateOutreachOutput({ channel: "email", recipient, subject, body,
    personalization: { angle, isHypothesis: true, claimsUsed }, valueProposition, callToAction,
    generationSummary: choice.generationSummary, warnings: recipient.email ? [] : ["No verified recipient is available. Authorization does not unblock execution."],
    executionReadiness: recipient.email ? "ready" : "blocked_missing_recipient", status: "ready_for_review" }, input, review, recipient);
}
export function validateOutreachOutput(output: unknown, input: ReviewerInput, review: ReviewerOutput,
  recipient: z.infer<typeof verifiedRecipientSchema>): OutreachOutput {
  const parsed = outreachOutputSchema.parse(output);
  if (review.decision !== "approve_for_outreach" || parsed.recipient.email !== recipient.email || parsed.recipient.name !== recipient.name
    || parsed.recipient.role !== recipient.role || parsed.recipient.companyName !== input.company.name
    || parsed.personalization.claimsUsed.some((fact) => !review.allowedPersonalizationClaims.includes(fact.claim)
      || !review.usableEvidence.some((accepted) => sameEvidence(fact, accepted))))
    throw new Error("Unsupported outreach claim or fabricated contact");
  const expected = draftContent(input, review, recipient, parsed.personalization.claimsUsed, parsed.callToAction);
  if (parsed.subject !== expected.subject || parsed.body !== expected.body || parsed.personalization.angle !== review.outreachAngle.primaryProblem
    || parsed.valueProposition !== review.outreachAngle.proposedValue || !Object.values(callsToAction).some((cta) => cta === parsed.callToAction))
    throw new Error("Unsupported message content");
  if ((parsed.executionReadiness === "ready") !== Boolean(recipient.email)) throw new Error("Recipient readiness mismatch");
  return parsed;
}

export const emailActionTargetSchema = z.object({ companyId: z.uuid(), leadId: z.uuid(),
  recipientName: text.max(240).nullable(), recipientEmail: z.email().max(320).nullable() }).strict();
export const emailActionPayloadSchema = z.object({
  subject: approvalMessageSchema.shape.subject, body: approvalMessageSchema.shape.body,
  personalization: outreachOutputSchema.shape.personalization, evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(3),
  generationMetadata: z.object({ researchRunId: z.uuid(), reviewerRunId: z.uuid(), outreachRunId: z.uuid(),
    taskId: z.uuid(), version: z.literal(1), model: text.max(200), review: reviewerOutputSchema,
    company: reviewerInputSchema.shape.company, leadScore: z.number().int().min(0).max(100),
    scoreBreakdown: scoreComponentsSchema, researchUncertainties: z.array(text.max(500)).max(10),
    generationSummary: text.max(2000) }).strict(),
  warnings: z.array(text.max(500)).max(10), executionReadiness: outreachOutputSchema.shape.executionReadiness,
}).strict();
export const proposedEmailActionSchema = z.object({ action_type: z.literal("send_email"), target: emailActionTargetSchema,
  payload: emailActionPayloadSchema, dedupe_key: text.max(240), risk_level: z.literal("medium") }).strict();
export type ProposedEmailAction = z.infer<typeof proposedEmailActionSchema>;
export function outreachDedupeKey(workflowId: string, leadId: string, taskId: string) {
  return [z.uuid().parse(workflowId), z.uuid().parse(leadId), "email", z.uuid().parse(taskId), "v1"].join(":");
}
