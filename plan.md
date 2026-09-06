# Sprue Project Plan

## Purpose

This document records the product plan, implementation priorities, validation strategy, and use of AI during the hackathon. It is a living document and must be updated when major product or architectural decisions change.

All repository records are written in English. Team communication may use Chinese, but repository artifacts remain English-only.

## Confirmed Participation

The user confirmed Start Fresh on 2026-09-05. This resolves the participation-category question, not the audit of development provenance or individual sponsor eligibility. The Graph's AI From Scratch award and Hedera's AI & Agentic Payments award are the primary candidate targets for their respective integrations. Continuity-only awards are excluded. Final award submissions and integration evidence remain pending.

## Product Goal

Sprue turns a natural-language description of onchain data logic into a persistent, reusable, and optionally monetizable data product.

The product is deliberately different from a natural-language blockchain query assistant. Sprue selects suitable existing The Graph Subgraphs, compiles validated queries and necessary supported transformations, and operates the result as a continuously available API. It does not build the upstream indexes.

The primary product promise is:

> Describe it. Shape it. Sell it.

## Confirmed Existing-Subgraph Boundary

On 2026-09-05, the human team confirmed that Sprue only discovers, inspects, selects, and queries existing Subgraphs. Creating, generating, deploying, or maintaining new Subgraphs or Subgraph Composition is outside the product boundary, not an MVP fallback or future optimization task. This supersedes the earlier source-generation idea while preserving the historical contribution log.

Select sources within bounded discovery by semantic/field fit, granularity, network and historical coverage, freshness, and evidenced access/query costs. Required semantics and coverage are prerequisites; unknown coverage or cost stays explicit. Reuse supported source-query capabilities and existing derived fields only when their meaning matches, then apply necessary supported Sprue transformations. Do not add nodes merely for display or claim a globally optimal source from a limited search.

If no suitable existing source is found, report missing facts and search limits, then request requirement revision or another existing source for the same validation. No new ingestion path, index generation, synthetic live-data substitute, or silent change in semantics is an acceptable fallback.

Source/output validation, reproducible versions, scheduled refresh, hosted API Build/Deploy, and optional x402 remain in scope. On 2026-09-05, the human team expanded the MVP runtime to support multiple existing Subgraphs and explicit Union/Join operators. H1/H3, E1/E2, and fee decisions remain open. This scope extension changes no relational database fields or migrations at the planning stage; source projections, source requests and multi-input artifact bindings already exist, while exact operator schemas and runtime behavior remain to be implemented and tested.

### Confirmed Multi-Source Composition Boundary

Sprue may combine results from multiple existing Subgraphs in its downstream DAG. Each source is discovered or supplied, schema-inspected, deployment-pinned, queried and accounted for independently. A product version records each source entry and access mode; the resulting Union/Join node makes the cross-source relationship explicit in the proposal, trace and execution definition.

`Union` is for compatible normalized row schemas and must preserve source lineage where needed. `Join` requires explicit typed key mappings, join type, cardinality, null behavior and collision behavior. The runtime must bound source count, per-source requests, intermediate rows and join fan-out. Each source keeps its own block and `_meta` provenance; a cross-chain result uses a common time interval where appropriate but does not claim one atomic cross-chain block.

This does not permit creating, deploying or maintaining a new Subgraph or Subgraph Composition. It also does not authorize hidden multi-source merging inside the Graph MCP adapter, arbitrary GraphQL composition, automatic payment, or automatic fallback between Graph access modes. The frontend design and fixture currently predate this scope extension and require a separate alignment pass.

## Windows Local and Evaluator Deployment

On 2026-09-05, the human team required a complete Windows-local browser testing workflow and packaging for the previously selected Vercel/Railway evaluator deployment. This is not a Windows desktop client. The same frontend and backend source must support both profiles through environment/build configuration rather than business-code edits.

The root Compose profile runs frontend, API, private standby worker, and PostgreSQL 17, with explicit one-off migrations and a persistent local database volume. `scripts/local.ps1` provides initialization, startup, checks, logs and non-destructive stop commands. Native Node.js 24 development with frontend hot reload is also documented. Default PostgreSQL port 15432 avoids this host's Windows reserved range; all host ports remain configurable and loopback-bound. See [deployment.md](deployment.md) for commands, security boundaries and deployment settings.

Vercel serves the compiled frontend; Railway runs API, worker and PostgreSQL. Only the API and frontend receive public domains. Checked-in manifests do not create cloud resources or demonstrate live sponsor integrations. The existing optional Sites adapter is preserved but is not the selected evaluator target. Frontend business pages still use labeled demo data; the new public-config transport is read-only preparation, not live business integration.

## Macro Development Plan

The project will follow this high-level sequence:

```text
Brainstorming (complete)
    -> project structure conception (complete)
    -> technical selection, including sponsor integrations (complete)
    -> data model definition (complete)
    -> product and interface design (frontend baseline accepted; review follow-ups remain)
    -> MVP implementation (current: frontend, database and backend framework)
    -> project refinement
```

### 1. Brainstorming — Complete

Define the product direction, target user, core differentiation, sponsor opportunities, MVP boundary, and demo narrative. The current direction is Sprue: natural-language data logic becomes a persistent, reusable, and optionally monetizable onchain data product.

### 2. Project Structure Conception — Complete

Turn the product direction into a concrete system and repository structure. Define the main user journey, frontend and backend responsibilities, shared Data Product Spec, transformation DAG, product lifecycle, API shape, and the smallest demonstrable vertical slice.

The current product shape is a hosted web platform with two connected surfaces: a Creator Console for building and operating products, and a Hosted Product API for external consumer agents and applications. Sprue provides the managed chain from natural-language analysis through The Graph, transformation, API hosting, and x402 access. For the temporary evaluator-facing demo, deploy the Creator Console to Vercel and the API, worker, and PostgreSQL to Railway. Keep the same application portable to Docker self-hosting without source changes. The current structure is documented in [`project-structure.md`](project-structure.md).

### 3. Technical Selection, Including Sponsors — Complete

Choose the implementation stack and validate the external dependencies that directly support the core flow. The selected sponsors are The Graph, Hedera, and Privy. The Graph supplies data purchased by Sprue on the creator's behalf. Privy provides the creator account wallet for funding and delegated Graph payments; the intended creator-controlled Hedera receipt path still needs validation. Sprue implements optional x402 v2 `exact` access for its hosted APIs, using Blocky402 to verify and settle downstream HBAR payments on Hedera testnet for the initial integration. Validate the upstream payment path and downstream settlement independently; sponsor qualification still requires evidence.

The Graph's requirements and proposed development gates are recorded in [sponsor/graph.md](sponsor/graph.md). Review them during dependency validation and final submission preparation. Research is complete, but integration checks and final eligibility confirmation remain pending.

The user selected Hedera to replace Bazantic for the x402 step on 2026-09-05. [sponsor/Hedera.md](sponsor/Hedera.md) records award conditions, the Blocky402 boundary, proposed evidence gates, and compatibility risks. Bazantic integration and Recipe work are removed from the active scope; [its reference](sponsor/bazantic.md) and earlier contribution records remain historical, not an implementation backlog.

Privy's conditions, wallet-action evidence gates, and x402/control references are recorded in [sponsor/privy.md](sponsor/privy.md). The user has clarified that the core wallet belongs to the creator account, not primarily an external buyer. Funding, bounded upstream data purchases, and downstream income are the intended workflow; final award selection and technical validation remain pending.

