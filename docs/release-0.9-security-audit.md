# Release 0.9 security and server-performance audit

Audit date: 3 October 2026, `Asia/Qyzylorda`. Source baseline: `f1cf331`, the combined Release 0.7–0.8 checkpoint. Reviewed repository instructions, the full Release 0.9 request and prior verification reports before changes. This report covers source inspection, offline regression tests, isolated local SQL and explicitly named localhost checks. It does not mark the unresolved Release 0.7 provider gates accepted.

## Findings and corrections

| Finding | Correction | Evidence |
| --- | --- | --- |
| Cookie-refresh proxy omitted Automation, Intelligence, ICPs, Templates and APIs | Include these routes and new onboarding; public demo remains separate | Source inspection; fresh TypeScript/lint checks |
| Email editing and CRM preview found an action by loading a workspace list | Exact workspace + action ID lookup | Old action after 1,000 synthetic records remains addressable; foreign workspace returns no record |
| Executor/reconciliation found snapshots and attempts through display lists | Exact workspace/workflow/action/snapshot reads; action attempts bounded by the existing three-attempt ceiling | Mocked older-snapshot, successful-attempt and cross-workspace/workflow regressions |
| Research provider success/error JSON could buffer an arbitrarily large response before the size check | Streaming one MiB UTF-8 byte ceiling with early cancellation, including Gemini quota diagnostics | Oversized chunked 200/429 responses are canceled; safe invalid-output errors; malformed quota diagnostics retain Retry-After handling |
| Workspace layout transferred broad event/run/execution history | Display snapshots: newest 200 runs, 300 events; execution history newest 200; explicit history-window metadata | Bounded read and pagination regressions; runtime access and exact execution remain independent |
| Activity had no database history paging | Authenticated `/api/history`, strict kinds/pages/workflow scope, 100 records plus a `hasMore` probe; Activity retains one page | Schema and safe DTO tests; localhost unauthorized/invalid-query checks |
| Observability requested 2,000 events while configured PostgREST maximum is 1,000, potentially hiding truncation | Request 1,000 and mark the window at that threshold | Source correction; existing observability semantics retained |
| Existing operational reads relied on an implicit API maximum | Explicit stable limits of 1,000 for workflow/task/entity/approval/strategy lists | Repository review; this retains the existing configured window, not complete large-dataset pagination |
| shadcn CLI was classified as a production dependency despite tooling-only use | Root moved it to development dependencies; no forced downgrade | Fresh production dependency audit: zero findings |

Approval permission, workflow/runtime ownership and external adapters were preserved. No new agent, external execution path or database migration was introduced. No paid AI/provider calls, email/CRM mutations, new OAuth consent, hosted database writes, deployment, push or commit were performed for this audit.

## Performed checks

### Application boundaries

Inspected all API route handlers and exported server actions, their authorization services, cookie-bound versus runtime Supabase clients, checked mutation RPCs, integration/OAuth code, deterministic Executor, worker authentication, research prompts/validation and logging. Source review found no route that sends using only client content or treats an approval click as Execute.

Authenticated identity and workspace checks remain in each operation's service path. Exact records include workspace filters; service-only execution/automation RPCs independently check the actor. OAuth tokens/claims are excluded from browser projections. Research, Reviewer and Outreach receive constrained data and no arbitrary code/execution tool. Research does not directly fetch company URLs. No untrusted HTML render path was found.

Fresh localhost checks against the Release 0.9 development server on port 3001:

- `GET /api/history?kind=events` without cookies: **401**.
- `GET /api/history?kind=events&workspaceId=forged`: **400**; caller cannot supply workspace scope.
- Unsigned `POST /api/automation/dispatch`: **401**.

Earlier requests to the existing port-3000 production build returned 404 for the newly added history route. That old build was not restarted or presented as verification of the new endpoint.

### Offline regression tests

An initial targeted provider/repository/history run passed **11 tests**, zero failures/skips. A broader fresh run covering workspace presentation, provider boundaries, analytics, HMAC/jobs, execution/contracts, OAuth, HTTP mutations and the new repository/history checks passed **64 tests**, zero failures/skips. A latest targeted rerun passed **12 tests**, including the 1,000-event observability truncation regression and the client-safe history DTO. Paid/provider transports were mocked. Targeted ESLint and a global TypeScript check passed during the audit. Final full-suite/build/browser checks belong to the overall Release 0.9 verification report; these interim checks are not a claim about later source edits.

### Fresh isolated database verification

Started a fresh PostgreSQL 18 cluster bound to loopback port 55439 inside ignored local output. Installed synthetic Supabase auth helpers/roles, then applied all **36 versioned migrations** in order. All eight existing rollback SQL suites passed sequentially:

`planner_runtime`, `research_runtime`, `outreach_runtime`, `execution_runtime`, `automation_runtime`, `observability`, `sales_strategy`, `intelligence_analytics`.

Added and passed a ninth read-only `security_audit` suite. It asserts all **23 public application tables enable RLS**, security-definer functions use an empty fixed search path, browser roles cannot read OAuth credentials/state or claim tokens, directly delete workflow/approval/audit history or call protected runtime/provider mutation functions, and Intelligence remains authenticated security-invoker. Existing suites exercise two-workspace isolation, checked state transitions, exact snapshots, claim replay/fencing, retry ceilings, cancellation/late results, independent follow-up approvals, immutable strategy/assessment history and unknown-safe aggregates.

