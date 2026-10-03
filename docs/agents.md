# Agent contracts

The Orchestrator owns workflow state; agents own typed output contracts. `AgentRuntime` supplies bounded retry and telemetry policies. PostgreSQL completion functions persist outputs and transitions atomically. Safe action summaries are displayed; hidden chain-of-thought is neither required nor exposed.

## Planner

| Contract | Behavior |
| --- | --- |
| Purpose | Convert the explicit business goal into supported tasks with dependencies and an approval gate. |
| Input | Goal, requested company count, title, immutable ICP/template guidance, `approvalRequired: true`. |
| Output | Zod-validated plan, assumptions, objectives, expected outputs and dependency graph. |
| Tools | One configured Gemini or OpenAI structured-output provider; no browsing or external mutation tools. |
| State | Claims one run for `planning`; completion saves tasks and moves the workflow to `running`. |
| Failure | At most two model attempts for eligible failures; configuration/quota/refusal failures require attention. Interrupted claims expire and can recover. |
| Limits | Cannot bypass approval, execute tasks, modify strategy history or write arbitrary database state. |

`PlannerAgent` is pure relative to application state. Domain validation rejects duplicate tasks, unsupported types, missing dependencies, forward/cyclic references and incomplete approval gates. A successful replay uses the saved plan without another paid call. Explicit user instructions remain authoritative over saved strategy.

## Research Agent

| Contract | Behavior |
| --- | --- |
| Purpose | Discover target companies, gather bounded public evidence and assess potential automation opportunities. |
| Input | Goal, saved ICP constraints, target count/profile, company identity and validated evidence sources. |
| Output | Target profile, cited candidates, structured company facts, hypotheses, score components, confidence and source references. |
| Tools | Tavily search, Gemini structured analysis and workspace-scoped evidence cache. |
| State | Executes one supported task or company per orchestration step; preserves successful company results during partial failure. |
| Failure | Shared per-step search/model/time budget and at most one retry; invalid evidence fails safely. |
| Limits | Cannot follow webpage instructions as commands, invent verified contacts, send messages, run SQL or independently change workflow state. |

Per-company limits include a 170-second budget, at most three search requests, two model requests, eight retained sources and a 24-hour evidence cache. Discovery has its own bounded stage. Workflow company count is capped at twenty. Exact citation IDs/quotes, score totals and public website rules are checked server-side. The base qualification rule requires score ≥60, ICP fit ≥15 and evidence quality ≥7; a saved ICP may tighten the overall threshold. Opportunities remain hypotheses about public signals.

## Reviewer

| Contract | Behavior |
| --- | --- |
| Purpose | Independently check research evidence, fit and safe personalization readiness. |
| Input | Workflow-specific immutable company/lead assessment, saved ICP and structured cited facts. |
| Output | Approve, reject or request-more-research decision, accepted evidence and explicit uncertainty. |
| Tools | Gemini structured-output provider; no browsing, mailbox or CRM tools. |
| State | One preparation run per eligible lead; only accepted reviews advance to Outreach. |
| Failure | Validation failure fails that lead and retains other results; eligible transient failure receives at most one retry. |
| Limits | A review decision cannot approve an external action, infer buying intent or rewrite unsupported evidence. |

Accepted personalization requires sufficient evidence, appropriate confidence and a supported official domain. The model's decision is checked against the saved research; rewritten or unknown evidence is rejected.

## Outreach

| Contract | Behavior |
| --- | --- |
| Purpose | Prepare concise, source-grounded initial or follow-up email content. |
| Input | Goal, company name, validated Reviewer decision, accepted evidence and verified recipient context when available. |
| Output | Validated subject/body, accepted evidence references, generation summary and pending proposed action. |
| Tools | Gemini structured composition plus deterministic server composition; no email transport. |
| State | Saves draft provenance; publication creates an approval and `waiting_for_approval` workflow state. |
| Failure | At most one retry for eligible transient provider failure; invalid content cannot publish an executable action. |
| Limits | Cannot send, supply invented contacts, approve its own draft or turn missing reply monitoring into “no reply”. |

Server composition restricts factual claims to accepted evidence and labels the proposed opportunity as a hypothesis. Follow-up generation adds the exact previous send context and elapsed time, then publishes a new independent approval. A timer never reuses the original send approval.

## Deterministic Executor

| Contract | Behavior |
| --- | --- |
| Purpose | Execute one exact, saved, human-approved action. |
| Input | Verified actor/workspace/workflow, action ID and expected immutable approval snapshot ID. |
| Output | Saved attempt status, provider result references or explicit uncertainty/error disposition. |
| Tools | Gmail send, HubSpot preview/upsert/reconciliation, or internal follow-up-plan transaction. |
| State | Claim → audited dispatch → succeeded / retryable failure / terminal failure / outcome unknown / cancelled before dispatch. |
| Failure | At most three attempts per snapshot; eligible retries retain exact approval. Ambiguous dispatch requires reconciliation. |
| Limits | No model call, regeneration, arbitrary URL/action type, implicit mutation retry, approval bypass or blind resend. |

Pre-dispatch guards recheck revision/digest, workflow state, confirmed recipient and exact current connection ID/identity/generation. Concurrent callers do not acquire another dispatch right. Successful replay returns saved success. Completion persistence retries reuse the same provider result rather than repeating the mutation.

## Automation workers

Workers are infrastructure handlers, not new AI agents. They invoke the same Orchestrator/Outreach/Executor with saved references. Domain state fences duplicate delivery and exhausted retries. Membership, original follow-up actor, approved snapshot and provider identity are rechecked at claim/execution time. A worker delivery grants no new external permission.

See [architecture](architecture.md), [security boundaries](security.md) and the [live prerequisite checklist](release-checklist.md).
