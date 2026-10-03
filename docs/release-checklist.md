# Release 1.0 readiness checklist

This is a launch gate, not completed-check evidence. Release 0.9 performs no production launch. Mark items only with environment-specific results and retain unresolved live gates.

## Repository and quality

- [ ] Review Release 0.9 diff and its performed-check report.
- [ ] Select an explicitly authorized source checkpoint/release tag.
- [ ] Tests, lint, TypeScript and production build pass on that checkpoint.
- [ ] Client-secret scan passes; no real secrets appear in Git, logs or public assets.
- [ ] Offline demo smoke and authenticated browser smoke pass.
- [ ] Desktop/laptop/narrow layouts work in dark/light themes.
- [ ] Keyboard, dialogs/drawers, reduced motion, empty/loading/error states and 404 are checked.
- [ ] Screenshots and README/architecture/demo/security documents match implementation.

## Database and authorization

- [ ] Record backup/restore capability before schema changes.
- [ ] Verify migration agreement; apply pending versions without hosted reset/seed.
- [ ] Run all nine rollback SQL suites sequentially in migrated staging/development, including [security schema/grants](../supabase/tests/security_audit.sql).
- [ ] Verify production membership, RLS and cross-workspace isolation with controlled accounts.
- [ ] Privileged runtime RPCs remain restricted and repeat membership/state guards.
- [ ] Archival/cancellation preserve audit history and confirmed provider results.
- [ ] Strategy, qualification and exact approval snapshots survive source edits.

## Environment, domain and Auth

- [ ] Canonical HTTPS domain, app origin and hosting duration are confirmed.
- [ ] Supabase public configuration and server-only runtime secret are configured.
- [ ] Gemini/Tavily credentials and selected structured-output models are available.
- [ ] OpenAI is configured if OpenAI Planner is selected.
- [ ] Verified exact pricing is configured, or unknown-cost limits are accepted explicitly.
- [ ] Supabase Site URL and `/auth/callback` redirect are configured.
- [ ] Sign-up/confirmation, sign-in, logout, session expiry and onboarding work.
- [ ] Encryption key is configured, separately backed up and recoverable.

## Integrations and approval

- [ ] Google/HubSpot apps have exact callbacks and controlled test accounts/portal.
- [ ] Owner connect/reconnect/disconnect and displayed identity are verified.
- [ ] Approve, edit/replacement and reject produce no provider mutation.
- [ ] Old connection generations/content-only approvals cannot execute.
- [ ] Separate, explicitly permitted Execute produces one controlled provider result.
- [ ] Saved-success replay causes no duplicate mutation.
- [ ] Ambiguous dispatch remains uncertain and cannot silently grant blind resend.
- [ ] Controlled HubSpot create/update/conflict/read-only reconciliation is verified.
- [ ] Connection changes/cancellation block unsent actions and retain history.

## Automation and follow-ups

- [ ] Matching Trigger project/key, worker signing secret and app origin are configured.
- [ ] Job/maintenance tasks are registered in the intended environment.
- [ ] Signed callback, hosting timeout and provider-status recovery are verified.
- [ ] Live workflow continues after browser closure/navigation.
- [ ] Duplicate delivery, exhausted retry, cancellation and recovery remain bounded.
- [ ] Controlled approved internal plan prepares a fresh pending proposal.
- [ ] Timer/preparation never sends or reuses original approval for a new email.
- [ ] Eligible existing Gmail read grant exists before claiming reply monitoring.
- [ ] Actual incoming reply cancels future work and unsent follow-up proposals.
- [ ] Send-only/unavailable monitoring is labelled unknown.
- [ ] Development due-test flag is disabled.

## Product, demo and Intelligence

- [ ] Attention states lead to useful approval/recovery/setup screens.
- [ ] ICP/template → Planner → Research → Reviewer → Outreach → Approval is coherent.
- [ ] Sources, score components, activity and run details reflect saved records.
- [ ] Intelligence matches selected database cohorts and separates company profiles from company–workflow units.
- [ ] Unknown usage/pricing/reply coverage and zero denominators are not measured zero.
- [ ] Public demo is clearly labelled, reproducible and isolated from real integrations/workspaces.
- [ ] Demo decisions/creation make no API, paid, email or CRM mutation.
- [ ] Real state persists after refresh; demo reset restores only sample content.

## Launch and recovery

- [ ] Controlled production smoke uses separately authorized external actions.
- [ ] Record limitations/owner acceptance; unresolved gates are not claimed as passes.
- [ ] Previous app/worker artifact and database/corrective migration recovery are recorded.
- [ ] Incident procedure disables future dispatch and preserves/reconciles attempts.
- [ ] Rollback compatibility is confirmed; external actions cannot be undone by code rollback.
- [ ] Authorize Release 1.0 deployment, portfolio URL and launch verification separately.

Open prerequisites from prior reports: live Trigger worker/recovery, actual incoming-reply acceptance with eligible read consent, HubSpot owner setup/live test and exact model pricing. See [deployment](deployment.md), [Release 0.7](release-0.7-verification.md) and [Release 0.8](release-0.8-verification.md).
