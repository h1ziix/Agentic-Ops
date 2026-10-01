# Release 0.6 implementation and verification — 1 October 2026

Implementation is available locally at package version 0.6.0. Initial controlled Gmail sending and internal follow-up persistence are now verified; release acceptance remains open for the other live scenarios, including HubSpot. The initial implementation checks below were recorded on 1 October; subsequent owner setup and execution are recorded separately below. On 2 October the owner requested a source checkpoint and push with these live gates explicitly open. The implementation baseline was the verified 0.5 checkpoint `26260a1`; no deployment was performed.

## Owner Gmail setup — 2 October 2026 (local time)

The owner enabled Gmail API, created a Google Web OAuth client with the localhost integration callback, configured test-user consent and the three required scopes, saved Google credentials locally, and completed consent in Chrome. An explicit one-time local setup generated the missing 32-byte encryption key directly in `.env.local` without displaying its value; this is not a startup fallback.

Read-only database verification at `2026-10-01T22:33:00Z` confirms connected Gmail generation 1 in workspace `0fe43ae9-171b-4f38-9599-d56ec843c6b7`: verified owner actor, required scopes, an AES-GCM versioned credential envelope with the expected nonce/tag lengths, and a workspace-level `integration_connected` event with null workflow linkage. Public Settings shows the connected identity. The ignored report is `output/execution/gmail-connection-verification.json`; no token values were exported. This establishes live initial OAuth connection and persistence, not sending, token refresh, reconnect or disconnect.

The owner selected their controlled Gmail address as the test recipient. Their workflow `5d0393a7-d0b2-453b-817a-3eda4a0e2de8` has saved research and one qualified lead. Preparation was resumed through the authenticated Chrome UI; live Reviewer and Outreach runs completed with 1,471 and 760 recorded tokens respectively. These are owner workflow runs, not mocked/automated tests. The grounded draft was edited into an explicitly identified Russian test message with the owner's selected recipient and Gmail generation 1, then saved as pending executable revision 1. Original AI output and evidence remain in history. `verify:execution` executable mode passed on the pending revision with zero snapshots/attempts/successes. This verifies contract persistence only; exact human review, product approval and separate explicit test-send authorization are still required before dispatch. The ignored review screenshot is `output/execution/gmail-test-review.jpg`.

Chrome console showed hydration attribute mismatches involving browser-injected `bis_skin_checked` and `__processed_*` attributes. This is consistent with an extension altering markup; no application fix or blanket warning suppression was applied. It is a browser-environment observation rather than a fresh clean-console result. HubSpot remains not configured. Historical statements below describe the earlier implementation verification and do not supersede this follow-up evidence.

## Controlled Gmail send — owner-operated, 2 October 2026 (local time)

The owner completed exact revision approval and explicitly executed the test action in the product. The assistant did not initiate a send. Read-only executable verification at `2026-10-01T22:38:22Z` passed: workflow completed, one immutable snapshot, one execution attempt, one success and zero unknown outcomes. Action `efe0fc12-6985-4d9f-bde8-467fb199b8f3` revision 1 is bound to snapshot `dc93b91e-07a4-463e-9406-057e46e23eb7` and Gmail generation 1. Attempt `1b21dbab-2a0a-4310-b7ad-c9929d9b54bb` records `provider_response` verification and Gmail message ID `1a0f99dd78ae336e`.

Chrome refresh retained Executed, exact sender/recipient/content, attempt 1 succeeded, provider message/thread IDs and the explicit Gmail-acceptance wording. Executed action has no edit/Execute control. The owner's message reports the result appeared; independent Sent/inbox inspection was not performed. The ignored refreshed screenshot is `output/execution/gmail-test-result.jpg`. Approval digest, run/audit/task/lead/group consistency passed the verifier. This is a real Gmail acceptance result, not a mocked transport result or a delivery/read guarantee.

HTTP replay/concurrent dispatch remain covered by deterministic automated/SQL checks; no extra send request was made solely to test duplication. Recipient replacement after approval, live refresh/reconnect/disconnect, approved internal follow-up persistence and HubSpot controlled create/update still remain open live checks.

