# Release 0.7 checkpoint — Automation + Observability

Implementation extends source checkpoint `8b37502` (Release 0.6). The application remains runnable with automation disabled. Live worker acceptance is open because Trigger.dev credentials/project configuration are absent. This report distinguishes implemented behavior, rollback SQL/mock verification, and actual provider verification. No release deployment, source commit, email send, CRM write, or OAuth scope expansion was performed during this task.

## 1. Implemented scope

Durable workflow continuation, research retries, approved-action retry references, follow-up preparation, read-only reply checks, health inspection/recovery, cancellation, and operational usage views extend the existing runtime. Creation persists the first job when enabled; the browser does not own background progression. Automation, Dashboard, workflow Runs & jobs, lead follow-ups, run details, Activity labels, and Settings reuse the current visual system.

Inspection confirmed the Release 0.6 deterministic Executor, separate approval/Execute transitions, immutable snapshots, encrypted OAuth boundaries, fenced external attempts, audit events and unknown-outcome reconciliation. No prerequisite runtime rebuild was needed. The existing controlled Gmail success is retained as provider evidence; HubSpot live acceptance remains dependent on its owner setup.

## 2. Background architecture

Trigger.dev v4.7.0 provides durable delayed invocations and a five-minute maintenance task. The repository had no durable background provider; this keeps timers and worker delivery outside the existing runtime without introducing a queue service or another workflow engine. Supabase owns domain state, job records, deadlines, bounded attempts, leases, claims, cancellation and the outbox. A small worker posts a timestamped HMAC-signed reference to the canonical Next.js origin. The callback resolves saved actor/workspace references and membership, then calls the existing Orchestrator, AgentRuntime, repositories, Outreach Agent and deterministic Executor. Provider retries are disabled; domain disposition determines recovery.

The Trigger task needs only the signing secret and app origin. AI, database and integration credentials remain on the Next.js server. Callback payloads are strict, capped at 4 KiB, and reject signatures older than sixty seconds. A fresh local unsigned POST returned HTTP 401.

## 3. Versioned migrations

The additive migration sequence is:

- `202610020003_observability.sql`: nullable telemetry, atomic completion wrappers and a member-scoped compact observation view.
- `202610020019_automation_events.sql`: auditable automation event vocabulary.
- `202610020020_automation_runtime.sql`: job/reply records, plan state, checked scheduling/claim/completion/cancellation/recovery and independent follow-up drafts.
- `202610020021_followup_failure_observability.sql`: failed follow-up generation telemetry.
- `202610020022_cache_write_usage.sql`: explicit cache-write categories and hashed failure correlation instead of a raw claim capability.
- `202610020023_automation_replay_guards.sql`: existing-draft replay, exact retry targets, cancellation replay, due-test fencing and accepted-evidence proof validation.
- `202610020024_followup_monitoring_copy.sql`: persisted input/approval wording distinguishes an actual inbox check from unavailable monitoring.
- `202610020025_automation_provider_reconciliation.sql`: bounded terminal-provider reconciliation and reply ownership/cancellation guards.
- `202610020026_followup_approved_actor.sql`: timer, activation and development-test jobs retain the immutable plan approver; scheduling/claim guards recheck current membership and read ownership.
- `202610020027_followup_failure_reply_status.sql`: failed/completed drafting and safe run summaries require a fresh check on the exact current read connection before reporting no detected reply; replay preserves observed facts.

All ten migrations are applied through the existing linked development project without resetting or reseeding hosted data. Local and remote migration history match through `202610020027`. Final SQL verification results are recorded below.

## 4. Tables and fields

`automation_jobs` stores domain links, original actor, type/status, due/start/completion/retry timestamps, provider run reference, idempotency key, lease/claim, bounded attempts, small input/result and safe failure classification. `reply_observations` stores only normalized thread/message/sender/date references tied to the confirmed parent execution. RLS protects reads; privileged mutations explicitly recheck workspace membership and related records.

Existing `follow_up_plans` gain automation, lead/company, generated-draft and actual reply-check fields. Existing `agent_runs` gain nullable normalized usage/provider categories, pricing version, estimated cost/status, model-call observation count and safe error category. Existing events carry correlated tool duration/retry/cache summaries. Public job projections omit claim tokens and leases.

## 5. Retry and idempotency

