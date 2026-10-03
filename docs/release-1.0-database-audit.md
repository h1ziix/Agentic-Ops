# Release 1.0 database and workspace-security audit

Date: **3 October 2026**, `Asia/Qyzylorda`. Committed baseline: **`d89d683`**, Release 0.9. AGENTS.md, PROJECT.md and the complete Release 0.9 verification checkpoint were read before work. This audit uses source review and isolated local PostgreSQL; it does not certify a hosted Supabase project or authorize a launch.

**All 37 migrations and all nine rollback SQL suites pass locally, both on a fresh database and after upgrading a populated copy of the unchanged 36-migration Release 0.9 schema.** One service-only SQL capability-fencing gap was reproduced and corrected with an additive migration. No committed migration was edited, and no hosted database mutation, paid model request, email, CRM mutation or new OAuth consent was performed. One saved hosted workflow was subsequently read to diagnose the verifier mode described below.

## Ranked finding and correction

| Severity | Finding | Result |
| --- | --- | --- |
| P2 — service-only execution integrity | `dispatch_execution` and `finish_execution` inherited `t.claim_token <> p_claim`. A NULL argument makes that comparison NULL, so PL/pgSQL did not reject the missing capability. A local approved mock action reached `succeeded` through NULL dispatch/completion arguments. Browser roles cannot invoke these RPCs, and the current Executor generates UUID claim tokens; no user-route exploit was demonstrated. | Corrected by `202610030004_execution_claim_fencing.sql`. Service-only entry points reject NULL capabilities before delegating to the existing checked implementations. `claim_execution` also rejects NULL retry intent so SQL three-valued logic cannot substitute for explicit retry permission. |

The pre-fence implementations are renamed and have execution privileges revoked from PUBLIC, anon, authenticated and service_role. The public entry-point signatures, defaults, actor checks, workflow/action locks, exact immutable approval snapshots, successful replay, retry ceilings and unknown-outcome handling remain intact. The migration contains no data-changing statement.

`supabase/tests/execution_runtime.sql` now checks missing claim input, missing retry intent, NULL/wrong dispatch and completion capabilities, rejected result persistence after dispatch, rejected successful replay with a NULL capability, unchanged state/audit history after fencing, and the private inner-function grants. All original execution invariants still pass.

## Performed database checks

PostgreSQL **18.4**, installed locally, was bound only to `127.0.0.1:55440`. Synthetic Supabase roles and auth helpers were installed in an isolated cluster. The cluster was stopped after the checks and its evidence moved into ignored `output/execution/release10-db/`.

| Check | Actual result |
| --- | --- |
| Release 0.9 baseline | All **36** committed migrations applied in filename order; all **nine** existing rollback suites passed before the correction. |
| Migration history preservation | Each original migration's Git blob matches `d89d683`; exactly **one** new versioned migration is added. |
| Fresh Release 1.0 schema | All **37** migrations applied in order to `release10_fresh`; all **nine** rollback suites passed. |
| Populated 0.9 upgrade | Independently applied the 36 original migrations to `release10_upgrade`, persisted synthetic workspaces, membership, OAuth states/connections/credentials, research-derived draft fixtures, exact approvals and a mocked successful execution, then applied migration 37. Row counts and deterministic content digests for **all 23 application tables** were unchanged. All **nine** rollback suites passed afterward. |
| RLS | All **23** public application tables enable RLS. Browser-visible workspace tables use membership policies; profiles use the verified user's ID; credential/state/cache tables remain unavailable to browser roles. |
| Definer functions | Final security-definer functions use an empty fixed `search_path`. Runtime/provider writers are service-only; intended authenticated RPCs repeat membership checks. Renamed pre-fence entry points cannot be called directly by the runtime role. |
| Browser grants | No anon application-table grant. OAuth credentials/state and execution/automation claim-token columns are unavailable to browser roles. Direct workflow, approval and audit-history deletion remains denied. |
| Observability / Intelligence | Observability view retains `security_invoker=true`; Intelligence remains an authenticated security-invoker read with workspace filtering and membership validation. |
| Local seed | In a rollback transaction, synthetic authenticated bootstrap + seed creates **three** fictional workflows. Repeated seeding is idempotent, and **zero** seeded proposals have executable schema version 2. The public `/demo` uses its independent fixture rather than this database seed. |
| Saved historical execution records | Read-only `verify:execution` passes for `885035e5-1332-47c6-8ae4-b4532270a7a2` with `--mode legacy`: one schema-v1 proposal, `ready_for_execution`, zero snapshots, attempts or follow-up plans. The initial default-mode failure was the explicit requirement for a v2 action, not a consistency defect. Historical content approval remains blocked from provider execution. |

