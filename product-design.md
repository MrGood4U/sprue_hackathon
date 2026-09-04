# Sprue Product and Interface Design

## Status

Draft 1.2, updated on 2026-09-05 with a formal three-layer design-token proposal applied to the selected Evidence-First Console prototype. The human team approved D1, D2, and D4, revised D3 to target large-screen web browsers, and selected the third visual exploration. Human approval of the token proposal and final prototype review remain pending; MVP application implementation has not started.

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

The MVP contains **seven route-level page families**. Parameterized routes and create/edit variants within one family do not increase this count. Privy callbacks, generic errors, and not-found routes are utility routes rather than product pages.

| No. | Page family | Proposed route | Audience | Primary outcome |
|---:|---|---|---|---|
| 1 | Entry and Sign In | `/` | Public | Understand Sprue and enter the Creator Console or public demo |
| 2 | Product Dashboard | `/app` | Creator | Start or resume a data product |
| 3 | Wallet and Access | `/app/wallet` | Creator | Prepare Graph credentials, wallet funding, and bounded authority |
| 4 | Product Builder | `/app/products/new`, `/app/products/:productId/build` | Creator | Describe, inspect, validate, and build a version |
| 5 | API and Deployment | `/app/products/:productId/api` | Creator | Deploy and privately test a persistent API |
| 6 | Monetization and Revenue | `/app/products/:productId/monetize` | Creator | Validate Hedera receipt, enable x402, and reconcile sales |
| 7 | Public Product and Consumer Demo | `/p/:slug` | Public | Understand and exercise the paid API flow |

There is no separate MVP page for run history, global settings, team management, or marketplace discovery. Build trace and recent runs belong inside Product Builder; API usage belongs inside API and Deployment; payment history belongs inside Monetization and Revenue.

## Route and Navigation Model

### Public Navigation

The public header contains the Sprue wordmark, a `View demo` link, and one primary `Open Creator Console` action. It must not imitate a large marketing website.

### Creator Console Navigation

Supported desktop layouts use a persistent application sidebar with two top-level destinations:

- `Products`
- `Wallet & Access`

The account control contains the authenticated identity, workspace name, environment indicator, and sign-out action. Destructive actions do not belong in primary navigation.

Inside a product, a persistent product header shows product name, product status, selected version, deployment health, and three deep-linkable views:

- `Build`
- `API`
- `Monetize`

The browser Back action must preserve product context, filters, chat draft, selected DAG node, and scroll position when safe. URL parameters identify product, product view, selected version, and selected run where appropriate. Modal and drawer state should use URL state only when it must be shareable or restorable.

### Global Status Strip

The Creator Console header shows compact, separately labeled readiness facts:

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

### 1. Entry and Sign In

**Purpose:** Explain the product in under 30 seconds and provide a reliable path to the console and public demo.

**Primary action:** `Open Creator Console`.

**Content and interaction elements:**

- Concise hero: `Describe it. Shape it. Sell it.`
- One-sentence product definition focused on persistent APIs rather than one-off answers.
- Three-step visual explaining Describe, Shape, and Sell.
- `Open Creator Console` action invoking Privy authentication.
- `View public demo` link to the selected demo product.
- Compact integration explanation for The Graph, Privy, Hedera, and Blocky402.
- Repository and demo-video links once submission assets exist.

**States:**

- Signed out.
- Authentication loading with a stable layout.
- Authentication failed with a retry action and provider-safe error.
- Signed in, immediately redirecting to `/app` without a second sign-in action.
- Public demo unavailable, with the Creator Console action remaining usable.

The page must not expose a wallet address as proof that authentication or wallet control is complete.

### 2. Product Dashboard

**Purpose:** Show product state and make the next useful action obvious.

**Primary action:** `Create data product`.

**Content and interaction elements:**

- Welcome and workspace heading.
- Readiness checklist for Privy wallet, one Graph access path, first build, private deployment, and optional x402 publication.
- Product list using cards for one to three products and a table when the list grows.
- Per-product facts: name, lifecycle status, active version, last successful build, data freshness, API access mode, deployment health, and last updated time.
- Per-product actions: `Open builder`, `Open API`, and `Resume setup` when blocked.
- Recent run summary with status and recovery link.
- Empty state with the example DEX-stickiness intent and one creation action.

**States:**

- New workspace with no products.
- Products loading through shape-preserving skeletons.
- Active, suspended, and failed products with text labels in addition to color.
- Partially configured product with the exact next step.
- Dashboard read failure with retry; cached data, if shown, includes its observation time.

**Domain reads:** `data_products`, active `data_product_versions`, `deployments`, `materializations`, latest `execution_runs`, and the `active_product_view` and `product_run_status` read models.

