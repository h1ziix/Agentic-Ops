# Release 0.9 — Portfolio / Production Polish verification

Date: **3 October 2026**, `Asia/Qyzylorda`. Starting checkpoint: **`f1cf331`**, the combined Releases 0.7–0.8 checkpoint. AGENTS.md, PROJECT.md, TASK.md and the full Release 0.9 request were read before implementation. The clean starting tree and prior verification records were preserved.

**The local Release 0.9 implementation passes the recorded code, isolated database and offline demo checks. Full live external acceptance and Release 1.0 production launch remain open.** A saved authenticated workflow was inspected read-only; no fresh complete live research → approval → external execution → reply cycle was accepted during this release. The public demo is explicitly fictional historical state with local interactions, not evidence of provider execution.

No migration history was edited. No hosted database write/reset/seed, paid AI run, external execution, new OAuth consent, source commit, push or deployment was performed for this release. The production test server used port **3001**; the pre-existing port-3000 server was left alone.

## Recorded verification evidence

| Check | Result and scope |
| --- | --- |
| `npm test` | **200 passed, 0 failed, 0 skipped**; paid APIs and provider mutation transports mocked |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed production build |
| `npm run test:e2e` | Final grid-aware run: **4 passed in 41.5 seconds**; 13 demo screens × 6 widths = **78 route/viewport cases**, plus interactions below |
| Database migrations | All **36** applied in order to an isolated PostgreSQL **18** cluster on loopback port **55439**; migration source unchanged |
| Rollback SQL | All **9** suites passed sequentially: eight preserved domain suites plus `security_audit` |
| RLS/grants | All **23** public application tables have RLS; fixed definer search paths and restricted grants checked locally |
| Source/current/history secret scan | Passed observed final scan of **375 current files**, **669 historical Git blobs** and **5 configured secret values**; values never printed |
| Client-secret scan | Passed **51 browser assets**, **0 public files**, **5 configured secret values**, credential identifiers and generic signatures |
| Production dependency audit | **0 findings** with `--omit=dev` |
| Full dependency audit | **8 high, 0 critical** in existing development-tooling chains; retained advisory below |
| Local HTTP boundaries | Unauthenticated history **401**; forged workspace query **400**; unsigned dispatch **401** |

Scan counts describe the observed command snapshots, not an invariant file count. Missing/unconfigured credential values cannot be searched as actual values. SQL used local synthetic Supabase roles/auth helpers and transaction-rollback fixtures; it establishes migration invariants, not hosted Auth or deployed project configuration.

The nine SQL suites are `planner_runtime`, `research_runtime`, `outreach_runtime`, `execution_runtime`, `automation_runtime`, `observability`, `sales_strategy`, `intelligence_analytics` and `security_audit`. The isolated cluster was stopped after verification. Detailed findings/evidence locations are in [security/server audit](release-0.9-security-audit.md), [product audit](release-0.9-product-audit.md) and [UX audit](release-0.9-ux-audit.md).

## Browser evidence

Manual in-app browser/CDP inspection covered all thirteen major authenticated screens: Dashboard, Workflows, workflow detail, Companies, Leads, Approvals, Activity, Automation, Intelligence, ICPs, Templates, Settings and onboarding. The recorded passes cover **1440 desktop**, **1280 laptop in dark mode** and **768 compact in dark mode**. The unauthenticated sign-in form was inspected at those three widths without submitting credentials. First-run/empty and loading experiences were inspected. No document overflow or meaningful console error was observed in these passes.

The four Playwright tests cover `/demo/dashboard`, workflows/list/detail, companies, leads, approvals, activity, automation, intelligence, ICPs, templates, settings and onboarding at **1920, 1440, 1280, 1024, 768 and 390** widths. They check demo labels, a visible single main heading, document overflow, runtime exceptions and absence of operational API requests.

Interaction coverage includes keyboard palette search, company drawer opening/Escape, local draft creation and refresh persistence, local draft edit/save/reset, simulated approval/confirmation, local decision refresh persistence/reset, dark theme, reduced motion, missing workflow and unknown route navigation. These flows emitted no operational API request or POST mutation. The reduced-motion test observed no running document animation on the sampled workflow page. This is focused smoke coverage, not an exhaustive accessibility or browser compatibility certification.

