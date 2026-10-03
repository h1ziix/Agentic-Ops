# Release 0.9 product experience audit

Source inspection against checkpoint `f1cf331`, before implementation. Browser inspection and the actual performed checks belong in the release verification record; source findings are not visual acceptance.

## Existing foundations to preserve

The application already has a coherent operational light/dark token system, compact headers, status badges, useful entity tables, mobile record views, Base UI dialog and sheet focus management, safe approval review, persisted execution history, and bounded analytics comparisons. Keep these foundations and the runtime architecture.

## Route findings and targeted decisions

| Screen | Primary goal and action | Actual issue | Targeted response |
| --- | --- | --- | --- |
| Dashboard | Find attention items; open or create workflow | A first visitor reaches operational statistics without a concise product/demo explanation; sparse live work needs onboarding | Root-owned onboarding and safe demo entry; retain operational focus |
| Workflows | Find and open a goal | Footer claims external execution is disconnected even for a live workspace | Describe separate approval and Execute accurately |
| Workflow detail | Understand current work, evidence, decisions and next step | Pipeline stages are uninspectable; blocked tasks collapse into pending; run tab and telemetry are absent from demo; record label always claims research/preparation | Inspectable persisted stage details with no simulated progress, honest unavailable telemetry, and recorded demo runs |
| Companies | Inspect research and latest fit | List uses latest lead assessment; drawer uses company score and an arbitrary first lead, so scores can disagree | Use the same latest assessment semantics and link to that lead; keep historical lead snapshots |
| Leads | Compare and inspect opportunities | Strong mobile/table foundations; source and confidence are understandable | Preserve layout; avoid speculative redesign |
| Approvals | Review exact proposed action; authorize separately from Execute | Safety behavior and keyboard tabs are sound; technical identity prose can obscure actual action | Keep safety controls; use more concrete descriptions in focused areas |
| Activity | Follow recorded execution story | Safe result summary is hidden until each row expands; newest-first relies on input ordering; timezone differs without a clear convention | Show a concise summary on rows and keep raw record behind details; explicit UTC ordering |
| Automation | Inspect jobs, follow-ups and recovery | Demo is an empty unavailable view; configured/unavailable status is correctly explicit | Root-owned labeled sample view; retain live unavailable conditions and real scheduling controls |
| Intelligence | Compare actual outcomes and consumption | Missing-data state has no next action; unknown values and conversion denominator lack local definitions; historic scroll table is not keyboard-focusable | Accessible metric guide, clear unknown/coverage semantics, actionable sparse states, focusable scrolling |
| ICPs | Save reusable targeting | Demo create button disabled with no demonstration of saved criteria; long names can overflow row header | Root-owned read-only sample strategy; allow sample inspection and preserve live CRUD |
| Templates | Reuse campaign guidance | Same demo issue; archive is immediate although historical snapshots are preserved | Clearly labeled sample strategy, readable criteria and safe archive confirmation |
| Settings | Understand workspace, model roles, integrations and guardrails | Claims four roles despite Outreach; deterministic Executor is labeled an AI Agent; live availability claim does not prove provider configuration | State actual four AI roles and deterministic Executor, with honest sample/configuration labels |
| Auth, onboarding, demo | Understand and enter safely | Auth is the only usable path when Supabase is configured; no distinct public sample route | Root-owned isolated demo path and concise first run flow |
| Error/loading/not found | Recover with context | Global error/loading exist; route-specific not found and useful navigation need refinement | Root-owned shared product recovery states |

## Interaction and accessibility

Preserve visible focus and reduced motion. New stage inspection must work with keyboard and show status text independent of color. Scroll regions need labels and keyboard access. Keep dialog titles/descriptions and focus trapping. Current shadcn Base UI documentation recommends semantic links using `buttonVariants`; the existing Button wrapper and link usages need a coordinated audit.

## Scope and honesty

No redesign of good pages. No backend feature, agent, dependency, schema or provider mutation is needed for these fixes. Demo records must be isolated and labeled. Pipeline duration, tokens, tool calls, cost and status use recorded data only; absent records remain unavailable. A completed research-only workflow must not claim outreach or automation occurred. Browser QA must verify dense and sparse data, both themes, laptop/compact/mobile, keyboard and reduced motion before acceptance.

## Implementation status

Implemented targeted component work:

- Workflow stages are keyboard-operable inspection controls with saved tasks, run summaries, duration, tokens and cost when recorded. Blocked tasks, unresolved approvals and uncertain execution stay distinct from completion. Sample agent runs are inspectable without a provider call.
- Research and preparation usage totals remain unknown when any contributing run is unmeasured; a completed Planner with absent duration no longer claims to be in progress.
- Company drawer opportunity fit uses the same latest-created lead assessment as the Companies table, preserving unknown new scores and historical lead records.
- Activity rows show concise safe summaries. Live history uses one validated 100-event server page at a time, with abort-safe workflow changes, loading/retry/error controls and explicitly page-local search/category filters. Sample mode does not call the endpoint.
- Intelligence includes an accessible metric guide, zero-denominator and coverage explanations, useful missing-data navigation and a keyboard-scrollable historical table.
- Settings accurately describes Planner, Research, Reviewer, Outreach and the deterministic Executor; provider configuration is distinguished from architectural roles.
- Workflow footer copy preserves separate approval and Execute. Strategy names wrap, archive confirms the exact record and preservation of historical snapshots, and sample libraries cannot invoke live CRUD.
- Final source review fixed programmatic Companies, Leads, Activity and Automation navigation so sample filtering and drawer inspection retain the `/demo` namespace. Pipeline collapse restores keyboard focus. Activity request failures display unavailable counts instead of zeros. Historical sample approvals identify simulated results, and saved sample approval states do not point to a live Execute control.
- Settled screenshot inspection caught an eight-stage Dashboard pipeline using seven desktop columns, which wrapped Executor onto an isolated row. The desktop grid now has eight columns and retains four on mobile; the smoke suite adds a one-row geometry check from 768px upward. Entity drawers also restore focus to the opening row, with a safe close-control fallback for direct links; focused drawer regressions cover both paths. This remains a targeted correction, without changing the product architecture.

Five focused pipeline and fixture regressions passed: blocked task visibility and workspace separation, unresolved human proposals overriding completed display state, unknown telemetry preserving measured zero correctly, coherent fictional sample records with no execution capability, and explicit sample navigation. Targeted ESLint and TypeScript checks passed during implementation. Final browser inspection and consolidated release checks remain the responsibility of the release verification record.
