# Release 1.0 verification — launch candidate

Verified on **3 October 2026**, `Asia/Qyzylorda`, from clean Release 0.9 HEAD **`d89d683`**. AGENTS.md, PROJECT.md and the complete [0.9 checkpoint](release-0.9-verification.md) were read before changes. The [initial blocker audit and freeze](release-1.0-audit.md) preceded significant implementation.

**4 October deployment update:** the application is live at [agentic-ops-gold.vercel.app](https://agentic-ops-gold.vercel.app), backed by separate production Supabase with all 37 migrations. Public E2E and unauthenticated security smoke pass. See [deployment identities and evidence](deployment-progress.md) and the updated [release checklist](release-checklist.md). Authenticated/provider/worker acceptance and the final tag remain open. The numbered audit sections below preserve the 3 October evidence and boundaries; their historical deployment status is superseded by this update.

**The 1.0 candidate passes local production, automated, isolated database and public-demo checks. Production launch is blocked.** Vercel CLI is logged out and no project is linked. Production Supabase/domain/Auth, Trigger worker and controlled provider acceptance also remain open. There is no verified production URL, final release commit or `v1.0.0` tag. Package version `1.0.0` describes the candidate, not launch certification.

No hosted migration, new OAuth consent, paid AI request, email send, CRM write or live worker deployment was performed. Saved hosted records were inspected read-only; browser inspection reused an existing signed-in local session. Evidence below must not be interpreted as a fresh complete live workflow.

## 1. Readiness audit and frozen scope

The existing Next.js/Supabase/domain architecture is preserved. Release changes address configuration, deployment compatibility, capability fencing and exact safety reads. No new agents, integration, infrastructure or frontend redesign was introduced. OpenAI remains an optional Planner provider; Gemini/Tavily supply research and preparation. The runtime is the repository's own typed `AgentRuntime`, not the OpenAI Agents SDK.

The three detailed audits are [database and authorization](release-1.0-database-audit.md), [runtime and external actions](release-1.0-runtime-audit.md), and [ranked launch findings](release-1.0-audit.md). Unverified production capabilities remain unchecked in the [release checklist](release-checklist.md).

## 2. Defects found and fixed

| Finding | Correction and evidence |
| --- | --- |
| Service-only execution RPCs accepted NULL claim capabilities through SQL three-valued logic. | Additive migration `202610030004_execution_claim_fencing.sql` rejects NULL capabilities/retry intent and revokes direct access to renamed inner functions. Local repro plus fresh/upgrade regression suites pass. Browser roles could not invoke the original RPCs; no browser approval bypass was demonstrated. |
| Follow-up parents and retry decisions depended on the latest 200 display records. | Load exact workspace/workflow/action/snapshot/attempt records; retain bounded presentation lists. Regressions use 250 newer unrelated records and still reject foreign IDs, non-success parents and changed authorization. |
| App/Auth/OAuth/worker origin and server settings were inconsistently validated. | Central server-only access, canonical-origin validation, supported provider/boolean/timezone/limit checks and secret-safe launch preflight. Hosted loopback origins are rejected. |
| A server Supabase credential could be misconfigured in the public-key slot. | Shared browser-safe validation rejects `sb_secret_*` and service-role JWTs, including surrounding whitespace. This is a preventive configuration guard; no committed or bundled credential exposure was found. |
| Trigger configuration used a placeholder project and a server-only import needed a worker build condition. | Missing/placeholder project fails explicitly. Trigger uses the `react-server` build condition; offline worker bundle/import tests make zero fetch calls and embed no signing value. |
| Intended hosting runtime needed updating. | Package engines and deployment guidance target Node 24; the final suite and production build run on Node **24.21.0**. Dependency versions are not broadly upgraded. |
| Application security response headers were absent. | Frame, MIME, referrer and permissions protections plus compatible `frame-ancestors`, `object-src` and `base-uri` CSP directives. HTTP verification and demo/browser tests pass. |

## 3. Secrets, input boundaries and safe logging

`.env.example` documents requirement, visibility and purpose, grouped by app, Supabase, AI, Gmail/CRM, automation and optional settings. Server modules use the centralized reader. Client Supabase configuration retains literal public environment references required by Next.js; framework runtime markers and browser-test settings remain separate.

`verify:env` reports names/categories without values. Vercel Node startup uses the same launch validation. Explicitly enabled automation cannot silently become a fake scheduler when required configuration is missing. Optional integrations and pricing remain visible setup/unknown states.

Client and source/history secret scans pass against the five configured local secret values and sensitive identifiers. Scanners reduce exposure risk; they are not a proof that every possible unknown credential is absent. `.env.local`, private verification output, database artifacts and `.vercel/` stay ignored.

Untrusted goals/web/company text are content in constrained prompts. Schema, source-ID/quote, scoring and envelope validation limit authority; only the deterministic Executor can dispatch approved provider actions. The app does not fetch arbitrary model-produced company URLs. Provider transports use fixed HTTPS hosts, bounded bodies and disabled redirects. OAuth tokens remain encrypted/server-only. Logs retain allowlisted identifiers/categories/timing rather than authorization headers, message bodies or raw model/web output. Hidden model reasoning is not exposed; Gemini thought parts are discarded.

## 4. RLS, authorization and workspace isolation

All **23** public application tables have RLS in the isolated final catalog. No anon application-table grant exists. Credentials, OAuth state/cache and claim capabilities are restricted. The observability view is security-invoker; Intelligence uses workspace-checked invoker reads. Security-definer functions have a fixed empty search path and repeat actor/state checks.

Cookie-bound identity uses Supabase `getUser`; workspace selection is checked through RLS. Repository scopes and RPC membership checks cover direct entity IDs across workflows/tasks, companies/leads, runs/events, approvals/actions, jobs/follow-ups, analytics, ICPs and templates. Local SQL and repository tests exercise foreign workspaces, not just navigation. No demonstrated IDOR or persisted-approval bypass was found in this scoped audit.

Production two-account/two-workspace testing remains required after selecting and migrating the intended hosted project. This source/local SQL audit is not independent penetration-test certification.

## 5. Migration and Supabase status

PostgreSQL **18.4** ran in an isolated loopback cluster. All **37** migrations apply from empty; all **nine** rollback SQL suites pass. Independently, the original 36 migrations were applied to a populated synthetic 0.9 database, migration 37 was applied, and all nine suites passed again. Row counts/content digests for all 23 tables were unchanged by the upgrade. The original 36 Git blobs are identical to the checkpoint.

The suites cover Planner, Research, Outreach, execution, automation, observability, strategy, Intelligence and schema/grants. Local fictional seeding is idempotent and produces zero executable schema-v2 proposals. The cluster is stopped; ignored local evidence is under `output/execution/release10-db/`.

Migration 37 has **not** been applied to hosted Supabase. The existing linked development project is not certified as production. Verify migration agreement/drift, backup and restore capability, production RLS/grants, encryption-key recovery, Auth Site URL/redirects and resource allowance before the hosted upgrade. No Realtime or Storage dependency was introduced. The [runbook](deployment.md) documents additive migration and rollback limitations; code rollback cannot retract provider actions.

## 6. Approval, execution and idempotency

Persisted immutable exact approval snapshots, revision/digest, recipient provenance, current integration identity/generation, membership and workflow state are rechecked before dispatch. Approval and Execute remain separate. Legacy content-only approval cannot authorize a provider call.

Mock/unit and SQL tests cover concurrent claims, sequential replay, duplicate delivery, persisted completion readback, retry ceilings and stale-worker recovery. Successful replay returns saved success. Completion-write retry reuses the recorded provider response. Ambiguous timeouts/5xx/invalid success bodies persist unknown outcome and cannot grant blind resend; provider reconciliation is read-only and inconclusive absence retains uncertainty.

A fresh controlled mailbox/HubSpot action, provider-side single-result verification and replay remain unperformed. Offline invariants do not establish live provider acceptance. HubSpot preview/write cannot be atomic across the remote provider interval; this race is documented.

## 7. Background jobs and follow-up safety

Signed callbacks bind request bytes and check timestamp, size and schema. Persistent claims, provider-run binding, bounded attempts and repeated actor/state checks fence delivery. Timers prepare a **new pending proposal** and never authorize sending with the previous email's approval. Cancellation, rejected/responded leads, integration changes and reply observations stop unsent work while preserving history.

Offline worker import/bundle tests pass. An unsigned local callback returns 401. Trigger CLI reports login required; project reference/key/signing secret/origin are absent and local automation is disabled. Live task registration, signed callback delivery, browser-independent continuation, due preparation, interruption/recovery and duplicate delivery remain launch gates. The 300-second callback allowance must be verified on the actual hosting plan.

Current Google consent is send-only. Incoming-reply acceptance requires an eligible separately permitted read grant and real controlled reply. Unavailable coverage stays unknown. Reply-discovery fairness at larger volumes remains a documented post-1.0 limit.

## 8. Production build and configuration checks

| Check | Actual final result |
| --- | --- |
| Node runtime | **24.21.0** |
| `npm run build` | Pass, Next.js **16.3.6**, build `UdanAvSdEHkAEDOLkI8XY` |
| Operational rendering | Authenticated operational routes compile as dynamic; public demo is static. |
| `npm run verify:env` | Pass with warnings for missing HubSpot, disabled durable automation and unknown pricing. |
| `npm run verify:env -- --production --require-automation` | Expected blocked result: loopback origin and absent/enabled worker configuration. A shape check does not authenticate providers. |
| Response headers | DENY frames, nosniff, strict-origin referrer, restricted permissions and compatible CSP observed on local production HTTP. |

The production server ran on `http://localhost:3002`; existing servers on other ports were left alone. The configured canonical local origin remains port 3000, so the QA server is used for reads/demo and unauthenticated rejection checks, not a claim of successful same-origin workflow mutations.

## 9. Automated test results

| Command / environment | Result |
| --- | --- |
| `npm test` on Node 24 | **218 passed, 0 failed, 0 skipped** |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test:e2e` against final local production server | **4 passed**, 37.6 seconds; includes 78 demo route/width cases and interaction assertions. |
| `npm run verify:client-secrets` | Pass: 51 browser assets, no public files, five configured secret values checked. |
| `npm run verify:source-secrets` | Pass: **391 current files, 792 historical Git blobs**, five configured secret values checked. |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| Full dependency audit | **8 high, 0 critical**, retained development-tooling transitive advisories; baseline finding, no production dependency finding. |
| Fresh and populated-upgrade PostgreSQL | 37 migrations and nine suites pass in each final environment. |

Initial baseline was 200 passing tests. No existing test was removed or skipped. New configuration/worker/capability/exact-read regressions account for the additional coverage. Dependency versions remain locked; no broad last-minute upgrade or new monitoring service was added.

## 10. Controlled E2E acceptance matrix

| Requested scenario | Performed evidence | Remaining acceptance |
| --- | --- | --- |
| A — Auth | Existing signed-in session renders workspace; separate hostname unauthenticated dashboard redirects to sign-in. Invalid credentials show loading then an accessible safe error and reenabled form. Sign-in/sign-up forms fit six widths. | Fresh signup/confirmation, successful signin, logout, session refresh/expiry and bootstrap on target production. Signup was not submitted; no new account or confirmation email. |
| B — Goal/Planner | Full suite validates typed plan, persistence/state transitions and failures. Existing saved workflow/tasks/Planner events inspected. | Fresh controlled goal and planning cycle. |
| C — Research/qualification | Read-only `verify:research` passes for workflow `5235ee7e-1c70-45d2-a21c-932d16c0508f`: one researched company, one qualified lead, five research runs and saved source/rubric/dedup checks. | Fresh provider search/research and persisted results on production. |
| D — Reviewer/Outreach | Read-only `verify:outreach` on the same workflow passes: one review, one outreach draft, one pending action; no execution. | Fresh model preparation cycle and UI recovery on production. |
| E — Approval | SQL/unit tests validate exact approval/edit/reject/history and no provider mutation; demo decisions are browser-only. | Fresh human-reviewed schema-v2 approval in controlled real workspace. |
| F — Executor | Contract/transport/mock/SQL checks pass. Historical workflow `885035e5-1332-47c6-8ae4-b4532270a7a2` passes `verify:execution --mode legacy`, confirming one v1 proposal and zero snapshots/attempts. | One separately executed controlled provider action and persisted result. Legacy verifier does not prove real execution. |
| G — Idempotency | Durable SQL and mock replay/concurrency/recovery tests pass. | Replay the controlled successful production action and verify no second provider mutation. |
| H — Automation | SQL/mock scheduled preparation, cancellation and delivery bounds pass; offline worker loads safely. | Deployed Trigger job persists and continues without browser; real due proposal/callback/recovery acceptance. |
| I — Intelligence | Aggregate/cohort tests and local SQL pass; authenticated screen reads saved database data. Unknown usage/reply coverage remain visible. | Cross-check the newly executed controlled production workflow against aggregates. |
| J — Demo | All automated public routes/interactions pass with zero operational API calls, POSTs or provider side effects. | Repeat public demo on the actual deployment URL. |

No scenario is labelled a full live pass based only on source, mocked providers or historical records. The initial default-mode legacy execution verifier failure was diagnosed as a v2 requirement, not a data defect; the correct explicit legacy mode passes.

## 11. Demo and portfolio walkthrough

Public fictional demo is visibly labelled, browser-local, independent of Supabase seed and real integrations. It supports a 2–4 minute path: Dashboard → showcase workflow/Planner tasks → Companies/score → Reviewer/outreach → Approval → simulated history → Automation → Intelligence. Drafts/decisions persist locally; Reset restores samples only. No AI billing, consent, timer, email or CRM activity occurs.

Seven shareable screenshots contain fictional sample records: [Dashboard](screenshots/dashboard.png), [workflow](screenshots/workflow.png), [Companies](screenshots/company.png), [Leads](screenshots/leads.png), [Approval](screenshots/approval.png), [Automation](screenshots/automation.png), [Intelligence](screenshots/intelligence.png). All seven were visually reviewed; no private workspace screenshot is included.

## 12. Browser QA, accessibility and error recovery

The Codex in-app browser and full CDP were used against `next start`, including the existing authenticated local workspace. Thirteen operational routes were checked at **1920, 1440, 1280, 1024, 768 and 390 px**: Dashboard, Workflows/detail, Companies, Leads, Approvals, Activity, Automation, Intelligence, ICPs, Templates, Settings and onboarding. The 1440/light and 1280/dark runs preceded the final configuration/badge build; the other four widths used the final build. No structural UI change occurred between them. Heading/main structure and page overflow checks pass. Sign-in/sign-up and protected-route checks used a separate unauthenticated hostname.

Automated demo QA additionally checks 13 routes at six widths, dark mode, reduced motion, keyboard palette/navigation, drawer focus return, workflow stage focus, filtering/empty results, local persistence/reset and 404. It reports no browser runtime errors, HTTP failures ≥400, operational API requests or mutation POSTs in those demo scenarios. Rendered screenshots were reviewed for spacing, hierarchy and legibility; no major redesign was warranted.

A controlled CDP block of `/api/history` produced an explicit unavailable state, unknown counts, accessible error and Retry history control. After unblocking and clicking Retry, all 100 saved events returned. Intentional network failure is separated from normal-path console results. Normal inspected authenticated passes had no captured warning/error; the CDP event buffer was truncated during bulk traversal, so no complete authenticated network-trace claim is made. Screenshot capture in the in-app backend was unavailable; final visual evidence comes from the production Playwright screenshots.

Temporary URL blocks and viewport overrides were cleared, original Light appearance restored, and the safe demo tab retained for review. Existing authenticated session was preserved.

## 13. Performance, queries, caching and observability

Final bundle report: **50 client chunks**, **2,217,136 raw bytes**, **661,246 bytes summed gzip**. Largest chunk: **415,529 raw / 99,629 gzip bytes**. These are whole-build assets, not a per-route transfer or latency benchmark. No heavy chart package or material new browser dependency was introduced.

Operational list/history paths remain bounded; activity pages contain 100 events, and execution presentation windows retain 200 records. Exact safety reads now bypass those presentation windows. Intelligence uses database aggregates rather than downloading entire history. Portfolio-scale windows and reply-discovery fairness need further paging work at larger volumes; no production-scale throughput claim is made.

Authenticated routes remain dynamic, operational HTTP responses avoid shared caching, and existing refresh/invalidation behavior is retained. Static public demo caching remains available. This is build/source/local HTTP evidence, not a production load or stale-state endurance test.

Persisted events/runs expose workflow/agent/tool correlation, time/status, safe failure categories, attempts/duration and nullable model usage/cost. Intelligence preserves distinct cohort/unit semantics and unknown denominators. No new commercial error-monitoring integration was added. Verify the target hosting logs and worker status during production smoke.

## 14. Documentation finalized

[README](../README.md) leads with the product, screenshot and workflow. [Architecture](architecture.md), [security](security.md), [demo](demo.md), [deployment](deployment.md), [case study](case-study.md), [portfolio description](portfolio-description.md), [interview notes](interview-notes.md), [release notes](../RELEASE_NOTES.md), PROJECT/TASK and this checklist/report reflect actual implementation and candidate status. Historical release reports are preserved.

Package checks/build/start, verification scripts and E2E commands were exercised. Supabase CLI **2.119.0**, Trigger CLI **4.7.0** and Vercel CLI **62.2.0** command/flag availability was checked. Production migration/deployment/worker commands are documented conditional procedures, not claimed performed commands. Relative documentation links and whitespace are checked before handoff.

## 15. Deployment status and exact next owner step

**Not deployed; production URL: none verified.** Read-only Vercel `whoami` returns **Logged out**, no `.vercel/project.json` exists, and dry upload inspection is blocked before deployment by credentials. Trigger `whoami` also requires login. No production CLI deployment was attempted with invented credentials.

The next exact boundary is Vercel account authorization. In this repository terminal, run:

```powershell
npx --yes vercel@62.2.0 login
npx --yes vercel@62.2.0 whoami
npx --yes vercel@62.2.0 link
```

Complete browser authentication and select the intended team/project. Then identify the production Supabase project and canonical HTTPS origin. Configure credentials directly in provider secret managers, never chat. The [deployment runbook](deployment.md) gives exact Vercel/Supabase/Auth/OAuth/Trigger settings and callback URIs.

Additional known gates: production backup/migration/Auth checks; matching Trigger project/key/signing secret and reachable worker origin; HubSpot app/controlled portal; controlled mailbox/exact approval/Execute/replay; eligible permitted Gmail read grant for reply acceptance; verified pricing or explicit acceptance of unknown cost. Login alone does not complete these gates. Resume deployment and controlled acceptance after setup; do not claim the only remaining task is authentication.

## 16. Production smoke and security smoke

**Not performed on a deployed URL.** Local production demo/navigation/authenticated saved-state and rejection checks are recorded above. Local unauthenticated `/api/history?kind=events`, `/api/automation` and `/api/integrations` return 401; malformed/forged history query returns 400; unsigned dispatch returns 401. Execute POST without required Origin returns 403. These HTTP rejections are useful perimeter checks; the SQL/unit suites establish persisted approval guards.

After deployment, directly open the canonical URL and repeat Auth, demo, workspace navigation, fresh controlled AI workflow, approval/Execute/replay, worker callback, OAuth redirect, Intelligence and console/network smoke. Repeat server-secret, workspace-ID and unapproved-execution rejection checks. CLI deployment success alone is insufficient.

## 17. Git and release status

Working changes are intentional code/config/docs, seven fictional screenshots and one corrective migration. No `.env.local`, credentials, private dumps or database exports are tracked. Package/lockfile version is **1.0.0**; application badge says **Release 1.0 candidate**. Existing migration history and prior checkpoints are preserved.

As of the 3 October verification, no final commit, tag, push or GitHub release was created because unresolved launch gates remained. On **4 October 2026**, the owner explicitly requested committing and pushing the current changes. This authorizes a **Release 1.0 candidate checkpoint**, while production acceptance and the final `v1.0.0` tag remain pending. The pre-commit source/history secret scan passed again: 391 current files, 850 historical Git blobs and five configured secret values checked. Git history records the checkpoint identity; this does not certify deployment or live providers.

After real acceptance, rerun relevant checks on the final source, make the clean authorized `release: Agentic Ops v1.0` release commit and create `v1.0.0` if consistent with repository release workflow.

## 18. Known limitations

- Provider-dependent research and human-reviewed qualification hypotheses; contact discovery is incomplete.
- Google send-only consent does not demonstrate reply monitoring; HubSpot setup/live acceptance remains open.
- Durable worker/provider acceptance is not established by offline or demo results.
- AI usage can be absent; unconfigured/unverified exact pricing means unknown estimated cost, not billed cost or zero.
- Portfolio-scale list windows and bounded reply scans need further fair paging at larger volume.
- HubSpot preview/write race and uncertain external outcomes require reconciliation; code rollback cannot undo sends.
- Eight high development-tooling dependency advisories remain; production dependency audit is clear.

## 19. Post-1.0 recommendations

After completing the existing launch gates, prioritize reply-scan fairness and explicit monitoring eligibility, continued compatible tooling-advisory remediation, target-environment callback/recovery endurance checks, and measured pagination/load work when real volume warrants it. Revisit broader Gmail consent only with explicit owner authorization. Avoid adding new agents/providers or infrastructure without a concrete operational requirement.

These are recommendations only. No Release 1.1 work is started. Release 1.0 remains a verified local candidate awaiting the external setup and live acceptance recorded here.
