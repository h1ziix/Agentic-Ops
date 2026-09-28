# Agentic Ops design direction

## Product
An operational workspace for auditable sales agents. Use the existing routes and typed local demo data. Do not invent metrics, execution, integrations, or CRM states that are not available.

## Composition
A 232px ink sidebar, 64px context bar, and a quiet gridded canvas. Overview is a command center; records use compact tables with deliberate mobile lists; approvals use queue/message/context columns; workflow details use task, evidence, and trace tabs.

## Visual system
Light mode uses a cool off-white canvas, white panels, dark ink navigation, cobalt action accents, and thin blue-gray borders. Dark mode uses navy surfaces with the same cobalt action language. Green denotes completed or healthy progress, amber denotes human review, and red denotes failure. Use tokens in src/app/globals.css; do not duplicate palette values in feature components.

Use Geist, 30–34px page headings, 12–13px work content, small metadata, and tabular numeric values. Prefer separators and aligned rows over nested cards. Standard radii are 6–8px. Pixel marks, tiny signals, a quiet canvas grid, and a dotted execution field carry identity.

## Interaction
Use installed shadcn/Base UI primitives. Motion is the default: fast opacity entrances, subtle position changes, shared tab/navigation indicators, no-bounce springs, drawers and dialogs, and state feedback. Primary actions lift and sweep once on hover; other buttons, rows, links, and tabs respond according to their role. Use the SSR-safe useReducedMotion hook from src/lib/use-reduced-motion.ts. Avoid JSX differences between server and first hydration render. Preserve native scrolling.

Every control needs a real action, visible keyboard focus, and relevant empty/error/loading state. Support ~390px, 768px, 1024px, 1280px, and 1440px+. Validate via browser and polish after implementation.

## Inspiration
21st catalog search: compact application sidebar, command palette, operations dashboard. Existing project primitives were adapted; no unrelated registry components or hosted generation were added.
