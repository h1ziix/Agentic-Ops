# Research citation validation repair

4 October 2026, Asia/Qyzylorda. Code checkpoint `b90049a`; production deployment `dpl_BRuJHk3d4MchHGYd3DYKCztxuqC7` is READY at [the canonical application](https://agentic-ops-gold.vercel.app). [Build inspection](https://vercel.com/h1ziixs-projects/agentic-ops/BRuJHk3d4MchHGYd3DYKCztxuqC7).

## Observed failure

A saved production Research run failed with `Unsupported evidence citation`: at least one model quote was absent from its cited search snippet. Planner, target profile and Discovery had completed. The evidence validator correctly rejected the assessment. The rejected raw model response was not stored, so the original erroneous quote cannot be reconstructed from the safe trace.

The first assessment validation failure previously stopped the company immediately, even when its existing model/retry budget still allowed a correction. This fix preserves the strict evidence validator and all persistence/approval gates.

## Change and bounds

- Request one new complete assessment with an allowlisted validation category and the identical supplied evidence. Do not send raw rejected output, hidden reasoning or validation exception details back to the model or logs.
- Revalidate the whole corrected assessment before returning or saving it. Repeated unsupported citations still fail; nothing is silently dropped or treated as evidence.
- Reuse the existing two model-call limit and one shared retry. Website resolution and transient Gemini/Tavily retries consume the same limits. No third model call or fresh search loop is added.
- Record safe rejection/retry events and account for both attempts' observed token usage. Missing usage/cost stays unknown.

No model switch, schema migration, new integration or UI change was required.

## Verification

All **224** automated tests pass, including six new regressions: valid repair with identical cached evidence, rejection after a second invalid assessment, exhausted Gemini retry, exhausted Tavily retry with a model slot remaining, no third call after website resolution, and safe provider feedback. TypeScript, lint, source/history secret scan and whitespace checks pass. The cloud production build compiles, checks TypeScript and generates pages successfully.

After publishing, the owner's stopped workflow was retried once through its normal UI. Research, Qualification, Reviewer and Outreach completed. Reloading confirmed persisted `waiting_for_approval`, one researched/qualified company and one pending draft. The failed run remains in history. The live continuation recorded zero automatic retries: the new assessment passed on its first call. Automatic validation repair itself is covered by the mocked regressions, not claimed exercised in this live run.

Discovery had originally saved one supported candidate for a target of three; the retry did not fabricate extra companies or rerun completed discovery. The draft still has no confirmed recipient. No action was approved or executed; recorded contacted companies and Executor successes are zero. Gmail/HubSpot/worker and controlled external execution acceptance remain pending.

Repeated public HTTP checks pass: sign-in/demo available, protected navigation redirects, valid unauthenticated reads and unsigned worker dispatch reject with 401. A fresh remote scan covers 14 public HTML pages and 31 browser scripts with zero server credential findings, including comparison against the production Supabase secret. Authenticated runtime data and screenshots were inspected privately, not committed as portfolio evidence.
