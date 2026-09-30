# Agentic Ops

Agentic Ops is an operational workspace for sales research workflows. Stage 3 adds a real Planner runtime to the existing Supabase Auth, PostgreSQL persistence, workflow services and audit history. A goal becomes a validated, persisted task plan through a server-side OpenAI call. Research, email sending and CRM execution remain future stages. Approving a proposed action records a decision; it does not execute the action.

## Requirements

- Node.js 20 or later and npm
- A Supabase project, or the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) with a running Docker-compatible runtime for a local stack

## Configure the app

```powershell
npm install
Copy-Item .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` from your Supabase project's **Connect** dialog. For a local stack, use the API URL and publishable key printed by `supabase status`. Set `NEXT_PUBLIC_APP_URL` to the canonical app origin (`http://localhost:3000` for local development); sign-up uses it to build the fixed email confirmation callback. The publishable key is client-visible and access is controlled by Supabase Auth and row-level security. Do not add a secret or service-role key to the frontend or commit `.env.local`.

Set `SUPABASE_SECRET_KEY` and `OPENAI_API_KEY` on the server for the runtime. Legacy Supabase projects may use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`. These credentials are imported through server-only modules and must never have a `NEXT_PUBLIC_` prefix. Supabase's [secret keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) authorize the service-role writer. Cookie-bound reads verify identity and workspace membership before the runtime writer is constructed; the planning RPC also checks the supplied verified user's membership.

`OPENAI_PLANNER_MODEL` optionally overrides the default `gpt-4.1-mini`. The selected model must support the Responses API and strict Structured Outputs. Model and bounded execution settings live in `src/server/agents/config.ts`; instructions live in `planner-prompt.ts`. The provider uses the official OpenAI SDK's [Responses structured output helper](https://developers.openai.com/api/docs/guides/structured-outputs), with SDK retries disabled so the runtime controls its retry limit.

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
4. `AgentRuntime` invokes the pure `PlannerAgent` through the OpenAI provider. Responses are checked with Zod, then domain validation rejects missing/forward/cyclic dependencies, duplicate IDs/titles, unsupported tasks and incomplete approval gates. Recoverable provider/validation errors get one retry; configuration errors, exhausted API credit/spend limits and refusals do not. Quota errors direct the administrator to API billing before an explicit retry. Audit failures stop execution.
5. `complete_planner_run` atomically inserts all validated tasks and their creation events, saves the structured plan and metrics, completes the run, and transitions the workflow to `running`. Every generated task remains `pending`; planning does not perform or claim research. Successful replay returns the existing run without calling OpenAI or creating more tasks.
6. Failure records safe error details, an `agent_failed` event and a failed workflow. Explicit retry is allowed only for failed planning with no saved tasks. This narrowly scoped retry does not change Stage 2's general terminal state rules. A late response cannot overwrite an expired/cancelled run or changed workflow.

The detail page displays summary, assumptions, task objectives, expected outputs, dependencies, model, duration, retry count, observed token usage, and persisted trace events. No raw provider errors, secrets, reasoning items or hidden chain-of-thought are stored or sent to the browser. `store: false` disables provider response storage. Usage records observed API token counts; it does not estimate cost.

Stage 3 uses an awaited HTTP request for planning, separate from progress polling. It does not require a queue or background worker. The provider and persistence ports let a later job runner invoke the same Orchestrator. A database outage can prevent failure events from being saved; the UI reports this and the expired claim recovery prevents a permanently stuck run.

Existing Stage 2 workflows and tasks are preserved. Create a new workflow to use AI planning for a legacy starter plan.

## Verification

`npm test` runs focused unit tests with mocked provider calls and SDK transports. It does not call paid APIs or load `.env.local`. The regression suite covers schema/domain validation, dependency mapping, retry bounds, safe failures, state transitions, idempotency, database failure handling, and the Supabase URL validator.

The SQL regression file checks real persisted state, atomic rollback, runtime RPC permissions, active/successful replay, failure retry and interrupted-run recovery. Run it on a migrated development project:

```powershell
npx supabase@latest db query --linked --file supabase/tests/planner_runtime.sql
```

All SQL fixtures are created inside a transaction and rolled back. This suite makes no OpenAI requests. `npm run verify:client-secrets` scans production browser assets for the configured server secrets and fails without printing their values.

For manual end-to-end verification, sign in and create a workflow with: “Find 20 SaaS companies in Kazakhstan that could benefit from AI automation and prepare personalized outreach. Do not send anything without approval.” Check planning progress, completed Planner run, pending task details, trace and refresh persistence. To verify the missing-key path, temporarily remove only `OPENAI_API_KEY` from the development server environment, create a separate test workflow, restore the key, then use **Retry planning**. No research or outbound action is executed.
