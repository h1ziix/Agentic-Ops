# Release 0.8 — Product Intelligence implementation and verification

**Release 0.8 is implemented and verified within the available provider boundary on 2026-10-03.** Persisted strategy, live planning/research, historical snapshots and Product Intelligence were exercised against the linked development project. Existing worker, mailbox-read and pricing prerequisites in section 13 remain unresolved; this report does not certify those external capabilities.

At the start of Release 0.8, the latest source checkpoint was `8b37502` (Release 0.6). Work began from the existing uncommitted Release 0.7 implementation, whose ten additive migrations through `202610020027` were already applied to the linked development project. A read-only migration listing confirmed local/remote agreement before Release 0.8 changes. The initial tree and prior work were preserved. No separate Release 0.7 source checkpoint is implied. The user subsequently authorized a combined Release 0.7–0.8 commit and push; deployment remains outside this request.

## 1. Implemented scope

Local implementation adds a dedicated Intelligence page, cumulative lead funnel, workflow comparison, creation-cohort trends, research quality, opportunity/industry/location/source/strategy segments, agent/model activity and nullable estimated cost. Dashboard keeps its operational role; workflow detail adds compact recorded outcomes. Leads gain URL-backed workflow/ICP/confidence/score/industry/opportunity/outreach/reply/date filters. Companies retain unique workspace profiles and show distinct workflow associations, latest lead assessment, normalized opportunities, confidence and source counts.

Workspace-owned ICP/template management supports create, edit, duplicate, archive and use in workflow. New Workflow combines these sources with an explicit goal. This extends the existing execution architecture; it adds no workflow engine, BI framework, automatic optimizer or external side-effect path. Production intelligence has no fictional demo fallback.

## 2. Database migrations

| Version | Purpose | Verification status |
| --- | --- | --- |
| `202610030000_strategy_events.sql` | Strategy mutation/creation audit vocabulary, applied before dependent functions | Applied locally and to linked Supabase; rollback suites passed |
| `202610030001_sales_strategy.sql` | Workspace-owned strategy, checked CRUD/archive, strategy references, immutable workflow and lead snapshots | Applied locally and to linked Supabase; strategy/authorization/snapshot suites passed |
| `202610030002_intelligence_analytics.sql` | Authenticated security-invoker analytics RPC, display normalization and targeted query indexes | Applied locally and to linked Supabase; aggregate/RLS/isolation suites passed |
| `202610030003_research_dns_root.sql` | Normalize valid terminal DNS root dots consistently with server validation while retaining private-host/IP exclusions | Applied after a real research failure; provider/unsafe-URL regressions and all hosted suites passed |

Supabase dry-run and linked `db push` applied the four additive migrations. A final listing confirmed all **36 local/remote versions agree**. A fresh isolated PostgreSQL database applied all 36 migrations and passed all eight rollback SQL suites. The same eight suites were rerun sequentially against the linked project after migration 003. Hosted data was preserved without reset or seed; test fixtures rolled back. The live URL fix was added as migration 003 rather than changing an already applied migration.

## 3. Metric definitions

Canonical definitions live in [intelligence-metrics.md](intelligence-metrics.md) and the analytics metric domain. One business unit is a distinct company/workflow association. Researched requires saved researched state. Qualification uses the immutable qualification assessment, with documented reliable legacy fallback. Reviewer acceptance, a persisted email draft/approval, immutable action snapshot, successful email attempt and detected reply each provide separate stage evidence.

Zero denominators yield unavailable rates. A completed run or approval never means an email was sent. Message actions, execution attempts, follow-up plans and reply observations have separate operational counts. Detected replies are a recorded lower bound; complete mailbox coverage and reply rate remain unavailable.

## 4. Analytics architecture

The server Analytics Service validates filters and resolves the verified workspace. Analytics Repository invokes `intelligence_analytics_08` with the cookie-bound Supabase client. The RPC explicitly checks membership and uses caller permissions/RLS. Aggregation remains in PostgreSQL; React receives validated compact results, not raw event histories or credentials. Analytics reads emit no domain events.

Business cohorts use workflow creation dates in `WORKSPACE_TIMEZONE` (default `Asia/Qyzylorda`) and retained outcomes to date. Agent/model tables use actual run creation dates. Workspace cost periods have independently labelled activity scopes. Comparison is bounded to the latest 200 workflows and signals truncation; full-cohort aggregates remain database totals.

## 5. Funnel implementation

