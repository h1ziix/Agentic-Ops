# Agentic Ops

Agentic Ops is an operational workspace for sales research workflows. Release 0.6 extends the existing planning, research, evidence review and approval architecture with a deterministic Executor: exact approved Gmail messages, exact HubSpot contact patches and internal follow-up plans. Approval and Execute are separate operations. Historical Release 0.5 content approvals stay readable and cannot authorize external execution.

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

`PLANNER_MODEL`, `RESEARCH_MODEL`, `REVIEWER_MODEL` and `OUTREACH_MODEL` independently override the models. `GEMINI_MODEL` provides a shared Gemini fallback (default `gemini-3.5-flash-lite`). The model must support JSON Schema structured output. The existing OpenAI Planner remains available with `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optional `OPENAI_PLANNER_MODEL` (default `gpt-4.1-mini`). Research uses Gemini regardless of the planning provider. Model configuration lives in `src/server/agents/config.ts`; research limits live in `research-budget.ts`.

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

Research executes `define_target_profile`, `discover_companies`, `research_companies`, `identify_opportunities`, and `score_leads`. After those tasks complete, the same Orchestrator continues supported Stage 5 tasks in dependency order. It respects intentional pauses. Legacy plans that already requested outreach receive a Reviewer prerequisite; research-only goals never acquire an outreach task. Progress is the percentage of actual completed tasks, including the pending future execution task in the denominator.

The existing Tavily and Gemini adapters remain server-only. Discovery uses 2–3 focused queries and extracts at most the requested number of source-supported companies. Directory candidates may have an unknown website; an additional focused identity lookup must establish a supported official domain before research. Domain-scoped company searches collect bounded snippets. Original URLs and retrieval times are retained in a workspace-scoped, server-only cache for 24 hours. Cache writes precede analysis so retries reuse search evidence.

Gemini sees goals, ICP and snippets as untrusted data, with no command execution or independent browsing tools. Zod validates profiles, facts, exact evidence quotes, citation IDs, opportunities, URLs and qualification. Unknown fields stay null. Opportunities are hypotheses rather than verified customer requirements. Only cited sources persist with the company. Research does not establish contacts or generate outreach. Stage 5 consumes the immutable workflow-specific research result; a later workflow updating the workspace company cannot change its evidence.

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

This verifies completed planning/research tasks, actual web-search events, researched companies, qualified leads, score components, citations, deduplication and task progress. For research-only goals it also checks the absence of outreach/approvals. It writes `output/research/stage4-verification.json` for local inspection. Keep generated reports out of source control. Finish with typecheck, lint, tests, build and `verify:client-secrets`.

## Stage 5 review, outreach and approval

This section describes the preserved 0.5 preparation boundary. Its verifier must use an untouched 0.5 workflow, rather than weakening its missing-recipient/no-execution assertions to accommodate 0.6.

The existing research endpoint continues `review_qualified_leads`, `generate_outreach`, then `request_approval`. Reviewer and Outreach use Gemini structured output with separate server-side prompts and centralized model overrides. They receive validated research and accepted evidence, without browsing or external action tools. Each run persists its input/output, status, model, timings, observed tokens, bounded retries and linked audit events.

The Reviewer checks evidence independently of the score. It may approve, reject or request more research. Unknown or rewritten evidence is rejected; approval requires sufficient exact facts, an official company domain or its subdomain, adequate confidence and supported personalization. Unsupported buying intent and internal needs remain uncertainties. Only accepted leads reach Outreach. Invalid results fail one lead and preserve successful results. Transient provider failures receive at most one retry; validation errors never automatically regenerate. Expired claims and database locks prevent duplicate active work.

The Outreach Agent selects accepted evidence and a concise call to action; server composition restricts factual content to those exact claims and labels the proposed opportunity as a hypothesis. Stage 4 has no verified-contact capability, so recipient name/email remain null. Drafts can be reviewed and authorized with `blocked_missing_recipient`; authorization does not invent a recipient or make an action executable.

`publish_outreach_approval` validates saved run provenance and atomically creates one approval and its proposed actions, moves the workflow to `waiting_for_approval`, and records the gate event. A unique workspace/dedupe key combines workflow, lead, channel, task and generation version. Repeated continuation reuses saved runs and approval records. Empty outcomes finish preparation with no actions and cancel unused execution. There is no infinite approval wait.

Live edits save immediately to Supabase through `edit_proposed_email`. Optimistic revisions reject stale overwrites; saving does not change approval state. `resolve_outreach_actions` supports an individual draft, eligible subset or whole batch. Partial decisions leave the batch pending. After all decisions, any authorization completes the approval task and leaves future execution pending with `ready_for_execution`; missing recipients stay blocked. An entirely rejected batch completes with a rejected outcome and cancels unused execution. Decisions and edits append audit events in the same transaction. The UI distinguishes human authorization from recipient readiness and sending.

Preparation RPCs are service-role-only and verify workspace membership. User editing/decisions use authenticated membership checks. Legacy loose proposal-creation and decision RPCs are revoked from authenticated users. No Gmail/email API or executor exists in this path. No provider secrets or hidden chain-of-thought are persisted in public records.

```powershell
npx supabase@latest db query --linked --file supabase/tests/outreach_runtime.sql
npm run verify:outreach -- --workflow WORKFLOW_UUID
```

The SQL fixtures roll back and make no paid calls. The verification command reads a real completed preparation workflow without new provider calls, checking accepted evidence, linked runs/actions, unique drafts, edits, audit, task progress and the execution boundary. It writes an ignored report under `output/outreach/`. Run the research verifier on the same workflow to inspect Stage 4 results. The visible workflow page drives continuation; navigation away stops it after the current bounded request, and reopening resumes pending work.

## Release 0.6 OAuth setup

Set these **server-only** variables in `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`. Never send their values in chat. The encryption key must be 32 cryptographically random bytes encoded as base64. Generate it in your own terminal with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and copy directly into `.env.local`. There is no fallback key. Restart the server after changing environment variables.

`NEXT_PUBLIC_APP_URL` is the validated canonical origin. Production requires HTTPS; HTTP is allowed only for localhost/loopback. Register these exact callback URIs in provider apps (replace the origin for another environment):

- Google: `http://localhost:3000/api/integrations/gmail/callback`
- HubSpot: `http://localhost:3000/api/integrations/hubspot/callback`

