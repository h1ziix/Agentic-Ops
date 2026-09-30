# Agentic Ops

Agentic Ops is an operational workspace for sales research workflows. The existing Supabase Auth, PostgreSQL persistence, workflow services and audit history support AI planning and real company research. Release 0.4 turns a goal into a validated plan, focused company discovery, Tavily evidence, Gemini analysis, explainable lead scores, and persisted qualified leads. Research stops after qualification; future outreach and approval tasks remain pending. Historical proposals remain readable.

## Requirements

- Node.js 20 or later and npm
- A Supabase project, or the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) with a running Docker-compatible runtime for a local stack

## Configure the app

```powershell
npm install
Copy-Item .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` from your Supabase project's **Connect** dialog. For a local stack, use the API URL and publishable key printed by `supabase status`. Set `NEXT_PUBLIC_APP_URL` to the canonical app origin (`http://localhost:3000` for local development); sign-up uses it to build the fixed email confirmation callback. The publishable key is client-visible and access is controlled by Supabase Auth and row-level security. Do not add a secret or service-role key to the frontend or commit `.env.local`.

Set `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, and `AI_PROVIDER=gemini` on the server. Legacy Supabase projects may use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`. These credentials are imported through server-only modules and must never have a `NEXT_PUBLIC_` prefix. Supabase's [secret keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) authorize the service-role writer. Cookie-bound reads verify identity and workspace membership before the runtime writer is constructed; the runtime RPCs also check the supplied verified user's membership.

`PLANNER_MODEL` and `RESEARCH_MODEL` independently override the models. `GEMINI_MODEL` provides a shared Gemini fallback (default `gemini-3.5-flash-lite`). The model must support JSON Schema structured output. The existing OpenAI Planner remains available with `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optional `OPENAI_PLANNER_MODEL` (default `gpt-4.1-mini`). Research uses Gemini regardless of the planning provider. Model configuration lives in `src/server/agents/config.ts`; research limits live in `research-budget.ts`.

## Apply the database schema

The versioned schema is in `supabase/migrations/`. Run these commands from the repository root. The examples use `npx supabase@latest`; an installed Supabase CLI can be used instead.

For a hosted Supabase project:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push
```

Use that project's URL and publishable key in `.env.local`. Do not pass `--include-seed` when pushing to a hosted environment. Schema changes belong in versioned migrations, then `db push`, rather than dashboard-only edits.

For a local Supabase stack:

```powershell
npx supabase@latest start
npx supabase@latest db reset
npx supabase@latest status
```

`db reset` recreates the **local** database, applies migrations, and runs `supabase/seed.sql`. It does not create a login-capable user. Copy the local API URL and publishable key from `supabase status` into `.env.local`.

## Optional local demo data

Run `npm run dev` and sign up at `/sign-in`. Confirm the email if prompted, then enter the workspace once so your profile and personal workspace are created. The local seed installs a `seed_demo_workspace` function; it is not included by the hosted `db push` command above. In the local Supabase Studio SQL Editor, get your user ID with:

```sql
select id, email from auth.users;
```

Then replace `<USER_UUID>` below with that ID and run:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
select public.seed_demo_workspace(public.bootstrap_workspace());
commit;
```

The sample workflows, companies, leads, events, and approvals are fictional. Seeded approval records are proposals; no email or external action is performed.

## Run and validate

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:client-secrets
```

