# Sprue MVP End-to-End Flow

Status: implementation alignment document, updated 2026-09-06.

This document describes the intended journey from a browser visit to a complete Sprue MVP demonstration, then distinguishes the behavior that already exists in the repository from the behavior that still requires implementation. It is a target flow, not evidence that every documented provider or business capability is live.

The primary demo product is the Cross-chain DEX Trader Footprint API:

> Find wallets that traded on both Ethereum and Arbitrum during the last 30 complete UTC days. Return per-chain trade count and USD volume, combined totals, and first/last seen timestamps.

The product uses two existing Graph Subgraphs. Sprue does not create a new Subgraph or Subgraph Composition. The Agent selects sources, obtains their schemas, creates provider-specific field mappings, and compiles the request into a bounded DAG.

## 1. End-to-End Product Sequence

```text
Browser entry
  -> Privy identity and workspace bootstrap
  -> wallet and Graph access readiness
  -> product and Agent session
  -> natural-language intent
  -> source discovery and schema inspection
  -> GraphQL plans and canonical source mappings
  -> Union/Join DAG proposal
  -> human acceptance of an immutable product version
  -> validation and explicit Build command
  -> private worker executes Graph sources and DAG
  -> ready materialization
  -> shared hosted private API
  -> optional Hedera x402 publication
  -> external consumer 402/payment/settlement/200 flow
  -> creator receipts and financial evidence
```

The browser owns presentation state. The backend owns identity, authorization, durable product state, provider calls, execution, payment state, and financial evidence. The browser never calls PostgreSQL, the Graph payment adapter, a private Privy signer, or Blocky402 settlement directly.

## 2. Entry, Identity, and Workspace

### Browser behavior

1. Load the public console configuration.
2. Start or restore the Privy session.
3. Send the Privy access token as a bearer token on creator requests.
4. Read the current identity and workspace.
5. If the user has no Sprue identity, submit bootstrap once and open the sole owner workspace.

### Backend behavior

1. Serve public configuration with only public URLs, the optional Privy app ID, and server-controlled feature flags.
2. Verify issuer, audience, subject, and expiry on creator requests.
3. Create `users`, `workspaces`, and owner membership transactionally during bootstrap.
4. Never create a wallet, run a Graph query, or move funds as a side effect of login.

### Intended contracts

```text
GET  /api/v1/app-config
GET  /api/v1/me
POST /api/v1/bootstrap
GET  /api/v1/workspaces/{workspaceId}/overview
```

Bootstrap is idempotent. A browser refresh must restore the same user and workspace rather than create another workspace.

## 3. Wallet and Graph Access Readiness

The user chooses access per Graph source. The choice is part of the product version and never changes automatically.

### Customer Graph API-key path

The user submits an existing Graph API key in Wallet & Access. The backend writes the secret only to server-side secret storage and persists a reference, fingerprint, and version. A validation operation may confirm credential usability, but it must not silently perform a metered query. During later execution, the backend resolves the secret, sends the bounded request, and records provider usage without creating a wallet expense.

```text
POST /api/v1/workspaces/{workspaceId}/graph-credentials
POST /api/v1/workspaces/{workspaceId}/graph-credentials/{credentialId}/validate
```

### Creator-wallet Graph x402 path

The user creates or connects a user-owned Privy wallet, authorizes the reviewed additional signer, and activates a bounded Graph spending policy. The policy contains the permitted network, asset, destination allowlist, per-request cap, and period cap. Sprue may use its own server-side signer authorization material, but never the creator's wallet private key.

The backend synchronizes wallet ownership, signer grant, provider policy, balances, and spending availability. Funding instructions tell the user where to fund the wallet; a browser-submitted amount is not a top-up proof.

```text
POST /api/v1/workspaces/{workspaceId}/wallets/synchronize
POST /api/v1/workspaces/{workspaceId}/wallets/{walletId}/synchronize-grants
POST /api/v1/workspaces/{workspaceId}/spending-policies
POST /api/v1/workspaces/{workspaceId}/spending-policies/{policyId}/activate
```

No Graph x402 payment occurs during ordinary page loading. Payment begins only after a build or refresh receives and validates an actual Graph requirement.

## 4. Product Creation and Agent Planning

### Browser behavior