These are separate from Supabase `/auth/callback`. Return navigation is fixed to Settings. The verified Supabase session and owner membership are required at both initiation and callback; changing session/browser during consent requires starting again. State is cryptographically random, hashed, browser/session/user/workspace/provider bound, single-use and expires after ten minutes. PKCE verifiers are encrypted server-side.

In Google Cloud, enable Gmail API, configure the consent screen/Web application client and callback, and add your controlled test account as a test user while the app is in testing. Scopes are only `openid`, `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/gmail.send`. Google uses code + PKCE and offline consent; the authenticated UserInfo endpoint verifies mailbox identity. Production verification and testing/offline-token restrictions are provider controlled. Do not add inbox/modify/Calendar scopes. See [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

Create a HubSpot OAuth app with `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, the exact callback and a controlled test portal. Token exchange/introspection use OAuth v3 POST bodies, never credentials in URLs. This HubSpot contract does not expose PKCE; Google does. See [OAuth v3](https://developers.hubspot.com/changelog/new-oauth-v3-api-endpoints-and-standardized-error-responses) and [token management](https://developers.hubspot.com/docs/api-reference/legacy/authentication/manage-oauth-tokens).

Only owners connect/disconnect/reconnect. Workspace members review, approve and execute. One retained Gmail and one HubSpot connection exist per workspace. Normal refresh preserves identity/generation and retains an omitted refresh token. Reconnection increments authorization generation and invalidates old snapshots. Disconnect removes local credentials first; Google revocation is attempted. HubSpot additionally requires uninstall in **Settings → Integrations → Connected apps**, since this v3 contract documents no corresponding revocation endpoint. Already dispatched HTTP may still complete.

Credentials use AES-256-GCM with a random nonce/tag and workspace/connection/provider AAD; credential/state tables have RLS and no browser grants. Back up the key separately from the database. Key loss requires reconnection/new approvals. Rotation is not automated: coordinate a server-side decrypt/re-encrypt migration before replacing the key. Do not simply change it on a running instance. Expired OAuth states are cleaned at subsequent connection initiation; wider maintenance jobs belong to 0.7.

## Exact approval and bounded execution

The existing Orchestrator delegates to the deterministic Executor through small Execution/Integration services and repositories. AgentRuntime's LLM retry policy is not reused for mutations. Providers receive only a server-loaded immutable envelope. Executor runs persist actual duration/results with `model=null` and null AI usage. Existing `agent_events` supports workspace integration audit without fake workflows.

Set and confirm one recipient (optional explicit name/role), select Gmail, review subject/body/evidence and save with expected revision. Confirmation records operator selection, not deliverability. Pending edits increment revision; approved edits create a replacement needing fresh approval and cancel the old unexecuted action. Executed email is immutable. Active dispatch or unresolved unknown blocks replacement. Original AI outputs and evidence are retained.

Approve freezes IDs, revision, confirmed recipient, exact connection/generation/identity, content/parameters, verified actor/time and canonical digest. Bulk approval atomically checks every displayed revision. Old v1/loose content approvals cannot execute. Email approval grants no CRM write or future email permission. Approval performs no provider request.

`POST /api/workflows/:id/execute` accepts only `{ actionId, expectedSnapshotId, retry? }`. One request handles one action; explicit UI batches dispatch ≤20 sequentially while mounted/visible. Limits: one active workflow action, 120-second claim lease, 30-second provider timeout, three attempts/snapshot. Resolve the entire primary batch first. Refresh/reopen never dispatch; navigation stops subsequent actions after the current request. Generic workflow/task transitions cannot impersonate execution completion.

Checked transactions lock workflow → action → attempt. Claim/dispatch audit precedes remote mutation; completion/result/domain/audit save together. External HTTP never runs inside a transaction. Replay returns saved success. Expired pre-dispatch claims can recover; expired dispatch becomes **outcome unknown**, never permission to resend. Definitive rejection permits explicit retry after `nextRetryAt`; timeout/reset/ambiguous 5xx does not. Persistence recovery saves the same provider response without another send. Cancellation preserves late confirmed success and stops siblings; partial failure retains earlier results.

Gmail sends UTF-8 text/plain MIME, one approved To, approved From, encoded subject/name and stable RFC Message-ID. No attachments/CC/BCC/arbitrary headers/HTML. Message/thread IDs mean **accepted by Gmail**, not delivered/read/responded. Message-ID does not guarantee provider deduplication or exactly-once delivery. See [sending](https://developers.google.com/workspace/gmail/api/guides/sending) and [errors](https://developers.google.com/workspace/gmail/api/guides/handle-errors).

Unknown email requires manual Gmail Sent checking by account/time/recipient/Message-ID. Actor/time/note are saved; manual confirmation is `user_confirmed`, not API-confirmed. “Not found” retains uncertainty. Explicit closure permits a replacement with duplicate risk, new approval and Execute; the uncertain record remains. No Gmail read scopes or background reconciliation are added.

**Sync contact / preview** reads HubSpot by unique email (`idProperty=email`), then proposes exact changed fields. Only explicit firstname/lastname/jobtitle and source-supported company/website are allowed. Empty/absent inputs do not clear fields. CRM requires its own approval/Execute; recheck expected fields before PATCH. A changed preview requires fresh replacement. Missing contacts are created; duplicate conflicts read canonical identity rather than search. Unknown writes reconcile read-only against exact fields. HubSpot offers no atomic compare-and-swap here, leaving an external-edit race between check and write. See [Contacts API](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide).

After an accepted/operator-confirmed email, **Plan follow-up** accepts explicit future UTC time and IANA display timezone, separate approval and Execute. One internal `planned` record is saved atomically; no email/job/Calendar event fires when due. Cancel is audited. Changing date cancels the saved plan and creates a replacement requiring approval. Auxiliary CRM/plans never reopen completed core tasks; cancelled workflows cannot dispatch.

## Release 0.6 verification and boundary

Performed checks, development migration targets and unresolved live gates are recorded in [Release 0.6 verification notes](docs/release-0.6-verification.md). Implementation availability does not mean controlled live acceptance is complete.

```powershell
npx supabase@latest db query --linked --file supabase/tests/planner_runtime.sql
npx supabase@latest db query --linked --file supabase/tests/research_runtime.sql
npx supabase@latest db query --linked --file supabase/tests/outreach_runtime.sql
npx supabase@latest db query --linked --file supabase/tests/execution_runtime.sql
npm run verify:execution -- --workflow WORKFLOW_UUID --action ACTION_UUID
# Explicit check of historical execution blocking:
npm run verify:execution -- --workflow UNTOUCHED_05_WORKFLOW_UUID --mode legacy
```

SQL fixtures roll back and use mocked results, with no provider calls. Unit tests mock every paid API/external mutation. The read-only verifier checks snapshots/digests/revisions/identity, attempt uniqueness, result IDs, audit, core/lead state and auxiliary plans. It cannot independently establish provider delivery or CRM state. Ignored reports are under `output/execution/`. `verify:outreach` retains strict 0.5 defaults and must use an untouched fixture.

Controlled live verification requires owner OAuth consent, a user-controlled test inbox and test HubSpot portal/contact. Show exact test account/recipient/subject/body or patch, product approval and separate permission, then Execute. Verify Sent/result, persistence, replay, recipient replacement, CRM create/update without duplicate and saved follow-up without automatic send. Test unknown outcomes with deterministic mocked transport. Missing environment/consent/accounts block live verification; mocked checks are never live evidence.

0.7 owns background continuation, scheduled retries, follow-up dispatch (a future email requires new approval), Calendar, response monitoring/webhooks and recovery/reconciliation jobs. None is implemented in 0.6; no billing, analytics, deployment or new orchestration infrastructure. Existing failed preparation leads remain skipped on resume, with no explicit preparation retry.
