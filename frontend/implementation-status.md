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
| Builder | Sample DAG and intent, read-only inspection, cancelable demo build | Agent conversation, validated editable DAG/spec, persisted versions and intent, actual run state and evidence |
| API and Deployment | Sample endpoint, copied endpoint text, demo request response | Reviewed request parameters, private access, real output, deployment and logs, functional code-example tabs |
| Monetization and Revenue | Local publication state and illustrative price/5% split | Validated price and confirmed fee policy, creator recipient checks, durable publication state, payment gate, revenue reconciliation |
| Public product | Sample product and a cancelable four-stage paid-request demonstration | Slug-based product loading, real payment requirements, authorized buyer client, receipts and uncertain-payment recovery |

Some secondary controls still have no implemented action, including wallet viewing, deployment logs, schema/explorer shortcuts, and navigation collapse. New-product and intent dialogs do not create or save definitions. Demo publication does not publish an endpoint, and fee terms are not yet agreed. These are concrete implementation tasks, not evidence of completed functionality.

## Implementation Order

1. Establish typed frontend/backend contracts against data-model version 1.3. Migrate the current JavaScript source incrementally to the selected TypeScript baseline and add real clients under `services/api/` as the backend becomes available.
2. Add session/workspace bootstrap, explicit demo-versus-live source selection, route identity resolution and not-found handling. A failed live request must display an error rather than fall back to sample success.
3. Implement products and Agent planning, editable intent and DAG versions, durable build status, private output, and deployment. Preserve state through navigation using server-backed records.
4. Integrate Graph credentials, Privy wallet and bounded spending, then Hedera recipient validation and optional x402 publication. Payment and fee evidence must come from the backend.
5. Complete page-local interactions, modal focus containment/return, route focus, localized async feedback, input validation, and clipboard failure feedback. Split growing feature components and styles as needed.
6. Verify the complete live creator and consumer journeys with browser tests, then exercise Vercel/Railway and Docker deployment profiles.

The approved large-screen browser scope and English/Simplified Chinese localization remain in force. Token decisions DT1-DT4 are review follow-ups; they do not pause the authorized frontend implementation. The capped consumer funding boundary and provider compatibility checks remain prerequisites for live paid actions.

## Validation of This Transition

Run `npm run build` and `npm run test:sites`. The build includes page-ownership, localization, demo-service, and token checks; `npm run test:services` also runs the service checks independently. Service tests cover canceled demo work, detached response objects, and consumer progress without external requests.

On 2026-09-05, the build, 14 automated tests, and token validation passed. Browser checks exercised all seven page families at the supported 1440-pixel viewport, English/Chinese selection and reload persistence, build progress/completion, sample API responses, consumer progress/completion, and leaving a running consumer request. Returning to that page restored the idle view, and the browser reported no console errors or warnings. These are frontend smoke checks, not a full accessibility audit or live-integration evidence.