The cumulative funnel requires all prior evidence for each later stage: researched, qualified, Reviewer approved, draft, approval requested, approved, sent and reply detected. Distinct company/workflow pairs prevent retries, replacement proposals, multiple messages and multiple replies from inflating funnel stages. Reliable operational send records with incomplete old approval history remain visible in message counts without fabricated funnel provenance.

Conversion divides each stage by its prior stage, except reply conversion, which remains unavailable without coverage evidence. Workflow/ICP/template and lead/company filters share this population. Filtering never changes historical lead scores or triggers execution.

## 6. Cost and agent analytics

Release 0.7 saved usage, cost status and pricing version remain authoritative; no retrospective repricing occurs. Total estimated cost is unavailable when any AI run is unknown. Known subtotals and unknown-run counts are shown separately. Executor is deterministic and has no AI cost. Empty/no-observed-cost history is unavailable; a measured priced zero remains zero.

Cost per company/qualified lead/sent unit requires known whole-workflow cost and a positive denominator. Lead/company segmentation cannot attribute shared workflow spend, so those ratios are unavailable under those dimensions. Agent success uses completed/(completed + failed), excluding active/cancelled runs. Duration, retry and correlated tool counts come from persisted run/event metadata. No agent intelligence score is invented.

## 7. ICP architecture

Saved profiles store optional industries, geography, employee bounds, business models, required/preferred/excluded signals and automation focus, plus bounded qualification/target defaults. Zod and database constraints validate them; checked mutations independently verify membership and exact workspace records. Archive preserves history and blocks new source use. Mutation events record actual strategy changes rather than ordinary page reads.

Agents receive the saved compact criteria. Explicit requirements and evidence conflicts can hold qualification/outreach deterministically. This does not dynamically retrain scoring or modify old assessments. Natural-language ICP generation is optional and not required for this implementation.

## 8. Template architecture

Templates retain a default goal, planning/research/outreach guidance, optional workspace ICP and bounded company target. Approval is always required. Follow-up configuration is planning guidance and never grants send permission. Templates invoke the existing Planner with context rather than installing a predetermined parallel task engine.

Only active workspace-owned sources are available for new workflows. There are no silently injected global templates or production sample analytics. Explicit user goals remain authoritative over defaults.

## 9. Historical snapshots

Checked workflow creation freezes selected ICP/template strategy and references atomically. Immutable-field guards prevent later replacement. Editing or archiving a source affects future creation only. Lead research/qualification snapshots retain source evidence, scores, threshold and source identity from that assessment; historical analytics prefer these snapshots and documented exact-workflow saved research fallback.

Mutable workspace company profiles are not used to invent historical segmentation. Original research text remains intact while display normalization derives categories. Companies uses the most recently created lead assessment; editing an older lead cannot promote it to the latest assessment. An unknown latest score remains unknown.

## 10. Tests and build checks

Performed before any Release 0.8 source edits: **160 existing offline tests passed, zero failures/skips; lint, TypeScript and production build passed.** The build emitted only the existing warning about an unrelated parent-directory lockfile.

The latest prospect-filter/workspace-view/workflow-default focused run passed **16 tests**, targeted ESLint passed, and a global TypeScript check passed after the workflow-dialog fixes. Evidence covers combined original ICP/research filters, unknown reply/date/score handling, inclusive UTC lead creation dates, query-preserving drawers, latest-assessment association counts and inherited versus explicit ICP defaults. A persisted positive reply observation is required; `responded` status alone remains unavailable. The dialog preserves explicit custom goal/target edits, follows a changed template's inherited ICP, ignores responses from earlier closed dialog sessions, and locks creation controls while saving. The static 21st review found a missing tab-panel focus replacement, which was fixed. Existing desktop table minimum widths remain inside horizontal scroll containers with separate mobile records.

