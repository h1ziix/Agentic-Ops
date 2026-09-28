# Agentic Ops

A Stage 1 product shell for an auditable sales operations workflow. It shows planning, company research, lead qualification, proposed outreach, human approval and activity history in a compact dark workspace.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The root route redirects to `/dashboard`.

## Demo interactions

- **New workflow** creates a deterministic planning record from a goal and stores it in this browser. It appears in the workflow list, detail page and activity log.
- **Workflows** can be searched and filtered. Each detail page shows the execution pipeline, tasks, discovered company sample, qualification evidence and event history.
- **Companies and leads** support search and filters. Rows open research and opportunity details. Company URLs such as `/companies?company=orda-finance` open the detail drawer directly.
- **Approvals** show every proposed email in a batch. Approving or rejecting records a local demo decision and updates the workflow and activity log. No message is sent.
- **Activity** filters the global audit stream by agents, tools, workflows, approvals and errors.

All company names, contact addresses and source URLs use fictional demo data. Workspace summary metrics represent a larger illustrative history than the individual sample records included in the tables. Local demo changes persist in `localStorage` for the current browser.

## Structure

- `src/app` — App Router pages and global theme.
- `src/components/app` — navigation, shared UI, workflow creation and the small local demo store.
- `src/components/workflow-detail` — execution pipeline and workflow panels.
- `src/components/ui` — shadcn/ui components.
- `src/lib/mock-data` and `src/types` — linked, strongly typed demo entities.

Stage 1 includes no AI calls, authentication, database, web research, external integrations, background jobs or email sending. External actions remain behind a human approval gate.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
