# Task — Stage 1: Build the Agentic Ops Product Shell

Read `AGENTS.md` and `PROJECT.md` completely before making changes.

We are beginning Stage 1.

Your job is to initialize and implement the first working version of Agentic Ops.

Do not implement real AI agents, Supabase, Gmail, CRM integrations or background jobs yet.

The goal of this stage is to establish an excellent product foundation and polished frontend using realistic mock data.

---

# Objective

Build a professional SaaS interface for:

**Agentic Ops — autonomous AI sales operations**

The application should visually communicate that autonomous agents are researching companies, qualifying leads and preparing actions.

It must NOT look like a generic AI chatbot.

---

# Setup

Initialize the application if the repository is empty.

Use:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons

Use the modern Next.js App Router architecture.

Use strict TypeScript.

Do not add unnecessary packages.

---

# Application Structure

Create a maintainable structure similar to:

```text
src/
  app/
  components/
    app/
    dashboard/
    workflows/
    companies/
    leads/
    approvals/
    activity/
    ui/
  lib/
    mock-data/
    utils/
  types/
```

Adjust if a cleaner structure makes sense.

Do not over-engineer it.

---

# Main Navigation

Implement a persistent sidebar.

Navigation:

- Dashboard
- Workflows
- Leads
- Companies
- Approvals
- Activity
- Settings

Include:

- Agentic Ops logo / wordmark
- active navigation state
- workspace selector
- user area

The sidebar should feel compact and professional.

---

# Global Layout

Desktop-first but responsive.

Use:

- sidebar
- page header
- main content
- optional contextual right panel where useful

Use a restrained dark theme.

The visual style should have:

- near-black / neutral backgrounds
- subtle borders
- clear typography
- compact cards
- high information density
- muted secondary text
- status colors only where meaningful

Avoid flashy visual effects.

---

# Page 1 — Dashboard

Route:

```text
/dashboard
```

Create a polished operations dashboard.

Include:

## Header

Title:

```text
Operations
```

Subtitle explaining current workspace activity.

Primary CTA:

```text
New workflow
```

---

## KPI Row

Show realistic values:

```text
Active workflows
3

Companies researched
148

Qualified leads
42

Pending approvals
18
```

Add subtle context such as changes or current period.

---

## Active Workflows

Show several workflows.

Example:

### Workflow 1

```text
Find AI automation opportunities in Kazakhstan fintech

Running

12 / 20 companies researched
8 qualified leads
```

Current step:

```text
Qualifying companies
```

### Workflow 2

```text
Research B2B SaaS companies in Central Asia

Waiting for approval
```

### Workflow 3

```text
Find ecommerce companies with support automation opportunities

Completed
```

---

## Recent Agent Activity

Build an activity timeline.

Examples:

```text
Research Agent
Analyzed freedomholdingcorp.com
2m ago

Reviewer Agent
Qualified lead with score 86
4m ago

Planner Agent
Created 7 workflow tasks
9m ago

Approval requested
14 outreach messages ready
12m ago
```

Make the activity feel operational and alive.

---

## Approval Preview

Show pending approval summary with CTA to `/approvals`.

---

# Page 2 — Workflows

Route:

```text
/workflows
```

Display a useful workflow table or dense list.

Columns:

- Workflow
- Status
- Progress
- Companies
- Qualified
- Current Step
- Created

Include search/filter controls.

Statuses:

- Running
- Waiting approval
- Completed
- Failed
- Draft

Clicking a workflow should open its detail page.

---

# Page 3 — Workflow Detail

Route:

```text
/workflows/[id]
```

This is the most important screen in Stage 1.

Build one excellent mocked workflow detail page.

Example workflow:

```text
Find AI automation opportunities in Kazakhstan fintech
```

Goal:

```text
Identify fintech companies in Kazakhstan where AI could
improve customer support or internal operations, qualify the
best opportunities and prepare personalized outreach.
```

Status:

```text
Running
```

---

## Workflow Progress

Create a visible execution pipeline:

```text
Planning
Complete

Company Discovery
Complete

Research
Complete

Qualification
Running

Outreach
Waiting

Approval
Waiting

Execution
Waiting
```

Make this easy to scan.

---

## Tasks

Show structured workflow tasks.

Example:

```text
✓ Define ideal customer profile

✓ Discover fintech companies

✓ Research company websites

● Evaluate automation opportunities

○ Score leads

○ Generate personalized outreach

○ Request user approval
```

---

## Companies Tab / Panel

Display discovered companies.

Example realistic companies can be fictional or clearly presented as demo data.

Fields:

- Company
- Industry
- Opportunity
- Score
- Research status

---

## Agent Activity Panel

Create a detailed timeline.