## Follow-up proposal and inbox polish — 2 October 2026 (local time)

Prepared pending internal follow-up action `265ef12d-5628-443b-82a4-8962009e90c5`, approval `362c8840-77dc-4cef-8653-995c2dc19177`, revision 1. It references the successful Gmail attempt, with exact due time `2026-10-03T05:00:00.000Z`, displayed as 3 October 10:00 in `Asia/Qyzylorda`, and an explicit test-only internal note. Native Chrome datetime entry required keyboard segments; the input value and persisted proposal UTC were checked before saving. The proposal persists independently while the core workflow remains completed. Read-only executable verification passed with two actions, one email success and zero saved follow-up plans: plan approval/execution remain pending owner review.

Live inspection found the shared approval inbox counted follow-up proposals as held emails and labelled them drafts/missing recipients. The existing inbox now counts pending email/CRM/plan actions separately, uses action-specific batch labels/icons, and displays the real recipient identity for auxiliary records. Browser desktop inspection confirms 0 emails held and 1 plan held. A 390-pixel DOM/AX check confirmed mobile navigation and no horizontal overflow; full-page Chrome capture at that override timed out, so it is not claimed as fresh mobile visual evidence. The override was reset and a native desktop review screenshot saved at ignored `output/execution/follow-up-review.jpg`.

After this UI correction, lint, TypeScript, 109 automated tests, production build and client-secret verification passed. The fresh secret scan checked 37 browser assets and five configured credential values. Database migrations and SQL were unchanged in this follow-up; earlier SQL results are not presented as a new rerun. HubSpot environment variables remain absent, and the owner needs account/app setup; live CRM verification has not started. Current HubSpot onboarding uses the newer developer platform for new OAuth apps rather than instructions to create a legacy public app.

## Saved internal follow-up — owner-operated, 2 October 2026 (local time)

The owner approved revision 1 and executed the internal plan before the assistant's next action. No additional Execute request was issued. Read-only executable verification at `2026-10-01T22:50:27Z`, after a Chrome page reload, passed with two immutable snapshots, two successful attempts, zero unknown outcomes and exactly one follow-up plan. Email still has its original single successful attempt; the plan attempt `5abb945e-bb37-4723-be93-97705526c56d` records `internal_transaction`, bound to snapshot `6b8e5fb9-2bb2-4f6e-8bb2-088b2560e84b`.

The reloaded approval page retains Executed, attempt 1 succeeded, exact UTC/timezone/note and the explicit saved-plan message. Core workflow remains completed. The refreshed result screenshot is ignored `output/execution/follow-up-result.jpg`. No automatic email or Calendar action was invoked; scheduled dispatch is absent from this release. Cancellation/date replacement and behavior when the future due time arrives were not exercised live. HubSpot account/OAuth setup and controlled create/update remain required.

## Architecture and release boundary

The existing Orchestrator, ApprovalService/Repository, runs/events, workflow/tasks, Supabase membership and RLS remain the foundation. ExecutionService delegates through Orchestrator to a deterministic Executor and fixed-host Gmail/HubSpot adapters. The Executor loads approved envelopes on the server; request bodies contain action/snapshot IDs and an optional explicit retry only. AgentRuntime mutation retry/regeneration is not used.

Strict v2 email, CRM and follow-up contracts retain immutable AI/evidence provenance. Expected revisions protect edits and bulk decisions. Approval snapshots freeze recipient/account/generation/content and actor/time/digest. Approved changes create independently reviewed replacements; historical v1 approvals and loose JSON remain readable without execution rights. No approval performs a provider mutation.

Protected encrypted credentials and single-use OAuth states are separate from connection DTOs. Google uses PKCE/offline code flow and authenticated UserInfo identity; HubSpot uses v3 POST token/introspection. AES-256-GCM has explicit key configuration and workspace/connection/provider AAD. Owner checks are repeated in RPCs. Integration audit extends existing agent_events with nullable workflow linkage and a direct workspace FK.

