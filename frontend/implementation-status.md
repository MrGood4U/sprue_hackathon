# Frontend Implementation Status

Updated on 2026-09-05 after the human team promoted this application to the maintained Sprue frontend.

## Current Baseline

The existing seven pages are the product frontend and will be developed in place. Shared UI, navigation, tokens, localization, and page ownership carry forward. The current runtime has one demo workspace; live backend integration and the complete MVP remain unfinished.

Implemented browser behavior includes route navigation, English/Simplified Chinese selection with a local preference, page composition, dialogs, Graph access-mode selection, DAG inspection, and sample build/request/publication flows. `services/index.js` currently selects the demo adapter. Build and request flows run through feature hooks with cancellation and duplicate-submission protection; sample response objects live in `services/demo/fixtures/`.

Application metadata, entry-page actions, and project instructions identify Sprue as a product. The demo workspace and simulated financial operations remain labeled with their actual behavior.

## Remaining Page Work

| Page | Current behavior | Needed for the integrated MVP |
|---|---|---|
| Entry | Product introduction and navigation into the demo workspace | Privy sign-in, session restoration, and workspace bootstrap |
| Dashboard | One sample product, static metrics, and a dialog that opens its sample plan | Product list/create APIs, search/filter behavior, actual activity and usage, loading/empty/error states |
| Wallet and Access | Sample balances and authorization, local access-mode selection, dialogs without durable writes | Wallet identity/funding, credential storage, validated grants, budgets, recipient capability, balance and policy refresh |
| Builder | Seven-node synthetic spec, actual-edge layout, four-card semantic overview, keyboard disclosure, read-only node/spec/schema inspection, constrained local parameter recompilation and resettable simulated trace | Agent conversation, reviewed backend compiler/templates, general structured editing, immutable provenance/versions, real run state and evidence |
| API and Deployment | Sample endpoint, copied endpoint text, demo request response | Reviewed request parameters, private access, real output, deployment and logs, functional code-example tabs |
| Monetization and Revenue | Local publication state and illustrative price/5% split | Validated price and confirmed fee policy, creator recipient checks, durable publication state, payment gate, revenue reconciliation |
| Public product | Sample product and a cancelable four-stage paid-request demonstration | Slug-based product loading, real payment requirements, authorized buyer client, receipts and uncertain-payment recovery |

Some secondary controls still have no implemented action, including wallet viewing, deployment logs and navigation collapse. The Builder now provides functional source-configuration and full-schema inspection; live Explorer evidence is not available. New-product planning is not connected, and local template edits do not create or save versions. Demo publication does not publish an endpoint, and fee terms are not yet agreed. These are concrete implementation tasks, not evidence of completed functionality.

## Implementation Order

1. Review [api-contract.md](../api-contract.md) Draft 0.1 and resolve its model gates against data-model version 1.3 before generating typed contracts. Migrate the current JavaScript source incrementally to the selected TypeScript baseline and add real clients under `services/api/` as the backend becomes available.
2. Add session/workspace bootstrap, explicit demo-versus-live source selection, route identity resolution and not-found handling. A failed live request must display an error rather than fall back to sample success.
3. Implement products and Agent planning, editable intent and DAG versions, durable build status, private output, and deployment. Preserve state through navigation using server-backed records.
4. Integrate Graph credentials, Privy wallet and bounded spending, then Hedera recipient validation and optional x402 publication. Payment and fee evidence must come from the backend.
5. Complete page-local interactions, modal focus containment/return, route focus, localized async feedback, input validation, and clipboard failure feedback. Split growing feature components and styles as needed.
6. Verify the complete live creator and consumer journeys with browser tests, then exercise Vercel/Railway and Docker deployment profiles.

The approved large-screen browser scope and English/Simplified Chinese localization remain in force. Token decisions DT1-DT4 are review follow-ups; they do not pause the authorized frontend implementation. The capped consumer funding boundary and provider compatibility checks remain prerequisites for live paid actions.

## Validation of This Transition

### Semantic Builder Update, 2026-09-05

The five-type scope is reflected in a synthetic seven-node spec. The two semantic groups expand read-only, actual edge IDs determine layout/connections, and constrained parameter changes rebuild local config and reset the simulated trace. A test-only evaluator independently checks the fixed expected output, including one-day wallets in the denominator and same-day event deduplication. This is not the backend interpreter. Canonical model, Builder, API and consumer examples share four typed output fields. Durable compilation provenance and backend schemas remain H1/H2; a live metric/source/profile remains H3.

The build, 26 automated tests and token validation passed, including 12 new Builder tests. The existing Sites packaging adapter passed unchanged. A local Builder route returned HTTP 200 and was opened for preview; no new browser interaction, screenshot or visual QA was performed for this canvas. Earlier visual evidence below describes the previous frontend state, not this update. No provider requests, backend runtime, payments, migrations or cloud deployment were performed.

### Earlier Frontend Transition

Run `npm run build` and `npm run test:sites`. The build includes page-ownership, localization, demo-service, and token checks; `npm run test:services` also runs the service checks independently. Service tests cover canceled demo work, detached response objects, and consumer progress without external requests.

On 2026-09-05, the build, 14 automated tests, and token validation passed. Browser checks exercised all seven page families at the supported 1440-pixel viewport, English/Chinese selection and reload persistence, build progress/completion, sample API responses, consumer progress/completion, and leaving a running consumer request. Returning to that page restored the idle view, and the browser reported no console errors or warnings. These are frontend smoke checks, not a full accessibility audit or live-integration evidence.