`output/release-08-audit.log` records **six high-severity package findings and zero critical**, propagating one `braces` advisory through `shadcn → ts-morph → @ts-morph/common → fast-glob → micromatch → braces`; ESLint also depends on the shared glob chain. Source inspection found tooling/CSS use rather than application runtime imports, and the inspected Next server trace manifests include none of these package paths. However, shadcn is declared as a production dependency, so this is not a clean production dependency audit. The [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports no patched braces version as of this review. No dependency versions were changed or forced audit fix run.

Final full offline suite: **186 tests passed, zero failures, cancellations or skips**. `npm run typecheck`, `npm run lint`, `npm run build` and `npm run verify:client-secrets` passed. The client-secret check inspected **42 browser assets for five configured credentials and found none**. `git diff --check` passed with line-ending warnings only. The build retains the existing unrelated parent-directory lockfile warning. Offline tests mock paid/provider calls; the real provider checks below were performed separately.

All eight rollback SQL suites passed locally and on linked Supabase after migration 003: `planner_runtime`, `research_runtime`, `outreach_runtime`, `execution_runtime`, `automation_runtime`, `observability`, `sales_strategy` and `intelligence_analytics`. Their checks cover prior runtime/execution guards, strategy constraints and immutable snapshots, grants/RLS, cross-workspace aggregate isolation, unknown-safe metrics and URL validation. Ignored local evidence includes `output/release-08-tests.log`, `output/release-08-build.log`, `output/release-08-local-migrations.log` and the audit log above.

## 11. Live end-to-end and browser verification

Authenticated UI verification created an ICP with minimum score **65** and a template with target **1**, then created workflow `bdef74ed-3c5e-4072-b7d8-17eef58660da` from the combined goal/template/ICP. The real Gemini Planner ran. Company research persistence initially failed in `complete_research_task_run` with SQL `22023`: Tavily supplied `https://rekassa.kz.` with a valid terminal DNS root dot accepted by TypeScript but rejected by the SQL validator. Migration 003 aligned safe URL normalization; provider/unsafe-URL regressions were added. The normal UI retry recovered to **one researched company, one qualified lead, score 75, Reviewer acceptance and eight runs**. The workflow completed without a draft, approval or external action, respecting its research-only goal.

The ICP was edited to minimum score **75** plus a merchant signal; template guidance was also edited. Workflow `5235ee7e-1c70-45d2-a21c-932d16c0508f` was created using the updated ICP alone, with no template. Real research produced **one researched company, one qualified lead, score 82 and eight runs**; Reviewer and Outreach produced **one draft awaiting approval**. Approval and sending were not performed. Refresh retained both workflows and strategy records. UI duplicate/archive operations were exercised for both an ICP copy and template copy; domain audits confirmed one create, update, duplicate and archive for each strategy type, plus two ICP-linked and one template-linked workflow creations.

Database checks confirmed the first workflow still holds minimum **65** and the original template guidance; the second freezes minimum **75**. Source edits did not alter the earlier workflow, its assessment or its displayed outcomes. Intelligence and workflow detail read these persisted records.

Browser verification covered Dashboard, Intelligence, Workflows/detail, Leads, Companies, ICPs, Templates and New Workflow at actual CSS widths **1440px, 1280px, 768px and 390px**. `document.scrollWidth` never exceeded `innerWidth` in these checks. Dark and light screenshots were visually inspected and polished, then the original dark theme was restored. At 390px, keyboard ArrowRight scrolled the comparison table from **0 to 53.3px**. Strategy forms, saved snapshot details, keyboard Escape, explicit-goal priority and query-preserving list/drawer behavior were exercised. Intelligence Today, 7-day, 30-day, 90-day and all-history ranges were checked, including combined ICP/template filters and a score-100 empty result without fabricated rates for zero denominators.

After `npm start`, production Dashboard, Workflows, Leads, Companies, ICPs, Templates and both new workflow detail/outcome panels were verified. A single-workflow Intelligence filter returned **one researched unit, one qualified unit and score 75**. The final fresh production Intelligence reload had a complete CDP window of **54 events** (`truncated=false`, `hasMore=false`), **zero runtime exceptions, zero console errors, zero HTTP statuses ≥400 and zero non-canceled network failures**. Nine refresh requests were browser-canceled. An earlier broad-navigation cursor was truncated and is not represented as a complete clean log.

A genuinely empty isolated authenticated analytics RPC result was temporarily rendered in a clearly labelled development QA route: **No history**, four zero activity counts, **Unavailable** estimated cost and unavailable rates. This exercised empty-state presentation without inserting production seed data; the temporary route was deleted. Ignored screenshots are `output/playwright/release08-intelligence-dark.jpg`, `release08-intelligence-light.jpg`, `release08-intelligence-mobile.jpg` and `release08-empty-intelligence.jpg` in the same directory.

One live analytics read returned a **503 timeout while hosted rollback DDL and live browsing ran concurrently**; a fresh reload recovered. Standalone authenticated-role RPC checks after that DDL completed measured **798.8ms** for the first workflow, **575.9ms** for the second, **150.2ms** for the workspace 30-day scope, **85.2ms** for Today and **99.5ms** for all history, with no timeout. These are database RPC timings on the current small dataset, not browser request latency or larger-volume capacity claims; no timeout settings were changed. The transient 503 remains recorded separately.

Earlier Release 0.7 provider/browser evidence remains in its own report as preservation context. This Release 0.8 session sent no email or CRM mutation and added no recipient authorization.

## 12. Database cross-checks

Independent authenticated database comparisons in workspace `649e4d1f-a863-44a3-9901-5457eebf5814` matched the displayed Intelligence and compact workflow outcomes for the two new workflows and historical workflow `885035e5-1332-47c6-8ae4-b4532270a7a2`. The historical comparison held **two researched units, two qualified units, mean score 83 and 11 runs**, with one historical draft/approval request but no current pending, approved, sent or reply count. All six direct/RPC reconciliations passed. New workflow values are recorded in section 11. Checks compared recorded run/agent/model activity and preserved strategy snapshots, not example seed expectations.

For the authenticated workspace after both live workflows, **all-history and 30-day workflow cohorts** both showed **12 researched company/workflow units, 10 qualified units and average score 74.7**. Workspace run activity was **98 runs**, with **16 today**. Successful email actions and detected reply observations were both **0**. All **98 runs were unpriced**; total estimated cost was **null/Unavailable**, and no known subtotal was displayed as zero. These displayed values matched direct database counts.

The Today cohort independently matched **two researched units, two qualified units, average score 78.5, 16 runs and one pending approval**. The timing/aggregate snapshot was taken at **2026-10-03 14:08:05 UTC**; Today starts at **2026-10-02 19:00 UTC** in `Asia/Qyzylorda`. Safe direct/RPC and timing evidence is retained locally under `output/execution/release-08-final-authenticated-timing.log`, `release-08-existing-crosscheck.log`, `release-08-final-hosted-*.log` and `release-08-final-hosted-migrations.log`.

The 30-day agent activity cross-check matched these persisted counts:

| Agent | Runs | Completed | Failed |
| --- | ---: | ---: | ---: |
| Planner | 12 | 9 | 3 |
| Researcher | 76 | 47 | 29 |
| Reviewer | 7 | 6 | 1 |
| Outreach | 3 | 3 | 0 |

Model groups matched **91 `gemini-3.5-flash-lite`, two `gemini-2.5-flash`, two `gemini-3.8-flash` and three `gpt-4.1-mini` runs**. The recorded known token subtotal is **320,029**, with **25 runs lacking usage**; it is not labelled complete usage. These are observed model identities from history, not model recommendations or added configuration.

Companies showed **16 unique canonical company profiles, six currently researched**. This differs intentionally from the **12 researched company/workflow associations** in Intelligence: the same company can have separate research evidence in multiple workflows. Action and reply-observation counts were compared separately from funnel company/workflow units.

Missing exact model prices were verified as unavailable; no `$0.00` estimate, reply-coverage assumption or synthetic provider result was introduced.

## 13. Known limitations

At inspection, Trigger project/key/signing configuration and exact model pricing were absent. Current Gmail consent is send-only. Live Release 0.7 worker scheduling/recovery and incoming-reply monitoring therefore remain open; no extra consent or provider setup is silently performed. HubSpot live setup also remains an existing external prerequisite. Missing pricing prevents complete AI cost estimates; current legacy history contains unknown telemetry/evidence.

Reply detection counts positive persisted observations only. The Leads view marks absent observations unavailable; it does not infer no response from missing data or an old unchecked state. Workflow comparison is bounded and labelled. Existing operational entity lists retain their repository/database record windows; Intelligence summary aggregates cover the full permitted cohort. Optional export/AI ICP narrative and enterprise strategy lifecycle are outside the necessary scope.

## 14. Technical debt

Retain the documented Release 0.7 provider/hosting/retention and failed-preparation recovery debt. Historical missing snapshots/pricing cannot be reconstructed from current mutable profiles. Fair pagination for operational records, larger-cohort query measurement and explicit archive-default replacement UX should be assessed as actual volume grows. Database aggregation and unknown-state labels must remain consistent if new providers/models are added.

Track the unresolved braces tooling advisory and reassess when an upstream compatible fix is available. Review whether the shadcn CLI belongs in development dependencies separately; the present release does not alter dependency classification or versions.

No retention scheduler deletes audit or approval history. External mutation gates, unknown-outcome recovery and exact account generations remain authoritative.

## 15. Release 0.9 handoff

Build portfolio/onboarding/deployment polish only in its separately requested release. Preserve metric semantics, versioned pricing, cohort/activity distinctions, workspace authorization and immutable snapshots. Do not use visual examples to fabricate production analytics or convert template/follow-up guidance into authorization. Complete the recorded provider live gates before claiming full automation/reply acceptance.

This release makes no automatic strategy, prompt, scoring, sending-volume, model or approval-policy optimization. Human decisions remain separate from observed intelligence.
