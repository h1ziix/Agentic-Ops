# Release 0.8 metric semantics

Intelligence reads persisted domain records through `intelligence_analytics_08`. The cookie-bound server client verifies the workspace before calling an authenticated, security-invoker RPC; table RLS and an explicit membership check independently protect every aggregate. Analytics reads create no events. No raw run inputs, source bodies, provider credentials, job claims, or thousands of audit events reach the browser.

## Business cohort and time

The selected range includes workflows created from the first local calendar day through the request timestamp. UTC boundaries use `WORKSPACE_TIMEZONE`, default `Asia/Qyzylorda`. Today, 7, 30 and 90 days include the current local day. All time has no lower bound. Company/lead/outreach outcomes, workflow comparison costs and research details are the retained outcomes **to date** of that workflow cohort. Trends group these same cohorts by workflow creation day; they are not message-send-day charts. Editing a saved ICP/template never changes its workflow creation snapshot or a saved lead's research/qualification snapshot.

Agent/model tables use actual **run creation time in the selected range**, across matching workflow/strategy/lead dimensions, including older workflows. Today/7-day/30-day cost summaries use actual workspace run creation times independently of business-cohort and dimension filters. Workflow comparison cost uses all retained runs for that workflow. These deliberately different scopes are labelled in the UI; cost per qualified lead never divides activity-period cost by cohort outcomes.

Costs cover whole matching workflows. Company/lead filters do not attribute spend: run telemetry does not allocate Planner/shared/research work to individual companies. Cost-per-unit ratios are unavailable with industry, location, status, confidence or score filters; workflow/ICP/template filters can retain their coherent whole-workflow ratios.

## Funnel unit

One funnel unit is a unique `(workflow_id, company_id)` association. The same canonical company researched in two workflows contributes two units. Companies remain unique workspace entities on Companies. The cohort's count is unaffected by multiple runs, retries, replacement email proposals, follow-up messages, or several replies.

The funnel is cumulative: each displayed stage also satisfies all prior stages. Reliable legacy records with missing review/approval history can appear in operational message counts without appearing at later cumulative funnel stages. Their missing history is not invented.

| Metric | Definition |
| --- | --- |
| Discovered | Persisted workflow-company associations in the cohort. |
| Researched | Association `research_status = researched`. |
| Qualified leads | Researched unit whose immutable qualification snapshot says qualified. Without a qualification snapshot, a progressed qualification/outreach status or exact saved `lead_qualified` audit record supports the stage; an ambiguous rejected/new record is not silently qualified. Reviewer rejection does not erase a preserved historical qualification snapshot. |
| Reviewer approved | Qualified unit with saved review decision `approve_for_outreach`. |
| Draft created | Prior stages plus a persisted `send_email` proposal for this company/workflow. |
| Approval requested | Prior stages plus its persisted approval record. |
| Approved | Prior stages plus an immutable action approval snapshot. A pending, legacy non-executable, or cancelled unapproved proposal is not approval evidence. |
| Sent | Prior stages plus a successful persisted email execution attempt. Approval alone never means sent. |
| Reply detected | Prior stages plus a persisted reply observation tied to its lead. |

Stage rate is `next distinct units / previous distinct units × 100`, with `null` for zero denominators. Reply rate is unavailable: the current domain does not establish complete mailbox monitoring coverage for every sent unit. Detected reply counts are observations, not a claim that all unobserved recipients have not replied. No delivery, opens or sales conversion rate is invented.

The workflow funnel is a separate set of **overlapping recorded milestones**, each counting distinct workflows from the entire filtered cohort: created, a completed Planner run, recorded company research, qualified leads, a requested proposal, an immutable approved action snapshot, a successful email attempt, and completed workflow state. It has no conversion rates: a legitimate research-only workflow can complete without an approval/send branch, and incomplete legacy history can omit an earlier milestone. Workflow status distribution separately shows current state.

## Operational counts

`messagesSent` counts distinct email actions with a successful attempt, including independent follow-ups. `repliesDetected` counts persisted normalized reply observations. `executionsAttempted` counts dispatched attempts of all action types. These can exceed funnel company counts and are never used as its denominators. `pendingApprovals` counts pending email proposals in the filtered cohort; `failedJobs` counts failed jobs; `needsAttention` counts paused/failed/needs-revision workflows. Scheduled follow-ups count saved approved/executed internal plans, including retained cancelled history; completed follow-ups require `automation_status = completed` (confirmed draft action execution).

Agent runs count saved run records. Success rate is completed / (completed + failed), excluding queued/running/cancelled runs from the denominator. Average duration uses known persisted duration or completed timestamp differences. Retries sum saved per-run retry counts. Tool calls deduplicate `tool_called` by saved correlation ID per run; historical events without one remain distinct observations. No model intelligence score is assigned.

## Nullable cost and usage

Existing Release 0.7 run cost, usage status and pricing version remain authoritative. No retrospective repricing occurs. Executor records are not AI calls; legacy non-Executor records with a missing model retain an Unknown model and unavailable cost. Estimated total cost is unavailable if any AI run cost is unknown; the known subtotal is separately available with an unknown-run count. No AI run/no observed estimate is unavailable rather than `$0.00`. An observed priced zero remains zero. Known token totals can be partial; unknown-usage counts identify incomplete coverage. Cost per company/qualified lead/sent unit requires a fully known cohort cost and a positive denominator. No cost-per-reply metric is calculated.

## Historical research and segmentation

Lead `research_snapshot` is preferred. Without it, a completed persisted researcher result for the exact company/workflow is used, preferring its saved research-run reference. The mutable workspace company profile is never used to fabricate historical industry, geography, opportunities, source evidence or confidence. Missing history is `Unknown` and counted separately.

Industry aliases normalize Fintech, SaaS and Ecommerce; other values normalize whitespace/case. Explicit recognized country strings normalize geography; a city alone is retained as a city, without silently inferring a country. Free-form opportunity categories map to customer support, lead qualification, knowledge automation, document processing, sales operations, internal operations, workflow automation, Other or Unknown. Original research is unchanged. Multiple opportunities in one category contribute one company-workflow unit to that category. Different categories can overlap, so category totals are not additive.

Source categories use saved typed metadata where available; raw historical research classifies same-domain sources as Company websites and other URLs as Other. Only distinct valid persisted public URLs count as sources; malformed/missing URLs are excluded. It does not guess search provenance, directories or news from names. A unit can be supported by several source categories; their counts overlap and describe association, not causation.

Research quality shows average distinct valid sources per researched unit. Without usable evidence means a retained snapshot has no nonempty factual claim/quote whose referenced valid source contains the normalized quote. Missing snapshots remain unavailable, not zero evidence. Research failures count saved failed company research runs in the cohort, including failures followed by a successful retry. Partial-failure workflows have a saved failed company research run and at least one researched company. High-confidence research and evidence-quality component below the existing threshold 7 use saved outputs. No arbitrary new quality score is introduced.

Workflow comparison returns the latest 200 matching workflows and explicitly signals truncation. All summary/segment/usage aggregates include the full matching database population. No sampled client-side totals or fabricated demo fallback are used.
