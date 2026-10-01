# Task — Release 0.6: Executor + Real Integrations

Read AGENTS.md, PROJECT.md and README.md completely. Preserve the architecture and Release 0.5 checkpoint 26260a1. Current user release boundaries take precedence over PROJECT.md's historical stages.

Implement and verify: AI proposes → human reviews exact revision → human approves → explicit Execute → deterministic provider action → persisted result/audit.

Scope: Gmail/HubSpot owner OAuth, encrypted server-only credentials, user-confirmed recipient, strict v2 executable contracts and immutable snapshots, checked claims/fencing/idempotency, bounded retries/unknown recovery, plain-text Gmail send, allowlisted CRM contact create/update, internal follow-up plans, operational UI and controlled verification. v1 content approvals remain readable and cannot execute.

Use existing Orchestrator, approval lifecycle, repositories, runs/events and workflow/tasks. No parallel runtime or audit log. Executor never calls an LLM; approval never performs a provider mutation. Browser Execute sends IDs and expected snapshot only. Limits: one active workflow action, batch ≤20, provider timeout 30s, claim lease 120s, ≤3 attempts. Unknown email blocks blind resend. Retain late confirmed results after cancellation and successful siblings after failure. CRM/follow-up approvals are independent and never reopen completed core tasks.

Required verification: npm run lint, npm run typecheck, npm test, npm run build, npm run verify:client-secrets; four rollback SQL suites on migrated development/test DB; appropriate read-only verifiers; in-app browser rendered/console/network/keyboard/responsive/dark/light checks and visual polish; git diff --check and final status. Never reset hosted DB or invoke paid/provider mutations in automated suites.

Live verification is a separate acceptance gate: controlled test inbox/portal, exact reviewed payload, product approval, separate explicit permission for external test actions. Missing environment/consent/accounts blocks live verification. Mocked checks are not live evidence. Do not request secret values in chat.

Do not implement 0.7: workers/cron/Trigger.dev, scheduled dispatch/retries, automatic follow-up, Calendar, inbox/monitoring/webhooks or recovery jobs. No billing, analytics, deployment, new infrastructure or Gemini/Tavily migration.

No push, deployment or checkpoint in this task. Final checkpoint is separate. Report implementation, migrations/targets, fresh test counts, browser/live evidence, unresolved blockers/env/manual steps, limitations/debt, 0.7 handoff and git status. README documents OAuth/architecture; verification notes record only performed checks.