Examples:

```text
Research Agent
Tool call: web_search
Completed

Research Agent
Extracted company profile
Completed

Reviewer Agent
Evaluating automation opportunity
Running

Planner Agent
Updated workflow plan
Completed
```

Show timestamps.

Design this in a way that could later support live updates.

---

# Page 4 — Companies

Route:

```text
/companies
```

Create a dense professional table.

Columns:

- Company
- Industry
- Location
- Opportunity
- Score
- Status
- Last researched

Add:

- search
- status filter
- score filter

Clicking a company can open a detail drawer or route.

If implementing detail view, include:

- overview
- research summary
- opportunities
- score explanation
- source placeholders
- related workflow

---

# Page 5 — Leads

Route:

```text
/leads
```

Create qualified sales opportunity table.

Columns:

- Company
- Lead Score
- Opportunity
- Status
- Outreach
- Workflow
- Updated

Statuses:

- New
- Qualified
- Outreach ready
- Waiting approval
- Contacted
- Responded

---

# Page 6 — Approvals

Route:

```text
/approvals
```

This page must visually communicate human-in-the-loop execution.

Create approval cards or a list.

Example:

```text
Send personalized outreach

14 recipients

Generated by
Outreach Agent

Requested
4 minutes ago

External action
Email communication
```

Actions:

```text
Review
Approve
Reject
```

Do not actually send anything.

Clicking Review should expose proposed individual actions.

Example item:

```text
Recipient:
A demo company

Action:
Send email

Subject:
Reducing support workload with AI

Status:
Waiting for approval
```

---

# Page 7 — Activity

Route:

```text
/activity
```

Global audit log.

Filters:

- All
- Agents
- Tools
- Workflows
- Approvals
- Errors

Event types:

- agent started
- task completed
- tool called
- lead qualified
- approval requested
- workflow completed
- error

Use realistic timestamps.

---

# Page 8 — Settings

Route:

```text
/settings
```

Create a basic settings shell.

Sections:

- Workspace
- AI
- Integrations
- Automation

Integrations should display future connection cards:

- Gmail
- Google Calendar
- HubSpot

Clearly mark them as not connected.

Do not implement real OAuth.

---

# New Workflow Interaction

Create a useful New Workflow dialog or page.

Input:

```text
What should Agentic Ops accomplish?
```

Example placeholder:

```text
Find 20 SaaS companies in Kazakhstan that could benefit
from AI automation and prepare personalized outreach.
```

Optional controls:

- target market
- number of companies
- location
- approval requirement

Primary button:

```text
Create workflow
```

During Stage 1 this should create or simulate a mocked workflow without calling an AI model.

The interaction should still feel believable.

---

# Mock Data

Create centralized strongly typed mock data.

Do not scatter arbitrary hardcoded objects throughout components.

Create mock datasets for:

- workflows
- workflow tasks
- companies
- leads
- approvals
- agent activity

Use realistic demo content.

---

# Core Components

Create reusable components where appropriate.

Examples:

```text
AppSidebar
PageHeader
MetricCard
StatusBadge
WorkflowCard
WorkflowProgress
WorkflowTaskList
CompanyTable
LeadScore
AgentActivity
ActivityItem
ApprovalCard
EmptyState
```

Do not create abstraction merely for abstraction.

---

# States

Include examples of:

- normal
- empty
- running
- completed
- waiting
- failed

A mature product needs states, not only ideal screenshots.

---

# UX Details

Use tooltips where icons are ambiguous.

Buttons must have hover/focus states.

Tables should remain readable.

Long text should truncate gracefully.

Use skeleton components where loading states make sense.

Use contextual empty states rather than generic "No data."

---

# Responsive Behavior

Desktop is the primary experience.

Still ensure:

- sidebar can collapse on smaller displays
- tables do not destroy layout
- primary content remains usable
- dialogs work on laptop-sized screens

---

# Do Not Build Yet

Do NOT implement:

- OpenAI calls
- Agents SDK
- Supabase
- authentication
- Gmail
- HubSpot
- Trigger.dev
- real web search
- MCP
- email sending
- background jobs

This is Stage 1 only.

---

# Verification

After implementation:

1. run formatting/lint checks;
2. run TypeScript checks;
3. run the production build;
4. fix errors;
5. inspect key routes;
6. make sure no obvious broken navigation exists.

Do not claim completion while build errors remain.

---

# Final Result

At the end, the repository should contain a polished working frontend that already looks like a credible product.

A person seeing screenshots should immediately understand:

> This is an operational AI agent platform that plans work, researches companies, qualifies leads and waits for human approval before performing external actions.

Do not stop at a bare skeleton.

Stage 1 should already be portfolio-quality.