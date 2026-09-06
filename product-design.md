# Sprue Product and Interface Design

## Status

Draft 1.32, updated on 2026-09-07. The user promoted the existing frontend to the maintained Sprue product and authorized continued implementation. D1, D2, and D4 are approved, D3 targets large-screen browsers, and the Evidence-First Console direction is selected. The public Entry page now contains only product explanation plus clear `Log in` and `Enter console` routes; Google and GitHub authentication is concentrated on a dedicated Login page and uses their official, unmodified brand marks rather than theme-colored generic icons. A completed Privy session is not an intermediate destination: after server-verified identity bootstrap succeeds, the Login route immediately enters the Product Dashboard without rendering a signed-in confirmation card. Provider subjects resolve to stable Sprue user IDs, creator routes require completed bootstrap, and public product access remains unauthenticated. The authenticated account control is anchored at the right edge of every Creator Console header instead of consuming persistent sidebar space; its avatar opens a compact identity, workspace, existing-destination, and sign-out menu. Language and account controls are top-aligned at that shared right edge. A dedicated Model Service page lets the creator configure and explicitly test the OpenAI-compatible language model used by Agent planning. Graph credential management is disclosed only when API-key access is selected and keeps its primary action next to the credential list. The Product Dashboard is focused on summary metrics and the product list; the redundant Recent Activity and Sponsor Proof panels are removed, and its creation action is colocated with the All Products controls instead of competing with global header controls. Product names use one shared inline-edit interaction across the Dashboard and product header, and the evaluator new-product flow begins with `New Product`. The Builder canvas now uses a larger, more visible tokenized dot grid while keeping it subordinate to nodes and edges. The API view prioritizes an explicit request-parameter contract and always-visible response schema/example, while omitting the standalone deployment-evidence panel. Token review remains follow-up work; durable product creation and naming, account-linking UI, durable model-secret storage, Graph, account-wallet, and payment integrations are still pending.

