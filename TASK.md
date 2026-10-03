# Task — Release 0.8: Product Intelligence

Read AGENTS.md and PROJECT.md completely. The latest committed checkpoint is Release 0.6 `8b37502`; the existing working tree contains Release 0.7 implementation and its verification record. Preserve that work, including its unresolved live acceptance boundaries. Do not invent a Release 0.7 source checkpoint.

Extend the existing pipeline with persisted-data Intelligence, canonical metric definitions, cumulative company-workflow funnels, workflow comparison, historical trends, research/opportunity/industry/location segmentation, agent/model usage and unknown-safe estimated cost. Keep Dashboard operational. Use server authorization, workspace-isolated database aggregation and existing Release 0.7 telemetry; analytics reads create no audit events.

Add workspace-owned saved ICPs and Workflow Templates with validated create/edit/duplicate/archive operations. Templates provide context to the existing Planner. New workflows may combine an explicit goal, ICP and template; explicit user instructions remain authoritative. Save immutable workflow strategy and lead research/qualification snapshots so later edits never alter historical execution or scores. Include focused Leads/Companies filters and compact workflow outcomes without a redesign.

Approval never sends; timers, templates and analytics grant no external permission. Preserve Orchestrator, AgentRuntime, deterministic Executor, exact account generations, successful results, follow-up guards and unknown-outcome recovery. Calendar, new mailbox consent, automatic strategy/prompt/scoring/model optimization, billing, large BI infrastructure, Release 0.9 and deployment remain excluded.

Use versioned additive Supabase migrations without hosted resets or seeding. After a migration is applied, fixes belong in another migration. Preserve and rerun prior tests and rollback SQL suites; add metric/date/normalization/authorization/snapshot regressions. Paid APIs and provider mutations stay outside automated suites.

Verify lint, TypeScript, production build, client-secret boundaries, migrations/RLS, browser desktop/mobile/dark/light/keyboard, saved strategy CRUD and combined workflow creation. Cross-check real displayed researched/qualified/sent/reply/cost metrics against database records. Exercise permitted live planning/research and historical snapshot stability; record any unavailable provider prerequisites explicitly.

Work autonomously within this release. Do not print secrets, push, deploy, or create a source checkpoint. Deliver local reviewable changes and the actual performed-check report in `docs/release-0.8-verification.md`; retain separate Release 0.7 live gaps until verified.
