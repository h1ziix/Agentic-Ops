# Agentic Ops 1.0 — release candidate

Candidate date: 3 October 2026, `Asia/Qyzylorda`. Baseline: Release 0.9 checkpoint `d89d683`. **Production deployment and complete live-provider acceptance are pending.** These notes describe implemented capabilities and the release scope; performed results belong in [1.0 verification](docs/release-1.0-verification.md).

## Product capabilities

- Natural-language goals become persisted, dependency-checked plans coordinated by the Orchestrator and bounded AgentRuntime.
- Research discovers companies, retains source evidence and produces structured qualification scores. Reviewer independently checks fit and personalization evidence before Outreach prepares a draft.
- Editable proposals require human approval of the exact revision, recipient and integration identity. A deterministic Executor handles a separate Execute request; approval alone sends nothing.
- Gmail sending and HubSpot contact actions use encrypted server-side OAuth credentials, account generations, fenced attempts, saved-success replay and explicit uncertain outcomes.
- Opt-in Trigger.dev automation delivers signed job references. Database-owned jobs support bounded recovery, cancellation and fresh follow-up preparation; every new email requires fresh approval.
- Agent runs, safe tool/event summaries, retries, duration and nullable usage/cost provide an auditable execution story without exposing hidden chain-of-thought.
- Product Intelligence aggregates persisted workspace data with documented cohort/denominator semantics. Saved ICPs, templates and immutable research/strategy snapshots preserve historical decisions.
- A clearly labelled public demo, onboarding, responsive dark/light workspace and privacy-safe screenshots support a short credential-free portfolio walkthrough.

## Release 1.0 scope

Feature development is frozen. This candidate audits launch readiness, fixes evidenced defects, validates the existing architecture and finalizes deployment, portfolio and interview material. It introduces no new agent, integration, workflow engine or billing system. [The audit](docs/release-1.0-audit.md) records findings; [the checklist](docs/release-checklist.md) separates local checks from environment-specific launch gates.

- Centralized server configuration and canonical Auth/OAuth/worker origins, added secret-safe launch preflight and hosted startup validation, and rejected secret/service-role authority in public Supabase configuration.
- Added compatible framing, MIME, referrer, permission and limited CSP headers; a complete script policy is not claimed.
- Added execution claim-fencing migration `202610030004_execution_claim_fencing.sql` to reject null capability/retry inputs, preserving existing guards and historical data.
- Kept exact follow-up parent/snapshot and retry authorization independent of display-history windows.
- Set the production runtime target to Node 24 and kept version `1.0.0` visibly labelled as a candidate while external gates remain open.

## Known limitations and launch gates

- Vercel login/project selection, intended production Supabase/domain configuration and production smoke remain required. Local build success is not deployment proof.
- Live Trigger continuation, timed preparation, duplicate delivery and recovery need a configured worker and controlled acceptance.
- Current Google consent is send-only. Incoming-reply acceptance requires eligible, explicitly permitted read access; unavailable monitoring stays unknown.
- HubSpot needs owner OAuth app/portal setup and controlled create/update/reconciliation acceptance.
- A fresh controlled workflow, exact approval, separate execution and saved-result replay remain distinct from mocked, SQL, historical-record and demo evidence.
- Model costs are estimates only when exact versioned pricing and usage exist. Current missing rates/telemetry remain unavailable, never measured zero.
- Research quality depends on public sources/providers; recipient discovery is not fully automated. Historical evidence may be incomplete, operational lists have bounded windows, and external CRM edits can race a preview.
- Provider acceptance does not establish email delivery/read or exactly-once delivery. Ambiguous dispatch blocks blind resend; code rollback cannot undo accepted external actions.

No completed-release commit/tag or production URL is represented by these candidate notes. Follow [deployment prerequisites](docs/deployment.md) and the actual verification report before publishing a completed 1.0 announcement.