This document defines the MVP information architecture, page inventory, interactions, state behavior, desktop layout behavior, accessibility requirements, and screen-to-domain contracts. The decisions are recorded in [Confirmed Design Decisions](#confirmed-design-decisions).

## Design Objective

The Creator Console must make Sprue feel like a transparent data-product compiler:

```text
Describe an onchain data product
    -> inspect the source and transformation plan
    -> authorize a bounded build
    -> deploy a persistent private API
    -> optionally publish it behind Hedera x402
    -> verify paid usage and creator proceeds
```

The interface must keep the Agent useful without hiding product semantics, data lineage, wallet authority, cost, deployment state, or payment evidence.

Product boundary confirmed on 2026-09-05: Sprue selects and queries existing Subgraphs and applies necessary supported transformations; it never creates or deploys new Subgraphs or Subgraph Composition. A source gap explains missing facts and bounded-search limits, then asks for a requirement revision or another existing source. Do not offer an upstream index-creation action. Build and Deploy still refer to the Sprue data product and hosted API. A later scope decision on 2026-09-05 approved multiple existing Subgraphs with explicit Union/Join DAG nodes; the current frontend design record predates that runtime extension and needs a follow-up UI alignment pass.

## MVP Experience Principles

1. **One primary action per view.** Secondary actions remain visible but visually subordinate.
2. **Plan before spending.** Conversation and non-paid planning may proceed before funding, but Build, Refresh, Deploy, and Monetize require explicit human actions and their relevant readiness checks.
3. **Private before paid.** Every successful product becomes testable through creator-authorized private access before x402 publication is offered.
4. **No hidden financial fallback.** A failed Graph API key never switches to creator-wallet x402 automatically.
5. **Balances remain separate.** Base/Base Sepolia Graph-spending funds and Hedera HBAR proceeds are never displayed as one spendable balance.
6. **The canvas is not the only explanation.** The canonical specification, node inspector, output schema, trace, and accessible structured DAG view remain available.
7. **State survives reloads.** Long-running Agent, build, refresh, deployment, and payment operations must be represented by durable server state rather than transient spinners.
8. **Real and replayed evidence are labeled.** Fixtures, example responses, and recorded receipts must never be presented as live integrations.

## Actors and Access Boundaries

### Creator

An authenticated Privy user who owns the MVP workspace, account wallet, products, credentials, policies, deployments, and publication decisions.

### Public Consumer

An unauthenticated external developer or agent that can inspect public product documentation and call an x402-protected endpoint. The consumer must use a compatible Hedera payment client for a live paid request.

### Evaluator

An ETHGlobal judge who needs a short, understandable path through the real product. Evaluator access must not expose creator credentials, wallet signing material, private payment payloads, or unrestricted spending authority.

The MVP implements one active owner per workspace. Invitations, role management, and non-owner Creator Console views are out of scope.

## Approved Page Count

The MVP contains **ten route-level page families**. Parameterized routes and create/edit variants within one family do not increase this count. Privy callbacks, generic errors, and not-found routes are utility routes rather than product pages.

| No. | Page family | Proposed route | Audience | Primary outcome |
|---:|---|---|---|---|
| 1 | Entry | `/` | Public | Understand Sprue and choose the Creator Console or public demo path |
| 2 | Creator Login | `/login` | Public | Authenticate with an approved provider before entering the console |
| 3 | Product Dashboard | `/app` | Creator | Start or resume a data product |
| 4 | Wallet and Access | `/app/wallet` | Creator | Prepare Graph credentials, wallet funding, and bounded authority |
| 5 | Model Service | `/app/model` | Creator | Configure the language model used for Agent plan generation |
| 6 | Agent Planner | `/app/products/new`, `/app/products/:productId/agent` | Creator | Describe intent, discover sources, and review Agent progress |
| 7 | DAG Builder | `/app/products/:productId/build` | Creator | Inspect, refine, validate, and build the generated DAG |
| 8 | API and Deployment | `/app/products/:productId/api` | Creator | Deploy and privately test a persistent API |
| 9 | Monetization and Revenue | `/app/products/:productId/monetize` | Creator | Validate Hedera receipt, enable x402, and reconcile sales |
| 10 | Public Product and Consumer Demo | `/p/:slug` | Public | Understand and exercise the paid API flow |

There is no separate MVP page for run history, global settings, team management, or marketplace discovery. Agent progress belongs inside Agent Planner; build trace and recent runs belong inside DAG Builder; API usage belongs inside API and Deployment; payment history belongs inside Monetization and Revenue.

## Route and Navigation Model

### Public Navigation

The public header contains the Sprue wordmark, a `View demo` link, a secondary `Log in` action, and the language selector. The hero contains the page's primary `Enter console` action. When no verified session exists, either creator action navigates to `/login` without opening a provider dialog directly. With a completed session, the actions open `/app`. The Entry page must not imitate a large marketing website or duplicate provider choices.

### Creator Console Navigation

Supported desktop layouts use a persistent application sidebar with three top-level destinations:

- `Products`
- `Wallet & Access`
- `Model Service`

The account control sits at the far right of shared application and product headers, after the language selector, and both controls are aligned to the header's top edge. Page-local primary actions stay with the content they affect instead of displacing these global controls. Its compact avatar button opens a menu anchored below the trigger containing the authenticated identity, current workspace, links to the existing Product Dashboard, Wallet & Access, and Model Service routes, followed by a visually separated sign-out action. It does not invent Team, Billing, or account-preference routes that are outside the current page inventory. The button exposes its expanded state, the menu is keyboard reachable, `Escape` returns focus to the trigger, and outside click or destination selection dismisses it. Environment and provider readiness are not persistent navigation content; they belong in the Wallet & Access page or the relevant product workflow. Destructive actions do not belong in primary navigation and sign-out remains separated inside the account menu.

Inside a product, a persistent product header shows the product name and four deep-linkable views. The product name and adjacent pencil action both enter inline editing. The controlled field receives visible focus; `Enter` or focus leaving the field commits a non-empty trimmed name, while `Escape` restores the prior value. An empty field restores the prior value instead of erasing the product name. Version, deployment, and workflow status are shown within the page where they support a decision rather than as always-visible header controls:

- `Agent`
- `Build`
- `API`
- `Monetize`

The browser Back action must preserve product context, filters, chat draft, selected DAG node, and scroll position when safe. URL parameters identify product, product view, selected version, and selected run where appropriate. Modal and drawer state should use URL state only when it must be shareable or restorable.

### Readiness Surfaces

The Creator Console presents compact, separately labeled readiness facts in the Wallet & Access page and the relevant product workflows:

- Graph access: `API key ready`, `x402 ready`, or `Action required`.
- Graph spending balance: network and asset included.
- Hedera receipt: `Verified`, `Pending`, or `Unavailable`.
- Environment: `Demo`, `Local`, or `Self-hosted`.

These facts are links to the relevant corrective view. They never combine unlike assets into one total.

## Primary Journeys

### Creator Build Journey

```text
Sign in
    -> open Product Dashboard
    -> create a product
    -> describe the intended data product
    -> review Agent assumptions, Graph source, access mode, DAG, and output schema
    -> accept the proposed immutable version
    -> resolve wallet, credential, policy, or budget blockers
    -> confirm Build
    -> follow the live trace
    -> inspect the materialized output
    -> open API and Deployment
    -> deploy and make a private test request
```

### Conversational Edit Journey

```text
Open an existing product in Build
    -> request a change in chat
    -> inspect the semantic diff and revised DAG
    -> accept as a new immutable version
    -> validate and Build
    -> compare output
    -> deploy the ready version explicitly
```

An Agent response never silently changes the active deployment. Semantic changes remain staged until the creator accepts a proposed version. Chat messages may autosave, but unaccepted DAG or form changes require a navigation warning.

### Monetization Journey

```text
Open a healthy private API
    -> open Monetize
    -> resolve and prove control of the Hedera recipient
    -> confirm HBAR receive and later-access capability
    -> enter an HBAR request price
    -> validate the current Blocky402 capability and fee payer
    -> review the x402 publication summary
    -> activate the publication explicitly
    -> open the public consumer page
```

### Consumer Payment Journey

```text
Open public product page
    -> inspect schema, freshness, price, network, and example
    -> submit a bounded request
    -> receive and inspect the x402 requirement
    -> authorize through a compatible Hedera client
    -> observe verification and settlement
    -> receive the pinned materialized response
    -> inspect the public-safe receipt and transaction reference
```

If payment confirms but response delivery fails, the UI offers delivery retry against the same request and payment. It must not invite another payment.

## Page Specifications

### 1. Entry

**Purpose:** Explain the product in under 30 seconds and provide a reliable path to the console, login, and public demo without mixing authentication controls into the product story.

**Primary action:** `Enter console`. The header also exposes `Log in`.

**Content and interaction elements:**

- Concise hero: `Describe it. Shape it. Sell it.`
- One-sentence product definition focused on persistent APIs rather than one-off answers.
- Traceable-chain visual explaining intent, DAG, source, API, and payment stages.
- Header `Log in` action and hero `Enter console` action. Both navigate to `/login` while signed out and `/app` after authentication/bootstrap succeeds.
- `View public demo` link to the selected demo product.
- Compact integration explanation for The Graph, Privy, Hedera, and Blocky402.
- Repository and demo-video links once submission assets exist.

**States:**

- Signed out, with both creator actions targeting `/login`.
- Signed in and ready, with both creator actions targeting `/app`.
- Public demo unavailable, with the Creator Console action remaining usable.

### 2. Creator Login

**Purpose:** Present authentication as one focused step after the creator has chosen to enter the console.

**Primary actions:** `Google` and `GitHub`.

**Content and interaction elements:**

- Sprue wordmark, language selector, and a predictable `Back to Sprue` route.
- Two explicit Privy authentication choices: Google OAuth and GitHub OAuth, each using its official brand mark at equal visual weight without inheriting Sprue's accent color.
- Automatic navigation to `/app` only after provider authentication and server-side Sprue identity bootstrap both complete.
- Provider-safe loading, configuration, and error messages in the same stable card.

**States:**

- Authentication configuration loading.
- Authentication unavailable when the deployment has no complete Privy configuration; provider actions remain disabled.
- Signed out and ready to select a provider.
- Authentication failed with a provider-safe error.
- Signed in and bootstrapping the local user/default owner workspace.
- Authenticated and bootstrapped, which redirects directly to `/app` without a persistent success card.

Each provider resolves through Privy to a server-verified subject, which the backend maps through an authentication binding to a stable Sprue user UUID. The provider subject is never displayed or used as the application user ID. Sprue does not infer account linking across different provider subjects and does not accept a browser-provided local user/workspace identifier. Authentication remains separate from the creator account wallet, funding, and delegated payment authority.

### 3. Product Dashboard

**Purpose:** Show product state and make the next useful action obvious.

**Primary action:** `Create data product`, colocated in the `All products` toolbar before its search and filter controls.

**Content and interaction elements:**

- Welcome and workspace heading.
- Product list using cards for one to three products and a table when the list grows.
- One `Create data product` action in the product-list toolbar; the Dashboard page header contains only the top-right global language and account controls.
- A persistent pencil action beside each product name. It enters the same controlled inline editor used by the product header; focus leaving the field saves, `Enter` saves, `Escape` cancels, and a failed save leaves a visible recoverable error.
- The evaluator new-product flow assigns the initial name `New Product` before opening the Agent view. This is session-scoped until durable product creation is implemented.
- Per-product facts: name, lifecycle status, active version, last successful build, data freshness, API access mode, deployment health, and last updated time.
- Per-product actions: `Open builder`, `Open API`, and `Resume setup` when blocked.
- Empty state with the example DEX-stickiness intent and one creation action.

**States:**

- New workspace with no products.
- Products loading through shape-preserving skeletons.
- Active, suspended, and failed products with text labels in addition to color.
- Partially configured product with the exact next step.
- Dashboard read failure with retry; cached data, if shown, includes its observation time.

**Domain reads:** `data_products`, active `data_product_versions`, `deployments`, `materializations`, latest `execution_runs`, and the `active_product_view` and `product_run_status` read models.

### 4. Wallet and Access

**Purpose:** Configure the reusable account-level resources required by product builds and optional revenue receipt.

**Primary action:** Contextual: `Set up Graph x402`, `Add Graph API key`, or `Resolve blocker`, depending on readiness.

**Sections and interaction elements:**

1. **Privy account wallet**
   - Control-model status, safe provider identifiers, and verification time.
   - Base/Base Sepolia address for Graph spending and a copy action.
   - External funding instructions and `Refresh balance`; Sprue does not imply that copying an address is an in-app top-up.
   - Additional-signer grant and provider-policy status.
   - `Grant bounded authority`, `Review policy`, and destructive `Revoke authority` actions.

2. **Graph access resources**
   - The access-mode selector uses progressive disclosure. API-key mode shows the credential list and its colocated `Add API key` action; x402 mode hides both because credentials are not part of that payment path. Switching modes changes presentation only and does not silently delete or convert an existing credential.
   - API-key credential cards showing label, validation status, safe prefix/fingerprint, version, last validation, and last use.
   - `Add API key`, `Rotate`, `Validate`, and `Revoke` actions. Raw keys are submitted directly to the server, never written to browser storage, and never shown again.
   - Graph x402 policy editor with network, asset, allowed destination, maximum per request, period limit, period type, optional lifetime cap, and validity window.
   - Available budget, confirmed spend, and active reservations displayed separately.

3. **Hedera receipt readiness**
   - Hedera testnet account ID and observed EVM-address mapping.
   - Account completion, identity resolution, creator control, HBAR receive capability, and HBAR later-access capability.
   - `Run bounded verification` or `Refresh evidence` action when an approved implementation exists.
   - Clear statement that receipt readiness is independent of Graph-spending funds.

4. **Account activity**
   - Filterable ledger rows for top-ups and Graph expenses, grouped by network and asset.
   - Payment status, product/run reference, amount, asset, network, time, and evidence link.
   - No summed total across Base USDC and Hedera HBAR.

**Blocking states and recovery:**

| State | Message | Recovery action |
|---|---|---|
| Wallet provisioning | Wallet setup is still processing | Refresh provider state |
| Insufficient Graph funds | Current wallet balance cannot cover the allowed operation | Copy funding address and refresh balance |
| Missing signer grant | Sprue cannot make bounded Graph payments | Review and grant authority |
| Policy drifted | Provider policy differs from the approved snapshot | Inspect diff and re-approve or revoke |
| Grant revoked or expired | New Graph payments are blocked | Create a new approved grant |
| Period budget exhausted | No available budget remains in this period | Wait for reset or approve a revised policy |
| Graph credential invalid | API-key builds are blocked; x402 will not be selected automatically | Rotate or validate the credential |
| Hedera identity unresolved | Paid publication cannot activate | Resolve account mapping |
| HBAR receive/access unverified | Revenue receipt is not proven | Run the bounded capability test |

**Domain reads and writes:** `account_wallets`, `wallet_addresses`, `wallet_asset_capabilities`, `wallet_policies`, `wallet_signer_grants`, `spending_policies`, `budget_reservations`, `wallet_balance_snapshots`, `provider_credentials`, `payment_intents`, and `financial_ledger_entries`.

### 5. Model Service

**Purpose:** Configure the creator-selected language-model service used when Sprue generates an Agent plan.

**Primary action:** `Save configuration`. `Test connection` is a secondary, explicit provider action.

**Content and interaction elements:**

- A complete HTTPS OpenAI-compatible Chat Completions URL.
- A masked API-key input with a closed-eye control by default. The key is revealed only after the creator activates the control. A configured-but-redacted key is represented by stars; the value is never written to browser storage or returned by a read response.
- An exact provider model name/ID. Empty API URL and model fields use the official OpenAI Chat Completions endpoint and `gpt-5.6-sol` as examples, not automatically submitted values.
- Visible labels, field-level validation, disabled duplicate submission while saving, and explicit loading, success, and failure feedback.
- A secondary `Test connection` control that uses the current form values, shows bounded progress and availability feedback, and discloses that the minimal provider request may incur charges.
- A concise execution-boundary explanation: the selected model receives the creator intent plus bounded source/schema summaries and may return only a structured proposal. It receives no wallet authority, unrestricted network tools, or arbitrary code execution.
- A clear temporary-runtime notice when durable authenticated secret storage is unavailable.

**Behavior:** Saving a valid profile does not call the model. `Test connection` sends one minimal fixed Chat Completions request to the current form configuration without saving it; when the key field is blank, it may reuse the current session's already-configured key. Test success exposes only availability, selected model, and latency. The next explicit `Generate plan` action uses the saved URL, key, and model. The returned JSON remains untrusted and must pass the same proposal schema, source binding, operator allowlist, acyclicity, and resource validation as mock output. Build, API test, and payment actions do not invoke the model implicitly.

**Current evaluator boundary:** The demo runtime retains one redacted profile per random browser-session ID in bounded backend process memory. It returns only URL, model, configured state, key-present state, and update time; the raw key is never returned. API restart clears the profile. This UUID is session scoping, not production authentication. Durable product behavior requires verified creator identity, a workspace-owned model profile, and a server-side secret-manager reference before implementation.

**States:** Loading, not configured, saving, configured, saved, testing, test available, test unavailable, invalid field, and backend unavailable.

**Future domain reads and writes:** A reviewed workspace model-profile resource and secret-manager reference. No raw model API key has a valid persistence field. Agent messages and planning calls retain the non-secret provider/model identity actually used.

### 6. Agent Planner

**Purpose:** Turn a natural-language request into an inspectable source and DAG proposal without hiding the Agent's work.

**Primary action:** `Generate DAG`.

**Desktop layout:**

- Main area: user/Agent conversation and the current intent composer.
- Side panel: a visual execution progress timeline.
- Product header: the four-step `Agent` → `Build` → `API` → `Monetize` journey.

The Agent page is the primary surface while planning. It does not show the full DAG, schema JSON, or API response by default. A completed plan offers `Review generated DAG`, which opens the Build page.

**Conversation elements:**

- Multiline intent composer with an explicit generate action.
- User intent message and structured Agent response.
- Discovered source chips, source count, DAG node count, and output-field count.
- Demo-versus-live labeling and operation status.
- No hidden chain-of-thought is requested or displayed.

**Progress elements:**

- Intent admission.
- Source planning.
- Proposal validation.
- Source mapping.
- DAG execution.
- Output preparation.

Each step exposes a localized status and a concise evidence description. The progress view is driven by backend trace events; the frontend must not fake elapsed progress with timers.

**Transitions:**

- Before a plan exists, the composer offers `Create manually` and `Generate plan`.
- During planning, the composer collapses to one spinning `Generating plan` action. Hovering or focusing it reveals `Abort and create manually`; activation requires confirmation before cancelling the request and opening Build.
- After a plan exists, the composer offers `Recreate plan` and `Next`. Recreating requires confirmation; `Next` opens Build directly. Manual creation is only offered before planning or when aborting an in-flight request.
- A successful plan moves to the Build page while preserving the returned proposal in shared runtime state.
- A failed plan remains on the Agent page with an actionable error.
- Returning from Build to Agent keeps the current intent available for revision.

**Domain reads and writes:** `agent_sessions`, `agent_messages`, `source_snapshots`, `provider_credentials`, `spending_policies`, and proposal/version records. The demo runtime remains non-durable and does not write these records.

### 7. DAG Builder

**Purpose:** Inspect and make bounded refinements to the Agent-generated DAG before building a data-product version.

**Primary action:** `Run backend build` after the proposal is reviewed.

**Desktop layout:**

- Center: editable semantic DAG with expandable template details and structured controls, using the full space left of the evidence inspector.
- Canvas overlay: a compact top-centered floating editor toolbar that does not consume a separate layout row or visually detach from the DAG surface.
- Canvas overlay: a compact top-left floating template/operator palette with its own bounded scroll area. It does not consume a permanent page column or obscure the centered toolbar.
- Right: build-readiness evidence and output schema; the evidence inspector can collapse into a narrow restore rail when more canvas space is needed.
- Center modal: selected-node/source configuration with a dimmed backdrop, close control, Escape dismissal, and backdrop dismissal so node editing does not permanently consume canvas width.
- Bottom action bar: `Save draft`, `Structured DAG`, and `Run backend build`, aligned to the right edge of the DAG canvas rather than the evidence inspector.

The DAG is the primary surface on this page. Full specifications, schemas, and sample output are progressive-disclosure details opened from the relevant inspector instead of competing with the canvas by default.

**DAG elements:**

- Seven allowlisted runtime types: Source, Filter, Map, Aggregate, Union, Join, and Output. GroupBy is aggregate configuration; a source window and derived score are configuration/expressions, not separate MVP operators.
- The Source node modal colocates selection from already discovered sources with discovery of another existing Subgraph. Discovery supports keyword or contract-plus-network search and direct lookup by Subgraph ID, immutable Deployment ID, or manifest IPFS CID; it never offers source creation or deployment.
- Directed edges with typed input/output ports and stable node IDs.
- Bounded node and parameter edits with inline validation.
- Reviewed templates can insert complete, editable node subgraphs; template origin is explanatory metadata rather than an editing lock.
- Structured DAG outline that provides a keyboard and single-pointer alternative to canvas connections.
- Validation summary for cycles, incompatible ports, unsupported configuration, missing sources, and resource bounds.
- Layout state stored separately from execution semantics.

The MVP has no arbitrary JavaScript/Python editor and no unrestricted custom-code node. Unsupported edits must be rejected explicitly rather than compiled through a custom-code fallback.

**Version and build elements:**

- Product name, lifecycle status, proposed/selected version, and dirty-change indicator.
- A clear `Back to Agent` path for intent revision and regeneration.
- Semantic diff between parent and proposed version.
- Save replaces the current validated working draft; active, deployed, or published versions remain unchanged until explicit promotion.
- Build confirmation summarizes version, source access modes, selected credentials/policies, configured maximum spend, refresh behavior, and known blockers.
- Durable build progress remains available through run details; the Builder page does not show a simulated progress trace.
- Output preview shows a bounded row sample, output schema, row count, freshness, provenance, and downloadable JSON only when allowed.
- Failed and blocked runs retain successful prior deployment pointers.

**Important states:** No proposal yet, Agent planning, proposal ready, unaccepted local changes, version validating, invalid, building, ready, or retired. Graph payment confirmation and provider failures retain their evidence and recovery guidance.

**Domain reads and writes:** `agent_sessions`, `agent_messages`, `source_snapshots`, `data_products`, `data_product_versions`, `data_product_version_sources`, `product_version_layouts`, `execution_runs`, `run_attempts`, `node_runs`, `source_requests`, `source_http_attempts`, `artifacts`, `materializations`, `trace_streams`, `trace_events`, `budget_reservations`, and upstream payment records.

### 8. API and Deployment

**Purpose:** Activate a ready version, test the private endpoint, and manage refresh and API credentials.

**Primary action:** `Deploy ready version` when undeployed; otherwise `Send private test request`.

**Content and interaction elements:**

- Deployment health, environment, provider label, active version, active materialization, and last health time.
- Ready-version selector and version diff before deployment.
- Explicit deployment confirmation; building a version never silently moves the active deployment pointer.
- Endpoint URL with copy action and environment label.
- Access summary showing private/API-key mode independently from optional x402 publication setup.
- Request parameter definitions showing name, location, type, required state, default, bounds, and example, followed by a form generated from the same approved schema.
- An always-visible response format showing HTTP status, media type, response envelope, generated row fields, and a clearly labeled example body before any test request is sent.
- Private response preview, response headers, status, latency, pinned version, and freshness.
- Code examples with copy actions and redacted placeholders.
- API credential list with name, prefix, scopes, expiry, last use, create, and revoke actions.
- One-time credential dialog that requires acknowledgement before closing; the raw key is not recoverable later.
- Refresh schedule editor with a human-readable cadence, timezone, next run, pause/resume, and advanced cron disclosure.
- `Run now` action with the same Graph-spending readiness and confirmation rules as Build.
- Recent API requests with private-safe correlation IDs and statuses.
- No standalone deployment-evidence or log panel. Artifact digests, region details, and deployment provenance belong in a contextual deployment/run detail if that operational workflow is implemented later.

**States:**

- No ready version.
- Ready but not deployed.
- Deploying, healthy, degraded, suspended, or failed.
- Healthy deployment with no materialization must not serve paid data.
- Stale materialization with last successful refresh and recovery action.
- Private test authorized, served, or failed.
- Credential shown once, active, revoked, or expired.
- Refresh scheduled, paused, running, blocked, or failed.

**Domain reads and writes:** `deployments`, `publication_versions`, `api_credentials`, `refresh_schedules`, `materializations`, `execution_runs`, `api_access_requests`, `api_http_attempts`, `usage_events`, and `active_product_view`.

### 9. Monetization and Revenue

**Purpose:** Turn an already healthy private API into an optional Hedera x402 product and show evidence-backed sales.

**Primary action:** `Activate x402 publication` after every gate passes.

**Publication setup stepper:**

1. **API readiness:** healthy deployment and ready materialization.
2. **Recipient:** resolved creator-controlled Hedera testnet account ID.
3. **Asset capability:** HBAR receive and later-access evidence.
4. **Pricing:** positive HBAR amount with an exact tinybar conversion preview.
5. **Facilitator:** current Blocky402 x402 v2 `exact` capability, timeout, and advertised fee payer.
6. **Terms:** service fee disabled unless separate immutable terms and settlement mechanism are explicitly approved.
7. **Review:** network, asset, amount, recipient, protocol version, scheme, timeout, facilitator, fee state, and public route.

Each step is deep-linkable within the page and preserves completed state. Failed gates remain visible with a cause and recovery action. The final action creates and activates an immutable publication revision only after server validation succeeds.

**Active publication elements:**

- Access mode, price, Hedera network, HBAR asset, resolved pay-to account ID, x402 version, scheme, timeout, facilitator, and capability observation time.
- Public product URL and API endpoint copy actions.
- `Open consumer page`, `Retire publication`, and `Create revised publication` actions.
- Clear statement that Creator Console preview remains available; the MVP does not promise simultaneous API-key bypass on the public x402 endpoint.

**Revenue and payment elements:**

- Separate HBAR cards for gross sales, creator proceeds, confirmed provider/network fees, and confirmed Sprue platform fees.
- Platform fee shows `Disabled` and zero until approved terms and actual settlement evidence exist.
- Sales table with request correlation, amount, payer-safe identifier, status, facilitator reference, Hedera transaction ID/hash, consensus time, and response delivery status.
- Payment detail drawer showing challenge, retry, verification, settlement, allocation, and response chronology.
- Mirror Node or explorer link only after the identifier has been validated.
- Pending or uncertain settlements are never included in confirmed revenue.

**Blocking and reconciliation states:**

- Recipient unresolved, incomplete, mismatched, or not creator-controlled.
- HBAR receive or later-access capability stale/unverified.
- Blocky402 capability missing or changed.
- Publication draft invalid.
- Payment required, submitted, uncertain, failed, confirmed, or reversed.
- Facilitator-reported success awaiting Mirror Node confirmation.
- Settlement mismatch, with public access failing closed.
- Payment confirmed but response delivery failed, with no-charge delivery retry.

**Domain reads and writes:** `wallet_addresses`, `wallet_asset_capabilities`, `deployments`, `publication_versions`, `api_access_requests`, `api_http_attempts`, `payment_intents`, `payment_attempts`, `payment_settlements`, `payment_allocations`, `financial_ledger_entries`, `usage_events`, `product_sales`, and `creator_proceeds`.

### 10. Public Product and Consumer Demo

**Purpose:** Give evaluators and external developers a public-safe product description, integration reference, and real x402 request path.

**Primary action:** `Run paid request` when a compatible consumer method is available; otherwise `Copy client command`.

**Content and interaction elements:**

- Product name, description, output purpose, source attribution, active version, freshness, and service health.
- Endpoint, HTTP method, parameter schema, response schema, example request, and clearly labeled example response.
- Hedera network, HBAR price, x402 version/scheme, and facilitator.
- Bounded request builder generated from public parameter definitions.
- Code tabs for a compatible client command and minimal integration example.
- Payment progress: request, `402` requirement, authorization, verification/settlement, response.
- Result viewer only after authorized private access or confirmed payment.
- Public-safe receipt with correlation ID, pinned product version, amount, asset, transaction reference, consensus status, response hash, and delivery status.
- Recovery action that distinguishes payment failure, settlement uncertainty, and post-payment delivery failure.

**Privacy and integrity rules:**

- Do not expose creator balances, spending policies, Graph credentials, private source-query variables, wallet signer data, payment authorization payloads, or internal logs.
- An example response is labeled `Example`; a stored verified response is labeled with its age; a live response is labeled `Live` with its request and settlement status.
- A private, retired, invalid, suspended, or unhealthy publication does not reveal paid product data.
- The initial `402` and paid retry remain one logical request and one price revision.

**Domain reads and writes:** public projections of the active product, deployment, publication, output schema, and materialization metadata; new `api_access_requests`, `api_http_attempts`, downstream payment records, allocations, ledger entries, and usage events for a live request.

## Supporting Overlays and Drawers

These are not separate pages:

- Privy authentication modal.
- Build, Run now, Deploy, Publish, Retire, Revoke, and Cancel confirmation dialogs.
- Agent proposal and version-diff drawer.
- Build trace and run-detail drawer.
- Source/schema evidence drawer.
- One-time API credential dialog.
- Payment and settlement detail drawer.
- Funding instructions dialog.

Every modal has a visible title, explicit close/cancel path, Escape support, focus trap, focus return, and unsaved-change protection when relevant. Destructive confirmations name the affected resource and consequence.

## Cross-Page State and Persistence

| State | Source of truth | Persistence rule |
|---|---|---|
| Authenticated user and workspace | Privy session plus backend authorization | Never infer workspace access from client routing |
| Account and balance observations | Backend read models | Include network, asset, provider, and observation time |
| Agent conversation | `agent_sessions` and `agent_messages` | User-visible content only |
| Accepted product version | `data_product_versions` | Immutable after insertion |
| Unaccepted semantic edits | Client draft plus navigation guard | Never presented as a durable version |
| DAG viewport and node positions | `product_version_layouts` | Separate from canonical execution semantics |
| Build and refresh progress | Runs and trace records | Reload-safe; stream or poll from a durable cursor |
| Active API version/result | Deployment pointers | Update atomically after readiness checks |
| Publication policy | Immutable `publication_versions` | Only deployment pointer activates it |
| Raw provider/API secret | Provider UI or one-time response | Never use local storage, logs, or persisted UI state |
| Payment progress | API request, intent, attempts, settlement | Reload-safe and idempotent; uncertain means reconcile |

Route changes after mutations occur only when the server returns the durable identifier or state. Optimistic UI may be used for layout-only actions, but not for wallet authority, balance, deployment activation, publication, or payment confirmation.

## Shared UI State Vocabulary

Status badges always include text and, where helpful, an icon. Color alone never communicates state.

| Semantic state | Meaning | Required UI behavior |
|---|---|---|
| Neutral | Draft, inactive, or informational | Explain the next available action |
| In progress | Async work is active | Show stage, elapsed time, and safe cancel behavior when available |
| Ready | All required checks passed | Enable exactly one relevant primary action |
| Blocked | Known prerequisite prevents progress | Name the blocker and deep-link to recovery |
| Failed | Operation ended without success | Preserve evidence, explain retry safety, and offer recovery |
| Uncertain | External side effect may have occurred | Disable duplicate side effect and prioritize reconciliation |
| Confirmed | Evidence-backed external or durable success | Show identifiers, time, and relevant proof |
| Stale | Prior evidence exists but is no longer current | Show observation time and refresh action |

Skeletons reserve the final content shape. Spinners are reserved for short local operations. Long operations use stage-based progress and remain inspectable after navigation.

## Financial Interaction Rules

- Amounts use locale-aware display plus explicit asset and network labels.
- Exact atomic-unit values are available in details; user-entered HBAR shows the resulting tinybar amount before confirmation.
- Addresses and hashes use monospaced, tabular text, preserve the beginning and end when truncated, and expose a copy action and full keyboard-accessible value.
- Funding, Graph expenses, gross sales, creator proceeds, provider/network fees, and platform fees remain distinct categories.
- A balance observation includes its time and provider. It is not displayed as guaranteed spendable money when capability or policy is blocked.
- Any action that can spend, deploy, publish, revoke, or retire requires a confirmation containing consequence and scope.
- Buttons remain disabled during a state-changing request and show progress. Duplicate clicks reuse the same logical operation rather than creating another payment or deployment.

## Desktop Support and Layout Behavior

The MVP is a web application for large-screen browsers. It is not a Windows, macOS, or other native desktop client. Mobile and tablet-specific interface design is deferred.

| Width | Support level | Navigation | Builder behavior | Data and financial views |
|---|---|---|---|---|
| `>= 1440px` | Primary design and judge-demo target | Persistent sidebar and product tabs | Three-pane workspace plus bottom trace drawer | Full tables with detail drawer |
| `1280-1439px` | Fully supported | Persistent compact sidebar | Three panes with bounded collapsible side panels | Reduced optional columns; detail drawer |
| `1024-1279px` | Minimum supported Creator Console width | Compact sidebar | Canvas remains primary; chat and inspector open one at a time | Essential columns plus detail drawer |
| `< 1024px` | Outside MVP support scope | No mobile-specific navigation commitment | Creator Console may show a concise desktop-required notice | Public content must not leak or corrupt data, but no mobile layout is promised |

The public product page and generated API remain reachable independently of Creator Console layout, but the hackathon UI is not required to provide a separately designed phone or tablet experience. The structured DAG outline remains a desktop keyboard and single-pointer alternative to drag operations; it is not a mobile-editor commitment.

## Accessibility Baseline

The target is WCAG 2.2 AA for the implemented MVP path.

- Provide a skip link and sequential heading hierarchy.
- Keep keyboard focus visible and unobscured by sticky headers, drawers, or toasts.
- Use native controls where possible; every custom control exposes role, name, state, and keyboard behavior.
- Every drag operation has button/form and keyboard alternatives.
- All fields have visible labels, persistent helper text where needed, and inline errors connected through accessible descriptions.
- Failed multi-field submissions focus a linked error summary while retaining inline errors.
- Route changes move focus to the main heading without disrupting pointer users.
- Live build/payment updates use a restrained atomic status region and do not move focus.
- Icon-only controls have accessible names; decorative icons are hidden from assistive technology.
- Normal text contrast is at least 4.5:1; meaningful non-text UI reaches at least 3:1.
- Pointer targets meet the WCAG 2.2 AA web minimum of 24 by 24 CSS pixels or documented spacing exceptions; primary actions should use larger targets where practical.
- Motion explains cause and effect, uses transform/opacity, and respects `prefers-reduced-motion`.
- Charts, if added, have a table or text summary and do not rely on color alone.
- Authentication permits paste and password-manager/provider flows without a cognitive puzzle.

## Localization Baseline

- The initial UI locales are English (`en`) and Simplified Chinese (`zh-CN`), with English as the complete fallback catalog.
- The first visit follows the browser language when supported. A visible language selector is available in the top-right navigation area on the entry page, creator console headers, and public product page.
- A user override is stored locally and applies across routes without changing route URLs or product identifiers.
- Locale changes update the document `lang`, title, description, visible labels, accessible names, alerts, workflow text, and mock-state copy without a reload.
- Provider names, addresses, hashes, API fields, source identifiers, code samples, network symbols, and other technical identifiers remain unchanged when translation could alter their meaning.
- New user-facing copy must be added to all locale catalogs instead of being embedded in route or feature components.

## Selected Visual Direction: Evidence-First Console

The human team selected the third visual exploration on 2026-09-05. The direction treats Sprue as a precise browser-based data compiler rather than a crypto trading dashboard or native desktop application.

- Dark charcoal operational surfaces: `#090d10` background, `#0e1418` panel surface, and `#273138` dividers.
- White primary text with restrained gray secondary text; cyan represents data lineage, violet represents Agent and primary actions, green represents confirmed state, and amber represents spending or payment attention.
- Inter for interface text and DM Mono for code, identifiers, hashes, JSON, and tabular amounts.
- A compact 4/8-pixel spacing rhythm, 5-8 pixel radii, thin borders, and minimal elevation.
- Phosphor icons provide one consistent icon family; emoji, custom inline SVG, and decorative illustration are not structural UI assets.
- The Agent Planner uses the persistent application sidebar, a shared top-right account menu, product tabs, conversation, editable intent, and a backend-driven progress timeline. The DAG Builder uses the same shell with a central DAG canvas, build-readiness evidence, progressive-disclosure inspectors, and a compact bottom action bar.
- Motion is short, interruptible, and state-explanatory; `prefers-reduced-motion` is respected.
- Operational text uses flat, high-contrast surfaces rather than glass or ambient animation.

The maintained product frontend is in [`frontend/`](frontend/). It includes all ten page families, shared components, locale catalogs, and feature hooks. The evaluator path uses a server-generated demo runtime while durable backend integration remains unfinished. Continue implementing this source directly. [Frontend implementation status](frontend/implementation-status.md) records the remaining behavior and service gaps.

The formal token proposal is in [`design-tokens.md`](design-tokens.md). It defines primitive, semantic, and component layers; meaningful color roles; typography and spacing scales; state behavior; accessibility checks; layout contracts; and the JSON-to-CSS generation workflow. The product frontend consumes the generated CSS; DT1-DT4 remain follow-up review items.

## Screen-to-Backend Contract Summary

These are logical UI contracts. Proposed HTTP paths, DTOs, authorization, and state behavior are now mapped in [api-contract.md](api-contract.md) Draft 0.6; approved M1-M3/H2 directions remain mapped in data-model 1.6 and the database foundation, while M4 durable model-profile persistence remains under review. Creator authentication/provider-identity resolution/bootstrap and the explicitly documented framework and evaluator-demo runtime surfaces are implemented; account-linking UI remains future work.

| Contract | Consumer pages | Required outcome |
|---|---|---|
| Workspace bootstrap | Dashboard, all authenticated pages | Authorized user, workspace, environment, readiness summaries |
| Product summaries | Dashboard | Products with active version, materialization, publication, freshness, health, and latest run |
| Wallet and access overview | Wallet, Builder blockers, Monetize | Network/asset balances, control evidence, credentials, grants, policies, capabilities, and recovery links |
| Agent model profile | Model Service, Agent Planner | Workspace-owned OpenAI-compatible endpoint, model identity, redacted key state, secret reference, validation state, and model identity used for each planning call |
| Agent session stream | Builder | Durable visible messages and structured proposals with resumable operation status |
| Product version detail | Builder, API | Canonical spec, source snapshots, DAG, layout, output schema, validation, parent diff, and status |
| Run and trace stream | Builder, API | Logical run, attempts, node progress, source/payment facts, artifacts, and terminal state |
| Active product view | Dashboard, API, public page | Atomic deployed version/materialization/publication, freshness, and health |
| Credential lifecycle | Wallet, API | Create/validate/rotate/revoke Graph credentials and create/show-once/revoke API credentials |
| Deployment lifecycle | API | Validate and atomically activate a ready version/materialization without mutating prior evidence |
| Publication lifecycle | Monetize | Validate recipient, asset, facilitator, price, timeout, fee terms, and immutable revision activation |
| Consumer request receipt | Monetize, public page | Correlated HTTP attempts, one payment intent, settlement evidence, pinned version, and delivery status |
| Financial summaries | Wallet, Monetize | Asset/network-scoped expenses, sales, proceeds, fees, pending state, and evidence time |

Every state-changing contract needs authorization, idempotency, a stable correlation identifier, a sanitized user-safe error code, and a reload-safe result.

## MVP and Deferred UI Scope

### P0 Implementation

- All ten page families.
- Desktop Creator Console support from 1024 CSS pixels, optimized for the 1440-pixel judge-demo viewport.
- One owner workspace.
- One representative Graph-backed product.
- Both Graph access configuration paths, with x402 used in the sponsor demo.
- Allowlisted DAG operations and structured non-drag editor.
- Durable build trace and materialized output preview.
- Private API deployment, credential, request test, and refresh schedule.
- Hedera testnet HBAR x402 setup through Blocky402.
- Public consumer page and one real paid request path.
- Evidence-backed payment/revenue display.

### P1 After the Core Flow Works

- Dedicated run/activity page and richer comparisons.
- Chart visualizations and export beyond JSON.
- Optional light theme.
- More product templates and onboarding education.
- Multiple API credentials with advanced scopes and usage charts.
- Product archive/restore UI.
- A polished evaluator walkthrough overlay.

### Deferred

- Mobile and tablet-specific Creator Console and public-page layouts.
- Marketplace browse/search pages.
- Team, invitation, and role-management pages.
- Per-product wallet management.
- Arbitrary code editor or custom execution sandbox.
- Automatic cross-chain conversion or bridging.
- Mainnet network selection.
- HTS token-association UI.
- Automatic pricing or fee optimization.
- General-purpose treasury and portfolio views.

## Judge Demo Path

The operator-controlled live demonstration should fit within four minutes:

1. Open a prepared workspace and briefly show the configured Agent model plus separated Graph-spending and Hedera-receipt readiness.
2. Create or open the DEX-stickiness product and submit the natural-language request.
3. Show source discovery, explicit Graph x402 mode, DAG, schema, and bounded Build confirmation.
4. Run the live build and open its Graph payment/source/transform trace.
5. Inspect the real materialized result, deploy it, and make a private request.
6. Request a conversational change and show the new version without silently replacing the deployment.
7. Open Monetize, review the validated Hedera HBAR publication, and activate or show the active revision.
8. Use the separate consumer path to complete one real x402 request.
9. Return to revenue detail and reconcile Blocky402, Mirror Node, response, and creator-proceeds evidence.

A prebuilt fallback product may protect the presentation from a slow live build, but it must be labeled as previously built and cannot replace the recorded live sponsor evidence.

## Confirmed Design Decisions

### D1. Page Architecture

**Approved:** Ten route-level page families with a public Entry page separated from Creator Login and shared product views for Agent, Build, API, and Monetize. Model Service is a top-level creator resource because its configuration is reused across Agent planning sessions. Separating Agent conversation/progress from DAG review keeps each page focused while preserving a clear product workflow and shared product context.

### D2. Evaluator Paid-Request Method

**Approved direction:** Use a tightly capped, rate-limited demo consumer for the hosted judge path and keep a documented CLI as reproducible evidence. The consumer remains a separate buyer and cannot receive creator or platform signing authority.

This product decision does not authorize funding or deployment by itself. Before implementation, define the demo consumer's wallet ownership, testnet funding cap, request rate limit, abuse controls, reset procedure, and shutdown behavior.

### D3. Large-Screen Web MVP Scope

**Approved as revised:** The Creator Console is a web application targeting large-screen browsers for the MVP. It is not a native Windows or macOS client. The primary judge-demo viewport is 1440 CSS pixels, with 1024 CSS pixels as the minimum supported width. Mobile and tablet-specific layouts are deferred.

The structured list/form DAG editor remains P0 as a desktop keyboard and single-pointer alternative to drag-only editing and as a reliable fallback during the demo. It does not create a mobile support obligation.

### D4. Visual-System Timing

**Approved:** Information architecture and interactions are approved before final colors, typography, component tokens, and desktop wireframes are selected. Visual exploration can now target a stable interface rather than redesigning product behavior.

## Approval Gate

The page architecture, selected visual direction, and existing source are the baseline for continued frontend implementation. The user promoted the frontend on 2026-09-05. This promotion establishes code ownership and development stage; it does not establish live provider or payment compatibility.

Remaining review and integration work:

- Review DT1-DT4 in [`design-tokens.md`](design-tokens.md) while frontend development proceeds.
- Maintain the existing `frontend/` application directly, with one file per page and explicit feature/service ownership.
- Preserve the validated 1440-pixel target and 1024-pixel minimum layouts during MVP implementation.
- Preserve every approved P0 journey, blocker, recovery path, data-model mapping, confirmation, and idempotent state behavior in the visual design.
- Document the capped demo consumer's security and funding boundary before implementing its paid action.

## Change Log

| Date | Change | Status |
|---|---|---|
| 2026-09-05 | Created Draft 0.1 with seven proposed page families, primary journeys, interactions, UI states, responsive/accessibility behavior, and screen-to-domain contracts | Awaiting human review |
| 2026-09-05 | Approved version 1.0 with D1, D2, and D4 accepted; revised D3 to a large-screen browser Creator Console and retained structured DAG controls for keyboard/single-pointer access rather than mobile support | Page architecture and interactions approved; visual system pending |
| 2026-09-05 | Added version 1.1 with the selected Evidence-First Console direction, explicit browser-only product boundary, design tokens, and a seven-page interactive prototype | Prototype ready for human review; MVP implementation has not started |
| 2026-09-05 | Proposed Draft 1.2 with a documented primitive-to-semantic-to-component token system, generated CSS contract, accessibility checks, and prototype adoption | Token decisions DT1-DT4 and final prototype review await human approval |
| 2026-09-05 | Recorded Draft 1.3 with the existing application promoted to the maintained product frontend, feature/service boundaries, and an implementation-gap register | Frontend implementation authorized; token review and live-integration gates remain open |
| 2026-09-06 | Recorded Draft 1.5 with Agent planning and DAG review split into separate deep-linkable product views; added backend-driven planning progress and a four-view product header | Information hierarchy approved; bounded DAG refinement and live integrations remain open |
| 2026-09-06 | Recorded Draft 1.6 by removing non-functional version/status controls from the product header and environment/provider readiness content from the persistent sidebar | Product workflows remain deep-linkable; readiness is contextualized in Wallet & Access and relevant pages |
| 2026-09-06 | Recorded Draft 1.7 with Agent composer states for no plan, planning, and existing plan; added confirmation before aborting or replacing the current plan | Agent action hierarchy and recovery paths approved; durable cancellation remains an implementation concern |
| 2026-09-06 | Recorded Draft 1.8 by keeping the existing-plan composer focused on `Recreate plan` and `Next`; manual creation remains available before planning or after a confirmed abort | Existing-plan action hierarchy simplified |
| 2026-09-06 | Recorded Draft 1.9 by removing the Builder's duplicate left rail and simulated bottom progress trace while retaining the right evidence inspector and three build actions | Builder hierarchy simplified around the DAG and evidence |
| 2026-09-06 | Recorded Draft 1.10 by adding a reversible collapse control and narrow restore rail to the Builder evidence inspector | Canvas space can expand without losing access to readiness evidence |
| 2026-09-06 | Recorded Draft 1.11 by removing the Builder's top-level primitive-DAG mode switch while retaining expandable template details | The canvas keeps one focused semantic workflow and removes a low-value mode toggle |
| 2026-09-06 | Recorded Draft 1.12 by making the Builder an editable workflow surface with a reviewed template/operator palette and live derived evidence | Workflow creation and refinement share one working draft without mutating active versions |
| 2026-09-06 | Recorded Draft 1.13 by moving node configuration into a centered modal, reducing palette items to one-line labels with hover/focus details, adding distinctive editor icons, and adding an explicit demo-only `Save draft` control | Node editing remains progressive disclosure without permanently narrowing the canvas; durable save remains a backend task |
| 2026-09-06 | Recorded Draft 1.14 by separating node selection from editing: single click selects and enables deletion, while double click opens a transactional modal with Confirm and Cancel | Node edits are explicit and reversible until Confirm; close, Escape, backdrop, and Cancel discard the temporary configuration |
| 2026-09-06 | Recorded Draft 1.15 by making hand mode pan-only, adding edge selection/deletion, removing redundant palette plus controls and native title tooltips, narrowing the palette, and reducing canvas nodes to icon/name/status | Canvas gestures have one clear purpose per tool and node cards prioritize the workflow's semantic identity |
| 2026-09-06 | Recorded Draft 1.16 by colocating discovered-source selection and existing-Subgraph discovery/import inside the Source node modal | Source selection and source acquisition remain one coherent configuration task; live provider validation is still required before a source can be confirmed |
| 2026-09-06 | Recorded Draft 1.17 by moving the editor controls into a compact top-centered floating toolbar inside the DAG canvas | Canvas tools are spatially associated with the surface they manipulate and no longer consume a detached page row |
| 2026-09-06 | Recorded Draft 1.18 by moving the template/operator palette into the DAG canvas and removing the workflow summary strip | The canvas gains the space formerly reserved for a palette column and status header while keeping insertion controls spatially associated with the workflow |
| 2026-09-06 | Recorded Draft 1.19 by adding a top-level Model Service page for a creator-supplied OpenAI-compatible API URL, API key, and model name | The next explicit Agent plan uses the configured model; the evaluator profile is backend-memory-only and redacted until verified identity and durable secret storage are implemented |
| 2026-09-06 | Recorded Draft 1.20 by moving `Add API key` into the credential section and showing credential management only for API-key Graph access | Access-mode selection now reveals only the resources required by the selected path and keeps related content and actions together |
| 2026-09-06 | Recorded Draft 1.21 by removing the Dashboard's Recent Activity and Sponsor Proof panels | Summary metrics and the product list already expose the useful overview; removing repeated evidence keeps the Dashboard focused on finding or creating a product |
| 2026-09-06 | Recorded Draft 1.22 by replacing the API page's deployment-evidence panel with backend-owned request and response format documentation | The API view now answers how to call the endpoint and what it returns without competing operational provenance content |
| 2026-09-06 | Recorded Draft 1.23 by concealing Model Service credentials by default, using the official GPT-5.6 Sol endpoint/model examples, and adding explicit connection testing | Make secret state unambiguous and let creators validate current form values without saving or conflating connectivity with Agent-plan generation |
| 2026-09-07 | Recorded Draft 1.24 with explicit Google, GitHub, and MetaMask creator login through Privy, fail-closed creator routes, transactional account/workspace bootstrap, and unchanged public product access | Authentication is separated from account-wallet creation, funding, and delegated payment authority; live provider evidence still requires configured credentials and origins |
| 2026-09-07 | Recorded Draft 1.25 with provider subjects mapped to stable Sprue user UUIDs and future explicit multi-identity binding | Provider replacement must not change domain ownership; account linking, unlinking, conflicts, and recovery remain unimplemented and cannot use heuristic merges |
| 2026-09-07 | Recorded Draft 1.26 by separating public Entry from Creator Login and routing both landing-page creator actions through `/login` while signed out | Keep product explanation and authentication as distinct decisions; provider choices appear only after the creator explicitly chooses to enter |
| 2026-09-07 | Recorded Draft 1.27 by narrowing Creator Login to Google and GitHub and redirecting a bootstrapped session directly to the Product Dashboard | Remove an unnecessary post-login decision and keep wallet authentication outside the current MVP login surface |
| 2026-09-07 | Recorded Draft 1.28 by replacing theme-colored provider glyphs with the official Google and GitHub brand marks | Preserve provider recognition and brand integrity while keeping both login actions equally prominent on the dark surface |
| 2026-09-07 | Recorded Draft 1.29 by moving the authenticated account control from the sidebar to the right edge of shared headers and disclosing account actions through an anchored menu | Keep persistent navigation focused, follow the familiar avatar-menu pattern, and expose only routes that exist in the current product boundary |
| 2026-09-07 | Recorded Draft 1.30 by moving `Create data product` from the Dashboard header into the `All products` toolbar and top-aligning the language and account controls | Keep the primary creation action attached to the collection it changes while reserving the shared header corner for global controls |
| 2026-09-07 | Recorded Draft 1.31 with shared inline product-name editing in the Dashboard and product header, plus `New Product` as the evaluator creation default | Make product identity directly editable at both recognition points while preserving an explicit distinction between session demo state and future durable writes |
| 2026-09-07 | Recorded Draft 1.32 with a larger and more visible tokenized Builder canvas grid | Improve spatial orientation and alignment readability while preserving the visual priority of nodes, handles, and lineage edges |