Checked transactions enforce workflow → action → attempt locks, one active action/workflow, claim fencing, ≤3 attempts and audit before dispatch. HTTP happens outside transactions. Success/result/domain/audit persist together; a lost completion save retries persistence of the same response without another send. Unknown email blocks blind retry. Cancellation retains late confirmed external results. CRM reconciles by canonical email and exact approved fields; internal plans are unique transactional saves. Specialized auxiliary paths preserve completed core tasks.

0.7 infrastructure is absent: no worker/cron, automatic follow-up email, scheduled retry, inbox access/monitoring, webhooks, Calendar, billing or deployment.

## Database changes and targets

Eight new migrations were added after `202610010010_stage5_failure_events.sql`; existing migrations were not edited:

| Migration suffix | Purpose |
| --- | --- |
| 011_execution_events | Separate enum additions |
| 012_integrations | Connections, protected credentials/state, owner/refresh guards, workspace audit |
| 013_executable_approvals | v2 envelopes, lineage/revision edits, immutable snapshots, exact approval |
| 014_execution_runtime | Claims/attempts, dispatch/completion/recovery, aggregation and generic transition guards |
| 015_auxiliary_actions | CRM proposals, internal plans, cancellation and manual email reconciliation |
| 016_execution_recovery_guards | Composite references, generation fencing, checked CRM/follow-up replacement and reconciliation |
| 017_execution_terminal_guards | Terminal siblings/attempt ceiling, blocked account readiness and narrowly scoped recovery |
| 018_internal_plan_recovery | Explicit recovery when an absent transactional plan proves no internal save occurred |

All eight were applied with linked `db push` to the existing **Agents-Ops development Supabase project** (`yyfyxmgnmvpnllfqmbrs`). No hosted reset or seed was used. The full migration chain was also applied to an isolated local PostgreSQL 18 test database `execution_release_final` on loopback port 55432. Its helper auth schema/roles simulate Supabase locally; actual Supabase checks also ran against the linked development project.

Planner, Research, Outreach and Execution rollback SQL suites passed on both targets. The local final rerun used all migrations through 018. Fixtures assert grants/RLS, two-workspace isolation, atomic snapshot/claim/completion/audit, immutable legacy history, unique active/successful operations, replay/fencing, retry bounds, cancellation/late results, generic transition guards, reconnect invalidation and auxiliary/follow-up independence. Provider outcomes in these suites are explicit mock results; no remote calls occur.

## Fresh automated and read-only checks

- `npm test`: **109 passed, zero failed/skipped**. The original 67 tests remain; 42 additional tests cover contracts, deterministic execution, OAuth/crypto/refresh, provider MIME/CRM semantics and bounded same-origin HTTP mutations. All external/paid transports are mocked.
- `npm run lint`, `npm run typecheck`, `npm run build` and `npm run verify:client-secrets`: passed. Production browser asset scan checked 38 assets and three configured server credentials. The five integration secret variables are absent locally, so their actual values could not be scanned; their identifiers and server/client boundaries are checked.
- `verify:research`, strict unchanged `verify:outreach`, and `verify:execution --mode legacy`: passed on untouched 0.5 workflow `885035e5-1332-47c6-8ae4-b4532270a7a2`. Its edited/approved action still has a null recipient, zero executable snapshots and zero attempts; progress is 88% with execution pending. This is preservation evidence, not a v2/provider success scenario.
- Strict `verify:outreach` also passed on untouched rejected workflow `eae3fac4-66d4-46a4-8d47-e056b28b2caa`: one rejected action, completed workflow and no external execution.
- `git diff --check`: passed; `.env.local`, screenshots and generated reports are ignored.

Default executable `verify:execution` is implemented but was not run against a real v2 provider operation: there is no authorized live test result yet. It reads database records only and cannot independently prove Sent content, delivery or external CRM state.

## Browser evidence and polish

Used localhost and the signed-in in-app browser. Real Settings, an existing workflow, grounded approval history and the recipient/replacement editor were inspected. The old approved action displays a legacy/no-recipient execution blocker, with Execute disabled. Refresh retains its actual persisted state. Missing OAuth configuration is visible in Settings with disabled Connect and an explanation.

