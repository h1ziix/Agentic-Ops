# Release 1.0 deployment runbook

The 1.0 candidate is authorized for launch when the intended accounts and configuration are available. **No production deployment or URL has been verified yet.** This document records exact setup and acceptance steps; actual results belong in [1.0 verification](release-1.0-verification.md). Preserve [0.9 evidence](release-0.9-verification.md) and use the [release checklist](release-checklist.md).

## Deployment shape

Vercel hosts the Next.js application, server actions and route handlers. Supabase hosts Auth/PostgreSQL. Trigger.dev supplies durable timers and signed callbacks to the same runtime. Gemini/Tavily support research/preparation; OpenAI is an optional Planner provider. Google and HubSpot supply separately approved external actions.

The public `/demo` is isolated fictional content. It needs no provider credentials, does not seed Supabase and cannot certify live provider behavior. Authenticated production routes need correctly configured Supabase.

## Manual gates observed during the 1.0 audit

Read-only checks on 3 October 2026 established:

| Gate | Actual observation | Required owner action |
| --- | --- | --- |
| Vercel account/project | CLI 62.2.0 `whoami` returned **Logged out**; no `.vercel/project.json` exists. | Run the login command below and finish browser authentication, then link the intended team/project. |
| Production Supabase | An existing development project is linked; its suitability as the production target and recovery setup are not established. | Identify the intended production project; confirm backups, production secrets, Site URL and redirect allowlist in its dashboard. |
| Canonical production origin | Local app configuration exists; no accepted public deployment origin is recorded. | Select the intended HTTPS origin/domain and set it consistently in application, Auth/OAuth and worker configuration. |
| Trigger environment | Project reference, environment key, signing secret and worker origin are absent; automation is disabled. | Create/select the intended Trigger project and environment, configure the restricted worker variables below and authenticate the CLI. |
| HubSpot | Client ID/secret are absent; owner portal acceptance is open. | Create/configure the OAuth app, register the exact callback and connect a controlled owner portal. |
| Gmail incoming replies | Existing consent is send-only. | Eligible, explicitly permitted read access is required before incoming-reply acceptance. Do not silently expand the existing consent. |
| Controlled external cycle | Historical provider evidence exists, but a fresh full 1.0 cycle has not been accepted. | Confirm a controlled inbox/portal and review the exact proposed action before separate Execute. Never use arbitrary recipients. |
| Pricing | Exact model pricing is absent. | Provide verified versioned rates or explicitly retain unknown-cost limits; no zero estimate is invented. |

These observations describe this local setup, not every account the owner may have. Credentials are entered directly into provider secret managers, never pasted into chat or committed.

## App runtime and domain

