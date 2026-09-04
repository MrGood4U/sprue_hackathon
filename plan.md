# Sprue Project Plan

## Purpose

This document records the product plan, implementation priorities, validation strategy, and use of AI during the hackathon. It is a living document and must be updated when major product or architectural decisions change.

All repository records are written in English. Team communication may use Chinese, but repository artifacts remain English-only.

## Confirmed Participation

The user confirmed Start Fresh on 2026-09-05. This resolves the participation-category question, not the audit of development provenance or individual sponsor eligibility. The Graph's AI From Scratch award and Hedera's AI & Agentic Payments award are the primary candidate targets for their respective integrations. Continuity-only awards are excluded. Final award submissions and integration evidence remain pending.

## Product Goal

Sprue turns a natural-language description of onchain data logic into a persistent, reusable, and optionally monetizable data product.

The product is deliberately different from a natural-language blockchain query assistant. The Graph provides indexed onchain facts and query capabilities; Sprue turns user-defined transformations into a continuously available API.

The primary product promise is:

> Describe it. Shape it. Sell it.

## Macro Development Plan

The project will follow this high-level sequence:

```text
Brainstorming (complete)
    -> project structure conception (complete)
    -> technical selection, including sponsor integrations (complete)
    -> data model definition (current)
    -> MVP implementation
    -> project refinement
```

### 1. Brainstorming — Complete

Define the product direction, target user, core differentiation, sponsor opportunities, MVP boundary, and demo narrative. The current direction is Sprue: natural-language data logic becomes a persistent, reusable, and optionally monetizable onchain data product.

### 2. Project Structure Conception — Complete

Turn the product direction into a concrete system and repository structure. Define the main user journey, frontend and backend responsibilities, shared Data Product Spec, transformation DAG, product lifecycle, API shape, and the smallest demonstrable vertical slice.

The current product shape is a hosted web platform with two connected surfaces: a Creator Console for building and operating products, and a Hosted Product API for external consumer agents and applications. Sprue provides the managed chain from natural-language analysis through The Graph, transformation, API hosting, and x402 access. For the temporary evaluator-facing demo, deploy the Creator Console to Vercel and the API, worker, and PostgreSQL to Railway. Keep the same application portable to Docker self-hosting without source changes. The current structure is documented in [`project-structure.md`](project-structure.md).

### 3. Technical Selection, Including Sponsors — Complete

Choose the implementation stack and validate the external dependencies that directly support the core flow. The selected sponsors are The Graph, Hedera, and Privy. The Graph supplies data purchased by Sprue on the creator's behalf. Privy provides the creator account wallet for funding and delegated Graph payments; the intended creator-controlled Hedera receipt path still needs validation. Sprue implements optional x402 access for its hosted APIs, using Blocky402 to verify and settle downstream payments on Hedera. Validate the upstream payment path and downstream settlement independently; sponsor qualification still requires evidence.

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

### 4. Data Model Definition — Current

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

Draft 0.1 was created on 2026-09-05. The phase remains current until the proposed defaults and review checklist are accepted.

### 5. MVP Implementation

Build the smallest reliable end-to-end product: creator-wallet funding and bounded Graph purchases, natural-language planning, validated data transformation, persistent API, conversational editing, optional Hedera x402 access through Blocky402, and a real paid consumer request with revenue reconciliation and any enabled fee.

### 6. Project Refinement

Improve the product after the core flow works. Focus on interface quality, explainability, reproducibility, build traces, caching, bounded resource usage, error handling, demo reliability, documentation, and final submission materials. Stretch features should not destabilize the core vertical slice.

## Problem Statement

Onchain data is abundant, but turning a data idea into a reliable service still requires source discovery, schema understanding, transformation logic, validation, scheduling, API design, deployment, and monetization. Sprue hides this data-engineering complexity behind a natural-language interface while preserving an inspectable execution plan.

## Target User

The initial user is a Web3 builder, analyst, protocol team, or AI agent creator who wants to create a derived onchain data product without manually implementing the full indexing and API stack.

Example request:

> Build an API that measures DEX stickiness on Base. Use the last 30 days, exclude one-time wallets, group by protocol, refresh daily, and charge $0.01 per request.

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
- Automated Graph payments within the account budget, including safe stops for insufficient funds or revoked permission.
- Natural-language data-product request.
- Existing The Graph source discovery and schema inspection.
- A focused Data Product Spec representation.
- A validated transformation DAG.
- A small set of transformation nodes: Source, Filter, GroupBy, Window, Aggregate, and Output.
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

- New subgraph generation when an existing source is insufficient.
- Composition of additional upstream paid providers beyond the required Graph integration.
- Separate per-product wallets and general-purpose autonomous treasury management.
- Marketplace discovery.
- Automatic pricing optimization.
- Additional payment networks beyond the required Base/Graph and Hedera sales paths; automatic cross-chain bridging or conversion.
- Broad multi-tenant support.
- Production-grade abuse prevention and enterprise access control.

## Confirmed DAG Execution Model

On 2026-09-05, the user approved Option A: dynamically compose predefined, developer-implemented operators into a DAG. The Agent selects nodes, parameters, and connections from a validated registry instead of generating arbitrary executable JavaScript or Python. The graph remains request-specific rather than a fixed pipeline.

The MVP must validate operator support, configuration, input/output compatibility, cycles, permissions, and resource budgets. Unsupported intent should produce an explicit limitation or a supported alternative, not an unrestricted code-execution fallback. Validate and bound generated Graph query configuration separately.

Store a versioned execution definition separately from UI layout and pin each run to a definition version. Queue scheduling, DAG execution, and result refresh/materialization are separate responsibilities. The exact operator subset, implementation stack, and execution libraries remain open decisions.

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

The frontend and backend should use one simple, validated representation:

```json
{
  "nodes": [
    {"id": "source1", "type": "graph_source", "config": {}},
    {"id": "filter1", "type": "filter", "config": {"minVolume": 1000}},
    {"id": "agg1", "type": "aggregate", "config": {"by": "wallet"}}
  ],
  "edges": [
    {"from": "source1", "to": "filter1"},
    {"from": "filter1", "to": "agg1"}
  ]
}
```

The frontend edits the graph; the backend validates, compiles, runs, and persists it.

## Implementation Sequence

Begin this sequence only after `data-model.md` satisfies the Data Model Definition acceptance gate and receives human review. External dependency spikes that do not create application schema may be prepared earlier, but application entities, migrations, repositories, and API persistence must follow the reviewed model.

### Phase 1: Validate External Dependencies

1. Validate a bounded Graph query and its live source coverage.
2. Validate creator-wallet funding and a Privy-authorized payment to the selected Graph gateway; test permission and balance failures.
3. Validate Hedera account/recipient mapping, supported payment asset, creator control of receipts, and buyer signing separately. Do not infer Privy compatibility from generic EVM support or export user keys to adapt a sample.
4. Protect a test Sprue-hosted API with x402 and Blocky402; verify a separate consumer's `402 -> payment -> 200` flow on Hedera, correlated with settlement and creator receipt.
5. Investigate revenue allocation and fee collection; approve fee terms before enabling any charge. Keep upstream funding and downstream income separate; no automatic bridge is planned.
6. Record credential names, networks, facilitators, payment evidence, and deployment assumptions without committing secrets. Any custody-model change needs a human decision before implementation.

### Phase 2: Build the Deterministic Runtime

1. Define the versioned Data Product Spec and a registry of predefined, developer-implemented operators.
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
3. Add a publish action that configures the selected product's Sprue-hosted x402 gate, Hedera price/recipient, and Blocky402 integration.
4. Run a real consumer-agent paid request and correlate the returned data with Hedera settlement evidence.
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
- Test Blocky402 integration with unpaid/invalid requests, confirmed settlement, duplicate retries, and payment-success/data-delivery-failure reconciliation.
- Verify creator control of the Hedera recipient and distinguish its balance from Base Graph-spending funds; a display-only account mapping is insufficient evidence.
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
| 2026-09-05 | Data model draft | Drafted `data-model.md` with PostgreSQL entities, fields, constraints, relationships, state machines, transaction boundaries, financial separation, migration order, and a pre-implementation review checklist | Human requested the data model and asked that uncertain decisions be raised for discussion; four proposed defaults remain pending review | Cross-checked the draft against project intent, architecture, and active Graph, Privy, and Hedera sponsor references; performed documentation validation only, with no migration, wallet, payment, or application code created |

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