The nine suites are `planner_runtime`, `research_runtime`, `outreach_runtime`, `execution_runtime`, `automation_runtime`, `observability`, `sales_strategy`, `intelligence_analytics` and `security_audit`. They exercise workspace isolation, guarded state transitions, immutable approval and strategy history, execution replay/fencing/recovery, cancellation, independent follow-up approvals and unknown-safe analytics.

An initial populated-upgrade suite trial collided with the execution test's fixed OAuth-state hash in the retained mock records. The synthetic upgrade fixture was given separate test hashes, and the complete populated upgrade plus all nine suites was repeated successfully. This was a local fixture collision, not a product migration failure; the initial log is retained.

## Application authorization review

`requireUser` verifies identity through Supabase `getUser`; `requireWorkspace` validates the workspace UUID and performs a cookie-bound RLS read. Workflow, company, lead, approval, execution, integration, automation and strategy repository reads include workspace scope. Exact execution/snapshot/attempt safety reads are independent of bounded display windows.

Privileged clients are server-only and constructed after cookie-bound authorization or signed worker authentication. Service-only SQL entry points independently verify the supplied actor's workspace membership; integration connect/disconnect and consent consumption require ownership. OAuth state is one-use, bound to the verified user, provider and browser/session, and expires. Approval decisions and Execute remain separate; execution consumes persisted approval snapshots and never accepts a client-written execution envelope.

Some cookie-bound RPC services pass an entity ID directly after authorization and rely on the RPC's repeated membership check. A nonmember cannot mutate or read the referenced workspace through those RPCs. This review found no demonstrated cross-membership IDOR, approval-to-execution bypass or browser credential/claim-token access after the correction. This is a scoped code/local SQL audit, not an independent penetration test.

## Evidence and deployment prerequisites

Ignored evidence under `output/execution/release10-db/` includes:

- `migration-manifest.json`, `migration-inventory.txt`, `catalog.log` and `final-catalog.log`.
- `null-fence-repro.sql` and `null-fence-before.log`, recording the pre-fix mocked `succeeded` result with a NULL capability.
- `release10_fresh-migration-*.log` and `release10_fresh-test-*.log`.
- `upgrade-populated-fixture.log`, `upgrade-populated-before.log`, `upgrade-populated-004.log`, `upgrade-populated-after.log` and `release10_upgrade-test-*.log`.
- `final-seed-check.log`, local bootstrap/start logs and `stop.log`.

The upgrade proves preservation of local synthetic records on this exact schema. It does not prove migration compatibility with undocumented hosted drift, hosted Auth configuration, Supabase role/default-privilege differences or production data volumes. Migration 37 has **not** been applied to a hosted project.

Before launch, verify the target project's applied migration history, grants/RLS, view invoker settings and RPC exposure using non-destructive inspection; take and validate a backup; preserve the integration encryption key and credential-recovery procedure; apply the additive migration through the approved deployment process; and exercise two-user/two-workspace access with controlled target accounts. Retain the separate Trigger, mailbox-read consent, HubSpot, pricing and fresh exact approval/Execute acceptance gates in the [Release 1.0 checklist](release-checklist.md) and [deployment runbook](deployment.md).
