# Agentic Ops — Coding Instructions

## Project

Agentic Ops is a portfolio-grade agentic AI SaaS for autonomous sales research and sales automation.

The product converts a natural-language business goal into an auditable workflow:

User Goal  
→ Planning  
→ Company Research  
→ Qualification  
→ Lead Scoring  
→ Personalized Outreach  
→ Human Approval  
→ Execution  
→ Follow-up

This must feel like a real professional SaaS product, not an AI demo or chatbot wrapper.

---

# Core Product Principles

1. Agentic workflows are the core of the product.
2. Every important agent action must be visible to the user.
3. High-impact external actions require human approval.
4. Agent decisions should be explainable and auditable.
5. The UI should feel like a professional operational workspace.
6. Prefer simple architecture over unnecessary abstraction.
7. Do not add infrastructure unless the current stage requires it.
8. Every development stage must leave the application runnable.

---

# Tech Stack

## Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Lucide icons

## Backend

- Next.js server-side APIs / server actions where appropriate
- TypeScript
- Zod for schemas and runtime validation

## Database

- Supabase
- PostgreSQL
- Supabase Auth

## AI

- OpenAI APIs
- OpenAI Agents SDK when agent orchestration is introduced

Main conceptual agents:

- Planner Agent
- Research Agent
- Reviewer Agent
- Executor Agent

Do NOT create unnecessary agents only to make the system look multi-agent.

## Automation

Later stages:

- Trigger.dev
- scheduled follow-ups
- background execution
- retries

Do not implement Trigger.dev during the initial UI stage unless explicitly requested.

## Integrations

Later stages may include:

- Gmail
- Google Calendar
- HubSpot
- MCP servers
- web research tools

External side effects must be protected by approval gates.

## Deployment

- Vercel
- Supabase

---

# Coding Standards

Use strict TypeScript.

Avoid:

- `any`
- giant components
- giant API handlers
- duplicated types
- duplicated UI state
- unnecessary global state
- unnecessary dependencies
- premature microservices

Prefer:

- small reusable components
- typed domain models
- explicit schemas
- server/client separation
- clear error handling
- predictable folder structure

Use Zod for structured external or AI-generated data.

---

# UI Direction

The interface should feel similar in quality and philosophy to:

- Linear
- Raycast
- Vercel
- modern developer tools
- professional operations dashboards

Do not directly copy these products.

Avoid:

- excessive glassmorphism
- giant gradients
- generic AI purple
- huge empty hero sections
- excessive rounded cards
- emoji-heavy UI
- fake futuristic visuals
- chatbot-first layouts

Prefer:

- compact information density
- strong hierarchy
- subtle borders
- restrained radius
- excellent spacing
- clear tables
- command-style interactions
- readable activity logs
- professional SaaS navigation

Dark mode should be first-class.

---

# Main Navigation

Initial product navigation:

- Dashboard
- Workflows
- Leads
- Companies
- Approvals
- Activity
- Settings

---

# Main Entities

The product will eventually contain:

## Workspace

Represents the current organization / environment.

## Workflow

A high-level user goal.

Example:

"Find 20 SaaS companies in Kazakhstan that could benefit from AI automation."

Workflow states may include:

- draft
- planning
- running
- waiting_for_approval
- completed
- failed
- cancelled

## Workflow Task

A concrete step created by the planner.

Examples:

- Define target profile
- Search companies
- Research websites
- Score opportunities
- Generate outreach

## Agent Run

One execution of an AI agent.

## Agent Event

Auditable runtime event.

Examples:

- agent_started
- reasoning_summary
- tool_called
- tool_completed
- task_started
- task_completed
- approval_requested
- approval_received
- error
- retry
- agent_completed

Do not expose hidden chain-of-thought.

Only store and display safe summaries, actions, structured outputs and tool activity.

## Company

Organization discovered through research.

Possible fields:

- id
- name
- website
- industry
- location
- description
- employee estimate
- source URLs
- research summary
- createdAt
- updatedAt

## Lead

A sales opportunity associated with a company.

Possible fields:

- companyId
- status
- score
- scoreReason
- opportunity
- confidence
- contact information when available
- outreach status

## Approval

A proposed external action requiring user confirmation.

Examples:

- send email
- create CRM contact
- schedule follow-up
- modify external data

Approval statuses:

- pending
- approved
- rejected
- cancelled
- executed

---

# Agent Architecture

Long-term architecture:

```text
User Goal
   |
   v
Orchestrator
   |
   v
Planner
   |
   v
Workflow Tasks
   |
   +----------------+
   |                |
   v                v
Researcher       Reviewer
   |                |
   +-------+--------+
           |
           v
     Approval Gate
           |
           v
        Executor
           |
           v
        Result
```

The Orchestrator owns workflow state.

Agents should not arbitrarily modify global application state.

Tools should expose explicit typed interfaces.

---

# Approval Rules

Never automatically perform high-impact external actions during development.

The system should generate proposed actions first.

Example:

```text
Proposed action:
Send personalized email to 18 leads.

Status:
Waiting for approval.
```

Only after explicit approval should the Executor eventually perform the side effect.

During early stages, execution can be simulated.

---

# Observability

Agentic execution must be observable.

Eventually every workflow should show:

- current agent
- current task
- tool calls
- task status
- timestamps
- execution duration
- errors
- retries
- generated outputs
- approvals
- execution cost
- token usage

Build the UI architecture so these can be added without redesigning the application.

---

# Security

Never expose secrets to the frontend.

Never commit `.env.local`.

Use server-side environment variables.

Never allow an AI-generated arbitrary URL, SQL query or command to execute without validation.

Validate all structured AI output.

Treat external websites and tool responses as untrusted input.

---

# Development Philosophy

We are building this incrementally.

Do not implement future stages unless explicitly requested.

If working on Stage 1, do not suddenly implement:

- Gmail
- real CRM sync
- autonomous email sending
- full agent orchestration
- complex queues
- Redis
- Docker infrastructure
- Kubernetes
- Temporal

Mock future behavior cleanly when necessary.

Build interfaces that can later be backed by real systems.

---

# Quality Bar

Before considering a task complete:

- TypeScript should compile.
- UI should render without obvious console errors.
- Responsive layout should work reasonably.
- Empty states should exist.
- Loading states should exist where appropriate.
- Error states should be considered.
- Components should not be unnecessarily duplicated.
- No fake buttons that obviously do nothing unless intentionally marked as prototype behavior.
- No placeholder lorem ipsum.
- Use realistic product data.

---

# Agent Behavior When Coding

Before making major changes:

1. inspect the existing repository;
2. understand current conventions;
3. identify the smallest coherent implementation;
4. preserve working functionality;
5. implement;
6. run relevant checks;
7. fix errors;
8. summarize what changed.

Do not rewrite large parts of the project without a strong reason.

If existing implementation differs from this document, prefer the existing working architecture unless the requested task specifically requires migration.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
