# Agentic Ops — portfolio case study

## Problem and product idea

Sales research combines uncertain public evidence, repeated analysis and consequential external actions. A chat response alone does not show which companies were researched, which claims are supported, why a lead qualified or whether an email actually reached a provider.

Agentic Ops converts a natural-language goal into an operational workspace: a plan, company research, qualification, independent review, personalized draft, human decision, exact execution and follow-up. Tables, timelines, evidence and approval queues make the workflow inspectable without requiring the user to understand model internals.

## Architecture choices

The system uses one Next.js application, typed services/repositories and Supabase. PostgreSQL owns durable state and transactional guards. An Orchestrator coordinates bounded steps through AgentRuntime. Typed agents produce validated outputs; the deterministic Executor performs external mutations. Trigger.dev adds timers without becoming a second workflow engine. [Architecture](architecture.md) documents the actual boundaries.

This keeps model reasoning separate from authority. Planner has no database tool. Research has search/evidence tools. Reviewer and Outreach receive structured, cited context. Executor has no LLM call. A workflow is useful even when automation or integrations are unconfigured; missing capability is an explicit state.

## Evidence-driven research

Research uses focused Tavily queries, source-supported company/domain resolution, bounded snippets and Gemini structured analysis. Zod and domain validators check citation IDs, exact quotations, facts, score component totals and URL safety. Search evidence is cached before model analysis so a model retry can reuse paid search results.

Qualification combines ICP fit, automation potential, operational signals, evidence quality and public context. The opportunity is a hypothesis supported by public signals. Reviewer independently checks suitability and personalization evidence. Workflow-specific research/qualification snapshots prevent later company or strategy edits from rewriting what was known at the time.

## Human approval and idempotency

Approve freezes an exact revision, recipient, content, account generation and canonical digest. Execute is separate. A changed draft/account requires fresh approval; old content-only approvals cannot authorize sending. Email, CRM write and internal follow-up plan have independent gates.

Remote services cannot participate in a database transaction. The system therefore audits claim/dispatch before the provider request and saves result/domain state together afterward. Concurrent calls are fenced and successful replay returns the stored result. A timeout or ambiguous dispatch becomes outcome unknown. The recovery path retries saving the same response, not sending again. This is careful duplicate prevention, not a claim of exactly-once email delivery.

## Automation and recovery

Domain jobs persist before external scheduling. Workers deliver signed references and recheck the saved actor, membership, state and exact approval. Leases, bounded attempts, backoff, provider-status checks and cancellation preserve a recoverable history. Follow-up timers prepare a new draft; every new email still needs fresh approval. Detected replies stop future work, but unavailable mailbox access remains unknown.

The implementation includes this behavior; real Trigger/reply acceptance still depends on provider setup and controlled live tests. The case study does not claim that mock/SQL verification establishes provider timing or incoming-mail behavior.

## Observability and Product Intelligence

Runs expose safe summaries, model, duration, tools, retries and nullable usage. Cost uses exact versioned pricing and remains estimated; missing telemetry/rates do not become zero. Activity tells the execution story without exposing hidden chain-of-thought.

Intelligence reads workspace-safe database aggregates. Business funnels count distinct company–workflow pairs in workflow-creation cohorts; agent/model activity uses run dates. Immutable snapshots, cumulative stage evidence and explicit denominators prevent retries or multiple messages from inflating conversion. Analytics informs an operator; it does not automatically alter strategy, scoring or approval policy.

## What this project demonstrates

- Domain-specific agents with narrow tool authority and validated contracts.
- Server authorization and database guards around irreversible operations.
- Stateful orchestration, partial-result preservation and explicit failure recovery.
- OAuth identity/generation handling, encrypted credentials and exact approval.
- Observable agent activity and unknown-safe outcome/cost analytics.
- A compact dark/light SaaS interface and isolated credential-free portfolio demo.

The central engineering lesson is that agent behavior, external authority and evidence quality require different controls. A model output is not a database transition; a completed run is not a sent message; an absent reply record is not proof of no response. Keeping those distinctions explicit makes the product easier to inspect and recover.

## Current limits

The current Release 1.0 candidate audits and hardens the preserved Release 0.9 product. Production deployment and fresh live acceptance are pending; no completed launch is claimed. Prior reports retain live Trigger worker/recovery, incoming-reply and HubSpot setup gates, missing exact pricing and historical telemetry gaps. Operational windows/pagination, retention policy and external CRM race/reconciliation limits remain documented debt. Calendar, billing, enterprise roles and arbitrary workflow scripting are outside scope.

Read [demo guide](demo.md), [security](security.md), [deployment](deployment.md), [release checklist](release-checklist.md) and [1.0 verification](release-1.0-verification.md) for the evidence behind these claims. [Portfolio copy](portfolio-description.md) and [interview notes](interview-notes.md) provide concise versions with the same acceptance limits.
