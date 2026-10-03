# Release 0.9 product audit

Baseline: clean checkpoint `f1cf331`, Releases 0.7–0.8. AGENTS.md, PROJECT.md, TASK.md and the Release 0.9 request were read before implementation. Source inspection covers every product route, auth, shared primitives, light/dark tokens, runtime, migrations and prior acceptance reports. Browser baseline confirms authenticated Dashboard with actual saved records.

## Preserve

Compact operational shell, existing Base UI overlays, semantic tokens, command navigation, server authorization, safe execution snapshots and separate Approve/Execute. Intelligence already uses database aggregation with unknown-safe usage. No agent/runtime rewrite or schema change is justified by this audit.

## Actual gaps and direction

- Entry: root redirects immediately; auth has no safe showcase entry. Add a public, clearly labeled `/demo` namespace without workspace loading or provider access.
- Demo: six scattered examples, counts inconsistent with visible records, empty runs and indefinitely running newly created plans. Replace with one coherent fictional historical sample; browser-created goals remain drafts. Sample decisions remain browser-only; no execution endpoint or live progress simulation.
- First run: new workspaces land on empty operational screens. Offer a short targeting/strategy setup, create through the existing workflow action and land in that workflow.
- Workflow: stages cannot be inspected and status labels obscure the next human decision. Add accessible stage inspection derived from saved tasks, preserving safe summaries and real state.
- Intelligence: metric meaning and unknown/zero denominators need readable definitions; empty history needs a workflow CTA. Preserve actual analytics and avoid invented charts.
- Companies: drawer and table can disagree about which historical qualification they show. Align selected assessment.
- Activity/settings: summaries, timezone and role descriptions need consistent concrete copy.
- Resilience: add product-specific 404, route loading and error boundaries retaining navigation. Honor reduced motion and existing focus management.
- Performance: broad operational event/run reads need explicit windows and exact-ID reads for mutations; keep analytics aggregation authoritative. Generated output must be outside ESLint source scope.
- Security: preserve checked RPC boundaries. Review refresh coverage, workspace authorization, exact revisions, URL protections, secrets and dependency advisories; record actual live prerequisites.
- Documentation: replace the release-history-heavy README with a concise product entry, reproducible demo, architecture, safety, setup and deployment preparation links; retain prior verification reports.

## Baseline checks

186 offline tests pass; TypeScript and production build pass. Lint fails on an old ignored `output/execution/release08-staged-scan.cjs` artifact. Build warns about an unrelated parent lockfile. Release 0.7 live Trigger/reply/HubSpot boundaries remain open.

Visual direction: retain restrained blue accents, dark navigation, light/dark semantic surfaces, compact tables and existing spacing. Use short state transitions rather than decorative ambient animation. Desktop is primary; validate 1920/1440/1280/1024/768/390 widths in the browser after implementation.