1. Create or open a product in Dashboard.
2. Open the Builder page and create an Agent session.
3. Submit the natural-language request.
4. Poll the command and trace, or reconnect from the last trace sequence.
5. Inspect the proposal, source selections, schema evidence, field mappings, DAG, output schema, assumptions, and blockers.

### Backend behavior

1. Create a `data_products` row with the original intent and account-wallet reference.
2. Persist the user message, planning command, and trace stream before dispatching work.
3. Let the Agent use bounded, provider-neutral tools:
   - search existing Subgraphs;
   - retrieve source schema;
   - generate and validate a static GraphQL document;
   - inspect bounded sample results and `_meta` provenance;
   - produce a source mapping and structured Data Product Spec.
4. Keep Graph MCP as discovery/schema/execution infrastructure. Sprue owns GraphQL generation, query validation, source semantics, and DAG planning.
5. Return a structured proposal, not arbitrary JavaScript or Python.

### Target proposal for the primary demo

```text
Ethereum Subgraph -> Source mapping -> Filter last 30 complete UTC days -> Aggregate by wallet
                                                                                  \
                                                                                   Join -> Map -> Output
                                                                                  /
Arbitrum Subgraph -> Source mapping -> Filter last 30 complete UTC days -> Aggregate by wallet

Ethereum rows + Arbitrum rows -> Union -> All-activity companion view
```

The exact provider fields come from the validated source schema. For the currently inspected Uniswap V3-shaped sources, the mapping includes `account.id`, `pool.id`, `timestamp`, `amountInUSD`, and `amountOutUSD`, but the runtime does not hardcode those names.

### Intended contracts

```text
POST /api/v1/workspaces/{workspaceId}/products
POST /api/v1/workspaces/{workspaceId}/agent-sessions
POST /api/v1/workspaces/{workspaceId}/agent-sessions/{sessionId}/messages
GET  /api/v1/commands/{commandId}
GET  /api/v1/trace-streams/{streamId}/events
GET  /api/v1/workspaces/{workspaceId}/agent-sessions/{sessionId}/proposals/{messageId}
```

## 5. Proposal Acceptance and Immutable Versioning

The user must explicitly accept a proposal. Local canvas changes are not sufficient to create a version.

The backend then:

1. Verifies the proposal hash and ownership.
2. Validates source access selections against the workspace.
3. Validates the operator allowlist, typed ports, node configuration, graph acyclicity, and resource policy.
4. Pins each logical Subgraph to its validated source snapshot, deployment, schema hash, field mapping, and access mode.
5. Creates an immutable `data_product_versions` row and its source projections in one transaction.

```text
POST /api/v1/workspaces/{workspaceId}/products/{productId}/versions
```

The accepted version begins in `proposed` state. Changing the intent, sources, mapping, operators, access mode, or refresh semantics creates a new version. Layout coordinates do not change the execution hash.

## 6. Validation and Build

### Browser behavior

1. Request a read-only build preflight.
2. Display blockers, access mode, spending bounds, and source readiness.
3. Ask the user to acknowledge spending bounds when any source uses x402.
4. Submit Build once and receive a durable command/run identity.
5. Poll the run, node states, source requests, trace, and output.

### Backend behavior

Build preflight performs no payment and no durable execution. It checks the current version, source access, policy availability, operator registry, and resource limits.

The Build command creates an `execution_run`, `run_attempt`, node-run records, and a transactional queue dispatch. The worker reloads trusted state by ID; it does not execute a browser-provided queue payload or code fragment.

```text
POST /api/v1/workspaces/{workspaceId}/products/{productId}/build-preflight
POST /api/v1/workspaces/{workspaceId}/products/{productId}/runs
GET  /api/v1/workspaces/{workspaceId}/runs/{runId}
GET  /api/v1/workspaces/{workspaceId}/runs/{runId}/nodes
GET  /api/v1/workspaces/{workspaceId}/runs/{runId}/source-requests
GET  /api/v1/workspaces/{workspaceId}/runs/{runId}/output
```

## 7. Worker Source Execution and DAG Runtime

At run start, the worker freezes the requested UTC interval and source execution context. For the primary demo this is the last 30 complete UTC days. Each source uses a bounded static GraphQL document, cursor pagination, a stable ordering, and recorded `_meta` block provenance.

### API-key source request

```text
load secret reference
  -> send bounded GraphQL request
  -> record HTTP attempt, response artifact, _meta, GraphQL errors, and usage
```