Inspected 1440, 1024, 768 and 390 CSS-pixel layouts, dark/light appearance, keyboard focus and confirmation cancellation. No horizontal overflow was observed at these widths. Fresh Settings refresh loaded application assets and integration metadata with HTTP 200 and no console warnings/errors; one cancelled `net::ERR_ABORTED` navigation request was observed rather than an HTTP failure. Loading appeared during authenticated navigation.

A temporary development-only page rendered clearly labelled mocked pending/approved, dispatching, retryable-failure, unknown-result, successful-result, CRM-diff and follow-up-review states with nonexistent database IDs. It was used for visual inspection only; no fixture Execute, approval decision or provider action was submitted. The CRM confirmation diff and follow-up form layout/focus were inspected. Native date input automation did not establish a entered/saved date, so browser follow-up persistence is **not** verified. All temporary visual/export routes were deleted before the production build.

The polish pass clarified core versus auxiliary counters, current failures versus historical attempts, recipient identity, missing-integration CTA, independent approvals, full content in bulk review, and explicit duplicate risk after closing an unknown operation. Approved Gmail acceptance is labelled separately from delivery/read confirmation. Mock renders do not establish persistence or live provider behavior.

An actual Settings screenshot is retained locally at ignored `output/execution/release-0.6-settings.jpg`. Responsive overrides were reset and the original dark theme restored.
The isolated local PostgreSQL helper was stopped after verification. The localhost development app remains available for owner setup.

## Remaining acceptance gates and manual steps

Set these variables directly in `.env.local`, never in chat:

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- HUBSPOT_CLIENT_ID
- HUBSPOT_CLIENT_SECRET
- INTEGRATION_TOKEN_ENCRYPTION_KEY (32 random bytes in base64)

Validate `NEXT_PUBLIC_APP_URL`, register the two `/api/integrations/{gmail,hubspot}/callback` URIs and provider scopes described in README, configure Google test users/Gmail API and a controlled HubSpot test portal, then restart the app. The owner must complete consent. OAuth connection/reconnect/disconnect, real token refresh and provider account restrictions remain unverified live.

Use only a controlled test inbox: show exact sender/recipient/subject/body, save and approve the exact revision, obtain separate explicit test-send permission, then Execute. Verify Gmail result/Sent and refresh persistence; replay must not resend. Check recipient replacement/new approval. Use only a controlled test portal/contact for independently approved create then update, canonical contact ID and duplicate absence. Save/approve/execute a future internal follow-up, check persistence/cancellation/date replacement and absence of automatic send. Run executable read-only verification on those saved IDs.

Do not intentionally create an uncertain real send. Deterministic transport tests cover unknown outcomes. Confirmed absence in Sent alone cannot clear uncertainty; explicit closure/new proposal carries duplicate risk and needs new approval.

## Limitations, debt and 0.7 handoff

- Gmail acceptance does not establish delivery/read; RFC Message-ID is not exactly-once deduplication. No mailbox-read scopes were added. Manual Sent confirmation records `user_confirmed`, not API verification.
- HubSpot has no atomic compare-and-swap here; a final external-edit race remains between preview check and write. Unknown results require read-only reconciliation or continued uncertainty. HubSpot remote uninstall is a documented owner manual step after local disconnect.
- Google consent/testing/verification and offline token restrictions are provider controlled. Encryption key backup/rotation and reconnect after key loss need an explicit operational procedure; there is no automated rotation or silent key.
- Research/preparation still depend on the open workflow page. Failed preparation leads remain skipped on resume with no explicit retry. Execution continuation also needs explicit Resume after navigation.
- 0.7 must add background continuation and scheduled recovery/retry without turning dispatch lease expiry into resend permission. Follow-up dispatch requires a new approved email; a saved plan does not authorize a future send. Monitoring/Calendar/webhooks require new permissions and contracts.
- Preserve immutable approval/account generations, cancellation/late-result history, unknown reconciliation evidence and provider limitations when adding durable jobs. Never infer success from a completed run or retry unknown email because a response/save is missing.

Acceptance is intentionally **not marked complete** until the live gates above are resolved. The owner-requested source checkpoint preserves the implementation, migrations and verification evidence; it does not certify completion of the remaining live scenarios.