Manual CDP interaction checks also exercised sample lead Enter/Escape, keyboard stage expand/collapse with focus restoration, workflow-scoped Activity filtering and the helpful zero-error empty state. A drawer focus-return defect was found and corrected in both entity drawers. The fourth regression passed after the correction, covering focus/filter/mobile-menu behavior; a fresh manual lead Enter/Escape check also returned focus to its lead button. The full 200-test/lint/typecheck/build checks were rerun successfully after the drawer fix.

An earlier stable-screenshot rerun passed all four tests in **41.9 seconds**, including direct-link drawer fallback focus. Reviewing those settled captures found a real Dashboard defect: the eight-stage fixture met a seven-column pipeline, leaving Executor alone on a second row. The desktop pipeline was corrected to eight columns while preserving four mobile columns. The final grid-aware rerun passed **all four tests in 41.5 seconds**, including the 78 route/width cases and one-row geometry assertions from 768px upward. Manual in-app reload confirmed all eight stages in eight columns. This is a targeted visual correction; no workflow state or architecture changed.

All six final captures were reviewed after animations settled. The original light preference was restored, viewport overrides were reset and the final observed warning/error console lists were empty. No source changed after the last grid-aware production build. The current local production-build server remains runnable on port3001; this is not a deployed production environment.

For a controlled local error test, only `localhost:3001/api/history` was temporarily blocked through CDP. Activity displayed **Event history unavailable**, safe retry guidance, a **Retry history** control and unavailable counts rather than zeros. The block was removed; Retry recovered the real first page of **100 events** without meaningful warning/error console messages. All network blocks were removed. This verifies local history-network failure/recovery, not live provider expiry or every server error.

## Checkpoint report — 21 requested topics

| # | Topic | Delivered result and limit |
| --- | --- | --- |
| 1 | UI/UX | Preserved compact operational design; clearer workflow stages/statuses, next decisions, activity summaries, metric definitions, latest company assessment and truthful Settings/strategy copy. Settled screenshots caught and corrected an eight-stage Dashboard pipeline wrapping Executor in a seven-column grid. No major redesign. |
| 2 | Motion/interaction | Restrained transitions, keyboard-operable stage inspection, palette/drawer behavior, focus restoration and reduced-motion support; no fabricated live progress. |
| 3 | Onboarding | Targeting panel plus existing workflow dialog/action and optional saved ICP/template. Immediate-session sign-up opens `/onboarding`; sign-in/confirmation open Dashboard, which renders first-run content when no workflow exists. New real execution was not run solely for onboarding verification. |
| 4 | Demo architecture | Public `/demo` layout uses independent browser DemoStore and namespace-aware links; authenticated APIs keep their normal server authorization. No Supabase seed or provider adapter is used for sample actions. |
| 5 | Demo data/behavior | One versioned fictional three-company showcase with `.example` contacts, sample tasks/research/reviews/drafts/runs/history, fixture-derived outcomes and a static follow-up explanation. New goals stay local drafts; reset/persistence are exercised. No live timer/job or invented token/cost measurement. |
| 6 | Accessibility | Semantic headings/status text, labels, visible focus, keyboard controls, Base UI overlays, scrollable data regions, Escape and reduced motion. Focused checks passed; full WCAG/assistive-technology audit was not performed. |
| 7 | Performance | Bounded display histories, exact-ID safety reads independent of list windows, Activity server paging, streaming provider-response ceiling and dependency cleanup. Whole-build chunk measurements are below; no load/scaling benchmark is claimed. |
| 8 | Security | Cookie-refresh coverage, exact action/snapshot reads, one-MiB streamed provider JSON bound and secret scans. Fixed provider egress, untrusted-evidence validation and safe logging were reviewed. No penetration-test/certification claim. |
| 9 | RLS/authorization | Local 23-table RLS, grants/definer search paths, two-workspace and protected-operation suites passed. Hosted production verification remains Release 1.0 work. |
| 10 | External-action safety | Separate approval/Execute, exact immutable revisions/generations, fenced attempts, successful replay and uncertainty preserved. Source/mock/SQL regression checks passed; no new email or CRM mutation was made. |
| 11 | Documentation | Added architecture, agents, security, demo, case study, deployment, release checklist and audit/verification documents; prior reports preserved. |
| 12 | README | Rewritten as product entry with sample screenshot, features, diagram, stack, approval model, local setup, migration/job/test instructions and honest status. |
| 13 | Architecture docs | Actual frontend/services/Supabase/Orchestrator/AgentRuntime/typed agents/Executor/automation/Intelligence described with Mermaid; no runtime rewrite or invented SDK deployment. |
| 14 | Demo/case study | Reproducible three-minute sample walkthrough and engineering tradeoffs; sample, mocked, local SQL and live evidence separated. Six labelled screenshots linked below. |
| 15 | Deployment readiness | Environment/callback/worker/domain/smoke/rollback runbook and checklist prepared. Target Vercel/Supabase/domain/OAuth environment not deployed or certified. |
| 16 | Tests | 200 offline unit tests, lint, TypeScript, production build, four Playwright tests and nine isolated SQL suites pass. Production audit clean; development advisory retained. |
| 17 | Browser QA | Thirteen authenticated screens at 1440/1280/768, auth form at the same widths; 78 demo screen/width cases and focused interaction smoke. No observed document overflow/meaningful console error. |
| 18 | Known limitations | Trigger live setup, eligible Gmail read grant/incoming reply, controlled HubSpot acceptance, exact pricing and fresh complete external walkthrough remain open. No unconfigured capability is represented as a pass. |
| 19 | Technical debt | Bounded operational windows, offset-page shifts, larger-history paging, historical usage/evidence gaps, retention/admin deletion policy, hosting duration and provider reconciliation/CRM race limits. Existing braces tooling advisory below. |
| 20 | Exact Release 1.0 blockers | Configure/verify target environment, worker and callbacks, controlled OAuth accounts/permissions, pricing or explicit unknown-cost acceptance, production RLS/backup/rollback and authorized live smoke. |
| 21 | Recommendation | Use [release checklist](release-checklist.md) as a gated launch runbook, retain evidence for each environment, and complete controlled provider tests before claiming live automation/reply acceptance. Release 1.0 requires separate authorization. |

