# Vercel production deployment

Verified 4 October 2026, Asia/Qyzylorda. The application is deployed and its public demo passes production smoke. Full Release 1.0 provider/worker acceptance remains open in the [release checklist](release-checklist.md).

Latest deployment: `dpl_BRuJHk3d4MchHGYd3DYKCztxuqC7` / source `b90049a`, READY at the same canonical URL. The [Research repair report](research-validation-repair.md) records the follow-up fix and successful authenticated continuation to a pending draft. The initial setup evidence below predates that live AI run.

## Initial deployment identity

- Application: [agentic-ops-gold.vercel.app](https://agentic-ops-gold.vercel.app).
- Public showcase: [demo dashboard](https://agentic-ops-gold.vercel.app/demo/dashboard).
- Vercel account `h1ziix`, scope `h1ziixs-projects`, project `agentic-ops` / `prj_17F5pad9EhbV8I1XiTbgS2IeXRdy`.
- Deployment `dpl_7YQRoF3oL384nLSAaDYaeP6vRVbL`, READY, Production. [Build inspection](https://vercel.com/h1ziixs-projects/agentic-ops/7YQRoF3oL384nLSAaDYaeP6vRVbL).
- Source: candidate checkpoint `5c38b56` plus `.vercelignore` and `vercel.json`. This was a CLI deployment; GitHub automatic deployments are not connected.
- Next.js 16.3.6, Node 24.x, `npm ci`, `npm run build`, Fluid compute. Cloud compilation, TypeScript and page generation pass; build duration 1m 15s.
- Function region `fra1` is pinned in `vercel.json` and confirmed by deployment inspection. The build machine ran in `iad1`; that is distinct from the function region.

## Production Supabase

The owner created the separate `Agentic-Ops` project `hrzakmrlsfxxrhjzsexg`, Frankfurt / `eu-central-1`, PostgreSQL 17.11. Before changes, read-only checks found zero public tables, zero Auth users and no migration history. This was an empty target, with no existing application data or managed backup to restore. Recovery of future production data and integration encryption keys is still an acceptance requirement; no restore test is claimed.

Commands explicitly selected this project, leaving the existing local development link and Supabase environment unchanged. The reviewed dry run planned exactly 37 migrations with no seeds or roles. All 37 were applied successfully using Supabase CLI 2.119.0, without hosted reset or development seed.

Post-deployment catalog checks confirm 37 migration records, 23 public tables with RLS on all 23, zero anon SELECT table grants, zero Auth users and zero workspaces. The hosted read-only `supabase/tests/security_audit.sql` passes. The full nine fixture suites were previously verified on isolated databases; they were not rerun against production. Two-user/two-workspace production acceptance remains pending.

Auth Site URL is `https://agentic-ops-gold.vercel.app`; the exact redirect allowlist contains `https://agentic-ops-gold.vercel.app/auth/callback`. Signup and email confirmation are enabled. The final CLI config diff has zero declared updates; remote-only defaults remain untouched. No production user or confirmation email was created by this deployment.

## Environment and upload boundary

Twelve Production variables were added: canonical app/Supabase origins, the new publishable and server Supabase keys, selected Planner provider, Gemini/Tavily credentials, research limit, workspace timezone, and explicitly disabled durable automation/test jobs. Server credentials were transmitted through CLI standard input and marked sensitive; values are absent from source, command arguments and reports. Local Google/HubSpot/Trigger credentials were not copied into this target.

Production launch validation passes with explicit warnings: Google/HubSpot OAuth unavailable, durable worker disabled, estimated model cost unknown. These are remaining setup/acceptance gates, not tested live integrations.

`.vercelignore` excludes credentials, local builds, private verification output, browser artifacts and temporary Supabase metadata. The final upload dry run inspected 397 files / 4,542,160 bytes, found zero private files and confirmed `.env.local` excluded. Ignored manifest/helper files stay outside Git and deployment inputs.

## Live verification

- Canonical URL and public demo opened in the in-app browser; rendered layout inspected. Production screenshots use fictional demo data only.
- `E2E_BASE_URL=https://agentic-ops-gold.vercel.app npm run test:e2e`: all four tests pass (50 seconds), including 13 showcase routes at six widths, keyboard/focus, compact navigation, filters, local drafts/approvals/reset, dark mode, reduced motion and missing routes. No runtime errors, failed responses, overflow or operational API calls in the route matrix.
- Sign-in and create-account pages return 200 with enabled controls. An unauthenticated dashboard streams a Next.js redirect to sign-in; no workspace data is exposed. This streamed redirect has HTTP 200 and is also verified through browser navigation.
- Valid unauthenticated History, Integrations and Automation reads return 401. Unsigned automation dispatch returns 401 without running a job.
- Frame, MIME and CSP protections pass on the inspected pages/API routes. Dynamic pages use private/no-store responses. Unauthorized JSON responses contain only the generic authentication error, with platform `public, max-age=0, must-revalidate` headers.
- Remote public-asset scan: 14 HTML pages and their 31 unique browser scripts contain no configured server credential values or credential signatures; scripts contain no server credential identifiers. Six credential values, including the new production Supabase secret, were compared only in memory. This covers the inspected public pages/assets, not every possible authenticated chunk.
- A final migration dry run reports `upToDate: true`, with no pending migrations, seeds or roles. Source/history secret scan passes (394 current files, 852 historical blobs, five configured local credentials); whitespace checks pass. The three screenshots changed by the live E2E run were visually reviewed.

During the initial deployment verification, no paid AI run, real email, CRM mutation, new OAuth consent or worker dispatch occurred. The subsequent [Research repair verification](research-validation-repair.md) exercised authenticated AI preparation to a pending draft. Full Auth lifecycle, exact approved Execute/replay, OAuth, durable jobs and incoming-reply acceptance remain pending. No final `v1.0.0` tag or completed provider launch is claimed. Continue using the [deployment runbook](deployment.md) and [release gates](release-checklist.md).
