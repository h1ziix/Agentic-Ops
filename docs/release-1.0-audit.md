# Release 1.0 launch-blocker audit and feature freeze

Started 3 October 2026 (Asia/Qyzylorda), from clean Release 0.9 checkpoint `d89d683`. AGENTS.md, PROJECT.md and the complete Release 0.9 verification checkpoint were read before changes. Repository evidence is authoritative.

Release scope is frozen: verify, harden, deploy, smoke-test and document. No new agents, integrations, infrastructure or product redesign. Improvements unrelated to a launch defect belong in the post-1.0 backlog.

## Initial findings before implementation

| Severity | Finding | Launch disposition |
| --- | --- | --- |
| BLOCKER | Production Vercel/Supabase environment and credentials are not yet verified. No production URL is established. | Verify available configuration; stop at the exact missing external authorization. Never invent credentials. |
| BLOCKER | Release 0.9 did not accept a fresh complete live workflow or controlled Executor cycle. | Repeat code/SQL/mock tests and distinguish them from live acceptance. A controlled mailbox/portal is required for external mutation. |
| HIGH | Trigger worker, signed production callback, browser-independent recovery and live duplicate delivery remain unverified. | Verify configuration and controlled environment before claiming durable automation acceptance. |
| HIGH | Gmail OAuth is send-only; actual incoming-reply acceptance requires an eligible existing read grant. HubSpot owner setup/live acceptance is also open. | Preserve explicit unavailable states; do not silently expand consent or claim a pass. |
| HIGH | Auth callback/sign-up and integration/worker origins use different validation; local origins are not distinguished from a hosted production origin. | Centralize safe origin validation and fail clearly on hosted misconfiguration. |
| MEDIUM | Environment access is distributed across server modules and invalid optional settings can silently fall back. | Reuse domain configuration behind validated server-only access; add a secret-safe launch preflight. |
| MEDIUM | No application security response headers are configured. | Add compatible frame, MIME, referrer and permission protections; avoid a script policy that breaks Next.js. |
| MEDIUM | Eight high development-tooling advisories remain in the baseline. | Reassess compatible fixes; production audit has zero findings. No blind major upgrades. |
| LOW | Model pricing is unconfigured; costs remain unknown. | Document the limitation rather than invent estimates. |

Baseline rerun: 200 unit tests passed, lint passed, production build passed. The initial table above is retained as the pre-implementation record. Final performed evidence is in [Release 1.0 verification](release-1.0-verification.md), [database audit](release-1.0-database-audit.md) and [runtime audit](release-1.0-runtime-audit.md).

## Final disposition

| Severity | Finding | Final state |
| --- | --- | --- |
| BLOCKER | Vercel account/project and production target unverified. | CLI logged out; no linked Vercel project or verified production URL. Owner must authenticate and select the target. Production Supabase/domain/backup/Auth configuration remains open. |
| BLOCKER | Fresh complete controlled approval/Execute/provider-result/replay cycle absent. | Offline invariants and saved-record verification pass; controlled live acceptance remains open. No arbitrary recipient or CRM mutation performed. |
| HIGH | Deployed Trigger continuation/callback/recovery and hosting duration unverified. | Offline worker build/import passes; missing configuration fails clearly. CLI login/project/secrets/target duration and live acceptance remain required. |
| HIGH | Gmail read consent and HubSpot setup absent. | Explicit unavailable/setup states preserved. Eligible permitted read grant, controlled reply and HubSpot owner/portal acceptance remain open. |
| HIGH — fixed deployment compatibility | Intended Vercel target requires a supported Node deployment runtime. | Node 24.x selected; final tests/build run on 24.21.0. No broad dependency upgrade. |
| MEDIUM — fixed execution integrity | Service-only dispatch/completion accepted NULL claim tokens through SQL three-valued logic. | One additive corrective migration fences NULL capabilities and retry intent; inner grants revoked. Reproduced only with approved local mock service-role calls. Fresh/upgrade SQL pass. |
| MEDIUM — fixed runtime correctness | Saved follow-up/retry safety records were selected from capped display history. | Exact scoped safety reads plus 250-newer-record regressions; display history stays bounded. |
| MEDIUM — fixed configuration | Distributed settings and inconsistent origin/public-key/worker validation. | Central reader/preflight, hosted-origin validation, public service-key rejection and 15 config regressions. Trigger build condition fixes server-only import; placeholder project fails explicitly. |
| MEDIUM — fixed browser protection | No configured application response headers. | Compatible frame/MIME/referrer/permissions/CSP headers verified in production HTTP/browser checks. |
| MEDIUM — retained | Reply-scan fairness at larger volumes and development-tooling advisories. | Documented post-1.0: bounded candidates can prioritize unmonitorable plans; eight high dev-only advisories remain, zero production advisories. |
| LOW — documented | Exact model pricing unavailable. | Unknown costs retained; verify dated rates or explicitly accept this limit. |

Final local gate: **218 tests**, lint, typecheck, Node 24 production build, **4 browser tests**, 37 fresh migrations and all nine SQL suites, populated-upgrade preservation and all nine suites, client/source-history secret scans pass. Public demo remains fictional and side-effect-free. These results do not certify deployed Auth/providers/jobs. No final commit/tag is created while launch gates remain.