## Final verification mapping — 45 requested checks

**Verified** means the stated scoped check ran. **Partial** means only source/mock/local/sample/saved-record coverage exists or some requested scenarios remain open. **Deferred** means target-environment/live work was not run. These labels do not certify the entire feature or production system.

| # | Requested check | Outcome | Evidence / limit |
| --- | --- | --- | --- |
| 1 | All tests | Verified | 200 offline passes; 0 fail/skip |
| 2 | Lint | Verified | Full lint pass |
| 3 | TypeScript | Verified | Full typecheck pass |
| 4 | Production build | Verified | Build pass |
| 5 | E2E smoke | Verified | 4 public demo tests; no live provider/auth submission |
| 6 | Migrations | Partial | All 36 in fresh local PostgreSQL; target hosted application deferred |
| 7 | RLS | Partial | 23 tables, grants and isolation local SQL pass; production project deferred |
| 8 | Security audit | Verified | Source/secret/HTTP/local SQL audit; no independent penetration test |
| 9 | Approval safety | Verified | Source, unit/SQL and demo no-mutation checks; no fresh real approval |
| 10 | External execution safety | Partial | Preserved Executor/mock/SQL invariants; new live provider action not run |
| 11 | Automation still works | Partial | Unit/SQL, saved/setup UI and static demo story; live Trigger gate open |
| 12 | Analytics matches data | Partial | Local aggregate/normalization/snapshot tests and live page inspection; prior Release 0.8 direct database cross-check retained, no new complete live outcome |
| 13 | Onboarding | Partial | Live route/empty-workspace presentation and demo draft creation verified; fresh authenticated creation cycle not run |
| 14 | Demo mode | Verified | All 13 sample screens and local flows |
| 15 | Demo safety | Verified | No executable sample snapshot/envelope; no API/POST in smoke; local-only state |
| 16 | Empty states | Verified | First-run/sparse/setup states inspected; focused scope |
| 17 | Loading states | Verified | Route/form/history loading inspected and source checked; no broad slow-network benchmark |
| 18 | Error states | Verified | Local history-network block showed safe unavailable/retry state and recovered 100 events; provider expiry/general server failures retain source/regression coverage, not new live acceptance |
| 19 | 404 | Verified | Missing demo workflow/unknown route retain navigation |
| 20 | Accessibility | Partial | Semantics/focus/labels/status/scroll/overlay inspection; no full standards certification |
| 21 | Keyboard navigation | Verified | Palette, drawer Escape, forms and stage controls in focused checks |
| 22 | Reduced motion | Verified | Source honors preference; sampled page has zero running animations |
| 23 | 1920 layout | Verified | All demo routes automated; authenticated 1920 not independently inspected |
| 24 | 1440 layout | Verified | Demo automation and authenticated/auth manual desktop |
| 25 | 1280 layout | Verified | Demo automation and authenticated/auth manual laptop dark |
| 26 | 1024 layout | Verified | All demo routes automated; authenticated 1024 not independently inspected |
| 27 | Narrow viewport | Verified | Demo 390/768 automated and authenticated compact768; live390 not independently inspected |
| 28 | Charts | Partial | Live Intelligence/sample funnel inspected and metric tests pass; exhaustive chart interaction/data scenarios not rerun |
| 29 | Tables | Verified | Major route layouts, sample scroll/overflow and live compact inspection |
| 30 | Dialogs/drawers | Verified | Company drawer, local workflow/approval dialogs and focus/Escape smoke; provider-specific paths not all exercised |
| 31 | Command palette | Verified | Search/keyboard selection retains demo namespace and opens company |
| 32 | README | Verified | Rewritten, setup/claims/relative links audited |
| 33 | Architecture docs | Verified | Code-grounded architecture/agent contracts and diagrams |
| 34 | Security docs | Verified | Implemented controls, performed audit and limits documented |
| 35 | Demo docs | Verified | Fixture/reset/walkthrough/smoke/screenshot guide matches source |
| 36 | Case study | Verified | Concrete engineering tradeoffs without live/certification overclaim |
| 37 | Deployment docs | Verified | Preparation runbook; no deployment performed |
| 38 | Release checklist | Verified | Environment-specific unchecked launch gates |
| 39 | `.env.example` | Verified | Every `process.env` configuration name documented; `NODE_ENV` framework-managed |
| 40 | No unfinished user screens | Partial | No obvious unfinished screen in inspected routes; config/unknown/sample states intentionally remain explicit |
| 41 | No obvious dead buttons | Partial | Focused navigation/form/decision/reset controls work; setup-gated live provider controls not exercised |
| 42 | Browser console | Verified | No meaningful console/runtime error in recorded manual/demo passes |
| 43 | Network failures | Partial | Demo no-operational-request checks, expected 401/400 boundaries and local blocked-history recovery pass; external/deployed network acceptance deferred |
| 44 | Full agent workflow regression | Partial | Prior suites retained; saved workflow inspected; fresh complete live cycle not accepted |
| 45 | Bundle/performance | Partial | Whole-build chunks measured and meaningful read/buffering fixes; no route-transfer/load/production database benchmark |

