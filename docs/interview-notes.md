# Agentic Ops — interview notes

## A thirty-second opening

Agentic Ops turns a sales goal into inspectable work: a plan, researched companies, qualification, independent review, an outreach draft and exact human approval before external execution. I built it to demonstrate how an agentic system handles state, evidence and external authority beyond a chat completion. The public demo illustrates the product without provider credentials or side effects.

## Why multiple roles

Planner, Research, Reviewer and Outreach have different contracts and tool permissions. Planner defines dependencies; Research gathers evidence; Reviewer checks supported personalization; Outreach composes from accepted facts. The Orchestrator owns state, and the Executor is deterministic. This is a typed application runtime, not an OpenAI Agents SDK deployment. Workers are infrastructure handlers, not extra AI agents.

## Orchestration and structured output

The runtime loads persisted state before each bounded step. Zod validates model outputs; domain validation rejects unsupported tasks, duplicate IDs, invalid dependencies, unsupported citations and inconsistent scores. Checked PostgreSQL operations atomically save outputs, state transitions and safe audit records. A successful replay reads saved work instead of paying for another call. Partial company results survive other failures.

## Bad web data and prompt injection

Source text, goals and strategy are untrusted data. Prompts reject instructions embedded in evidence; agents cannot execute arbitrary SQL, commands or URLs. Research calls fixed search/model endpoints rather than fetching arbitrary company URLs on the application server. URL, citation and exact-quote checks constrain evidence; Reviewer independently checks accepted facts. Opportunities remain hypotheses, and missing contact information blocks execution rather than producing an invented recipient.

## Human approval and duplicate prevention

Approval freezes revision, recipient, content, connection identity/generation and digest. Approve and Execute are separate. Editing approved content creates a replacement requiring new approval. Database locks, claims and pre-dispatch audit fence concurrent calls. Confirmed replay returns the saved result. If the provider accepted an action but completion persistence failed, recovery saves the same response without another mutation. An ambiguous timeout stays outcome unknown and blocks blind resend. This prevents duplicate local dispatch; it does not promise exactly-once email delivery across a remote network.

## Background recovery

Jobs persist before external scheduling. Trigger.dev delivers timestamped HMAC-signed references to the canonical app; the server reloads actor/workspace state, permissions and claims. PostgreSQL owns leases, attempts, cancellation and the outbox. Maintenance reconciles bounded saved work; provider unavailability is not proof that a worker stopped. A timer prepares a fresh follow-up proposal and has no authority to send. Reply checks require an eligible exact read grant; send-only access is displayed as unavailable.

## Usage, cost and analytics

Runs store agent/model, duration, retries and observed nullable token categories. Exact versioned pricing enables estimated cost; missing data stays unknown and no retrospective repricing is assumed. Executor has no model cost. Intelligence is a security-invoker database aggregate. Business outcomes use distinct company–workflow units in workflow-creation cohorts; agent/model activity uses actual run dates. Repeated messages or retries cannot inflate the lead funnel. Analytics never changes prompts, scores or approval policy automatically.

## Hard decisions and tradeoffs

| Decision | Reason / tradeoff |
| --- | --- |
| One Next.js app with Supabase | Keeps product/services close and avoids premature infrastructure; privileged operations still need independent guards because service credentials bypass RLS. |
| PostgreSQL owns workflow and job state | Transactions enforce invariants; versioned checked operations are more explicit than letting agents mutate tables directly. |
| Exact approval plus explicit Execute | An extra human step preserves a clear authority boundary for irreversible actions. |
| Unknown external outcome | Some retries require reconciliation; claiming success or resending blindly would be less recoverable. |
| Immutable historical snapshots | Additional stored context prevents later source edits from rewriting previous decisions. |
| Fictional public demo | Easy to review safely, while live acceptance is kept as separate evidence. |
| Bounded reads and provider budgets | Predictable portfolio-scale behavior; larger-volume paging, retention and load testing remain future work. |

## Evidence to discuss honestly

Use the current [1.0 verification](release-1.0-verification.md) for actual counts and environments. Offline tests mock paid/provider mutations. SQL suites establish database invariants. Demo interactions establish sample isolation. Saved records are historical observations. Only fresh controlled provider/production tests establish those live paths. The candidate currently has external deployment, Trigger, HubSpot and incoming-reply prerequisites; do not describe them as completed.

## Improvements after 1.0

Prioritize observed scaling needs: fair paging/retention, clearer historical telemetry coverage, controlled provider failure/recovery acceptance and more complete accessibility testing. Consider additional integrations or recipient enrichment only with a concrete user need. Keep these as backlog recommendations; the current task stops at Release 1.0.
