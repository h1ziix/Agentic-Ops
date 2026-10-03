# Deployment preparation

Release 0.9 prepares the repository for a separately authorized Release 1.0 launch. This is an operator runbook, not evidence of a completed deployment. Use the [release checklist](release-checklist.md) and retain unresolved live verification gates.

## Deployment shape

- Vercel hosts Next.js pages, server actions and route handlers.
- Supabase hosts Auth/PostgreSQL; versioned migrations and RLS remain authoritative.
- Trigger.dev supplies durable jobs/timers when automation is enabled.
- Gemini/Tavily supply research/preparation; OpenAI is an optional Planner provider.
- Google and HubSpot OAuth supply separately approved external actions.

The public `/demo` is isolated sample content. It needs no provider credentials and must not become a production database seed or provider acceptance evidence. Authenticated routes require configured Supabase.

## App and domain

Use the lockfile and a Node.js version compatible with installed Next.js (currently ≥20.9). Run production checks before selecting a deployable checkpoint. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin. Preview origins do not automatically belong in production OAuth allowlists.

The signed automation callback declares 300 seconds, matching the worker HTTP timeout. Per-company research has a 170-second budget. Confirm the hosting plan supports these requests and that the worker can reach the callback. A local build does not establish hosting duration compatibility.

## Environment inventory

Copy variable names from [.env.example](../.env.example); enter real values directly into the intended secret manager. Never put real values in documentation, chat, fixtures or client-prefixed variables.

| Group | Application variables |
| --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY` (legacy fallback `SUPABASE_SERVICE_ROLE_KEY`) |
| App | `NEXT_PUBLIC_APP_URL` canonical origin |
| Planner | `AI_PROVIDER=gemini` with `GEMINI_API_KEY`, or `AI_PROVIDER=openai` with `OPENAI_API_KEY`; optional `PLANNER_MODEL` / `OPENAI_PLANNER_MODEL` |
| Research/preparation | `GEMINI_API_KEY`, `TAVILY_API_KEY`; optional `GEMINI_MODEL`, `RESEARCH_MODEL`, `REVIEWER_MODEL`, `OUTREACH_MODEL`, `MAX_RESEARCH_COMPANIES_PER_WORKFLOW` |
| Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and encryption key |
| HubSpot | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` and encryption key |
| Encryption | `INTEGRATION_TOKEN_ENCRYPTION_KEY`: exactly 32 random bytes encoded as base64 |
| Automation | `AUTOMATION_ENABLED`, `TRIGGER_PROJECT_REF`, matching `TRIGGER_SECRET_KEY`, `AUTOMATION_JOB_SIGNING_SECRET`, `AUTOMATION_APP_URL` |
| Observability | Optional verified `AI_MODEL_PRICING_JSON`; `WORKSPACE_TIMEZONE` defaults to `Asia/Qyzylorda` |

Stage model defaults do not guarantee account access. Verify structured-output/model access before live acceptance. Missing pricing leaves estimated cost unavailable. Keep `AUTOMATION_ALLOW_TEST_JOBS=false` in production.

The Trigger task environment needs only `AUTOMATION_APP_URL` and the matching signing secret. Configure project/key for the app/CLI in the correct Trigger environment. Never sync the entire `.env.local` into Trigger: database, AI and OAuth credentials remain on the application server.

## Supabase migrations and Auth

Record backup/recovery capability and inspect pending migrations before production changes. Apply versioned files in `supabase/migrations` in order through the normal linked workflow:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest migration list --linked
npx supabase@latest db push --linked --dry-run
npx supabase@latest db push --linked
```

These are launch-time operations. Never reset a hosted workspace or pass `--include-seed`. Existing data and audit history must survive. Fixes after applied migrations belong in a new migration. Run rollback SQL suites sequentially against migrated development/staging and independently verify production membership/RLS with controlled accounts.

Set Supabase Auth Site URL to the canonical origin and allow `<origin>/auth/callback`. Verify sign-up/confirmation, sign-in, logout and expired sessions. Integration callbacks are separate.

## OAuth configuration

| Provider | Exact callback | Current requested scopes |
| --- | --- | --- |
| Google | `<origin>/api/integrations/gmail/callback` | `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/gmail.send` |
| HubSpot | `<origin>/api/integrations/hubspot/callback` | `oauth`, contact read and contact write |

Configure controlled test users/portals. An owner must connect from the authenticated browser and verify displayed mailbox/portal identity. OAuth state is single-use and bound to user/workspace/browser; consent in another session requires restarting.

Current Gmail OAuth is send-only. Reply monitoring requires an existing exact grant with `gmail.metadata` or `gmail.readonly`. This release implements no broader consent flow; do not label unavailable monitoring as live. Provider app approval and account restrictions are external prerequisites.

Back up the encryption key separately. Replacing it without coordinated decrypt/re-encrypt work makes stored tokens unusable. Reconnection changes authorization generation and invalidates old action readiness. Disconnect removes local credentials; HubSpot may also require manual uninstall in connected-app settings.

## Background worker

Register a Trigger.dev project and configure matching environment keys. Deploy `src/trigger` only during a separately authorized deployment:

```powershell
# Local worker after project/login/environment setup:
npm run automation:dev
# Separate authorized production worker deployment:
npm run automation:deploy
```

Verify registration of `agentic-ops-job` and `agentic-ops-maintenance`, reachable app origin, matching secret and callback authentication. Then enable `AUTOMATION_ENABLED=true` and restart/redeploy. Keep it disabled until this gate is established; synchronous workflows remain usable.

A callback delivers a saved reference, never permission to send. Test browser-independent continuation, bounded duplicate delivery, due preparation, cancellation and recovery with controlled accounts. Mock/SQL tests do not establish live worker acceptance.

## Production smoke and rollback

Check public demo without credentials; authenticate to a controlled workspace. Exercise onboarding → ICP/template → workflow → plan → research → review → draft → exact approval. Confirm approval alone produces no send. If separately authorized, execute one controlled action, verify provider result and replay without a second mutation. Follow-up preparation must create fresh pending approval. Refresh saved state and cross-check Intelligence against persisted records.

Retain previous app/worker artifacts, database recovery information and an additive corrective migration plan. Schema changes may make simple code rollback unsafe; assess compatibility first. Disable future dispatch during incident recovery, retain jobs/attempts and reconcile uncertain outcomes before resuming. Rollback cannot undo a provider-accepted email or CRM write. Never erase approval/audit/attempt history to permit a retry.

Actual evidence belongs in verification reports. Existing Trigger/reply/HubSpot/pricing boundaries remain in [Release 0.7](release-0.7-verification.md) and [Release 0.8](release-0.8-verification.md).
