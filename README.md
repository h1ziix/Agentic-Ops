# Agentic Ops

A Stage 1 workspace for auditable sales operations: planning, research, qualification, proposed outreach, human approval, and execution history. The frontend is light-first with dark and system themes. Existing App Router URLs and typed local state remain intact.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. `/` redirects to `/dashboard`.

## Workspace interactions

- **Command center** shows metrics derived from the included records, the current workflow, its execution path, pending messages, workflow health, and recent events.
- **Quick search** (`Ctrl+K` or `Cmd+K`) finds pages, workflows, companies, and leads. Arrow keys and Enter navigate results.
- **New workflow** validates a goal and target, creates a deterministic local plan, and opens its tasks, research, and trace. Creation and decisions persist in this browser.
- **Workflows** support search, status filters, sorting, and responsive records. Detail views separate the task plan, company evidence, and expandable execution trace.
- **Leads** offer high-fit/review views, search, sorting, filters, bulk selection, and CSV export. Approval decisions update lead outreach state. Company and lead drawers provide scoring explanations, evidence, draft previews, and connected records.
- **Deep links** such as `/companies?company=orda-finance`, `/leads?lead=lead-orda-finance`, and `/activity?workflow=kazakhstan-fintech` preserve record and trace context.
- **Approval inbox** groups proposed emails into batches. Inspect recipients and research, edit and validate local drafts, then explicitly approve or reject a batch. Decisions update workflow checkpoints and the audit log. No messages are sent.
- **Appearance** synchronizes light/dark/system selections between the header and settings. Motion powers navigation, route entrances, tabs, disclosures, sheets, dialogs, result changes, and restrained execution indicators. Reduced motion is hydration-safe and removes ambient animation.

All company names, contacts, sources, and recorded runs are fictional demo data. Dashboard totals use the available records; individual seeded workflow totals may describe a larger illustrative result than the included company sample. Draft edits are local to this browser. If storage is blocked, the UI reports that persistence is unavailable.

## Structure

- `src/app` — existing App Router pages and shared semantic theme tokens.
- `src/components/app` — application shell, command search, motion, workflow creation, shared UI, and local demo store.
- `src/components/dashboard` — command-center metrics and operational views.
- `src/components/entities` — lead/company records, details, score rails, export, and approval-derived lead states.
- `src/components/approvals` — approval review, research context, and validated local draft storage.
- `src/components/workflow-detail` and `src/components/activity` — task, evidence, and trace views.
- `src/components/ui` — customized shadcn/Base UI primitives.
- `src/lib/mock-data` and `src/types` — linked, strictly typed demo entities.
- `.21st` — design direction and conventions.

Stage 1 has no live AI calls, authentication, database, web research, integrations, queues, CRM sync, or email sending. Unavailable backend capabilities are labeled; no execution activity is fabricated by the frontend. Native application scrolling is preserved; GSAP and Lenis are not needed for these interactions.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

The redesign was inspected in a real browser at 1440, 1280, 1024, 768, and 390 pixels. Coverage includes all existing routes, detail drawers, filtering, CSV export, draft editing, approval decisions, workflow creation, reload persistence, keyboard navigation, themes, empty/error states, and reduced motion. Local screenshots and QA notes are in `output/playwright/` (ignored by Git).