No wallet payment or Graph expense ledger entry is created for a customer subscription request.

### Graph x402 source request

```text
initial Graph request
  -> 402 challenge
  -> validate requirement and exact price/network/asset/destination
  -> reserve budget in a serialized transaction
  -> request bounded Privy authorization
  -> submit payment-bearing retry
  -> reconcile provider result
  -> consume reservation after confirmed settlement
  -> retain data-delivery failure as a separate recovery state
```

Each paginated page is tracked as a logical source request. An initial 402 and its paid retry are separate physical HTTP attempts of that request. An uncertain payment blocks a new retry until reconciliation proves the safe next action.

### Pure DAG execution

The runtime executes the following bounded path:

```text
provider row
  -> schema-provided field mapping
  -> canonical Swap row
  -> timestamp filter
  -> per-wallet/per-chain Aggregate
  -> Union of source lineage
  -> inner Join on normalized wallet
  -> final Map/Output projection
```

The current [DAG runtime](backend/src/modules/dag/runtime.ts) implements this pure transformation for fixture-backed inputs. It validates mappings, normalizes addresses and timestamps, performs exact decimal arithmetic, preserves source lineage, rejects duplicate Join keys, and never evaluates generated code.

## 8. Materialization and Private API

After successful execution, the worker stores an output artifact and ready materialization with its version, source freshness, schema, content hash, and provenance. A successful Build makes the version ready; it does not automatically change a deployment pointer.

The creator then creates a shared hosted deployment and explicitly activates the ready version/materialization. The first publication is private. Creator preview reads the materialized result and does not trigger a public sale or a new Graph query.

```text
POST /api/v1/workspaces/{workspaceId}/products/{productId}/deployments
POST /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/activation-preflight
POST /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/activate
POST /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/private-requests
GET  /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/contract
```

The hosted data endpoint reads the latest successful materialization pinned for the logical request. It does not execute a fresh Graph query or DAG on every request.

## 9. Optional Hedera x402 Publication

Publication is an access configuration on Sprue's hosted API, not a marketplace listing.

The creator:

1. Opens Monetization and Revenue.
2. Runs publication preflight.
3. Confirms a Hedera testnet HBAR profile, resolved Hedera account-ID recipient, and current Blocky402 capability.
4. Creates and activates an immutable publication revision.

The backend checks deployment health, materialization readiness, recipient capability, HBAR receive/spend evidence, and facilitator capability before switching the active publication pointer. Service fees remain disabled until fee terms and settlement behavior are explicitly approved and implemented.

```text
POST /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publication-preflight
POST /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications
POST /api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications/{publicationId}/activate
```

## 10. External Consumer Payment Flow

The public product page reads safe metadata. It does not expose creator credentials, spending policies, internal traces, or private wallet information.

```text
GET /api/v1/public/products/{endpointSlug}
GET /data/v1/{endpointSlug}
```

For an active x402 publication:

1. The consumer sends a request with a logical idempotency key and recovery capability.
2. Sprue validates the endpoint, parameters, active materialization, and publication, then returns one pinned `402 Payment Required` requirement.
3. The consumer wallet signs the Hedera HBAR payment and retries the same logical request with `PAYMENT-SIGNATURE`.
4. Sprue verifies and settles through Blocky402.
5. Sprue reconciles facilitator evidence with Hedera Mirror Node evidence.
6. After exact settlement confirmation, Sprue returns the materialized DataResponse and `PAYMENT-RESPONSE`.
7. Sprue records the request, attempts, receipt, response hash, sale, creator proceeds, and any separately approved fee allocation.

If payment status is uncertain, the response is a reconciliation state, not a second payment prompt. If payment is confirmed but delivery fails, the consumer retries delivery against the same request and capability; it never settles again.

## 11. State Ownership

| State | Owner | Examples |
|---|---|---|
| Presentation state | Browser | Locale, selected node, unsent text, tab, viewport, polling cursor |
| Durable product state | PostgreSQL/backend | Workspace, product, version, source projection, deployment, publication |
| Durable execution state | PostgreSQL/worker | Command, run, node run, source request, artifact, materialization, trace |
| Upstream provider state | The Graph/Privy | Subgraph schema, API subscription, wallet ownership, provider policy, x402 requirement |
| Downstream settlement state | Blocky402/Hedera | Verification, facilitator reference, transaction evidence, creator receipt |
| Derived UI read models | Backend | Overview, readiness, output preview, financial summary |