### 3. Wallet and Access

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

### 4. Product Builder

**Purpose:** Turn natural-language intent into an inspectable, validated, and built data-product version.

**Primary action:** Contextual: `Generate plan`, `Accept version`, or `Build version`.

**Desktop layout:**

- Left: persistent Builder Agent conversation.
- Center: visual DAG and structured toolbar.
- Right: selected-node inspector, source details, validation, and output schema.
- Bottom drawer: build trace and recent runs.

Only the center workspace is primary at one time. Side panels are resizable within bounded widths and collapsible without losing state.

**Agent conversation elements:**

- Starter prompt and example DEX-stickiness intent.
- Multiline composer with explicit send action and keyboard shortcut hint.
- User and Agent messages, timestamps, and operation status.
- Structured Agent cards for assumptions, unsupported intent, discovered sources, access-mode choice, estimated resource bounds, and proposed version diff.
- `Accept proposal`, `Revise in chat`, and `Discard proposal` actions.
- Stop action for an active Agent request when supported.

Only user-visible messages and structured facts are displayed or retained. Hidden chain-of-thought is never requested or shown.

**Source and access elements:**

- Source identity, data network, schema status, immutable deployment/manifest evidence, and discovery method.
- Explicit choice between `Customer Graph API key` and `Wallet-funded Graph x402` for every source.
- API-key mode selects one active workspace credential.
- x402 mode selects one active spending policy and shows available network/asset budget.
- No fallback checkbox or implied automatic switch between modes.

**DAG elements:**

- Allowlisted Source, Filter, GroupBy, Window, Aggregate, and Output nodes.
- Directed edges with typed input/output ports.
- Pan, zoom, fit, select, connect, duplicate where valid, and remove actions.
- Node inspector with visible labels, helper text, units, inline validation, and schema-aware choices.
- Structured DAG outline that lists nodes and inputs and permits connection changes without dragging.
- Validation summary for cycles, incompatible ports, unsupported configuration, missing sources, and resource bounds.
- Layout state stored separately from execution semantics.

The MVP has no arbitrary JavaScript/Python editor and no unrestricted custom-code node.

**Version and build elements:**

- Product name, lifecycle status, proposed/selected version, and dirty-change indicator.
- Semantic diff between parent and proposed version.
- `Accept as version` creates a new immutable proposed version and runs validation.
- Build confirmation summarizes version, source access modes, selected credentials/policies, configured maximum spend, refresh behavior, and known blockers.
- Because the exact Graph x402 amount may arrive only with the real `402`, the confirmation shows the approved bounds rather than inventing an exact quote.
- Build progress uses a durable trace: queued, planning, source request, payment challenge when applicable, payment, transform nodes, validation, materialization, and completion.
- Output preview shows a bounded row sample, output schema, row count, freshness, provenance, and downloadable JSON only when allowed.
- Failed and blocked runs retain successful prior deployment pointers.

**Important states:**

- No intent yet.
- Agent planning.
- Proposal ready.
- Unsupported intent with a supported alternative.
- Unaccepted local changes.
- Version validating, invalid, building, ready, or retired.
- Run queued, running, succeeded, failed, blocked, or cancelled.
- Graph payment confirmed but source delivery failed, with reconciliation guidance and no false budget refund.
- Insufficient budget, revoked grant, invalid credential, changed source schema, or unavailable provider, each linked to its recovery view.

**Domain reads and writes:** `agent_sessions`, `agent_messages`, `source_snapshots`, `provider_credentials`, `data_products`, `data_product_versions`, `data_product_version_sources`, `product_version_layouts`, `execution_runs`, `run_attempts`, `node_runs`, `source_requests`, `source_http_attempts`, `artifacts`, `materializations`, `trace_streams`, `trace_events`, `budget_reservations`, and upstream payment records.

### 5. API and Deployment

**Purpose:** Activate a ready version, test the private endpoint, and manage refresh and API credentials.

**Primary action:** `Deploy ready version` when undeployed; otherwise `Send private test request`.

**Content and interaction elements:**

- Deployment health, environment, provider label, active version, active materialization, and last health time.
- Ready-version selector and version diff before deployment.
- Explicit deployment confirmation; building a version never silently moves the active deployment pointer.
- Endpoint URL with copy action and environment label.
- Access summary showing private/API-key mode independently from optional x402 publication setup.
- Request parameter form generated from the approved schema.
- Private response preview, response headers, status, latency, pinned version, and freshness.
- Code examples with copy actions and redacted placeholders.
- API credential list with name, prefix, scopes, expiry, last use, create, and revoke actions.
- One-time credential dialog that requires acknowledgement before closing; the raw key is not recoverable later.
- Refresh schedule editor with a human-readable cadence, timezone, next run, pause/resume, and advanced cron disclosure.
- `Run now` action with the same Graph-spending readiness and confirmation rules as Build.
- Recent API requests with private-safe correlation IDs and statuses.

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

