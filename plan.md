# Sprue Project Plan

## Purpose

This document records the product plan, implementation priorities, validation strategy, and use of AI during the hackathon. It is a living document and must be updated when major product or architectural decisions change.

All repository records are written in English. Team communication may use Chinese, but repository artifacts remain English-only.

## Confirmed Participation

The user confirmed Start Fresh on 2026-09-05. This resolves the participation-category question, not the audit of development provenance or individual sponsor eligibility. The Graph's AI From Scratch award is the candidate AI target; its Continuity award and Bazantic's Continuity-only agent-usability award are excluded from the current plan. Final award selection and integration evidence remain pending.

## Product Goal

Sprue turns a natural-language description of onchain data logic into a persistent, reusable, and optionally monetizable data product.

The product is deliberately different from a natural-language blockchain query assistant. The Graph provides indexed onchain facts and query capabilities; Sprue turns user-defined transformations into a continuously available API.

The primary product promise is:

> Describe it. Shape it. Sell it.

## Macro Development Plan

The project will follow this high-level sequence:

```text
Brainstorming (complete)
    -> project structure conception
    -> technical selection, including sponsor integrations
    -> MVP implementation
    -> project refinement
```

### 1. Brainstorming — Complete

Define the product direction, target user, core differentiation, sponsor opportunities, MVP boundary, and demo narrative. The current direction is Sprue: natural-language data logic becomes a persistent, reusable, and optionally monetizable onchain data product.

### 2. Project Structure Conception

Turn the product direction into a concrete system and repository structure. Define the main user journey, frontend and backend responsibilities, shared Data Product Spec, transformation DAG, product lifecycle, API shape, and the smallest demonstrable vertical slice.

The current product shape is a hosted web platform with two connected surfaces: a Creator Console for building and operating products, and a Hosted Product API for external consumer agents and applications. Sprue provides the managed chain from natural-language analysis through The Graph, transformation, API hosting, and x402 access. For a public demo, the preferred deployment shape is one shared hosted runtime with separate web and worker responsibilities, external source-of-truth persistence, server-side secrets, and health-checked deployment. The current structure is documented in [`project-structure.md`](project-structure.md).

### 3. Technical Selection, Including Sponsors

Choose the implementation stack and validate the external dependencies that directly support the core flow. The Graph supplies data purchased by Sprue on the creator's behalf. Privy provides the creator account wallet for funding, delegated Graph payments, and API revenue. Bazantic provides optional x402 publication of an already-hosted API. Validate the upstream payment path and downstream settlement independently; sponsor qualification still requires evidence.

The Graph's requirements and proposed development gates are recorded in [sponsor/graph.md](sponsor/graph.md). Review them during dependency validation and final submission preparation. Research is complete, but integration checks and final eligibility confirmation remain pending.

Bazantic's award conditions, proposed publication boundary, Recipe evidence gates, and unresolved technical questions are recorded in [sponsor/bazantic.md](sponsor/bazantic.md). Evaluate the sponsor-API workflow as a candidate fit; do not assume eligibility, automated provisioning, or wallet compatibility from the prize description alone.

Privy's conditions, wallet-action evidence gates, and x402/control references are recorded in [sponsor/privy.md](sponsor/privy.md). The user has clarified that the core wallet belongs to the creator account, not primarily an external buyer. Funding, bounded upstream data purchases, and downstream income are the intended workflow; final award selection and technical validation remain pending.

The creator tops up the account wallet and grants limited spending authority; Sprue handles individual Graph purchases without requiring manual payment for every query. Optional API publication may include a disclosed platform fee deducted from sales revenue. The fee rate, calculation basis, collection method, and settlement timing are open decisions, not authorization to charge. See [the financial model](project-structure.md#account-wallet-and-money-flows).

### 4. MVP Implementation

Build the smallest reliable end-to-end product: creator-wallet funding and bounded Graph purchases, natural-language planning, validated data transformation, persistent API, conversational editing, optional Bazantic publication, and a real paid consumer request with revenue reconciliation and any enabled fee.

### 5. Project Refinement

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
    -> optional Bazantic x402 publication (exercised in the demo)
    -> real consumer payment
    -> paid data response and creator revenue
    -> disclosed service-fee allocation, if enabled
```

The demonstration must show creator funding, a real Graph purchase authorized through the creator wallet, and a separate downstream paid API request. The API must also work in its private hosted mode without Bazantic publication. Simulated UI states must not replace these integrations; any enabled service fee must reconcile to real settlement evidence.

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
- x402-gated endpoint with a real paid request.
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
- Broad multi-chain and multi-tenant support.
- Production-grade abuse prevention and enterprise access control.

## Architecture Plan

### Frontend

- Builder Agent chat panel.
- Visual DAG and Data Product workspace.
- Build trace and status timeline.
- API preview, schema, refresh policy, and monetization controls.
- Revenue and request status for the demo product.
- Account top-up, available budget, Graph expenses, gross API sales, net proceeds, and disclosed platform fees.

### Backend

- Agent planner that converts intent into a Data Product Spec.
- The Graph source and schema integration.
- Spec validator and DAG compiler.
- Transformation runtime.
- Product registry and persistent configuration.
- API gateway for `/products/{id}` endpoints.
- Upstream payment and optional Bazantic publication adapters with payment verification.
- Creator-wallet authorization, upstream payment orchestration, and funding/expense/revenue reconciliation.
- Optional scheduler, cache, and materialized-result store.

### Shared Data Model

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

### Phase 1: Validate External Dependencies

1. Validate a bounded Graph query and its live source coverage.
2. Validate creator-wallet funding and a Privy-authorized payment to the selected Graph gateway; test permission and balance failures.
3. Publish a test hosted API through Bazantic and verify a separate consumer's `402 -> payment -> 200` flow and creator receipt.
4. Investigate revenue allocation and fee collection; approve fee terms before enabling any charge.
5. Record credentials, networks, facilitators, payment evidence, and deployment assumptions without committing secrets.

### Phase 2: Build the Deterministic Runtime

1. Define the Data Product Spec and supported node types.
2. Implement validation for node configuration and graph connectivity.
3. Implement a deterministic execution path for one representative product.
4. Add product persistence and a stable API route.
5. Add tests for spec validation and transformation results.

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

1. Add a publish action that enables x402 for the selected product.
2. Run a real consumer-agent paid request.
3. Show Graph expenses, gross API sales, creator proceeds, and any enabled platform fee as distinct records in the workspace.
4. Add caching, rate limits, and bounded demo budgets.
5. Record a short, reliable end-to-end demo and verify the public repository history.

## Validation Strategy

- Validate every generated specification before execution.
- Test the runtime with deterministic fixtures before using live data.
- Verify source selection and schema assumptions against The Graph documentation and actual responses.
- Show source-to-output lineage for representative results.
- Reproduce at least one result from the displayed specification and raw source data.
- Test the x402 endpoint from a separate consumer path.
- Verify that a creator can build and privately use an API without Bazantic publication.
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