Jobs default to three attempts with a hard database ceiling of five. Existing agent budgets and the Executor's three-attempt ceiling still apply. Temporary failures persist exponential backoff and provider delay; permanent validation/authorization/state failures require attention. Manual retry cannot reset an exhausted budget.

Workspace/domain keys deduplicate job creation. Provider keys include the persisted scheduling epoch; cancelled or retried invocations cannot silently reuse an old provider task. Row locks, claim ownership, lease checks and completion fences handle duplicate delivery. Completion-save recovery retries the same successful result, including lost responses, without calling the operation again.

Safe stale agent runs resume through the existing claim/recovery logic. Provider outages and unknown provider states are never proof that a worker stopped. A terminal provider outcome can reconcile an unclaimed callback through bounded redispatch; uncertain external execution remains blocked. Exact external retry references require a definitively retryable saved attempt and the original immutable approval snapshot. There is no blind Gmail resend.

## 6. Follow-up behavior

The existing separately approved/executed internal plan is the scheduling source. Its successful sent parent, original recipient/account generation, accepted evidence and elapsed time feed validated follow-up drafting. Preparation produces a new independent pending v2 proposal with a new approval; the original send approval authorizes no future message. Existing drafts are reused, including after lost publication responses. Cancellation/reply/invalid lead/changed connection guards prevent future preparation or unsent execution. Jobs retain the original plan approver, requiring current membership and ownership when monitoring is available. Exact plan reads use the workspace and ID rather than a recent-list window, so older scheduled plans remain addressable.

The development-only due test advances the same internal job to fifteen seconds from now while preserving the approved plan deadline. It never sends. It requires explicit development configuration and is unavailable in production. Workflow and plan cancellation cancel future jobs while preserving audit history and confirmed provider results.

## 7. Reply monitoring

The current live Gmail grant is send-only. No extra consent or scope was requested. Monitoring remains visibly unavailable unless an existing exact original connection already grants Gmail metadata or read-only access.

For eligible connections, maintenance schedules targeted ten-minute reply checks and retains contexts after preparation while the draft awaits approval/Execute. Each tick examines bounded saved records, schedules at most twenty checks per owner context, and skips ongoing checks. Execution rechecks current owner role, plan state and connection generation. Only the saved sent thread's metadata is read; no bodies or mailbox-wide scan are stored. Sender/thread/time matching is a heuristic, not read/delivery/authentication proof. Failed and completed preparation record no detected reply only with a fresh check during that attempt and the exact current approved read connection. Missing/stale checks or changed permissions remain unavailable; replay preserves the original observation. Detected replies deduplicate and cancel future follow-up work. SQL and mocked provider tests verify this behavior; a real incoming-reply scenario remains unverified.

## 8. Usage, cost and observability

Normalized provider usage is nullable. Successful and failed observed usage survive atomic completion; cache-read/cache-write/reasoning categories retain their provider semantics. Exact model prices come from versioned `AI_MODEL_PRICING_JSON`, not invented defaults. Missing price/usage/category accounting is unknown, and every computed cost is labelled estimated. Executor runs have no AI cost.

Aggregates cover workflow, model, agent, day and workspace. Today uses configured workspace time zone. Partial tokens, unknown costs and bounded record windows are labelled. Historical model-call/tool duration estimates have an explicit caveat. Run drawers show only bounded safe summaries and correlated tool activity, excluding hidden reasoning and generic raw input serialization. No aggressive retention/deletion policy was introduced.

## 9. Automated and database verification

Baseline: 109 tests, lint, TypeScript and production build passed on the unmodified Release 0.6 checkpoint. Final implementation checks: all 160 offline tests pass with zero failures or skips; lint, TypeScript and production build pass. The client-secret scan checked 41 browser assets and five configured server credential values, finding no values or server credential identifiers. Build emitted only the existing warning about an unrelated lockfile outside this repository. All six rollback SQL suites passed against the final migrated development schema: planner, research, outreach, execution, automation and observability. Diff whitespace checks pass.

Rollback SQL suites cover authenticated member/cross-workspace isolation, service-only mutations, claim replay and stale fences, bounded retries, cancellation, exact snapshots, independent pending follow-up approval, due-time/development test behavior, reply deduplication, no automatic send, failed usage, cost nullability and atomic failure rollback. Paid/provider calls are mocked in unit tests.