### 6. Monetization and Revenue

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

### 7. Public Product and Consumer Demo

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

## Selected Visual Direction: Evidence-First Console

The human team selected the third visual exploration on 2026-09-05. The direction treats Sprue as a precise browser-based data compiler rather than a crypto trading dashboard or native desktop application.

- Dark charcoal operational surfaces: `#090d10` background, `#0e1418` panel surface, and `#273138` dividers.
- White primary text with restrained gray secondary text; cyan represents data lineage, violet represents Agent and primary actions, green represents confirmed state, and amber represents spending or payment attention.
- Inter for interface text and DM Mono for code, identifiers, hashes, JSON, and tabular amounts.
- A compact 4/8-pixel spacing rhythm, 5-8 pixel radii, thin borders, and minimal elevation.
- Phosphor icons provide one consistent icon family; emoji, custom inline SVG, and decorative illustration are not structural UI assets.
- The Product Builder uses a persistent account sidebar, product tabs, intent and Agent summary, central DAG canvas, build-readiness evidence, and a bottom execution trace.
- Motion is short, interruptible, and state-explanatory; `prefers-reduced-motion` is respected.
- Operational text uses flat, high-contrast surfaces rather than glass or ambient animation.

The interactive prototype is in [`prototype/`](prototype/). It includes all seven page families and realistic mock transitions for planning, building, API testing, x402 publication, and a judge-safe consumer request. It performs no real authentication, data query, wallet action, payment, deployment, or persistence.

The formal token proposal is in [`design-tokens.md`](design-tokens.md). It defines primitive, semantic, and component layers; meaningful color roles; typography and spacing scales; state behavior; accessibility checks; layout contracts; and the JSON-to-CSS generation workflow. The prototype consumes the generated CSS, but the proposal remains subject to human approval.

## Screen-to-Backend Contract Summary

These are logical UI contracts, not final HTTP endpoint names.

| Contract | Consumer pages | Required outcome |
|---|---|---|
| Workspace bootstrap | Dashboard, all authenticated pages | Authorized user, workspace, environment, readiness summaries |
| Product summaries | Dashboard | Products with active version, materialization, publication, freshness, health, and latest run |
| Wallet and access overview | Wallet, Builder blockers, Monetize | Network/asset balances, control evidence, credentials, grants, policies, capabilities, and recovery links |
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

- All seven page families.
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

1. Open a prepared workspace and show separated Graph-spending and Hedera-receipt readiness.
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

**Approved:** Seven page families with shared product views for Build, API, and Monetize. This keeps wallet resources account-scoped, gives the complex Builder enough space, and separates private API readiness from optional payment configuration without creating a page for every table.

### D2. Evaluator Paid-Request Method

**Approved direction:** Use a tightly capped, rate-limited demo consumer for the hosted judge path and keep a documented CLI as reproducible evidence. The consumer remains a separate buyer and cannot receive creator or platform signing authority.

This product decision does not authorize funding or deployment by itself. Before implementation, define the demo consumer's wallet ownership, testnet funding cap, request rate limit, abuse controls, reset procedure, and shutdown behavior.

### D3. Large-Screen Web MVP Scope

**Approved as revised:** The Creator Console is a web application targeting large-screen browsers for the MVP. It is not a native Windows or macOS client. The primary judge-demo viewport is 1440 CSS pixels, with 1024 CSS pixels as the minimum supported width. Mobile and tablet-specific layouts are deferred.

The structured list/form DAG editor remains P0 as a desktop keyboard and single-pointer alternative to drag-only editing and as a reliable fallback during the demo. It does not create a mobile support obligation.

### D4. Visual-System Timing

**Approved:** Information architecture and interactions are approved before final colors, typography, component tokens, and desktop wireframes are selected. Visual exploration can now target a stable interface rather than redesigning product behavior.

## Approval Gate

The page-architecture and interaction gate is complete. The visual direction is selected, a formal token proposal is applied, and the representative web prototype is ready for human review. The broader Product and Interface Design stage remains current until the tokens, prototype, and capped demo-consumer boundary are approved.

Before the design stage is complete:

- Review and approve DT1-DT4 in [`design-tokens.md`](design-tokens.md) and the seven-page interactive prototype.
- Treat the prototype as a browser-based design reference, not production application architecture or a native desktop-client requirement.
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