The creator tops up the account wallet and grants limited spending authority; Sprue handles individual Graph purchases without requiring manual payment for every query. Optional API publication may include a disclosed platform fee deducted from sales revenue. The fee rate, calculation basis, collection method, and settlement timing are open decisions, not authorization to charge. See [the financial model](project-structure.md#account-wallet-and-money-flows).

The current payment plan spans two networks: Graph spending on Base or Base Sepolia and API-sale settlement on Hedera. Keep network/asset balances and authorization scopes separate. Do not assume revenue replenishes the Graph budget, add automatic bridging, or substitute a platform-custodial recipient without an explicit decision. Prefer test environments for the first bounded spike; confirm the exact assets and account prerequisites before any funded action.

The user marked technical selection complete on 2026-09-05. The implementation baseline is:

- React, Vite, TypeScript, and React Flow for the Creator Console;
- Node.js 24 LTS, Express, and TypeScript for the API and worker runtime;
- PostgreSQL through `pg` and Drizzle ORM for source-of-truth persistence;
- `pg-boss` as the initial PostgreSQL-backed job queue;
- predefined, developer-implemented DAG operators selected and connected by the Agent;
- Vercel for the evaluator frontend, Railway for the evaluator API, worker, and PostgreSQL, and Docker Compose for equivalent self-hosting;
- The Graph, Privy, and Hedera/Blocky402 behind explicit integration adapters.

Package versions, external API compatibility, wallet control, payment behavior, and sponsor evidence still require implementation-time validation. Changing a baseline technology requires an explicit plan update.

### 4. Data Model Definition — Complete

Define the complete MVP data model before feature implementation. Review [data-model.md](data-model.md) as the source of truth for:

1. Domain entities, ownership boundaries, identifiers, and lifecycle states.
2. Relationships, cardinalities, and an entity-relationship diagram.
3. PostgreSQL tables, columns, types, enums, defaults, foreign keys, uniqueness rules, checks, and indexes.
4. Immutable product versions, DAG definitions, node configuration, run snapshots, and lineage.
5. Durable jobs, leases, retries, idempotency keys, and per-node execution state.
6. Wallet references, delegated spending policies, reservations, Graph expenses, x402 sales, creator proceeds, provider charges, and platform fees by network and asset.
7. Deployment, API-key, visibility, refresh, usage, and settlement records without storing raw secrets.
8. Audit timestamps, retention expectations, migration order, and representative records for the primary demo flow.

The phase is complete only when every MVP action has an unambiguous read/write path, monetary values use atomic units with explicit asset/network identity, retryable side effects have idempotency and reconciliation fields, and the domain model maps clearly to PostgreSQL and API contracts. Review the model before generating migrations or implementation scaffolding.

Version 1.3 was approved on 2026-09-05. It combines the previously approved defaults and Privy control model with current official Graph and Hedera refinements: dual Graph access, immutable source identity/provenance, per-query records, Hedera account-ID/address resolution, per-asset receive/access capability, x402 v2 `exact` requirements, Blocky402 capability snapshots, and normalized network settlement evidence. The human team also selected Hedera testnet HBAR (`0.0.0`) for the initial downstream integration and default demo path. This historical version was subsequently extended by approved version 1.4: M1-M3 and H2 persistence directions. The initial database foundation now implements 51 tables and 699 columns; live provider compatibility and service-level checks remain validation gates.

### 5. Product and Interface Design — Frontend Baseline Accepted

Define the evaluator-facing Creator Console before application implementation. This phase determines how many pages the MVP needs, what responsibility each page owns, and which interaction elements and UI states are required to complete the primary creator and consumer-demo journeys.

The phase will produce `product-design.md` covering:

1. Primary user journeys and the shortest judge-demo path.
2. Page inventory, route map, navigation model, and page ownership boundaries.
3. Each page's content hierarchy, interactive controls, forms, tables, visualizations, and contextual actions.
4. Cross-page transitions and the state preserved between chat, DAG editing, builds, deployments, wallet actions, and publication.
5. Empty, loading, success, partial, error, insufficient-funds, revoked-authorization, and payment-reconciliation states.
6. Large-screen web viewport behavior, keyboard access, accessibility expectations, and evaluator-safe copy.
7. The data-model entities and backend/API contracts consumed by every important screen and action.
8. MVP-versus-deferred boundaries so design breadth does not expand implementation scope.

The human team approved the initial seven-page information architecture, interaction specification, capped demo-consumer direction, and large-screen browser scope on 2026-09-05. The product is a web application, not a Windows or macOS native client. Mobile and tablet-specific layouts are deferred; the structured DAG editor remains a browser-based keyboard and single-pointer alternative. The human team then selected the third visual exploration, Evidence-First Console. The maintained application subsequently split Agent planning from DAG editing and added a top-level Model Service page, producing the current nine-page architecture in product-design 1.23. Route pages, application composition, shared components, feature components, and backend-demo data now have explicit file owners instead of sharing one multi-page module. A formal three-layer design-token Draft 0.1 defines the dark MVP palette, meaningful accent roles, typography, spacing, component states, layout contracts, accessibility checks, and generated CSS workflow. DT1-DT4 remain review follow-ups, and durable model-secret storage plus the capped demo-consumer security/funding boundary remain gates for production behavior.

### 6. MVP Implementation — Current

Continue developing the existing nine-page frontend directly. Route-level business data comes from the explicit backend demo runtime; maintain feature hooks and service contracts so durable backend resources can replace it incrementally. Current frontend gaps and their implementation order are recorded in [frontend/implementation-status.md](frontend/implementation-status.md).

The proposed interface design is [api-contract.md](api-contract.md) Draft 0.4 with domain references under `docs/api/`. M1-M3 directions are approved and mapped to data-model 1.5; M4 durable model-profile persistence remains under review. Review route/DTO schemas and implement their service transactions before connecting durable frontend clients. E1/E2 remain gates for live provider and capped-consumer behavior; the document itself enables no payment or fee.

The Agent/runtime preparation is [backend/harness/README.md](backend/harness/README.md) Draft 0.6. It defines natural-language clarification, bounded multi-source discovery/schema verification, per-source GraphQL compilation, explicit Union/Join composition, validation/simulation, and a separate creator-authorized build. The fixture-backed controller validates proposals and runs the cross-chain transformation path with the mock planner by default or an explicitly configured OpenAI-compatible planner in the evaluator session. Durable Agent sessions, metering, queue execution, Graph adapters, and other live integrations remain open. H2 persistence directions are approved; H1 exact executable schemas and H3 source/methodology/operating limits remain open.

Build the smallest reliable end-to-end product: creator-wallet funding and bounded Graph purchases, natural-language planning, validated data transformation, persistent API, conversational editing, optional Hedera x402 access through Blocky402, and a real paid consumer request with revenue reconciliation and any enabled fee.

The first backend slice is [database.md](backend/database.md): 15 checksummed forward migrations, 51 tables/699 columns, nine domain schema files, explicit public network/HBAR seeds, a database-only Compose profile and offline transaction tests. The subsequent [backend framework](backend/framework.md) adds API/standby-worker process entries, health/readiness, public app configuration, verifier-gated identity reads, domain route registrations, safe transport middleware and an explicitly partial OpenAPI artifact. The evaluator demo routes and session-scoped model adapter are implemented, but durable domain handlers, queue relay, Graph/Privy/Hedera adapters, and payments remain unavailable. Native PostgreSQL and the Windows Docker profile have passed the documented local checks; cloud deployment and multi-connection race verification remain pending.

### 7. Project Refinement

Improve the product after the core flow works. Focus on interface quality, explainability, reproducibility, build traces, caching, bounded resource usage, error handling, demo reliability, documentation, and final submission materials. Stretch features should not destabilize the core vertical slice.

## Problem Statement

Onchain data is abundant, but turning a data idea into a reliable service still requires source discovery, schema understanding, transformation logic, validation, scheduling, API design, deployment, and monetization. Sprue hides this data-engineering complexity behind a natural-language interface while preserving an inspectable execution plan.

### MVP Operator and Template Alignment

On 2026-09-05, the human approved a small node scope and the corresponding repository changes, then expanded it to seven runtime types: source/filter/map/aggregate/union/join/output. Wallet Activity and Repeat Activity are compile-time templates. The maintained frontend and deterministic backend demo runtime now demonstrate the cross-chain two-source Union/Join example, while the Builder projects edits locally. This remains fixture-backed evaluator behavior, not live Graph execution or durable compilation evidence. H1 exact schemas and H3 live source/methodology/limits remain open. H2 and M1-M3 directions were subsequently approved and persisted in model 1.5; M4 durable model-profile persistence and E1/E2 provider/buyer gates remain unverified.

## Target User

The initial user is a Web3 builder, analyst, protocol team, or AI agent creator who wants to create a derived onchain data product without manually wiring existing sources, queries, transformations, scheduling, and API hosting.

Example request:

> Build an API that reports wallets that traded on Uniswap V3 on both Ethereum and Arbitrum during the last 30 complete UTC days. Return each wallet's trade count, per-chain USD volume, combined volume, first-seen time and last-seen time. Refresh daily and optionally publish paid access after deployment and separate approval.

### Confirmed MVP Demo Target: Cross-chain DEX Trader Footprint API

The primary MVP data product is a cross-chain trader-footprint API. It answers: "Which wallets used the same DEX on more than one chain, and what was their activity on each chain?" This is the concrete judge-facing product target for the current vertical slice. The earlier repeat-activity example remains a fixture/template reference, not the primary demo.

The initial source candidates are existing Uniswap V3 Subgraphs for Ethereum and Arbitrum. They are candidates only until Sprue performs bounded discovery, schema inspection, deployment pinning, live query validation and coverage checks. Sprue must not assume that similarly named deployments have identical schemas or usable history.

The intended normalized row shape is `{wallet, chain, tradeId, pool, volumeUsd, timestamp}` where each field is included only after source-specific schema and semantic validation. The product should preserve each source's deployment, schema hash, query, access mode, block/time provenance and Graph cost evidence.

The intended DAG is:

```text
Uniswap V3 Ethereum  -> Normalize -> Aggregate by wallet and chain -+
                                                                      +-> Join on normalized wallet -> Map totals -> Output
Uniswap V3 Arbitrum  -> Normalize -> Aggregate by wallet and chain -+
```

The `Join` keeps wallets active on both chains and combines their per-chain statistics. A companion all-activity view may use the same normalized source rows with an explicit `Union` before aggregation. The first implementation must not force every operator into one graph when a simpler graph is more reliable; Union and Join are both supported, but each must have a clear business purpose.

The API response should expose `wallet`, `chains`, `ethereum`, `arbitrum`, `combinedVolumeUsd`, `firstSeenAt` and `lastSeenAt`, plus source and freshness evidence in an owner-facing trace. The public paid response must contain only the approved output projection.

The demo should support a bounded 30-day window and a small result cap, with optional filters such as minimum combined volume or a specific wallet. It must not claim canonical cross-chain atomicity: each source keeps its own chain provenance and the product uses a common time interval.

## Hackathon Definition of Done

The MVP is successful when the following flow works end to end:

```text
Creator account wallet funding and spending authorization
    -> natural-language request
    -> source and schema discovery
    -> Data Product Spec
    -> transformation DAG
    -> Sprue-paid Graph data retrieval and live-data validation
    -> persistent API endpoint
    -> conversational modification
    -> optional Hedera x402 access (exercised in the demo)
    -> real consumer payment settled through Blocky402
    -> paid data response and creator revenue
    -> disclosed service-fee allocation, if enabled
```

The demonstration must show creator funding, a real Graph purchase authorized through the creator wallet, and a separate downstream paid API request settled on Hedera through Blocky402. The API must also work in its authenticated private mode without paid publication. Simulated UI states must not replace these integrations; any enabled service fee must reconcile to real settlement evidence. A successful consumer payment does not by itself prove the creator can control or access the receiving account's funds.

## Scope Priorities

### P0: Required Core Flow

- Web-based Builder Agent interface.
- Creator account wallet, funding status, limited spending authorization, and expense history.
- Per-source creator choice between a customer-supplied Graph API key/existing subscription and creator-wallet x402 pay-per-query, with no automatic paid fallback.
- Automated Graph payments within the account budget, including safe stops for insufficient funds or revoked permission.
- Natural-language data-product request.
- Existing The Graph source discovery and schema inspection.
- A focused Data Product Spec representation.
- A validated transformation DAG.
- Seven runtime types: Source, Filter, Map, Aggregate, Union, Join, and Output. Grouping/window/score use configuration or expressions; advanced operators remain deferred.
- Cross-chain DEX Trader Footprint as the primary end-to-end demo product, using existing Uniswap V3 source candidates and explicit multi-source composition.
- Wallet Activity and Repeat Activity remain compile-time template coverage with inspectable primitive expansion; they are not the primary judge-facing product; see [semantic-templates.md](backend/harness/semantic-templates.md).
- Live or freshly queried Graph data.
- Persistent product configuration and API endpoint.
- Conversational editing of an existing product definition.
- Sprue-hosted x402 payment gate using Blocky402 for Hedera settlement, exercised by a separate consumer agent/client.
- Validated creator-controlled Hedera receipt configuration, with network/asset-specific balances distinct from Graph spending funds.
- Creator revenue tracking and an explicit service-fee policy/ledger if a fee is enabled; no fee rate is assumed.
- Build trace showing source, transformation, validation, and deployment status.

### P1: Strong Product Enhancements

- Explainable and reproducible result view.
- Query-versus-materialize decision for simple versus expensive products.
- Cached or scheduled results for repeated requests.
- Product visibility controls and basic rate or budget limits.
- API schema, example response, price, and endpoint documentation.

### P2: Future Work Unless the Core Flow Is Stable

- Separate per-product wallets and general-purpose autonomous treasury management.
- Marketplace discovery.
- Automatic pricing optimization.
- Additional payment networks beyond the required Base/Graph and Hedera sales paths; automatic cross-chain bridging or conversion.
- Broad multi-tenant support.
- Production-grade abuse prevention and enterprise access control.

## Confirmed DAG Execution Model

On 2026-09-05, the user approved Option A: dynamically compose predefined, developer-implemented operators into a DAG. The Agent selects nodes, parameters, and connections from a validated registry instead of generating arbitrary executable JavaScript or Python. The graph remains request-specific rather than a fixed pipeline.

The MVP must validate operator support, configuration, input/output compatibility, cycles, permissions, and resource budgets. Unsupported intent should produce an explicit limitation or a supported alternative, not an unrestricted code-execution fallback. Validate and bound generated Graph query configuration separately.

Store a versioned execution definition separately from UI layout and pin each run to a definition version. Queue scheduling, DAG execution, and result refresh/materialization are separate responsibilities. The technical baseline is selected above; the seven-type operator scope is now confirmed; exact configuration/template schemas, Union compatibility, Join key/cardinality/null/collision semantics, numeric/null semantics and execution libraries remain subject to implementation review. The proposed registry and compiler/tool constraints are recorded in [backend/harness/operators.md](backend/harness/operators.md).

## Confirmed Deployment Strategy

On 2026-09-05, the user selected Vercel plus Railway for temporary evaluator access:

```text
Vercel: Creator Console
Railway: public API + private worker + PostgreSQL
```

Use provider-supplied domains for the hackathon. Do not make Vercel or Railway behavior part of application logic. The same source must support a Docker Compose deployment of the frontend, API, worker, and PostgreSQL, configured through environment variables and a standard PostgreSQL connection string. Platform manifests and deployment commands may differ; product behavior, APIs, jobs, migrations, and data models must not.

This is a demo delivery decision, not a commitment to permanent managed hosting. Exact service sizing and the activation/deactivation schedule remain operational decisions. No cloud account, deployment, or paid resource has been created by this plan.

## Architecture Plan

### Frontend

- Builder Agent chat panel.
- Visual DAG and Data Product workspace.
- Build trace and status timeline.
- API preview, schema, refresh policy, and monetization controls.
- Revenue and request status for the demo product.
- Account top-up, available Graph budget, and Hedera sales/proceeds shown by network and asset, with any disclosed platform fees. Do not present an aggregate value as a shared spendable balance.

### Backend

- Agent planner that converts intent into a Data Product Spec.
- The Graph source and schema integration.
- Spec validator and DAG compiler.
- Transformation runtime.
- Product registry and persistent configuration.
- API gateway for `/products/{id}` endpoints.
- Separate upstream Graph payment and downstream Hedera x402 adapters; Sprue owns pricing and endpoint gating, and Blocky402 handles downstream verification/settlement.
- Creator-wallet authorization, upstream payment orchestration, and funding/expense/revenue reconciliation.
- Optional scheduler, cache, and materialized-result store.

### Deployment and Portability

- Deploy the Creator Console to Vercel for evaluator access.
- Deploy the public API and private worker as separate Railway services; use Railway PostgreSQL for the demo.
- Provide Docker images and a Compose profile that run equivalent frontend, API, worker, and PostgreSQL roles without source changes.
- Keep provider configuration under infrastructure files and runtime configuration in validated environment variables.
- Use explicit database migrations, health/readiness checks, and smoke tests in both deployment profiles.
- Keep durable state outside ephemeral service filesystems and never bake secrets into images or frontend bundles.

### Shared DAG Representation

The frontend and backend use canonical DataProductSpec schemaVersion 2 from [data-model.md](data-model.md#canonical-data-product-specification). The earlier illustrative graph_source/from/to shape is superseded. This small structural excerpt is not a complete executable specification:

```json
{
  "nodes": [
    {"id": "source1", "type": "source", "operatorVersion": "1", "config": {}},
    {"id": "aggregate1", "type": "aggregate", "operatorVersion": "1", "config": {}},
    {"id": "output1", "type": "output", "operatorVersion": "1", "config": {}}
  ],
  "edges": [
    {"fromNode": "source1", "fromPort": "rows", "toNode": "aggregate1", "toPort": "rows"},
    {"fromNode": "aggregate1", "fromPort": "rows", "toNode": "output1", "toPort": "rows"}
  ]
}
```

The frontend edits supported graph parameters; the backend validates, compiles, runs, and persists immutable versions. Concrete source/operator configurations must follow the reviewed registry, not the empty illustrative objects above or frontend fixture labels.

## Implementation Sequence

Frontend implementation is authorized using the accepted page architecture and selected visual direction. The existing frontend is the application baseline; remaining design reviews continue alongside it. Approved [data-model.md](data-model.md) version 1.5 is its persistence baseline. Initial migrations, typed query mappings and isolated SQL tests now exist under backend/; implementation evidence may still require an explicit model revision through the same change-control process.

Implementation checkpoint (2026-09-06): the first provider-independent DAG runtime slice is now implemented. It accepts a schema snapshot and source field mapping, normalizes provider rows into the canonical Swap contract, and executes the bounded Union, per-chain Aggregate, timestamp window, and cross-chain Join path used by the primary MVP. The captured Ethereum and Arbitrum JSON samples prove live response shape only; they are not current-window coverage, source-selection certification, payment evidence, or a live application adapter.

### Phase 1: Validate External Dependencies

1. Discover a candidate Graph source, distinguish its logical Subgraph ID from its immutable deployment and manifest identifiers, validate and hash its schema, then run a bounded static query with cursor pagination, pinned-block `_meta` provenance, and explicit GraphQL/indexing-error handling.
2. Validate a customer-supplied Graph API key through server-side secret storage, credential rotation/revocation, one successful bounded query, and usage evidence without persisting the key or creating a wallet expense.
3. Validate creator-wallet funding and a Graph x402 payment from a Privy user-owned wallet through a policy-bound Sprue additional signer. Capture wallet owner, signer/key-quorum, policy, provider idempotency, transaction reference, permitted-action, rejected-action, revocation, and policy-drift evidence.
4. On Hedera testnet, use HBAR (`0.0.0`), resolve the intended creator recipient to a complete Hedera account ID, and validate its HBAR receive/access capability. Do not infer Privy compatibility from an EVM address or export user keys to adapt a sample.
5. Protect a test Sprue-hosted API with x402 v2 `exact`; discover Blocky402's current fee payer from `/supported`; verify a separate consumer's `402 -> verify -> settle -> 200` flow; and reconcile the facilitator reference to the Hedera transaction ID/hash, consensus timestamp, result, exact transfer, and creator receipt.
6. Investigate revenue allocation and fee collection; approve fee terms before enabling any charge. Keep upstream funding and downstream income separate; no automatic bridge is planned.
7. Record credential names, networks, facilitators, payment evidence, and deployment assumptions without committing secrets. Any custody-model change needs a human decision before implementation.

### Phase 2: Build the Deterministic Runtime

1. Define the versioned Data Product Spec and a registry of predefined, developer-implemented operators. The first executable slice is the canonical Swap contract plus Source, Filter/window, Map/normalization, Aggregate, Union, Join, and Output semantics for the cross-chain footprint target.
2. Validate supported operators, node configuration, typed connections, acyclicity, permissions, and resource budgets.
3. Implement dependency-aware execution for one representative product without arbitrary generated-code execution.
4. Persist product versions and per-node run status, and expose a stable API route.
5. Test supported compositions, invalid graphs, transformation results, and retry behavior; reconcile payment side effects before retrying paid work.

### Phase 3: Add the Builder Agent

1. Convert a natural-language request into a structured product specification.
2. Discover and select a suitable Graph source.
3. Show the planned source, schema, transformations, refresh policy, and estimated cost.
4. Require an explicit build action before expensive execution.
5. Support follow-up requests that modify the existing specification.

### Phase 4: Add the Product Workspace

1. Render the DAG from the shared JSON representation.
2. Allow editing of supported node parameters.
3. Display build trace and validation evidence.
4. Display the live endpoint, schema, sample response, and refresh state.

### Phase 5: Add Monetization and Demo Hardening

1. Package equivalent frontend, API, worker, and PostgreSQL roles for Docker Compose self-hosting.
2. Deploy the Creator Console to Vercel and the API, worker, and PostgreSQL to Railway; run migrations, health checks, and evaluator-path smoke tests.
3. Add a publish action that configures the selected product's Sprue-hosted x402 v2 `exact` gate, Hedera atomic price/fungible asset/resolved account-ID recipient/timeout, and Blocky402 capability.
4. Run a real consumer-agent paid request and correlate the returned data with facilitator and Hedera Mirror Node settlement evidence.
5. Show Graph expenses, gross API sales, creator proceeds, and any enabled platform fee as distinct records in the workspace.
6. Add caching, rate limits, and bounded demo budgets.
7. Record a reliable 2-4-minute end-to-end demo covering both sponsor paths; this proposed duration also fits Hedera's five-minute ceiling. Verify the public repository history and final award-specific evidence.

## Validation Strategy

- Validate every generated specification before execution.
- Test the runtime with deterministic fixtures before using live data.
- Verify source selection and schema assumptions against The Graph documentation and actual responses.
- Show source-to-output lineage for representative results.
- Reproduce at least one result from the displayed specification and raw source data.
- Test the x402 endpoint from a separate consumer path.
- Verify that a creator can build and privately use an API without Hedera paid publication; private access remains authenticated and must not create a public unpaid bypass.
- Test Blocky402 integration with capability drift, unpaid/invalid requests, verify failure, settle failure, replay/duplicate retries, and payment-success/data-delivery-failure reconciliation.
- Verify creator control of a resolved Hedera account ID and HBAR receive/access capability; distinguish its balance from Base Graph-spending funds. A display-only EVM address mapping is insufficient evidence.
- Test delegated Graph spending limits, revocation, concurrent budget reservations, and payment retry reconciliation.
- Reconcile deposits, upstream expenses, sales, creator proceeds, and any platform fee; never count deposits as earned revenue.
- Keep a manual fallback demo path if an external service is temporarily unavailable, while clearly labeling it as a fallback.
- Never commit API keys, private keys, wallet seed phrases, or other secrets.

## AI Usage and Disclosure Plan

AI is a development collaborator, not an unreviewed source of truth. All AI-generated work must be reviewed by the human team and validated through tests, documentation, live integration checks, or direct inspection before it is treated as project output.

### Planned Uses of AI

- Product ideation and narrowing the problem statement.
- Competitive and sponsor-landscape research.
- Architecture exploration and trade-off analysis.
- Drafting product copy, interface text, README content, and demo narration.
- Generating implementation scaffolding and repetitive code.
- Explaining SDKs, APIs, and unfamiliar code.
- Writing test cases and debugging hypotheses.
- Reviewing code for correctness, missing edge cases, and security risks.
- Summarizing build traces and validation results.

### Human Responsibilities

- Decide product scope, priorities, and final architecture.
- Verify sponsor requirements and technical claims against primary documentation.
- Review and own every committed code change.
- Run tests and real integration checks.
- Confirm that generated code does not introduce secrets, unsafe permissions, or uncontrolled resource usage.
- Approve final copy, screenshots, demo claims, and submission materials.

### AI Contribution Record

For each substantial AI-assisted contribution, record the following information in this section or in a linked project log:

| Date | Area | AI contribution | Human action | Verification |
|---|---|---|---|---|
| 2026-09-05 | Product direction | Consolidated brainstorming into the Sprue product thesis, MVP, and sponsor priorities | Human selected the final product boundary and implementation priorities | Reviewed against the shared product discussion and recorded in `agents.md` |
| 2026-09-05 | Project planning | Drafted this implementation and AI-disclosure plan | Human reviewed and approved the plan structure | Cross-checked against the MVP definition and repository language rule |
| 2026-09-05 | Project structure | Translated the hosted-web-product direction into control-plane, data-plane, lifecycle, domain-model, and repository-structure proposals | Human specified that Sprue should provide the managed service chain from Agent analysis through hosted API and x402 | Reviewed against the current product direction and recorded in `project-structure.md` |
| 2026-09-05 | Deployment architecture | Reviewed the hosted structure against Fly.io-style public deployment constraints | Human identified the need for an evaluator-accessible hosted demo | Checked official Fly.io guidance for process groups, persistence, secrets, deployment, and health checks |
| 2026-09-05 | Sponsor selection | Updated the integration plan to The Graph, Bazantic, and Privy | Human selected the sponsor combination | Roles were mapped to data, agent-service, and embedded-wallet layers; official qualification details remain a technical-selection task |
| 2026-09-05 | The Graph sponsor research | Summarized official award requirements, reviewed linked technical references, and proposed source-validation and evidence gates in `sponsor/graph.md` | Human supplied the official prize URL and requested a reusable development reference; track selection and final review remain pending | Cross-checked the official ETHGlobal page, Graph documentation, and sponsor-linked skill repository READMEs; no live integration or eligibility certification performed |
| 2026-09-05 | Bazantic sponsor research | Drafted `sponsor/bazantic.md` with award-specific conditions, proposed Recipe checks, and publication integration unknowns | Human supplied the Bazantic prize URL for the sponsor-reference workflow; award selection and review remain pending | Read the complete Bazantic section of the official event prize listing after the individual page could not be retrieved; no account, gateway, Recipe, or payment integration was created |
| 2026-09-05 | Participation and Privy research | Recorded Start Fresh, updated Graph/Bazantic applicability, and drafted `sponsor/privy.md` with wallet-flow and control evidence gates | Human confirmed Start Fresh and supplied the official Privy prize URL; integration choices and final review remain pending | Checked the Privy prize page and official x402/policy documentation; the linked quickstart could not be retrieved; no wallets, credentials, or paid actions were used |
| 2026-09-05 | Creator-wallet payment model | Corrected sponsor roles, scope, money flows, and evidence plans around the creator account wallet | Human specified wallet top-ups, Sprue-managed Graph purchases, optional Bazantic publication, creator revenue, and possible sales-based service fees | Checked official Graph x402 and Privy wallet documentation; product intent is confirmed, but provider interoperability and fee settlement remain untested; no funds moved |
| 2026-09-05 | Hedera sponsor replacement | Drafted `sponsor/Hedera.md`, replaced active Bazantic/Recipe work with Sprue-hosted x402 gating and Hedera/Blocky402 settlement, and updated financial and evidence boundaries | Human selected Hedera for the x402 step and requested the reference and replacement; wallet compatibility, fee terms, and implementation choices remain pending | Checked official ETHGlobal Hedera requirements, Blocky402, Graph payment, and Privy x402 documentation; validated documentation consistency; no wallets, paid calls, or deployed integrations were created |
| 2026-09-05 | DAG execution boundary and hosting costs | Recorded the predefined-operator DAG model in project guidance, architecture, and the implementation plan; researched Render's web, worker, database, and free-tier costs | Human approved Option A and requested a hackathon budget estimate; the stack and hosting provider remain unselected | Cross-checked the confirmed decision and official Render pricing, workspace-plan, database-storage, billing, and free-tier documentation; documentation changes only, with no deployment or purchase |
| 2026-09-05 | Portable evaluator deployment | Defined Vercel and Railway service roles plus a provider-neutral Docker self-hosting contract | Human selected Vercel plus Railway for temporary evaluator access and required Docker self-hosting without source changes | Compared official Vercel and Railway capabilities and pricing with past ETHGlobal deployment patterns; documentation changes only, with no cloud account, resource, or deployment created |
| 2026-09-05 | Development sequence and data-model gate | Marked the agreed technical baseline complete and defined the required data-model deliverable, contents, and acceptance gate before implementation | Human declared technical selection complete and added data-model definition as the next planning stage | Cross-checked the new stage against the MVP workflow, DAG execution boundary, financial model, deployment profiles, and existing implementation plan; no schema, migration, or application code created |
| 2026-09-05 | Data model draft | Drafted `data-model.md` with PostgreSQL entities, fields, constraints, relationships, state machines, transaction boundaries, financial separation, migration order, and a pre-implementation review checklist | Human requested the data model and asked that uncertain decisions be raised for discussion; at draft time, four proposed defaults remained pending review | Cross-checked the draft against project intent, architecture, and active Graph, Privy, and Hedera sponsor references; performed documentation validation only, with no migration, wallet, payment, or application code created |
| 2026-09-05 | Data model approval | Converted the reviewed draft into the version 1.0 MVP implementation baseline and synchronized the current project stage | Human approved all four defaults, including future-ready workspace membership records with only a single-owner flow implemented in the MVP | Confirmed the decisions are represented consistently in `data-model.md`, `agents.md`, `plan.md`, `project-structure.md`, and `README.md`; external compatibility and implementation checks remain open |
| 2026-09-05 | Privy implementation research and data model Draft 1.1 | Reviewed current official wallet-control, policy, idempotency, transaction, chain-support, Node SDK, and agent-wallet references; proposed separating wallet ownership, provider policies, signer grants, application budgets, and provider attempts in the model | Human supplied Privy's official documentation and GitHub organization to improve the data model; review of the resulting material refinement remains pending | Cross-checked official Privy documentation, `privy-io/node-sdk`, `privy-io/examples`, and representative Privy-owned agent repositories; validated documentation structure only, with no wallet, signer, policy, transaction, credential, or funded action created |
| 2026-09-05 | Data model version 1.1 approval | Promoted the reviewed Privy wallet and payment refinement to the implementation baseline and synchronized current project status | Human explicitly approved the user-owned wallet, policy-bound Sprue additional signer, immutable provider-policy snapshot, and Sprue database budget model | Updated documentation status only; no migration, wallet, signer, policy, credential, transaction, or funded action was created |
| 2026-09-05 | Graph documentation review and data model Draft 1.2 | Reviewed current official source identifiers, gateway routes, MCP discovery/schema operations, GraphQL pagination and `_meta` behavior, API-key access, and per-query x402 flow; proposed immutable source snapshots and upstream HTTP-attempt records | Human supplied The Graph's official documentation and requested a corresponding data-model check; review of the material refinement remains pending | Cross-checked the source and payment model against official Graph documentation; performed documentation validation only, with no query credential, migration, paid request, wallet action, or deployment created |
| 2026-09-05 | Dual Graph access model | Added first-class customer-API-key/existing-subscription access alongside creator-wallet x402 pay-per-query, including credential lifecycle, secret references, mode constraints, metering, and no-paid-fallback behavior | Human explicitly required users to be able to choose either their existing Graph API key or per-call Graph x402 | Updated Draft 1.2 and product guidance only; no API key, secret, provider account, query, wallet action, payment, or migration was created |
| 2026-09-05 | Hedera documentation review and data model Draft 1.3 | Reviewed current official Hedera x402, account identity, asset capability, facilitator, and Mirror Node transaction references; proposed recipient/asset capability and normalized settlement records | Human supplied Hedera's official documentation and requested the same evidence-driven model review workflow | Cross-checked official Hedera and Blocky402 documentation and performed read-only live `/supported` checks for hosted testnet/mainnet; updated documentation only, with no account, key, wallet, transaction, paid request, migration, or deployment created |
| 2026-09-05 | Data model version 1.3 approval and HBAR profile | Promoted the combined Graph/Hedera refinement to the implementation baseline and synchronized the initial downstream profile | Human explicitly approved Draft 1.3 and selected HBAR for the first Hedera integration | Updated planning records to use Hedera testnet HBAR while retaining HTS only as a future-compatible model; no migration, account, wallet, token, transaction, paid request, or deployment was created |
| 2026-09-05 | Product and interface design stage | Inserted a design gate between the approved data model and MVP implementation, with page inventory, interaction specification, UI-state, navigation, accessibility, and data-contract deliverables | Human requested that page count and per-page interaction elements be designed before development | Synchronized the macro plan and current-stage records; no page count, visual direction, component, application code, or deployment was assumed in this planning-only change |
| 2026-09-05 | Product and interface design Draft 0.1 | Proposed seven page families, shared navigation, creator/consumer journeys, per-page interactions, financial and operational states, responsive/accessibility rules, and screen-to-domain contracts | Human asked to begin the dedicated design artifact | Applied a developer-tool UX review and mapped every major interaction to data-model version 1.3; the page architecture, evaluator payment method, mobile editing commitment, and visual-system timing await human approval; no component, application code, wallet action, payment, or deployment was created |
| 2026-09-05 | Product and interface design version 1.0 | Promoted the seven-page architecture and interaction specification, revised narrow-screen requirements to a large-screen browser Creator Console, and separated structured DAG accessibility from mobile support | Human approved D1, D2, and D4 and explicitly excluded mobile from the current product target | Updated the planning baseline and kept visual tokens, browser wireframes, and capped demo-consumer safeguards as remaining design work; no UI code, wallet action, funding, payment, or deployment was created |
| 2026-09-05 | Evidence-First Console prototype | Implemented a self-contained seven-page React prototype from the selected third visual direction, added realistic mock transitions, documented visual QA, and clarified the browser-only product boundary | Human selected the third visual exploration and clarified that Sprue is a web product rather than a Windows client | Built and tested the static prototype, passed the Sites worker test, exercised the primary Builder/API/Monetize/consumer/wallet interactions in the Codex in-app browser, checked browser logs, compared the 1440-by-1024 render with the selected source, and checked the 1024-pixel minimum; no real authentication, wallet, payment, Graph query, backend, or deployment was used |
| 2026-09-05 | Design-token Draft 0.1 | Formalized the Evidence-First Console into documented primitive, semantic, and component layers; added a validated JSON-to-CSS generator; and migrated the prototype's color system and principal layout/component contracts to generated tokens | Human requested design-token work after selecting the third visual direction; DT1-DT4 remain subject to human review | Checked every token for type, description, valid references, and legal layer direction; verified generated-file freshness, removed raw color literals from application CSS, rebuilt the prototype, and reran all Sites packaging tests; no production application, integration, wallet action, payment, or deployment was created |
| 2026-09-05 | Frontend and backend repository boundaries | Moved the runnable browser prototype into `frontend/`, created the `backend/` ownership boundary, split all seven route pages into separate files, extracted shared components and Builder features, and documented production-oriented file allocation rules | Human requested root frontend/backend folders and explicitly rejected multi-page source files in both future frontend code and the prototype | Rebuilt the frontend, reran source-structure, token, and Sites packaging checks, and rendered the refactored Dashboard, Wallet, Builder, and public product routes in the Codex in-app browser; no backend runtime, provider integration, wallet action, payment, or deployment was created |
| 2026-09-05 | English and Chinese frontend localization | Added a centralized React locale provider, complete English and Simplified Chinese message catalogs, browser-language detection, persistent user selection, accessible language controls, localized prototype copy, and catalog validation | Human requested initial English and Chinese localization support | Applied focused React context and language-control accessibility guidance, validated catalog parity and message references, rebuilt the frontend, and exercised locale switching across creator and public routes; no translation service, account data, backend write, or external provider action was used |
| 2026-09-05 | Maintained product frontend | Promoted the existing seven-page application, updated product naming and guidance, isolated sample services and fixtures behind feature hooks, added cancellation and duplicate-submission guards, and documented integration gaps | Human requested that the existing code be treated as the real product frontend rather than a disposable prototype | Production build, page ownership, locale parity, tokens, four demo-service tests, and four Sites packaging tests passed; browser checks covered all seven page families, English/Chinese switching and reload persistence, sample build/API/consumer flows, and navigation during a running request. UI/UX guidance informed loading-state and current-step corrections. No real account, payment, provider request, or deployment was created |
| 2026-09-05 | Frontend/backend API contract | Mapped data-model 1.3, seven frontend pages, and designed interactions into a shared HTTP contract and four domain references covering DTOs, authentication, commands, concurrency, traces, deployment, x402, recovery, and financial views; identified M1-M3 model gaps | Human requested an interface document based on the data model and frontend; contract, model refinements, provider control, and capped-consumer review remain pending | Checked six JSON examples, local documentation links/anchors, Markdown tables, operation uniqueness, English-only text, and Git diff formatting; cross-checked reviewed model invariants and official Privy/x402 references. Hedera pages were unavailable in this pass, so the previously reviewed local reference was retained. Documentation only: no migration, endpoint, provider action, payment, or deployment created |
| 2026-09-05 | Agent harness design | Designed the natural-language/source/query/operator compilation stages, typed Agent tool and developer-script inventory, deterministic runtime handoff, bounded expression/operator language, recovery constraints, and semantic/security evaluation plan under backend/harness | Human requested a harness folder with step-by-step design, tools to prepare, and enforced constraints; exact operator/configuration schemas, durable checkpoint refinements, live metric/source, and operating limits remain proposed H1-H3 review items | Cross-checked data-model 1.3, frontend Builder fixtures, API contracts and active Graph/Privy references; checked five JSON examples, 75 local links/anchors, 20 Markdown tables, ten unique Agent tools, English-only text, and the worked repeat-activity arithmetic. Documentation only: no script implementation, migration, provider request, model call, wallet action, payment, source deployment or API publication |
| 2026-09-05 | MVP operator and semantic-template alignment | Aligned the five-type scope across guidance, architecture, design, harness and API/model examples; designed two versioned compile-time templates plus bounded read/expand tools; replaced the six-card frontend fixture with a seven-node spec, actual-edge projection, semantic disclosure, constrained local recompilation and consistent output fixtures | Human agreed to small MVP scope and authorized these changes; exact executable schemas, durable provenance, live source/methodology and numerical limits remain H1-H3 review work | Used UI/UX guidance for stable IDs, derived display state and keyboard disclosure while preserving semantic tokens. Build, 26 automated tests and token checks passed; validated 10 JSON examples and 86 local links, and opened a local route after HTTP 200. No new browser interaction/visual QA, backend compiler/runtime, Agent call, migration, provider query, wallet action, payment or cloud deployment. Fixture evaluation is test-only, not integration evidence |
| 2026-09-06 | Deterministic DAG runtime implementation | Generated the provider-neutral source mapping validator, canonical Swap normalization, exact decimal helpers, bounded window/filter, Aggregate, Union, Join, output orchestration, live-shape fixtures, and regression tests | Human asked to begin implementation after approving schema-driven provider field selection and the Cross-chain DEX Trader Footprint as the MVP target | Passed 34 backend tests, strict TypeScript validation, production build, and whitespace checks. The implementation remains offline and fixture-backed: no application Graph adapter, Agent call, migration, wallet action, payment, or deployment was created |
| 2026-09-06 | MVP end-to-end flow and implementation support matrix | Recorded the complete browser-to-backend journey, provider/payment branches, durable state ownership, and the distinction between implemented foundations, framework reservations, and missing live integrations in `mvp-flow.md` | Human asked to record the full frontend/backend MVP sequence and check which parts are already supported | Cross-checked the current frontend status, backend route implementation, database/runtime tests, API contract, harness boundary, and deployment records; documentation synchronization only, with no new handler, provider call, wallet action, payment, or deployment |
| 2026-09-06 | Configurable mock Agent harness | Added server-side `AGENT_MODE`, `AGENT_API_URL`, `AGENT_API_KEY`, `AGENT_MODEL`, and `AGENT_TIMEOUT_MS` configuration; implemented a provider-neutral model port, fixed MVP mock proposal, untrusted proposal validation, source binding, trace stages, and deterministic cross-chain execution | Human requested a configurable Agent harness with a mock model so the non-Agent MVP flow could be connected before selecting a real model/provider | Passed 37 backend tests, strict TypeScript validation, production build, and diff checks. Mock execution is fixture/synthetic-input backed; remote mode fails closed, and no durable Agent route, live model call, wallet action, payment, or deployment was created |
| 2026-09-05 | Database initialization and approved M1-M3/H2 persistence | Updated data-model to 1.4; designed and implemented 51 domain tables/699 columns, split SQL migrations and Drizzle mappings, command/outbox/recovery/checkpoint/provenance records, migration tooling, public metadata seeds and isolated constraint tests; synchronized API/harness guidance | Human explicitly approved the five proposed persistence/lifecycle directions and database initialization work; H1/H3, E1/E2 and fee decisions remain open | Passed 13 backend tests on Node 24/PGlite, model/schema comparison, backend TypeScript validation, frontend build and 26 frontend tests; native PostgreSQL 17/Docker/Railway and multi-connection behavior remain unverified. No remote DB, API, model/provider call, wallet, funds movement or deployment was created |
| 2026-09-05 | Backend API and worker framework | Implemented Express 5/TypeScript process composition, validated configuration, domain-split route registrations, safe errors/logging/CORS/transport checks, health/readiness, verifier-gated identity reads, explicit standby worker, generated partial OpenAPI, Docker build/Compose profiles and tests | Human requested backend scaffolding following the existing file layout and API design; no H1/H3, E1/E2 or fee gate was approved | Passed 28 backend tests, TypeScript/build checks, 100-route Markdown/catalog parity, generated OpenAPI freshness, compiled API/worker startup/probes/shutdown and Compose configuration validation. SQL tests used isolated PGlite; no native PostgreSQL/container/cloud deployment, real Privy verification, queue job, provider request or payment was performed |
| 2026-09-05 | Existing-Subgraph-only product boundary | Aligned project guidance, architecture, source-selection and failure behavior, harness tools/operators/acceptance requirements, model/design scope notes, and Sprue-specific Graph sponsor guidance; removed upstream creation and ingestion fallbacks from the roadmap | Human explicitly excluded creating new Subgraphs or Subgraph Composition and authorized documentation synchronization only; the single-source/five-type MVP and open implementation/payment gates are unchanged | Checked boundary consistency, relative documentation links, English-only additions, whitespace, and unchanged official sponsor rules/historical records. Documentation only; no runtime tests or provider checks were rerun, and no code, schema, routes, paid actions, or deployments changed |

| 2026-09-06 | Schema-driven multi-source DAG runtime slice | Implemented provider-neutral source mapping validation, canonical Swap normalization, exact decimal arithmetic, timestamp windows, per-chain aggregation, Union lineage, one-to-one cross-chain Join, and the primary MVP orchestration; added sanitized live-shape Ethereum and Arbitrum fixtures plus deterministic tests | Human asked to begin the next implementation step after confirming that provider fields should come from Graph schema/response rather than being hardcoded | Passed 34 backend tests, strict TypeScript validation, production build, and diff checks. Live Graph queries previously confirmed both candidate sources expose compatible selected fields and stable cursor/block behavior; no live application adapter, migration, Agent call, wallet action, payment, or deployment was created |

| 2026-09-05 | Windows-local stack and evaluator packaging | Added root Compose/PowerShell lifecycle, frontend Docker/Nginx packaging, public API configuration transport, Vercel and Railway manifests, deployment guidance and infrastructure tests; preserved the optional Sites adapter and patched Vite to 6.4.3 with compatible dependency updates | Human requested Windows-local frontend/backend/database testing plus portable evaluator deployment; no cloud resource, payment authority or business feature was approved | Passed 28 backend tests, typecheck, frontend full build and 28 frontend tests including Sites, three deployment checks, PowerShell 5.1/7 config validation, Docker image builds and four-service readiness. Native PostgreSQL 17 verified 15 migrations, 51 tables and 699 columns; native Node API/worker probes and shutdown passed. HTTP deep links, missing-asset/API 404s, exact CORS and unchanged migration journal after full stop/start passed. Official-registry dependency audits reported zero known vulnerabilities. Local port conflicts were handled through configuration only; no volume or system reservation was deleted. Cloud deployment, browser interaction QA, multi-connection races and sponsor/business integrations remain unverified |
| 2026-09-05 | Multi-Subgraph Union and Join scope | Expanded the MVP from one Graph source to multiple existing Subgraph sources with explicit Union and Join nodes, per-source access and provenance, compatible-schema validation, typed join constraints, and bounded fan-in and fan-out | Human explicitly changed the prior single-source boundary; new Subgraph creation, Subgraph Composition, hidden adapter merging, automatic payment fallback, and arbitrary code execution remain excluded | Documentation-only synchronization across agents.md, data-model 1.5, harness, Graph sponsor guidance, API/design records and current frontend-status notes; no runtime code, migration, provider query, wallet action, payment or deployment was performed |

| 2026-09-06 | Primary MVP demo target | Converted the approved multi-Subgraph scope into one concrete Cross-chain DEX Trader Footprint API: Uniswap V3 activity on Ethereum and Arbitrum, explicit Join for cross-chain wallet overlap, and Union for the companion all-activity view | Human approved this example as the MVP planning target | Recorded the natural-language request, normalized row contract, DAG shape, output projection, source-validation gates and bounded demo scope; no code, migration, provider query, wallet action, payment or deployment was performed |

| 2026-09-06 | Creator-configurable Agent model service | Added a ninth route-level page for an OpenAI-compatible API URL, API key, and model name; implemented a redacted session profile, bounded remote Chat Completions adapter, and next-plan-only model selection | Human explicitly requested a left-sidebar page for configuring the model used during Agent construction | UI/UX guidance informed visible labels, inline validation, first-error focus, reduced-motion behavior, duplicate-submit prevention, and explicit status feedback. Passed 40 backend tests, strict TypeScript/build/OpenAPI checks, the full frontend build and Sites tests, deployment tests, Docker image rebuild/four-service readiness, and browser checks for localized layout, validation, key non-disclosure, reload behavior, restart clearing, and console errors. The remote request test used an injected fake provider; no external model, database migration, durable identity, secret-manager write, Graph request, wallet action, payment, or cloud deployment was performed |
| 2026-09-06 | Graph credential progressive disclosure | Moved the credential action from the page header into the credential section and made credential management conditional on API-key Graph access | Human identified the split attention and explicitly required credentials and their action to disappear for x402 access | Applied focused UI/UX progressive-disclosure and accessibility guidance; the full frontend build, 4 Sites tests, Docker image rebuild and four-service readiness passed. Browser checks covered x402 absence, API-key disclosure, the colocated add dialog, return-to-x402 removal, radio semantics, and console errors. No credential, secret, provider request, wallet action, payment, or backend behavior was created or changed |
| 2026-09-06 | Product Dashboard simplification | Removed the lower Recent Activity and Sponsor Proof panels, their presentation styles, icons, and obsolete localized copy while retaining summary metrics, the product list, and product creation | Human explicitly identified the entire lower Dashboard region as unnecessary | Applied focused information-hierarchy guidance and added a source-structure regression. The full frontend build, 4 Sites tests, Docker rebuild and four-service readiness passed; browser checks confirmed the two panels are absent, product navigation remains functional, and no console errors were emitted. The backend demo projection remains unchanged; no provider evidence, wallet action, payment, or API behavior was created or removed |
| 2026-09-06 | API contract-focused page | Removed the standalone deployment-evidence panel and replaced it with explicit request-parameter and response-format documentation backed by the demo runtime contract; made the request tester send and validate the documented `limit` query parameter | Human explicitly removed deployment evidence from this page and requested visible request and response formats | Applied compact responsive data-table guidance, added backend and frontend regressions, and verified the page at the target desktop viewport. Backend typecheck, 40 tests, production build and API specification checks passed; the full frontend build, 4 Sites tests, Docker rebuild and four-service readiness passed. A local HTTP request confirmed bounded `limit` handling and response metadata. No cloud deployment, Graph request, wallet action, payment, or sponsor evidence was performed |
| 2026-09-06 | Model Service concealment and connection testing | Made the API key concealed by default with closed-eye/reveal states, changed empty-field examples to the official OpenAI Chat Completions URL and `gpt-5.6-sol`, and added a non-saving explicit connection test with bounded feedback | Human explicitly requested clearer secret presentation, GPT-5.6 Sol examples, and a way to test the current model configuration | OpenAI's official model reference established the exact `gpt-5.6-sol` ID and Chat Completions path; UI/UX guidance kept testing secondary to saving and made loading/result feedback explicit. Passed 41 backend tests, strict TypeScript/build/OpenAPI checks, the complete 34-test frontend build, 4 Sites tests, Docker image rebuild/four-service readiness, and browser checks for conceal/reveal state, examples, controls, and console errors. Provider requests were tested with injected fakes; no external model request or real API key was used |

This table must be updated when AI materially influences architecture, implementation, testing, or submission content.

## Risk Controls

- Builder execution is private or authenticated by default.
- Planning should be inexpensive; build, backfill, deployment, and paid execution must be bounded.
- Use server-side secret storage.
- Prefer one backend runtime with multiple product definitions instead of one server per product.
- Use cached or materialized results where repeated calls could multiply upstream costs.
- Set explicit request, query, storage, and spending limits for the demo.
- Treat upstream data licensing and resale permissions as product metadata before composing or monetizing third-party outputs.

## Submission Narrative

The demo should make three moments obvious:

1. **Describe it:** the user expresses a data-product idea in natural language.
2. **Shape it:** Sprue exposes the source, transformation DAG, validation trace, and live API.
3. **Sell it:** the product is published with x402 and a consumer agent completes a paid request.

The central explanation for judges is:

> A query dies after it returns an answer. Sprue turns data logic into a persistent product.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-05 | Created the initial project plan and AI usage record | Establish a transparent hackathon development record |
| 2026-09-05 | Added the five-stage macro development plan; brainstorming marked complete | Align the detailed plan with the team's overall execution sequence |
| 2026-09-05 | Started project structure conception and documented the hosted platform model | Define the product surfaces, service boundaries, and MVP architecture before technical selection |
| 2026-09-05 | Added Fly.io-compatible deployment guidance to the project structure | Make the public hosted demo reliable without turning every data product into a separate deployment |
| 2026-09-05 | Selected The Graph, Bazantic, and Privy as the planned sponsor integrations | Align the technical-selection phase with the team's sponsor strategy |
| 2026-09-05 | Added The Graph sponsor reference and linked development gates | Separate official requirements from implementation proposals and preserve a source-backed compliance checklist |
| 2026-09-05 | Added the Bazantic sponsor reference and research record | Make award-specific evidence and publication unknowns explicit before implementation |
| 2026-09-05 | Confirmed Start Fresh and excluded Continuity-only targets | Apply the user's participation category without claiming completed eligibility checks |
| 2026-09-05 | Added the Privy sponsor reference and research record | Distinguish wallet creation from functional payment/control evidence and flag interoperability work |
| 2026-09-05 | Replaced the buyer-first wallet proposal with the confirmed creator-account model | Make Graph payment automation core, Bazantic publication optional, and revenue/fee accounting explicit |
| 2026-09-05 | Replaced Bazantic with Hedera and Blocky402 in the active x402 plan; retained superseded research and earlier logs | Follow the user's sponsor decision, remove Recipe deliverables, and expose recipient compatibility and separate-network accounting gates without claiming implementation |
| 2026-09-05 | Confirmed dynamic DAG composition from predefined operators, excluding arbitrary generated-code execution from the MVP | Record the user's Option A decision while leaving the stack and hosting choice open |
| 2026-09-05 | Selected Vercel plus Railway for the evaluator demo and required source-compatible Docker self-hosting | Optimize temporary judge access while preserving deployment portability and avoiding permanent provider coupling |
| 2026-09-05 | Marked technical selection complete and inserted data-model definition before MVP implementation | Make entities, relationships, constraints, execution state, and financial records explicit before code and migrations are created |
| 2026-09-05 | Added the first complete data-model draft and left the phase open for human review | Establish an implementation-ready persistence contract while keeping unresolved product defaults explicit |
| 2026-09-05 | Approved data model version 1.0 and moved the project into MVP implementation | Record the four confirmed defaults while preserving external integration and implementation checks as open validation gates |
| 2026-09-05 | Proposed data model Draft 1.1 from current Privy implementation references | Model wallet owner, entity, additional signer, provider policy, finite idempotency, and transaction reconciliation as distinct concerns for human review before migrations are generated |
| 2026-09-05 | Approved data model version 1.1 as the implementation baseline | Record the human decision on the Privy control model and unblock wallet and payment migration design while retaining live integration gates |
| 2026-09-05 | Proposed data model Draft 1.2 from current Graph documentation | Separate logical source identity from immutable deployment/schema snapshots, preserve block/error provenance, and represent every x402 challenge and paid retry without assuming live compatibility |
| 2026-09-05 | Added customer Graph API-key access as a peer to x402 in Draft 1.2 | Follow the human product decision, keep externally billed subscription usage separate from wallet expenses, and forbid silent paid fallback |
| 2026-09-05 | Proposed data model Draft 1.3 from current Hedera and Blocky402 documentation | Pin x402 v2 `exact`, resolve recipient account identity, verify per-asset receive/access capability, and reconcile facilitator results to native Hedera settlement evidence without assuming Privy compatibility |
| 2026-09-05 | Approved data model version 1.3 and selected Hedera testnet HBAR for the first downstream integration | Unblock affected migration design while keeping Privy-to-Hedera control and live settlement as evidence gates |
| 2026-09-05 | Inserted product and interface design before MVP implementation and made it the current stage | Decide page count, per-page interactions, navigation, UI states, accessibility, and screen-to-data contracts before components encode product behavior |
| 2026-09-05 | Created product and interface design Draft 0.1 | Propose a seven-page MVP architecture with explicit creator, consumer, financial, responsive, accessibility, and backend-contract behavior for human review before implementation |
| 2026-09-05 | Approved product-design version 1.0 for a large-screen browser Creator Console | Record D1, D2, and D4 approval, remove mobile/tablet layout work from the MVP, retain non-drag DAG controls for browser accessibility, and move the design stage to tokens and wireframes |
| 2026-09-05 | Selected Evidence-First Console and created the seven-page browser prototype | Preserve the chosen third visual direction, clarify that Sprue has no native Windows/macOS client, and make the approved page architecture reviewable before MVP implementation |
| 2026-09-05 | Proposed design-token Draft 0.1 and applied it to the prototype | Convert the selected visual direction into a governed three-layer source of truth with accessibility, component, layout, and generation contracts before production UI implementation |
| 2026-09-05 | Reorganized the repository around root `frontend/` and `backend/` boundaries and split the prototype by route and feature | Keep page ownership explicit, prevent multi-page modules, and establish deployable frontend/API/worker boundaries before MVP implementation |
| 2026-09-05 | Added English and Simplified Chinese localization to the frontend prototype | Make evaluator-facing UI language selectable and persistent while keeping copy centralized, accessible, and ready for additional locales |
| 2026-09-05 | Promoted the existing application to the maintained product frontend and started frontend implementation | Follow the human direction, retain page ownership and localization, isolate demo workflows, and track incomplete behavior explicitly without claiming live integration |
| 2026-09-05 | Added API contract Draft 0.1 and four domain interface documents, linked from frontend/backend/model/design guidance | Establish one reviewable frontend/backend contract while explicitly separating proposed model additions and lifecycle clarification from approved data-model 1.3 |
| 2026-09-05 | Added Agent harness Draft 0.1 under backend/harness and corrected the plan's superseded DAG excerpt | Define reusable bounded planning tools, deterministic operator execution, explicit creator gates and testable recovery before implementing the Agent; retain H1-H3 and existing model/API review gates |
| 2026-09-05 | Confirmed the five-type MVP scope and aligned semantic-template design, canonical examples and maintained Builder frontend | Keep execution primitive-only, distinguish repeat activity from retention, preserve the full denominator and record H1-H3 boundaries without approving new persistence or live integrations |
| 2026-09-05 | Approved M1-M3 and H2 persistence directions; implemented initial database foundation | Keep commands, recovery credentials, run context and compilation provenance durable without approving executable H1 semantics, H3 limits, live provider compatibility, buyer authority or fees; preserve SQL migration history and separate structural tests from integration evidence |
| 2026-09-05 | Added backend API/standby-worker framework and executable route registry | Make process, transport and ownership boundaries testable without advertising unimplemented business routes, activating provider capabilities, or accepting non-durable work |
| 2026-09-05 | Confirmed and synchronized the existing-Subgraph-only product boundary | Select and query suitable existing sources, use only necessary supported processing, and report source gaps without creating Subgraphs, Subgraph Composition, or ingestion fallbacks; retain hosted APIs, optional x402, and the current single-source MVP scope |
| 2026-09-05 | Implemented Windows-local deployment and Vercel/Railway packaging with native PostgreSQL verification | Make the same source runnable as a browser product locally or in the evaluator profile; preserve durable data and explicit migrations while keeping demo pages and unfinished integrations honestly labeled |
| 2026-09-05 | Updated language-selector labels to use native language names | Help users identify their language regardless of the current interface locale; `English` and `中文` are now stable option labels in both catalogs | Added localization regression coverage; frontend i18n tests and the isolated production build passed |
| 2026-09-05 | Clarified the Graph Subgraph MCP adapter boundary in the harness | Treat MCP as replaceable discovery/schema/execution infrastructure while keeping GraphQL generation, validation and DAG semantics inside Sprue; preserve access and payment authorization around execution | Updated harness overview, workflow, tool catalog, and Graph module ownership notes; documentation-only change, no provider call or live query performed |
| 2026-09-05 | Expanded the MVP to explicit multi-Subgraph Union and Join composition | Enable cross-chain and multi-source products while preserving separate source selection, access, provenance, consistency and cost accounting; keep upstream Subgraph creation out of scope | Human explicitly approved the scope change; synchronized model 1.5, harness, Graph sponsor guidance, API/design records and frontend alignment notes; no runtime code, migration, provider request, wallet action, payment or deployment was performed |
| 2026-09-06 | Confirmed the Cross-chain DEX Trader Footprint API as the primary MVP demo target | Give the multi-Subgraph MVP one concrete buyer-facing data product: compare Uniswap V3 activity on Ethereum and Arbitrum, use Join for cross-chain wallet overlap, and retain Union as an explicit all-activity view | Human approved the concrete example for MVP planning; source candidates, schema compatibility, coverage, runtime limits and live payment/provider evidence remain validation gates; no code, migration, provider query, wallet action, payment or deployment was performed |
| 2026-09-06 | Moved frontend business data behind the backend demo runtime | Remove browser-owned product fixtures from route-level pages while the mock Agent harness and deterministic DAG runtime provide the evaluator projection; keep the demo route explicit, non-durable and clearly separate from live sponsor evidence | Added the documented `/api/v1/public/demo/state` and `/api/v1/public/demo/actions` boundary, backend runtime tests, frontend API client, runtime provider and page integration; provider calls, wallet actions, payments, durable business handlers and cloud deployment remain pending |
| 2026-09-06 | Added creator-configurable Agent model service | Let evaluators supply an OpenAI-compatible endpoint, API key, and model name while keeping secrets server-bound and invoking the model only on explicit plan generation |
| 2026-09-06 | Scoped Graph credential management to API-key access and colocated its action with the credential list | Keep each access path focused on only its required resources and avoid splitting one credential task across the page header and lower content |
| 2026-09-06 | Removed the Dashboard's Recent Activity and Sponsor Proof panels | Keep the landing workspace focused on summary metrics, finding products, and starting the primary creation flow |
| 2026-09-06 | Replaced the API deployment-evidence panel with request and response format documentation | Keep the API view focused on consumer integration needs and make its bounded request tester match the displayed contract |
| 2026-09-06 | Added default API-key concealment, GPT-5.6 Sol examples, and explicit Model Service connection testing | Let creators verify current form values without saving while keeping provider calls, possible charges, and secret boundaries visible |