An initial parallel SQL rerun encountered temporary CLI login-role authentication contention; no successful result was inferred. Final suites ran sequentially because shared audit fixture DDL must not run concurrently. New fixture checks also caught an outdated expected rejection code after adding membership, and a scope-removal fixture that omitted required identity scopes; both were corrected without weakening production guards, then rerun successfully. Dependency audit reports zero production vulnerabilities. Final TypeScript/browser/build checks required no further source changes after the SQL-only observation correction.

## 10. Live and browser results

Read-only `verify:execution` on the owner's existing controlled workflow `5d0393a7-d0b2-453b-817a-3eda4a0e2de8` confirms the unchanged original single successful Gmail attempt, its immutable snapshot, the separately executed internal plan, two total successful attempts, one plan and zero uncertain outcomes. The saved plan remains due `2026-10-03T05:00:00Z` in `Asia/Qyzylorda`. No new send request was made.

The authenticated in-app browser inspected actual Automation setup/empty state, operational Dashboard, saved workflow metrics/runs, safe tool disclosures, lead detail, Approvals, Activity and Settings. Read-only, clearly marked temporary fixtures covered scheduled/retry/permanent/unknown jobs, pending follow-up approval, reply cancellation, failed runs and unknown cost. They were removed after QA and are absent from the production routes. Dark/light layouts and approximately 390/768/1024/1440 CSS widths were inspected; no horizontal overflow was observed. Keyboard Escape dismissal and filter reset worked. Fresh workflow navigation and final Automation reload produced no runtime exception or failed network response; the refreshed setup state persisted. Older development logs reflected a corrected in-progress import and are not represented as fresh failures.

Ignored evidence files: `output/playwright/release-07-dashboard.png`, `release-07-workflow.png`, `release-07-automation.png`, and `release-07-mobile-job.png`. The mobile job screenshot is explicitly mocked visual evidence, not proof of a live send/recovery. Automation remains open in the in-app browser.

## 11. Required external/manual setup

Configure a Trigger.dev project and CLI login. Set `TRIGGER_PROJECT_REF`, matching development `TRIGGER_SECRET_KEY`, and a random `AUTOMATION_JOB_SIGNING_SECRET` of at least thirty-two characters directly in `.env.local`. Set the same signing secret plus `AUTOMATION_APP_URL` in the matching Trigger development task environment. Run `npm run automation:dev`; enable `AUTOMATION_ENABLED=true` only after worker registration, then restart Next.js. Do not paste secrets into chat or sync the full app environment to Trigger.dev.

Hosted deployment requires a reachable HTTPS callback, matching production keys and adequate execution duration. Configure verified exact model prices to obtain cost estimates. HubSpot's existing live verification also still requires owner OAuth app/account setup. Real reply verification requires a permitted read grant; this task deliberately does not broaden it.

## 12. Known limitations

Real Trigger execution, browser-independent continuation, rapid due preparation/fresh approval, real incoming-reply cancellation, provider interruption/redelivery and manual recovery have not been exercised against Trigger.dev. These remain live acceptance gates, not claimed passes. No paid AI run was started to manufacture telemetry. Current send-only Gmail cannot observe replies. Calendar, billing, quotas, unrestricted autonomous sends and new integrations remain excluded.

Maintenance and UI queries use explicit bounded windows, not unlimited historical analytics. A cancelled job cannot undo a completed send. Local mock/SQL proof does not establish hosted network, provider task registration, production timing or OAuth reconnect behavior.

## 13. Technical debt

Operational ownership/configuration, hosting duration validation, fair pagination/retention at larger volumes, historical telemetry gaps, dedicated failed preparation-lead retry controls and existing Gmail reconciliation limits remain documented debt. Telemetry and approval history are retained; there is no cleanup scheduler that deletes evidence. Failed writes and unknown external outcomes remain inspectable rather than being disguised as zero usage or success.

## 14. Release 0.8 handoff

Use the same workflow state owner, checked repositories, runtime, exact snapshots and deterministic Executor. Never treat a timer, reply check, existing approval or worker delivery as permission for a new external side effect. Respect connection generations and original actor membership. Keep failed and partial paid usage when adding models/providers; pricing must be versioned and unknown-safe. Complete the listed live gates before declaring Release 0.7 accepted. No Release 0.8 features were added.