## Controlled live walkthrough mapping — 21 requested steps

This release did **not** run a fresh controlled external cycle. Existing saved live records, local regression proof and fictional demo illustration are distinguished below. “Inspected” means read-only observation, not re-execution.

| # | Step | Actual outcome |
| --- | --- | --- |
| 1 | Sign in | Existing authenticated session inspected; sign-in UI checked unauthenticated without new submission. Fresh sign-in cycle not run. |
| 2 | Complete/inspect onboarding | Live route and first-run presentation inspected; sample draft flow exercised. No new real workflow created by this check. |
| 3 | Create/select ICP | Existing live library/selection inspected; saved-strategy unit/SQL regressions pass. Fresh live CRUD not run. |
| 4 | Select template | Existing template/library and dialog inspected; source/local strategy tests pass. Fresh live combined selection not run. |
| 5 | Create workflow | Browser-only demo draft created/refreshed/reset; fresh authenticated creation not run. |
| 6 | Planner creates plan | Saved live plan inspected; Planner unit/SQL and sample plan pass. No new paid planning request. |
| 7 | Research executes | Saved research inspected; bounded/evidence/provider mock and SQL regressions pass. No new paid research request. |
| 8 | Companies appear | Saved live company records and sample profiles displayed. Not new discovery. |
| 9 | Leads qualify | Saved lead assessments and sample scores inspected; qualification SQL/unit proof retained. Not new qualification. |
| 10 | Reviewer evaluates | Saved Reviewer evidence and fictional review shown; tests pass. No new model evaluation. |
| 11 | Outreach drafts generated | Saved drafts and fictional drafts inspected; local edit/reset exercised. No new live generation. |
| 12 | Approval requested | Existing pending/saved approval and sample queue inspected; publication SQL tests pass. No new live proposal. |
| 13 | Human reviews | Read-only draft/evidence inspection and sample edit/review performed. |
| 14 | Approve controlled action | Local simulation approved and persisted across reload; no real account/action approval made. |
| 15 | Executor executes | Existing historical result inspected; Executor mock/SQL invariants pass. No new send/CRM write. |
| 16 | Follow-up appears | Existing saved/setup view and static fictional story inspected. Real due preparation awaits Trigger setup. |
| 17 | Observability shows runs/tokens/cost | Saved runs/known usage/unknown cost inspected. Sample tokens/cost unavailable; exact pricing unconfigured. |
| 18 | Intelligence reflects workflow | Existing persisted page and fixture-derived sample viewed; local aggregate tests pass. No new live workflow outcome added. |
| 19 | Refresh | Saved live views inspected read-only; sample draft/decision refresh persistence explicitly tested. |
| 20 | State remains correct | Local replay/snapshot/SQL tests and sample refresh prove their scoped invariants; no fresh external-cycle persistence claim. |
| 21 | Open demo/case-study path | Public showcase/routes exercised; demo/case-study/architecture documentation links verified. |

