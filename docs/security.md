# Security model

Agentic Ops separates research, human permission and external execution. These controls are implemented in the application and versioned SQL; the project does not claim a security certification or an independent penetration test.

## Identity and workspace isolation

`requireUser` verifies the Supabase user on the server. `requireWorkspace` resolves an accessible workspace through the cookie-bound client. Browser-supplied record IDs are validated, and repository reads include the verified workspace. The Next.js proxy refreshes cookies for authenticated product routes, onboarding and APIs; the public `/demo` namespace does not depend on an authenticated workspace.

All 23 application tables enable Row Level Security. Member read policies use `is_workspace_member`; sensitive writes use checked RPCs rather than browser table writes. Runtime service credentials bypass RLS, so their RPCs independently recheck the saved actor's membership, related workspace records, connection generation and claim ownership. Public security-definer functions fix an empty `search_path`. Intelligence uses an authenticated security-invoker RPC so aggregation retains caller RLS.

ICP/template archive preserves history. Immutable workflow strategy, lead assessments and approval snapshots retain their original context after source edits. Browser roles cannot directly delete workspace, workflow, approval-snapshot or audit history. Privileged database deletion can still cascade; a production administrative deletion/backup policy needs an explicit operational decision.

## Secrets and OAuth

Supabase runtime, AI, OAuth and automation credentials are server environment variables. Only the Supabase project URL, publishable key and canonical app origin are public. `.env.local`, runtime reports and browser evidence are ignored. `verify:source-secrets` scans current files and historical Git blobs; `verify:client-secrets` scans built browser assets without printing credential values.

OAuth token and state tables are inaccessible to browser roles. Tokens and PKCE verifier state use AES-256-GCM with an explicitly configured key and workspace/connection/provider associated data. OAuth state is single-use, short-lived and bound to the initiating browser session. Owner checks protect connection management. Refresh and reconnect are fenced by credential versions and connection generations. Local disconnect revokes dispatch rights before attempted provider revocation. Encryption-key backup/rotation remains an operator procedure; there is no silent fallback key.

## Approval and external actions

AI agents can propose an action. A human reviews and approves the exact revision; a separate Execute request starts the deterministic Executor. Approval, a template, analytics, a worker callback and a follow-up timer never grant permission for a new message.

The immutable snapshot freezes recipient, sender identity, connection generation, content, approval actor/time and digest. The Executor reads that exact snapshot and the action's bounded attempts independently of UI history pages. Database claim/dispatch checks and audit persistence precede provider mutation. Edited or superseded proposals need a newly approved snapshot. Legacy loose approvals cannot acquire execution rights through display controls.

Database operation keys, locks, claims and completion fences prevent repeated local dispatch. A confirmed result is retained if saving fails; recovery retries persistence of that same result. An uncertain Gmail outcome blocks blind resend. These controls do not promise exactly-once delivery across external networks. Gmail acceptance is not delivery/read proof, and HubSpot retains an external-edit race between its preview check and write.

## Untrusted research and URL boundaries

Goals, saved strategy, company text and web evidence are data. Research, Reviewer and Outreach system prompts explicitly reject instructions embedded in them. Structured Zod contracts and exact evidence/quote checks constrain outputs; Outreach receives accepted structured facts. Gemini hidden thought parts are discarded. Agents cannot execute arbitrary SQL, code, tool names or network instructions.

Research uses fixed Tavily and AI provider endpoints rather than fetching an arbitrary company URL on the Next.js server. Company/source URL validation excludes credentials, custom ports, IP literals and common private/local host suffixes. Integration HTTP permits only fixed HTTPS provider hosts and rejects redirects carrying credentials. This is syntactic URL validation and fixed egress, not a DNS-rebinding security claim. A future direct website fetcher would require separate resolved-address and redirect validation.

Provider JSON is read through a one MiB byte ceiling, including chunked responses and Gemini quota diagnostics. Oversized streams are canceled before full buffering. Research HTML/snippets are rendered as text; the sole current `dangerouslySetInnerHTML` use is a fixed theme bootstrap, not research content.

## Jobs, read APIs and audit

Browser mutation handlers enforce the canonical origin and streamed request-size limits. Server actions independently authorize their service operation; a page-level sign-in check is not the mutation boundary. Automation callbacks authenticate exact body bytes using a timestamped HMAC, reject signatures older than sixty seconds and cap bodies at four KiB. Callback payloads contain references, never arbitrary actor/workspace/content instructions. Saved actor membership, job provider identity and claims are rechecked before work.

History APIs resolve the current workspace on the server, reject unknown/duplicate parameters and return 100 safe records per page with `hasMore`. UI snapshots load recent histories, not the whole event stream; exact approval/execution access does not depend on those windows. Server logs contain safe operation/error identifiers rather than raw provider bodies, tokens or hidden reasoning. Persisted safe summaries, tool events, approvals and attempts form the execution trace. Analytics and history reads create no domain events.

## Public demo and verification limits

`/demo` loads versioned fictional fixtures without a Supabase workspace or provider adapter. Sample contacts use `.example`, contain no executable envelope/snapshot and show explicit demo blockers. Local draft/approval interactions stay in browser storage. The authenticated application's external APIs keep their normal authorization regardless of whether a demo page is open.

The performed Release 0.9 security checks and remaining live gates are recorded in [release-0.9-security-audit.md](release-0.9-security-audit.md). Production deployment, hosted RLS/configuration verification, live Trigger continuation/recovery, mailbox-read consent/reply testing, HubSpot controlled execution and pricing configuration remain separate acceptance work.