Use the lockfile and **Node.js 24** for the intended Vercel target, then run the full checks on that runtime. Next.js 16.3.6 itself requires Node ≥20.9, but that package minimum is insufficient hosting guidance: Vercel disabled new Node 20 deployments on 1 October 2026. Set the project to 24.x and retain the actual build-runtime evidence. [Vercel Node 20 deprecation](https://vercel.com/changelog/node-js-20-is-being-deprecated).

Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin, with no path, credentials, query or fragment. Configure public variables **before build**; Next.js embeds `NEXT_PUBLIC_*` values at build time. Changing them requires a fresh build/deployment. Local development can use a loopback HTTP origin. Preview origins need a separate controlled configuration; do not add wildcard production OAuth redirects.

The signed automation callback uses Node runtime and declares 300 seconds; its worker HTTP timeout is also 300 seconds and task maximum is 360. Company research has a 170-second budget. Confirm the selected Vercel runtime/plan supports the configured request durations and the worker can reach the callback. Local build success does not verify hosting timeout behavior.

## Environment inventory

Copy names from [.env.example](../.env.example). Use Vercel **Settings → Environment Variables**, selecting Production, for app values. Keep Preview/Development separate. Public values are browser-visible; every secret below stays server-only.

| Scope | Variables | Requirement |
| --- | --- | --- |
| Public Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Intended project URL/key; configured at build time. |
| Server Supabase | `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY` | Intended project's runtime writer; never client-prefixed. |
| Public app origin | `NEXT_PUBLIC_APP_URL` | Canonical production HTTPS origin. |
| Planner | `AI_PROVIDER`, `GEMINI_API_KEY` or `OPENAI_API_KEY`; optional `PLANNER_MODEL`, `OPENAI_PLANNER_MODEL` | Select a supported structured-output provider/model with account access. |
| Research/preparation | `GEMINI_API_KEY`, `TAVILY_API_KEY`; optional `GEMINI_MODEL`, `RESEARCH_MODEL`, `REVIEWER_MODEL`, `OUTREACH_MODEL` | Gemini/Tavily required for these stages; model names alone do not prove access. |
| Research ceiling | `MAX_RESEARCH_COMPANIES_PER_WORKFLOW` | Supported integer range 1–20; workflow target also applies. |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Exact app/callback and controlled mailbox. |
| HubSpot OAuth | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` | Exact app/callback and controlled portal. |
| Credential encryption | `INTEGRATION_TOKEN_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as base64; back up separately. |
| App automation | `AUTOMATION_ENABLED`, `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, `AUTOMATION_JOB_SIGNING_SECRET`, `AUTOMATION_APP_URL` | Correct matching environment; keep disabled until worker/callback gate passes. |
| Automation test flag | `AUTOMATION_ALLOW_TEST_JOBS=false` | Development-only accelerated due jobs must remain disabled in production. |
| Observability | `AI_MODEL_PRICING_JSON`, `WORKSPACE_TIMEZONE` | Optional verified pricing; IANA timezone defaults to `Asia/Qyzylorda`. Missing usage/pricing remains unknown. |

Framework `NODE_ENV` and Vercel environment markers are platform-managed. `E2E_BASE_URL` selects an already-running browser-test origin and is not product configuration. OpenAI is optional when Planner uses Gemini. Missing integrations/automation remain explicit setup states; their presence is required to accept those live capabilities.

Run the secret-safe configuration check with the intended environment present:

```powershell
npm run verify:env
npm run verify:env -- --production --require-automation
```

The production check rejects loopback origins and missing durable-worker configuration. It reports variable names/categories without values. A passed preflight validates configuration shape; it does not authenticate providers, prove callback reachability or accept live execution. OAuth setup and controlled provider tests remain separate gates.

## Supabase migrations, recovery and Auth

Before production changes, record the selected project, available backup/restore procedure and pending migration list. The existing link is not permission to treat a development database as production. Supabase CLI 2.119.0 was verified to support these commands:

```powershell
npx supabase@2.119.0 login
npx supabase@2.119.0 link --project-ref YOUR_PRODUCTION_PROJECT_REF
npx supabase@2.119.0 migration list --linked
npx supabase@2.119.0 db push --linked --dry-run
npx supabase@2.119.0 db push --linked
```

Apply only the reviewed pending versioned migrations. Never reset a hosted project, pass `--include-seed`, rewrite applied history or wipe audit data to recover a schema issue. The optional `supabase/seed.sql` is local development data. Public demo state comes from the independent browser fixture and needs no production seed.

Run all nine rollback SQL suites **sequentially** in migrated staging/development, for example:

```powershell
npx supabase@2.119.0 db query --linked --file supabase/tests/security_audit.sql
```

The suites are Planner, Research, Outreach, Executor, Automation, Observability, strategy, Intelligence and security. Separately verify intended production membership/RLS with controlled accounts; an isolated synthetic Auth test does not establish hosted project configuration.

In Supabase **Authentication → URL Configuration**, set Site URL to the canonical origin and add exactly `<origin>/auth/callback` to redirect URLs. Verify sign-up/confirmation, sign-in, sign-out, expired sessions, protected-route rejection and onboarding. Integration callbacks are separate.

## OAuth configuration

| Provider | Exact redirect URI | Current requested scopes |
| --- | --- | --- |
| Google | `<origin>/api/integrations/gmail/callback` | `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/gmail.send` |
| HubSpot | `<origin>/api/integrations/hubspot/callback` | `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write` |

For Google, enable Gmail API, configure the OAuth consent screen and permitted test users/account restrictions, then register the URI under the web client's authorized redirect URIs. For HubSpot, configure the OAuth app redirect and scopes, then connect a controlled portal with an owner who can grant them. Support localhost callbacks only in the separate local configuration; production must not depend on `http://localhost:3000`.

Connect from the authenticated application and confirm the displayed mailbox/portal identity. OAuth state is single-use and bound to user/workspace/browser; another session must restart consent. Current Gmail consent is send-only. Reply checks require an eligible exact grant containing `gmail.metadata` or `gmail.readonly`; implementing or authorizing broader consent is a distinct owner decision. Unavailable monitoring does not mean no reply.

Back up the encryption key separately before connecting accounts. Replacing it without coordinated decrypt/re-encrypt makes saved tokens unusable. Reconnect changes the authorization generation and invalidates old readiness. Local disconnect removes dispatch rights; HubSpot may also need manual uninstall in connected-app settings.

## Background worker

Use the pinned Trigger.dev 4.7.0 CLI from the package scripts. Its read-only `whoami` check returned **You must login first** during the audit. Create/select the intended project/environment and finish CLI browser authentication:

```powershell
npx --yes trigger.dev@4.7.0 login --profile default
npx --yes trigger.dev@4.7.0 whoami
```

The app needs the matching project reference/environment secret key. The worker needs only **`AUTOMATION_APP_URL` and `AUTOMATION_JOB_SIGNING_SECRET`** as task runtime variables. Do not sync the entire `.env.local`; database, AI and OAuth credentials stay on Next.js.

```powershell
# Local worker after Trigger project/login/environment setup:
npm run automation:dev
# Production worker once the intended app origin and secrets are configured:
$env:TRIGGER_PROJECT_REF = "YOUR_TRIGGER_PROJECT_REF"
npm run automation:deploy
```

Register `agentic-ops-job` and `agentic-ops-maintenance` in the intended environment. Verify the exact production callback `/api/automation/dispatch`, signature/timestamp rejection, body limits and duplicate-delivery fencing. Then set `AUTOMATION_ENABLED=true` on the app and redeploy. Keep it disabled while setup is incomplete; visible workflow pages can still continue bounded synchronous steps.

Test browser-independent continuation, due preparation, interruption/recovery, cancellation and bounded duplicate delivery. Timers grant no sending permission. Incoming reply cancellation needs the eligible grant and a real controlled reply. Mock/SQL tests and the static demo story do not establish live worker acceptance.

## Vercel login, link and deploy

The observed stop boundary is account authentication. Run in the repository terminal and finish the browser/device login:

```powershell
npx --yes vercel@62.2.0 login
npx --yes vercel@62.2.0 whoami
npx --yes vercel@62.2.0 link
```

Select the intended team/project during link; verify the local project identity matches the dashboard. Authentication alone does not identify the deployment project. Do not use an unowned temporary deployment to bypass this boundary. [Vercel login](https://vercel.com/docs/cli/login), [project linking](https://vercel.com/docs/cli/link).

When linking from a noninteractive agent/CI session, supply the known selection explicitly: `npx --yes vercel@62.2.0 link --yes --team YOUR_TEAM --project YOUR_PROJECT`. Do not invent these identifiers or use default project selection to avoid the owner decision.

In the selected project's **Settings → Build and Deployment**, choose Next.js, root directory `.`, lockfile install (`npm ci`), build (`npm run build`) and Node 24.x. Configure Production variables and the canonical domain before building. Inspect upload inputs locally; `--dry` performs no deployment:

```powershell
npx --yes vercel@62.2.0 deploy --dry --json
```

Verify `.env.local`, secret/token files, private reports, temporary database output and unrelated workspace artifacts are excluded. After all available gates pass and the correct environment is established, the authorized production command is:

```powershell
npx --yes vercel@62.2.0 deploy --prod
```

This command is documented, **not recorded as performed**. Preserve the actual deployment URL/identity, build output and chosen configuration in the verification report. CLI success is followed by direct browser verification.

## Production smoke and security smoke

Open the real canonical URL. Verify public demo without credentials, sign-in/out and protected route/API rejection, onboarding/navigation, saved workflow pages, Companies/Leads, Approvals, Activity, Automation and Intelligence. Inspect console/network failures and safe recovery. Confirm Auth/OAuth redirects use the production origin and unsigned worker callbacks reject requests.

Use a controlled workspace for ICP/template → goal → Planner → Research → qualification → Reviewer → Outreach → exact approval. Approval alone produces no provider mutation. Review the confirmed recipient/content/account, then separately execute one controlled action. Verify provider result persistence and saved-success replay without a duplicate mutation. A follow-up prepares fresh pending approval; refresh real state and cross-check Intelligence against saved records. Record unknown pricing/monitoring honestly.

Verify no client bundle, public asset or response exposes server environment values or service-role credentials. Test cross-workspace URL/ID access, unapproved execution rejection and demo isolation. Retain code/mock/local SQL scope distinctions; no penetration-test certification is implied.

## Rollback and incident notes

Retain previous app/worker artifact identities, backup/recovery capability and an additive corrective migration plan. Review schema compatibility before rolling back code. Stop new dispatch by disabling automation and account/action readiness as needed; retain job/attempt history. Reconcile uncertain provider outcomes before resuming. Never erase approval/audit/attempt history to permit retry.

Rollback cannot retract an accepted email or undo arbitrary CRM writes. Replacing the encryption key is not rollback. Restore procedures and production grants/RLS need intended-environment verification. The final commit/tag remains withheld while blockers remain, and post-1.0 recommendations do not start a new release.