Open [http://localhost:3000](http://localhost:3000). With Supabase configured, application routes are protected by server-side authentication. `/sign-in` supports email/password sign-in and sign-up; `/auth/callback` exchanges email confirmation codes. If using hosted Supabase Auth with email confirmation, configure your Auth Site URL and allowed redirect URL to include `http://localhost:3000` and `http://localhost:3000/auth/callback` for local development. For deployment, set `NEXT_PUBLIC_APP_URL` to the deployed origin and allow its `/auth/callback` URL in Supabase Auth.

Without Supabase values, `npm run dev` retains the Stage 1 browser-only preview so the UI can be inspected. It does not provide Stage 2 authentication or persistence. A production build without Supabase values displays a configuration-required state instead of the application workspace.

## Code layout

- `src/app` contains the App Router pages, auth routes, and server action entry points.
- `src/server` contains workspace, workflow, approval, event, and repository logic.
- `src/lib/supabase` contains cookie-bound server and browser clients.
- `src/lib/validation` and `src/types` define validated request and domain contracts.
- `supabase/migrations` contains reproducible SQL schema, row-level security, and checked database operations.
- `supabase/seed.sql` contains optional local-only sample data.

Authenticated reads are scoped by workspace membership in PostgreSQL policies. Core mutations use checked server operations and append safe event summaries.

## Planner runtime

1. Workflow creation persists a `planning` workflow and its creation event, without deterministic starter tasks. The detail screen dispatches planning immediately and polls status independently every 1.5 seconds while visible. Refreshing or reopening an unfinished workflow safely dispatches the same operation again.
2. `planning-service.ts` verifies the user and workspace and constructs the Orchestrator. `Orchestrator.planWorkflow({ workflowId, workspaceId, userId })` loads the workflow and existing tasks/runs before any paid request.
3. `start_planner_run` claims one active Planner run under the existing workflow row lock. It atomically records the planning state, run and start events. Concurrent requests return the existing run. An interrupted run expires after three minutes and can be recovered when the workflow is reopened or planning is retried.
4. `AgentRuntime` invokes the pure `PlannerAgent` through the configured Gemini or OpenAI provider. Responses are checked with Zod, then domain validation rejects missing/forward/cyclic dependencies, duplicate IDs/titles, unsupported tasks and incomplete approval gates. Recoverable provider/validation errors get one retry; configuration errors, exhausted API credit/spend limits and refusals do not. Quota errors direct the administrator to API billing before an explicit retry. Audit failures stop execution.
5. `complete_planner_run` atomically inserts all validated tasks and their creation events, saves the structured plan and metrics, completes the run, and transitions the workflow to `running`. Every generated task remains `pending`; planning does not perform or claim research. Successful replay returns the existing run without calling OpenAI or creating more tasks.
6. Failure records safe error details, an `agent_failed` event and a failed workflow. Explicit retry is allowed only for failed planning with no saved tasks. This narrowly scoped retry does not change Stage 2's general terminal state rules. A late response cannot overwrite an expired/cancelled run or changed workflow.

The detail page displays summary, assumptions, task objectives, expected outputs, dependencies, model, duration, retry count, observed token usage, and persisted trace events. No raw provider errors, secrets, reasoning items or hidden chain-of-thought are stored or sent to the browser. The OpenAI provider sets `store: false`. Usage records observed API token counts; it does not estimate cost.

Stage 3 uses an awaited HTTP request for planning, separate from progress polling. It does not require a queue or background worker. The provider and persistence ports let a later job runner invoke the same Orchestrator. A database outage can prevent failure events from being saved; the UI reports this and the expired claim recovery prevents a permanently stuck run.

Existing Stage 2 workflows and tasks are preserved. Create a new workflow to use AI planning for a legacy starter plan.

## Verification

`npm test` runs focused unit tests with mocked provider calls and SDK transports. It does not call paid APIs or load `.env.local`. The regression suite covers schema/domain validation, dependency mapping, retry bounds, safe failures, state transitions, idempotency, database failure handling, and the Supabase URL validator.

The SQL regression file checks real persisted state, atomic rollback, runtime RPC permissions, active/successful replay, failure retry and interrupted-run recovery. Run it on a migrated development project:

```powershell
npx supabase@latest db query --linked --file supabase/tests/planner_runtime.sql
```

All SQL fixtures are created inside a transaction and rolled back. This suite makes no OpenAI requests. `npm run verify:client-secrets` scans production browser assets for the configured server secrets and fails without printing their values.

For manual end-to-end verification, sign in and create a workflow with the example goal in the workflow dialog. Set the requested company count explicitly. Check planning, running research, partial results, trace, qualification, and persistence after refreshing. Provider failures surface safe errors and an explicit retry; successful results are retained. Tests use mocked providers and do not call paid APIs.

## Stage 4 research execution

`POST /api/workflows/:id/research` accepts `{}` or `{ "retry": true }`. The endpoint verifies the same-origin request, Supabase session, workspace membership, workflow state and task dependencies before any paid request. It extends the existing Orchestrator, AgentRuntime, AgentRunService and EventService. It executes one bounded task or company per request. The visible workflow detail screen continues requests sequentially and polls persisted state; reopening an unfinished workflow resumes execution. This release has no background worker, so navigating away stops continuation after the current request.

Only `define_target_profile`, `discover_companies`, `research_companies`, `identify_opportunities`, and `score_leads` execute. Other planned tasks remain pending. Completion pauses the workflow at the research boundary when future tasks exist, or completes it when all tasks are supported. Progress is the percentage of actual completed tasks.

The existing Tavily and Gemini adapters remain server-only. Discovery uses 2–3 focused queries and extracts at most the requested number of source-supported companies. Directory candidates may have an unknown website; an additional focused identity lookup must establish a supported official domain before research. Domain-scoped company searches collect bounded snippets. Original URLs and retrieval times are retained in a workspace-scoped, server-only cache for 24 hours. Cache writes precede analysis so retries reuse search evidence.

Gemini sees goals, ICP and snippets as untrusted data, with no command execution or independent browsing tools. Zod validates profiles, facts, exact evidence quotes, citation IDs, opportunities, URLs and qualification. Unknown fields stay null. Opportunities are hypotheses rather than verified customer requirements. Only cited sources persist with the company. No contacts, outreach content, approval proposals or external actions are generated.

The rubric totals 100: ICP fit 25, automation potential 30, operational signals 20, evidence quality 15, and public reachability/context 10. Server validation checks component bounds and their sum. Qualification requires at least 60 overall, 15 ICP-fit points and 7 evidence-quality points. Confidence reflects evidence quality and is reduced when support is weak. Only qualified assessments create or update leads, initially `qualified` with outreach `not_started`.

`MAX_RESEARCH_COMPANIES_PER_WORKFLOW` sets a hard ceiling (default 20, supported range 1–20). Discovery is capped at 30 evidence sources and 12 results per broad search. Each company run permits at most two search queries, three Tavily HTTP attempts/basic-credit reservations, two Gemini requests and one shared transient retry. Company searches return four results each, at most eight sources with 3,500 characters per snippet. Provider execution has a 170-second budget; each Gemini response allows at most 6,000 output tokens. Failed attempts consume the same budget. Invalid evidence and configuration/authentication failures are not automatically retried. Explicit company recovery is capped at three failed attempts per work item and 70 research runs per workflow.

`start_research_task_run` claims work under workflow and task locks. Concurrent requests reuse one active run; successful replay makes no paid request. Interrupted claims expire after three minutes. `complete_research_task_run` atomically persists profiles, workflow-company associations, source objects, opportunities, qualification, runs and events. Normalized domains take precedence in deduplication; name fallback applies when a website is unknown. Companies are reusable across workflows. One company's evidence failure does not discard successful results. All-company failure stops the task for explicit recovery. Late responses cannot overwrite a cancelled or paused workflow. Legacy RPCs that created outreach no longer grant execution to the runtime writer.

Companies and Leads show saved evidence and assessments. Their detail sheets expose source links, timestamps, confidence and rubric components. Workflow task state, research metrics and the audit trail reflect actual database writes; safe summaries never expose hidden reasoning.

Run database regressions against a migrated development project (fixtures roll back, no paid calls):

```powershell
npx supabase@latest db query --linked --file supabase/tests/research_runtime.sql
```

After a **paid, real** workflow is created and executed from the UI, verify its persisted results without making further provider calls:

```powershell
npm run verify:research -- --workflow WORKFLOW_UUID
```

This verifies completed planning/research tasks, actual web-search events, researched companies, qualified leads, score components, citations, deduplication, task progress and the absence of outreach/approvals. It writes `output/research/stage4-verification.json` for local inspection. Keep generated reports out of source control. Finish with typecheck, lint, tests, build and `verify:client-secrets`.
