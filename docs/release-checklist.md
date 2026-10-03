# Release 1.0 readiness checklist

Updated 3 October 2026. **Local candidate verified; production launch blocked.** Checked items refer only to the stated source/local environment. Unchecked items require target setup or live acceptance. See [performed evidence](release-1.0-verification.md), [ranked audit](release-1.0-audit.md) and [deployment runbook](deployment.md).

## Code, security and local production QA

- [x] Read AGENTS/PROJECT and complete Release 0.9 checkpoint; inspect clean baseline `d89d683`, history, source and docs before changes.
- [x] Freeze feature scope; preserve existing architecture and committed migrations.
- [x] Node 24.21.0: 218 tests, lint, TypeScript and Next.js production build pass.
- [x] Client and source/history secret scans pass; `.env.local`, private output and deployment state remain ignored.
- [x] Central environment/origin/public-key checks and secret-safe production preflight implemented/tested.
- [x] Compatible security response headers verified locally.
- [x] Public demo automated smoke and authenticated saved-state browser traversal pass locally.
- [x] Major routes inspected at 1920/1440/1280/1024/768/390 px; light/dark and severe overflow checked.
- [x] Demo keyboard, drawers/focus, reduced motion, empty states, loading, controlled history error/retry and 404 checked.
- [x] Production dependency audit has zero findings; eight high dev-tooling advisories documented.

## Database and authorization

- [x] All original 36 migration blobs preserved; exactly one additive corrective migration.
- [x] All 37 migrations and nine rollback SQL suites pass on isolated fresh PostgreSQL.
- [x] Populated 0.9 upgrade preserves all 23 table counts/digests; all nine suites pass after upgrade.
- [x] Local catalog verifies RLS, restricted credentials/capabilities, fixed definer search paths and invoker observability.
- [x] Scoped source/repository/SQL tests exercise direct foreign-workspace IDs and persisted approval guards.
- [x] Cancellation/archive/history/strategy/approval snapshot invariants pass locally.
- [ ] Identify intended production Supabase project and verify migration agreement/drift.
- [ ] Record and validate target backup/restore and encryption-key recovery before migration.
- [ ] Apply reviewed pending migrations without hosted reset/development seed.
- [ ] Verify target RLS/grants and two-user/two-workspace direct-ID isolation.

## App environment, domain and Auth

- [x] `.env.example` documents requirement, public/server visibility and purpose for each product variable.
- [x] Local shape preflight passes with documented setup/pricing warnings.
- [x] Strict production/required-worker preflight correctly blocks incomplete local setup.
- [x] Auth forms/invalid credentials/protected-route redirect checked in separate unauthenticated local context.
- [ ] Confirm canonical HTTPS origin and Vercel request duration allowance.
- [ ] Configure intended production Supabase public key and server writer, Gemini/Tavily and selected Planner credentials/models.
- [ ] Configure verified model rates or explicitly accept unknown estimated cost.
- [ ] Set target Supabase Site URL and exact `/auth/callback` allowlist.
- [ ] Fresh target signup/confirmation/signin/logout/refresh/expiry/bootstrap/onboarding acceptance.
- [ ] Confirm encryption key is backed up separately and recoverable.

## Integrations, approval and execution

- [x] Offline/SQL approve/edit/reject do not dispatch a provider mutation.
- [x] Exact immutable approval, recipient, membership, revision and authorization-generation guards tested.
- [x] Legacy content approvals cannot execute; NULL service claim capabilities now reject.
- [x] Mock/SQL saved-success replay, concurrent claims and persistence retries do not redispatch.
- [x] Ambiguous outcomes remain unknown and cannot silently grant blind resend.
- [ ] Configure Google/HubSpot OAuth apps with exact callbacks and controlled accounts/portal.
- [ ] Verify target owner connect/reconnect/disconnect and displayed account identity.
- [ ] Fresh real schema-v2 proposal: review, approve separately, then Execute one controlled provider action.
- [ ] Verify provider result persistence and replay without duplicate external action.
- [ ] Controlled HubSpot create/update/conflict/read-only reconciliation acceptance.
- [ ] Target integration changes/cancellation block unsent work while preserving history.

## Automation and follow-ups

- [x] Worker builds/imports offline with zero fetches; missing project/config fails clearly.
- [x] Signed callback validation and unsigned rejection, durable claim/retry/cancellation rules pass locally.
- [x] Exact parent/snapshot/latest-attempt reads are independent of the 200-record display window.
- [x] Mock/SQL approved internal plan creates a fresh pending proposal and never sends/reuses approval.
- [x] Send-only/unavailable reply coverage is explicitly unknown; dev due-test flag forbidden in production.
- [ ] Authenticate Trigger; configure matching project/key, worker signing secret and canonical callback origin.
- [ ] Register/deploy intended job and maintenance tasks; verify hosting duration and reachability.
- [ ] Accept live signed callback, browser-independent continuation, duplicate delivery, recovery and cancellation.
- [ ] Accept real due preparation and fresh proposal persistence.
- [ ] Obtain eligible explicitly permitted Gmail read grant before claiming incoming-reply monitoring.
- [ ] Actual controlled incoming reply cancels future work and unsent follow-up proposals.

## Product, observability, Intelligence and demo

- [x] Existing saved research/review/outreach records pass read-only verification; sources/scores/events are visible.
- [x] Aggregate/cohort/unknown-denominator tests pass; authenticated local Intelligence reads saved data.
- [x] Safe summaries, run/tool correlation, duration/retries and nullable usage/cost retained.
- [x] Public demo is clearly fictional, isolated, reproducible and makes no operational API/provider mutation.
- [x] Demo drafts/decisions persist locally and Reset restores only samples.
- [x] Seven fictional screenshots visually reviewed; walkthrough requires no billing/consent.
- [ ] Fresh controlled ICP/template → goal → Planner → Research → Reviewer → Outreach → exact Approval acceptance.
- [ ] Cross-check new controlled workflow/provider outcome in production observability and Intelligence.

## Documentation, deployment and release

- [x] README, architecture/security/demo/case-study, deployment, release notes, portfolio/interview copy and PROJECT/TASK match candidate implementation.
- [x] Exercised local package checks; verified documented CLI command/flag availability and relative links.
- [x] Rollback/incident procedures documented: stop dispatch, preserve/reconcile history, retain encryption key; external actions are not undone by rollback.
- [x] Working diff understood; no secrets/private exports tracked; package version 1.0.0 and candidate badge consistent.
- [ ] Vercel login and intended team/project link. Current exact manual boundary: CLI logged out, no project linked.
- [ ] Configure production target variables/domain and all preceding target gates.
- [ ] Perform authorized Vercel/worker deployment and record artifact identities/URL.
- [ ] Open deployed URL; complete production functional/security/network smoke and controlled A–J acceptance.
- [ ] Record remaining limitations/owner acceptance and verified recovery artifacts.
- [ ] Create clean final release commit and `v1.0.0` tag only after launch gates pass.

No production URL, commit or tag is claimed. The request already authorizes deployment when the intended environment is available; no additional generic approval is needed. Credentials and target selection remain concrete external setup requirements. Post-1.0 ideas are recommendations only.