These suites use local synthetic records and roll back; they do not contact providers or prove production provider behavior. No hosted database was read or mutated for this audit. The local test cluster was stopped after completion. Migration source files remain unchanged.

Ignored evidence: `output/execution/release09-migration-*.log`, `release09-sql-*.log`, and local init/bootstrap/stop logs in `output/`.

### Secrets and dependencies

The new `verify:source-secrets` scanner inspected **361 current files and 669 historical Git blobs** in its first successful run, checking **five configured credential values** plus common key/private-key signatures. Later audit reruns scanned **371**, then **374 current files** with the same historical/credential counts and passed. The final run after the consolidated report was saved passed **375 current files**, **669 historical blobs** and **five configured values**. These are recorded scan snapshots. Missing/unconfigured credential values cannot be searched as actual values.

Source and client scanners now share credential identifiers/signatures. A fresh client scan after the root agent's production build passed on **51 built browser assets and zero public files**, with **five configured credential values**, server credential identifiers and generic key/private-key signatures checked. It inspected `.next/static` JS/JSON/maps/CSS and public files, without scanning server build outputs or printing values.

Fresh full `npm audit` reported **eight high-severity findings, zero critical**, propagated through the braces/glob tooling chains, including shadcn and ESLint. After shadcn's development-dependency reclassification, fresh `npm audit --omit=dev` reported **zero vulnerabilities**. The overall tooling findings remain open. The [primary GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), opened during this audit, lists braces through 3.0.3 with no patched version. npm's proposed shadcn/Next ESLint major downgrades were not applied.

Ignored dependency evidence: `output/release-09-audit.json`, `output/release-09-production-audit.json`. Audit status is time-specific; recheck before Release 1.0.

### Production chunk report

`npm run report:client-bundles` inspected the first completed production build's **50 JavaScript chunks**: **2,212,235 bytes** raw and **659,324 bytes** independently gzip-compressed. The drawer-correction rebuild measured **2,213,535 raw / 659,779 summed gzip bytes**. The final build after the Dashboard grid correction retains **50 chunks**, measuring **2,213,535 raw / 659,783 summed gzip bytes**; the largest chunk remains **415,437 raw / 99,566 gzip bytes**. These sums cover the whole build, not one route's transferred JavaScript; actual request/encoding measurements must be recorded separately. Maps, CSS, server outputs and public media are excluded. Reproducible evidence is ignored `output/release-09-bundles.json`.

Largest eight chunks captured from the earlier build snapshot:

| Chunk under `.next/static/chunks/` | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| `3dcqr23yl_xp9.js` | 415,437 | 99,566 |
| `12_celfi3iros.js` | 227,963 | 71,334 |
| `1-1tx8wja1hrs.js` | 145,120 | 48,353 |
| `0edte-771726v.js` | 129,338 | 34,775 |
| `0cz1d0mv5g_q7.js` | 112,594 | 39,627 |
| `0ovaiybrohzxa.js` | 68,546 | 16,929 |
| `2yer83fi2weos.js` | 65,373 | 18,365 |
| `1qgg6qnfd71vu.js` | 53,676 | 14,282 |

## Remaining limits and release gates

- Live Trigger scheduling, browser-independent continuation, interruption/redelivery/recovery and follow-up draft preparation remain the prior Release 0.7 acceptance gap. Current Gmail grant is send-only; no fresh mailbox consent or incoming-reply test was performed. HubSpot live OAuth/create/update verification remains open. Missing exact pricing remains unknown.
- Local helper auth/RLS tests verify migration behavior, not hosted Auth settings, deployed grants or project configuration. Release 1.0 must verify those on its target database without resetting data.
- Operational workflow/company/lead/strategy lists retain a 1,000-record window; execution display history retains 200. Activity has server paging, but offset pages can shift if new events arrive. Stable keyset paging and broader list paging are future volume-driven work. Windowed legacy evidence may be unavailable; immutable Release 0.8 snapshots and full-cohort Intelligence remain authoritative.
- Approval/execution and reconciliation now use exact saved IDs, so UI history caps cannot discard their permission/result evidence. Runtime readers retain their configured 1,000-row maximum; exceptionally large histories still need dedicated fair paging without changing safety decisions.
- Unknown external outcomes cannot be converted into resend permission. Gmail acceptance does not prove delivery; HubSpot cannot atomically prevent every external-edit race. Cancellation cannot undo an accepted provider operation.
- URL validation is syntactic and research egress is fixed. A future direct webpage fetcher needs resolved-address/redirect controls. Prompt/schema/evidence guards reduce injection risk; they are not a guarantee that all untrusted text is harmless.
- Production secret/key rotation, backups, provider scopes, reachable signed callbacks, hosting duration and controlled end-to-end external smoke tests still require target-environment setup. No Release 1.0 deployment was performed.

Read [security.md](security.md) for the implemented model and retain [Release 0.7](release-0.7-verification.md) and [Release 0.8](release-0.8-verification.md) records as their own historical evidence.
