# Frontend Implementation Status

Updated on 2026-09-06 after the editable Builder interaction refinement.

## Current Baseline

The existing eight route-level pages are the product frontend and will be developed in place. Shared UI, navigation, tokens, localization, and page ownership carry forward. The frontend now loads its evaluator workspace projection, Agent trace, DAG, product metadata, API response, wallet display state and consumer action result from the backend demo runtime. Agent planning and DAG review are separate product views under one product header. Live backend integration and the complete durable MVP remain unfinished.

Implemented browser behavior includes route navigation, English/Simplified Chinese selection with a local preference, page composition, dialogs, Graph access-mode selection, backend-provided DAG inspection, and backend action flows. `services/index.js` selects the backend demo client. Build and request flows run through feature hooks with cancellation and duplicate-submission protection; no product page imports browser fixture records.

The Builder now includes the first editable workflow slice under `src/features/workflow-editor/`. It supports a select tool, a hand tool, node dragging, typed connections, node deletion, undo/redo, zoom and fit-to-view, operator and template insertion, operator-specific configuration forms, client-side structural validation, and a centered modal node inspector with a dimmed backdrop. Palette labels are single-line with mouse-following and keyboard-focus descriptions, and operator icons are visually distinct. The current draft is projected back into the existing Builder evidence and Structured DAG views; disconnected or invalid output paths clear the derived schema and preview instead of presenting the old result as current. The `Save draft` control is an explicit demo-only UI boundary and reports that durable persistence is not connected; the backend durable version command and revision-conflict handling are not connected yet.

Application metadata, entry-page actions, and project instructions identify Sprue as a product. The demo workspace and simulated financial operations remain labeled with their actual behavior.

## Remaining Page Work

Deployment infrastructure now includes public API-origin validation, a read-only app-config client, Windows/full-stack Docker orchestration and Vercel/Railway manifests; see [deployment.md](../deployment.md). The default page service adapter remains demo. A reachable backend or successful infrastructure probe does not complete any of the live page dependencies below.

| Page | Current behavior | Needed for the integrated MVP |
|---|---|---|
| Entry | Product introduction and navigation into the demo workspace | Privy sign-in, session restoration, and workspace bootstrap |
| Dashboard | Backend-generated product projection, metrics, activity, sponsor proof, and a dialog that opens its plan | Product list/create APIs, search/filter behavior, durable activity and usage, creator loading/empty/error states |
| Wallet and Access | Sample balances and authorization, local access-mode selection, dialogs without durable writes | Wallet identity/funding, credential storage, validated grants, budgets, recipient capability, balance and policy refresh |
| Agent Planner | Backend-generated intent, source summary, proposal facts, six-stage planning trace, and three-state action composer with a focused existing-plan state plus confirmation dialogs | Durable Agent sessions/messages, live provider discovery, streaming trace, proposal history, and unsupported-intent recovery |
| Builder | Backend-generated cross-chain proposal rendered in an editable semantic DAG; operator/template palette; select/hand tools; typed connections; centered modal node configuration inspector; undo/redo; structural validation; current-draft schema/preview projection; collapsible evidence inspector; compact three-action bar with an explicit demo-only save boundary; bounded backend build action | Durable structured-edit command, immutable provenance/versions, revision conflicts, server validation, real run state and evidence |
| API and Deployment | Backend-generated endpoint, copied endpoint text, and backend action response | Reviewed request parameters, private access, real output, deployment and logs, functional code-example tabs |
| Monetization and Revenue | Backend-generated publication state and price/split projection; publication button remains a demo action | Validated price and confirmed fee policy, creator recipient checks, durable publication state, payment gate, revenue reconciliation |
| Public product | Backend-generated product metadata and a backend consumer action response; no browser payment is performed | Slug-based product loading, real payment requirements, authorized buyer client, receipts and uncertain-payment recovery |

Some secondary controls still have no implemented action, including wallet viewing, deployment logs and navigation collapse. The Builder editor is functional for the bounded in-memory slice, but it cannot yet save a durable version, discover new live sources, execute a changed DAG, or show live Explorer evidence. New-product planning is not connected. Demo publication does not publish an endpoint, and fee terms are not yet agreed. These are concrete implementation tasks, not evidence of completed functionality.

## Implementation Order

1. Review [api-contract.md](../api-contract.md) Draft 0.3 against approved data-model version 1.5 before generating typed contracts. M1-M3 and H2 persistence directions are approved and initial tables exist; the offline DAG runtime exists, but business handlers, production identity verification, Graph adapters and queue processing remain unimplemented. A registered route returning 503 is not a usable frontend integration. Migrate the current JavaScript source incrementally to the selected TypeScript baseline and add real clients under `services/api/` as the backend becomes available.
2. Add session/workspace bootstrap, explicit demo-versus-live source selection, route identity resolution and not-found handling. A failed live request must display an error rather than fall back to sample success.
3. Implement products and Agent planning, editable intent and DAG versions, durable build status, private output, and deployment. Preserve state through navigation using server-backed records.
4. Integrate Graph credentials, Privy wallet and bounded spending, then Hedera recipient validation and optional x402 publication. Payment and fee evidence must come from the backend.
5. Complete page-local interactions, modal focus containment/return, route focus, localized async feedback, input validation, and clipboard failure feedback. Split growing feature components and styles as needed.
6. Verify the complete live creator and consumer journeys with browser tests, then exercise Vercel/Railway and Docker deployment profiles.

The approved large-screen browser scope and English/Simplified Chinese localization remain in force. Token decisions DT1-DT4 are review follow-ups; they do not pause the authorized frontend implementation. The capped consumer funding boundary and provider compatibility checks remain prerequisites for live paid actions.

## Validation of This Transition

### Semantic Builder Update, 2026-09-05

The frontend/backend demo transition now exercises the approved cross-chain scope: two server-side source inputs are mapped to a canonical Swap shape, the mock Agent returns an eleven-node proposal with explicit Union and Join, and the backend runtime returns one cross-chain wallet row. This is a fixture-backed evaluator path, not live Graph/Privy/Hedera evidence. Durable compilation provenance and backend schemas remain H1/H2; a live source profile remains H3.

The backend test suite and frontend build passed after adding the demo HTTP boundary and client tests. The existing Sites packaging adapter passed unchanged. No provider requests, wallet actions, payments, migrations or cloud deployment were performed.

### Editable Workflow Slice, 2026-09-06

The workflow editor was rebuilt as a feature-owned React Flow surface with a versioned operator catalog and predefined insertion templates. Pure tests cover canonical DAG round-tripping without canvas coordinates, template namespacing and undo, cycle rejection, and invalid-output projection. Browser verification at a 1440-pixel viewport covered palette rendering, single-line palette labels, the centered modal node inspector, operator configuration, distinctive toolbar/operator icons, the explicit demo-only save boundary, and the evidence-panel boundary. The React Flow base stylesheet and a minimum zoom below the library default were required so the full DAG remains visible when the editor is open.

### Earlier Frontend Transition

Run `npm run build` and `npm run test:sites`. The build includes page-ownership, localization, backend-client, and token checks; `npm run test:services` validates the backend request boundary without external requests.

On 2026-09-05, the build, 14 automated tests, and token validation passed. Browser checks exercised all seven page families at the supported 1440-pixel viewport, English/Chinese selection and reload persistence, build progress/completion, sample API responses, consumer progress/completion, and leaving a running consumer request. Returning to that page restored the idle view, and the browser reported no console errors or warnings. These are frontend smoke checks, not a full accessibility audit or live-integration evidence.
