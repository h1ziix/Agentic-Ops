# Demo walkthrough

Open `/demo` for the public, credential-free showcase. It is a deterministic fictional sample workspace, separate from authenticated data. The story illustrates the product; it does not claim a live model run, email delivery, CRM write or working background provider.

## A three-minute presentation

| Time | Screen | What to show |
| --- | --- | --- |
| 0:00–0:25 | `/demo/dashboard` | Goal-driven sales operations, operational metrics and actions needing review. Point out the DEMO label. |
| 0:25–1:00 | `/demo/workflows/kazakhstan-fintech` | Goal, stages, tasks, fictional research and sample run details. Stages are historical sample state, not a timed progress simulation. |
| 1:00–1:30 | `/demo/companies` and `/demo/leads` | Open a company and lead. Show illustrative evidence, confidence, sample score components and opportunity hypothesis. These fictional values illustrate the rubric, not a live assessment. |
| 1:30–2:00 | `/demo/approvals` | Inspect subject/body, evidence and the approval boundary. Any sample approval decision changes only browser sample state; it sends nothing. |
| 2:00–2:25 | `/demo/automation` | Illustrative follow-up story and fresh-approval requirement. It is a static explanation, not an active worker/job dashboard. |
| 2:25–2:50 | `/demo/intelligence` | Labelled fixture-derived funnel/outcomes and explicit unavailable usage/cost/reply monitoring. Distinguish these illustrations from production database aggregates. |
| 2:50–3:10 | `/demo/activity`, then README architecture | Follow the safe execution story, then explain Orchestrator, typed agents, exact approval and deterministic Executor. |

Use one showcase workflow. The fastest useful demonstration is inspection of the saved story, not waiting for live provider timing. A new demo workflow remains a draft; it does not pretend that planning/research ran.

## Sample data and safety

The versioned [application fixture](../src/lib/demo-fixture.ts) is the reproducible seed for the browser sample workspace. It uses fictional companies and reserved `.example` contacts, deterministic IDs and timestamps, task/research/lead records, approval/execution history, automation examples and sample Intelligence. It is loaded through demo presentation and is never inserted automatically into Supabase.

Sample decisions and draft creation are local-only and persist in this browser's local storage under `agentic-ops-demo-v09`. Reload retains these local changes. Use **Reset demo** to restore the fixture before an interview or screenshot; no real workspace history is cleared. Demo mode does not connect OAuth, call model/search providers, schedule real jobs, send emails or create CRM contacts. The prior `supabase/seed.sql` remains an optional local development database seed, not the public demo or a production seed.

Provider-looking status, durations, sources and outcomes are sample illustrations. Token usage/cost are unavailable because no model call ran. Read-only sample ICP/template views explain targeting and historical snapshots, but the showcase does not contain a real database strategy snapshot. Do not describe the sample as new live verification. Production Intelligence continues to aggregate real authorized database records with unknown-safe metric semantics.

## Authenticated product walkthrough

For an actual workflow, configure Supabase/AI/research credentials and apply migrations. Sign-up with an immediate session opens `/onboarding`; sign-in and email confirmation open `/dashboard`, which shows the same first-run panel when the live workspace has no workflows. `/onboarding` is also directly available. Enter targeting criteria, then choose an optional active ICP/template and review the explicit goal in the workflow dialog. Creation uses the existing authenticated action and opens workflow detail. Planner/research spend is real; no live workflow is generated merely to populate a demo.

Inspect persisted plan, source citations, scores, Reviewer outcome, draft and approval. Refresh to verify persistence. Approval never sends. A controlled external execution requires owner OAuth setup, confirmed exact recipient/content/account, human approval and separate Execute. Use only explicitly authorized test inboxes/contacts. The read-only verification scripts can inspect existing results without new provider calls.

Automation requires configured Trigger registration; real reply cancellation requires an eligible existing Gmail read grant. Current send-only Gmail cannot establish a reply observation. Preserve these open live gates in [Release 0.7 verification](release-0.7-verification.md).

## Screenshots

Capture with demo labels visible, fixed fixture state and consistent theme/viewport. Do not expose real inbox addresses, workspace identifiers or provider credentials. Screenshots document the product and are not hardcoded into runtime rendering.

| File | Evidence |
| --- | --- |
| [Dashboard](screenshots/dashboard.png) | Operational overview and useful next actions |
| [Workflow](screenshots/workflow.png) | Goal, agent pipeline, tasks and saved outputs |
| [Company](screenshots/company.png) | Research evidence and qualification context |
| [Approval](screenshots/approval.png) | Inspectable draft and human review boundary |
| [Automation](screenshots/automation.png) | Follow-up/job story and fresh approval |
| [Intelligence](screenshots/intelligence.png) | Clearly labelled sample analytics |

Use the Mermaid diagram in [architecture](architecture.md) for the system view. Current actual browser/automated results belong in [1.0 verification](release-1.0-verification.md); [0.9 verification](release-0.9-verification.md) preserves prior checks. Live and sample evidence remain distinct. The demo's versioned `v09` storage key is a fixture-compatibility namespace, not a production release version.

## Reproducing the offline smoke

`playwright.config.ts` expects an already-running server, defaulting to port 3001. After `npm run build`, start `npm run start -- --port 3001` in one terminal. Run `npx playwright install chromium` once if necessary, then `npm run test:e2e` from another terminal. `E2E_BASE_URL` can point to another local server origin.

The suite covers all thirteen demo screens at 1920/1440/1280/1024/768/390 widths, plus local draft persistence/reset, search/drawer keyboard behavior, dark/reduced-motion mode and missing records. It asserts no operational API requests or POST mutations in these flows. This is an offline sample smoke, not authentication, database RLS or external provider verification.