## Performance and dependency limits

The final production chunk report after the drawer and Dashboard grid corrections measured **50 JavaScript chunks**, **2,213,535 raw bytes** and **659,783 summed gzip bytes**. The largest chunk is **415,437 raw / 99,566 gzip bytes**. These are whole-build sums, not one route's transferred JavaScript or a request-level performance budget. The shared catch-all demo imports multiple presentation screens; no claim of optimal route splitting is made.

Display histories now have explicit windows (200 runs, 300 events, 200 execution records), while Activity pages up to 100 events with `hasMore`. Exact approval/execution/reconciliation reads are independent of display windows. Other operational lists retain a 1,000-record window; offset-page movement and fair paging at larger volumes remain debt. Intelligence's full-cohort database semantics remain authoritative.

Full development-tooling audit retains eight high findings through braces/glob chains. The [GitHub braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no published patched version at the audit snapshot. Production dependency audit has zero findings. Forced major tooling downgrades were not applied; reassess compatible upstream fixes before launch.

## Portfolio screenshots

All captures are labelled fictional demo evidence, not live provider execution:

- [Dashboard](screenshots/dashboard.png)
- [Workflow execution story](screenshots/workflow.png)
- [Company research drawer](screenshots/company.png)
- [Approval review](screenshots/approval.png)
- [Automation explanation](screenshots/automation.png)
- [Sample Intelligence](screenshots/intelligence.png)

## Exact remaining gates before Release 1.0

1. Configure matching Trigger project/worker credentials, signing secret and reachable callback; verify browser-independent continuation, due preparation, duplicate delivery, interruption/recovery and cancellation live.
2. Obtain a separately permitted eligible Gmail read grant before incoming-reply acceptance. Current send-only OAuth cannot establish mailbox monitoring; no scope expansion was made.
3. Complete controlled HubSpot owner OAuth/portal setup and separately authorized create/update/conflict/reconciliation acceptance.
4. Configure verified exact model pricing or explicitly accept unknown-cost limitations; do not invent a zero estimate.
5. Configure/verify target Vercel/Supabase/domain, hosting execution duration, Auth/OAuth redirects, production grants/RLS, secrets/key backup and rollback compatibility.
6. Run the fresh controlled product cycle with explicit exact approval and separate permitted Execute, then verify provider result, refresh/replay, fresh follow-up approval and actual reply cancellation where available.

Retain [Release 0.7](release-0.7-verification.md) and [Release 0.8](release-0.8-verification.md) live boundaries. Use [deployment preparation](deployment.md) and [Release 1.0 checklist](release-checklist.md) for the next authorized step. This local polish release does not mark those external gates complete or perform the launch.