The frontend may optimistically disable a duplicate button, but the backend remains authoritative for idempotency, ownership, concurrency, payment, and lifecycle state.

## 12. Current Repository Support Matrix

This matrix is based on the current source tree and test/build evidence, not on the existence of a route description.

| Capability | Current support | Evidence or limitation |
|---|---|---|
| Browser application, nine page families, routing, English/Chinese localization | Implemented | Maintained frontend under `frontend/`; route-level product data comes from the backend demo runtime |
| Session-scoped Agent model configuration | Implemented for evaluator demo | OpenAI-compatible URL/key/model are retained in bounded API-process memory; no durable identity, secret manager, rotation, metering, or production profile exists |
| Builder DAG display, keyboard inspection, local sample edits | Implemented as demo behavior | Does not call the backend or create a product version |
| Public app configuration transport | Implemented | Read-only server configuration route; feature flags remain false |
| Health and readiness probes | Implemented | Process and database/migration readiness only |
| Privy production authentication | Not implemented | Replaceable verifier exists; production composition is intentionally unavailable |
| Workspace bootstrap and product CRUD handlers | Not implemented | Routes are registered reservations and return `503 CAPABILITY_NOT_IMPLEMENTED` |
| Graph API-key persistence and validation | Not implemented | Data model and route catalog exist; secret storage/provider adapter is absent |
| Privy wallet synchronization and spending policy | Not implemented | Persistence and contracts exist; live provider control is gated by E1 |
| Graph MCP discovery/schema/query adapter | Not implemented | Harness and provider-neutral ports are documented; candidate live sources were manually queried, but no application adapter exists |
| Schema-driven canonical Swap mapping | Implemented offline | Pure runtime validates declared schema mappings; no automatic schema inference from arbitrary response data |
| Multi-source Union and cross-chain Join | Implemented offline | Runtime tests cover two sources, exact aggregation, windowing, lineage, and one-to-one wallet Join |
| Durable Agent planning and structured proposals | Not implemented | Agent modules and contracts are design boundaries only |
| Durable command dispatch and worker execution | Not implemented | API/worker processes run; worker is standby and consumes no queue jobs |
| Graph source execution with cursor/block provenance | Not implemented in app | Live samples demonstrate response shape only; adapter, persistence, and paid request path are absent |
| Product versions, run records, artifacts, materializations through handlers | Not implemented | PostgreSQL schema/migrations exist; domain services and handlers are absent |
| Private hosted API and endpoint contract | Not implemented | Deployment/data routes are reservations; no materialization-serving handler exists |
| Scheduled refresh | Not implemented | Schedule schema and contracts exist; no scheduler/queue consumer exists |
| Hedera recipient validation and publication | Not implemented | Hedera profile and acceptance gates are documented; no live account or facilitator integration exists |
| Downstream x402 consumer request | Not implemented | Frontend shows a cancelable simulated flow; no real buyer authority or settlement exists |
| Revenue and platform-fee accounting | Not implemented | Ledger model exists; fee terms are disabled and no settlement records are produced |
| Docker Compose local packaging | Implemented and verified | Frontend/API/worker/PostgreSQL roles and migrations are packaged; business features are not enabled |
| Vercel/Railway deployment manifests | Prepared, not deployed | Provider manifests and configuration exist; cloud deployment and external connectivity remain unverified |

## 13. Implementation Order From the Current State

The next vertical slice should make the frontend and backend meet at the smallest useful boundary:

1. Implement the Graph adapter ports for schema retrieval, static query validation, cursor pagination, and response provenance. Keep provider field names in source mappings, not in runtime logic.
2. Implement product, Agent session, message, proposal, and version services against the existing migrations.
3. Implement the durable command service and worker queue handoff, then connect the current pure DAG runtime to fixture-backed and later live source inputs.
4. Replace Builder demo services with authenticated API clients and server-backed polling/trace state.
5. Implement deployment, materialization, and private API serving before enabling any public payment path.
6. Validate Privy Graph spending, then separately validate Hedera recipient control, Blocky402 settlement, the capped consumer boundary, and financial reconciliation.

Every step must preserve the existing source-only boundary, explicit user confirmation before spending, immutable versioning, no arbitrary code execution, server-side secrets, and the English-only repository record rule.
