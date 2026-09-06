# Sprue Project Context

## Product Intent

Sprue is a cloud-based developer tool that turns natural-language data logic into persistent, reusable, and optionally monetizable onchain data products.

Sprue is not primarily a natural-language blockchain query assistant. The Graph and its MCP tools can answer questions about existing indexed data. Sprue adds the product layer: it lets a user define derived data, transform it through a pipeline, keep it updated, expose it through an API, and optionally sell access through x402.

The division of responsibility is:

- The Graph supplies existing indexed data and query capabilities.
- Sprue builds: "Create a reusable data product that continuously answers this question."

## Core Workflow

```text
Natural-language intent
    -> source and schema discovery
    -> Data Product Spec
    -> transformation DAG
    -> validation and reproducibility
    -> scheduled or materialized computation
    -> persistent API
    -> optional x402 monetization
```

### Confirmed Existing-Subgraph Boundary

On 2026-09-05, the user confirmed that Sprue only discovers, inspects, selects, and queries existing The Graph Subgraphs. Sprue does not create, generate, deploy, or maintain new Subgraphs or composed Subgraphs (Subgraph Composition). These are outside the product boundary, not deferred fallback tasks. Automatic compilation into a new upstream index is also out of scope.

Choose suitable sources within bounded discovery using semantic/field fit, data granularity, network and historical coverage, freshness, and evidenced access/query costs. Semantic correctness and required coverage are prerequisites; unknown coverage or cost must remain explicit, not be treated as complete or free. Explain the choice without claiming a globally optimal source after a limited search.

Use verified query capabilities and existing indexed fields or aggregates when they preserve the requested meaning. Apply only the necessary supported Sprue transformations after retrieval; do not add processing merely to populate the DAG. Source validation, output validation, provenance, versioning, refresh, hosted APIs, and optional x402 remain in scope. Build and Deploy refer to Sprue's data product/API, not upstream Subgraph deployment.

If bounded discovery finds no suitable existing source, report the missing facts and search limits. Ask the creator to revise the requirement or supply another existing source for the same validation; never silently change semantics, invent data, or start an ingestion/deployment workflow.

Treat The Graph Subgraph MCP as a replaceable adapter, not as Sprue's planner. Keep `searchSubgraphs`, `getSubgraphSchema`, and `executeGraphQL` provider-facing capabilities behind the Graph module, while `generateGraphQL` and static query validation remain Sprue-owned. The MCP has no language model and must not receive authority from provider text, model-selected URLs, or arbitrary tool names. Live query execution remains a data-plane action bound to an approved query plan, access mode, budget, and creator authorization.

On 2026-09-05, the user expanded the first runtime to support multiple existing Subgraphs and explicit `Union`/`Join` operators. This is multi-source data composition inside Sprue; it does not create, deploy, or maintain a new Subgraph or Subgraph Composition.

The MVP runtime scope is Source, Filter, Map, Aggregate, Union, Join, and Output. GroupBy is aggregate configuration; source windows and derived scores use bounded configuration/expressions. Union requires compatible normalized row schemas. Join requires explicit input ports, join keys, join type/cardinality and bounded fan-out; it must not hide a cross-source merge inside an adapter. Standalone Window/Score and advanced onchain analytics remain deferred. The frontend DAG and backend execution model should share a simple, validated representation.

## Confirmed DAG Execution Boundary

On 2026-09-05, the user selected Option A: the Agent dynamically selects, configures, and connects predefined, developer-implemented operators. Different requests can produce different DAGs; this is not a single fixed pipeline. The exact operator subset remains limited to the MVP's demonstrated needs.

The Agent produces a structured specification, not arbitrary executable JavaScript or Python. Validate operator allowlists, configuration, input/output compatibility, acyclicity, permissions, and resource budgets before execution. Generated Graph query configuration must also be validated and bounded. Unsupported transformations must be reported explicitly, not implemented through an unrestricted code-execution fallback.

Keep the versioned execution definition separate from visual layout. A background job queue schedules work; the DAG runtime executes node dependencies and records progress. This decision does not select a frontend framework, queue library, database vendor, or hosting provider.

On 2026-09-05, the user approved this small operator scope and the corresponding documentation/frontend alignment. Follow [semantic-templates.md](backend/harness/semantic-templates.md): Wallet Activity and Repeat Activity are versioned compile-time templates, not additional runtime operators. Execute only the expanded primitive DAG. Keep template provenance separate from execution and visual layout; its H2 persistence direction is approved and recorded in data-model 1.5 and compilation_records. Initial template expansion is read-only, and parameter edits produce new proposals. Repeat activity is not cohort retention; retain one-day wallets in its denominator. The frontend sample is not live Graph/runtime evidence. Exact configuration/numeric schemas (H1), operating caps and the live source/methodology (H3) remain review items; approval of H2 tables is not a working harness.

## Hackathon MVP

The MVP is complete when a user can:

1. Describe an onchain data product in natural language.
2. Choose a customer-supplied Graph API key/existing subscription or fund a Privy-backed account wallet and authorize bounded x402 data spending, then see Sprue discover a real Graph source and build a data-product specification.
3. See Sprue use the selected Graph access mode and run the transformation pipeline against live data. The sponsor demo exercises the wallet-funded x402 branch.
4. Access the result through a persistent API endpoint.
5. Modify the product conversationally and see the definition/output update.
6. Optionally enable x402 access on the hosted API, settle API sales on Hedera through Blocky402, and inspect creator receipts and any disclosed Sprue service-fee allocation. The demo must exercise a real paid consumer request. Validate the creator's Hedera recipient setup before claiming the Privy wallet supports this path.

The primary demo story is:

> Describe it. Shape it. Sell it.

The main vertical slice is more important than breadth. Both customer-API-key and x402 source access are product scope; the creator account wallet and bounded Graph x402 payment are core sponsor-demo scope. Separate wallets per product, general-purpose autonomous treasury management, marketplace features, complex multi-tenancy, and automatic pricing remain future work.

## Product Principles

- Users describe semantics; Sprue decides execution details.
- A query is temporary; a data product is persistent, explainable, and reusable.
- Every generated result should be traceable to its sources and transformations.
- Prefer real integrations and a reliable end-to-end flow over simulated UI.
- Keep the builder and generated runtime resource-bounded; planning may be open, but expensive build and deploy actions must be controlled.
- Generated products should be private by default and use caching, rate limits, and budget guards where appropriate.
- The product should feel like a data-product compiler, not a generic LLM wrapper.

## Preferred Product Shape

Sprue is a web application with:

- an Agent Planner chat interface;
- a visual Data Product/DAG workspace;
- a build trace available through Agent/run details, showing source, schema, transformations, validation, and deployment;
- API preview and endpoint details;
- account-wallet funding, Graph spending, and remaining authorized budget;
- publication, x402 payment, and revenue status.

The selected sponsor integrations are The Graph, Hedera, and Privy. The user selected Hedera to replace Bazantic on 2026-09-05. The Graph supplies upstream data through either the creator's existing Graph API key/subscription or x402 purchased by Sprue on the creator's behalf. Privy provides the creator account wallet and bounded Graph-spending authorization for x402 mode. Hedera is the downstream settlement network, with Blocky402 as facilitator. The initial downstream profile is `hedera:testnet`, HBAR (`0.0.0`), x402 version 2, Hedera's `exact` scheme, and a facilitator-advertised fee payer. HTS remains modeled but deferred. Sprue owns the hosted API and its optional x402 payment gate; Blocky402 is not an API host, publishing dashboard, or marketplace. External buyers need a compatible Hedera payment client, not necessarily a Privy wallet.

Bazantic integration and Recipe deliverables are no longer in the active plan. Its research is retained only as historical context. Building, refreshing, hosting, and privately using an API must not require downstream paid publication.

## Confirmed Deployment Strategy

On 2026-09-05, the user selected Vercel plus Railway for the temporary evaluator-facing deployment. Vercel hosts the Creator Console. Railway hosts the public API, private background worker, and PostgreSQL database. Platform-provided domains are sufficient for the hackathon; a custom domain is not required.

Sprue must also support Docker-based self-hosting from the same source without changing application or business logic. Deployment manifests may differ, but provider-specific behavior must remain outside the domain, DAG, Agent, Graph, wallet, and payment modules. The portable deployment contract is:

- configure services and public URLs through validated environment variables;
- use a standard PostgreSQL connection string and explicit migrations;
- keep durable state out of ephemeral filesystems;
- expose health and readiness endpoints;
- run the API and worker as separate commands or containers from the same codebase;
- provide a Docker Compose profile for the frontend, API, worker, and PostgreSQL;
- keep secrets server-side and outside images, frontend bundles, and repository history.

Vercel and Railway are the demo delivery profile, not permanent product dependencies. A Docker operator must be able to supply equivalent configuration, networking, persistence, and secrets without patching source code.

On 2026-09-05, the user explicitly requested Windows local frontend/backend/database operation for browser testing, alongside evaluator packaging. Follow [deployment.md](deployment.md): the root Compose profile and PowerShell helper run a loopback-only local stack with an explicit migration step and a persistent PostgreSQL volume; native Node.js 24 development remains supported. Windows is the host, not a desktop-client target. Preserve the optional Sites build adapter, keep frontend API origins public and server secrets private, and use the Vercel/Railway manifests for the selected external profile. Starting infrastructure does not enable unfinished business routes, authentication, jobs or payments.

## Current Planning Stage

Project-structure conception, technical selection, and data-model definition were marked complete on 2026-09-05. On 2026-09-06, the user approved splitting the product workflow into separate Agent Planner and DAG Builder views. Extend the existing eight route-level pages directly, preserving the Evidence-First Console design, route ownership, and English/Simplified Chinese localization. The current evaluator runtime is server-generated and remains demo-only while real backend integrations are pending. Token decisions DT1-DT4 remain follow-up design review items, and the capped demo-consumer funding boundary remains a live-integration gate.

Use approved [data-model.md](data-model.md) version 1.5 as the implementation baseline. It combines evidence-driven Graph source/access refinements with multi-source version projections and explicit Union/Join composition semantics, plus Hedera account/asset capability, x402 v2 requirement, facilitator capability, and normalized settlement-evidence refinements. The initial database foundation is implemented under backend/migrations and backend/src/db; read backend/database.md for SQL authority, setup, test coverage and unverified native PostgreSQL/concurrency behavior. M1-M3 and H2 persistence directions were approved on 2026-09-05; live provider checks remain required. The model maps MVP workflows to explicit domain entities, relationships, ownership, lifecycle states, PostgreSQL fields and constraints, API-facing representations, and durable execution records. It treats product/DAG versions as reproducible definitions, models job retries and side-effect idempotency, represents money in atomic units with explicit network and asset identity, keeps financial categories separate, and references secrets without storing secret values.

Use [product-design.md](product-design.md) Draft 1.15 as the page-architecture, interaction, and selected visual baseline. It defines eight page families, the four product views `Agent`, `Build`, `API`, and `Monetize`, each page's interaction elements, cross-page state transitions, loading/empty/error/financial states, large-screen web layout behavior, accessibility behavior, and approved data/API dependencies. Use [frontend/workflow-editor.md](frontend/workflow-editor.md) for the editable Builder workflow contract. Use [design-tokens.md](design-tokens.md) Draft 0.1 and `frontend/src/design-tokens.json` as the proposed visual implementation contract until the human team approves or revises DT1-DT4. New UI must consume semantic or component tokens; do not add raw component colors or bypass the documented layer direction. Follow [frontend/README.md](frontend/README.md) for page, component, feature, service, and test ownership. Every route-level page must have its own file; do not place multiple page implementations in the application entry point or a shared component module. Sprue is a browser-based web product; do not build or imply a Windows, macOS, or other native desktop client. The Creator Console targets browsers at 1024 CSS pixels and above and is optimized for a 1440-pixel judge-demo viewport; mobile and tablet-specific layouts are deferred. Structured DAG controls remain required as a browser keyboard and single-pointer alternative, not as a mobile editor. The code under `frontend/` is the maintained product frontend. Its evaluator path uses a server-generated demo runtime; replace this boundary with reviewed backend clients as integrations proceed. The Builder page keeps one focused editable semantic DAG with a reviewed template/operator palette without redundant plus controls or native title tooltips, pan-only hand mode, selectable/deletable nodes and edges in select mode, expandable template details, a collapsible right-side evidence inspector with a keyboard-accessible restore control, a centered modal inspector opened by double-clicking a selected node with explicit Confirm/Cancel commit semantics, and canvas node cards limited to icon, name, and status; the technical node version remains in the inspector. Its compact action bar has `Save draft`, `Structured DAG`, and `Run backend build`; it does not render a simulated progress trace or a top-level primitive-DAG mode switch. Product naming must reflect the application, while sample data and simulated financial operations remain identifiable. Track unfinished interactions and integrations in `frontend/implementation-status.md`. Do not infer new product behavior inside UI implementation when the design specification is silent; update the design record first.

The data model includes workspace membership and roles for forward compatibility, but the MVP implements only one active owner per workspace. Do not build invitations, role-management UI, or non-owner authorization flows unless the scope is explicitly expanded.

Do not infer database fields ad hoc while building endpoints. If implementation reveals a missing concept, update the reviewed data model and record the decision before adding the migration or dependent behavior.

The proposed frontend/backend HTTP contract is [api-contract.md](api-contract.md) Draft 0.3, with domain details under `docs/api/`. Review it before implementing frontend clients or backend routes. It records proposed authentication, DTOs, commands, concurrency, traces, private deployment, x402 delivery, and financial projections. Model directions M1-M3 (durable command idempotency, anonymous request recovery authorization, and validation/build/activation separation) were approved and incorporated into data-model 1.5. Database structure and the API/standby-worker framework exist. Read backend/framework.md: 100 route registrations include explicit unavailable handlers, not completed business APIs. Process probes/public configuration work; identity reads require an injected verified-identity adapter, and production composition fails closed. Durable command HTTP guarantees, queue dispatch and provider verification still require implementation and tests. Provider and capped-consumer gates E1/E2 remain explicit.

The proposed Agent harness is documented in [backend/harness/README.md](backend/harness/README.md) Draft 0.4. It separates natural-language planning and verified source/query/operator compilation from creator-authorized deterministic execution. Consult its workflow, tool/script catalog, operator semantics, constraints and verification plan before building the planner/runtime. Tools are named typed functions, not unrestricted shell, code, network or wallet access. Only existing Subgraphs are eligible sources; source gaps lead to requirement revision or another existing-source candidate, never source creation or deployment. H2 persistence directions are approved in model 1.5. H1 executable-language and H3 live-metric/operating-limit choices remain open; none enables payments. Planned scripts are not yet implemented.

## Account Wallet and Revenue Model

The user confirmed this model on 2026-09-05: for each Graph source, the creator may select either a customer-supplied Graph API key backed by their existing Graph subscription or creator-wallet x402 pay-per-query access. In x402 mode, the creator funds an account wallet and Sprue handles Graph purchases within the authorized budget. If the creator opts into downstream x402 publication, API sales produce creator revenue, with a Sprue service fee deducted from those sales if enabled and disclosed. Top-ups are user funds, not platform revenue.

The preferred Privy control model is a user-owned wallet with a Sprue-controlled additional signer restricted by a separately owned provider policy. The wallet owner, provider entity association, additional signer/key quorum, and policy are distinct resources and must remain distinct in persistence. Sprue may hold its own P-256 signer authorization private key in a server-side secret manager; this is not the creator's wallet private key and must never be stored in PostgreSQL or committed. A provider policy that Sprue can unilaterally weaken must not be described as a user-enforced spending boundary.

Privy's provider idempotency window is finite, so keep a stable logical payment intent separate from each provider-attempt key and request fingerprint. Policy drift, signer removal, provider-key expiry, cached provider errors, and idempotency expiry all require reconciliation before another Graph payment is attempted. Sprue's serializable budget reservations remain authoritative for strict per-workspace accounting even when a Privy provider policy also applies.

Keep Graph Subgraph IDs, gateway Deployment IDs, and manifest IPFS CIDs distinct. Published products should pin an immutable validated deployment and schema snapshot; following a Subgraph ID's current deployment is for discovery/preview unless a new product version revalidates it. Use static GraphQL documents with validated variables, cursor pagination, a consistent block across pages, and recorded `_meta` provenance and GraphQL errors.

Treat one paginated Graph page as one logical source request. Under Graph x402, persist the initial `402` and payment-bearing retry as separate HTTP attempts, accept and validate the returned requirement before reserving its exact amount, and consume budget whenever settlement confirms even if data delivery later fails. Customer-API-key access and x402 access are both first-class product modes; the x402 mode remains the required evidence for the Privy wallet-funded sponsor flow. Store customer keys only through server-side secret references, meter their provider requests without inventing wallet expenses, and never fall back to x402 automatically after credential failure.

The creator's account remains the intended funding and revenue identity. Graph's documented x402 path uses USDC on Base or Base Sepolia; API sales will settle separately on Hedera. Track balances, recipients, and settlement evidence by network and asset. Hedera revenue is not automatically available for Graph spending. Automatic bridging or conversion is outside the MVP unless separately approved.

For the initial downstream publication, use Hedera testnet HBAR and a resolved Hedera account ID as `payTo`, not an unresolved EVM-address string. Record account-ID/EVM-address mapping evidence, account completion, and HBAR receive/spend capability. HBAR uses entity ID `0.0.0` and tinybar units. Read Blocky402's current x402 v2 `exact` fee payer from `/supported`, pin it in each accepted requirement, and reconcile the facilitator transaction reference through Hedera Mirror Node before recognizing settlement. HTS support remains future-compatible but is not part of the first integration.

Privy-to-Hedera recipient control and signer compatibility are validation gates, not established capabilities. Test receipt, ownership, and subsequent access to proceeds separately from an external buyer's payment. Do not export the creator's private key or silently replace user-controlled receipt with platform custody to satisfy an SDK example. Any additional network account requires an explicit, validated ownership model.

The fee rate, calculation basis, recipient configuration, and settlement timing remain undecided. Do not assume Blocky402 provides native revenue splitting or that one wallet library proves end-to-end compatibility. Keep funding, upstream expenses, gross sales, creator proceeds, and platform fees separately auditable. Do not move funds or enable a fee without the relevant user authorization.

## Hackathon Participation

The user confirmed Start Fresh participation on 2026-09-05. Do not plan Continuity-only awards as eligible targets. This records the team's participation category, not proof that all event or sponsor conditions have been satisfied; preserve development history and verify submission evidence.

## Sponsor References

Before implementing or changing a sponsor integration, consult the corresponding active reference in `sponsor/`: [The Graph](sponsor/graph.md), [Hedera](sponsor/Hedera.md), and [Privy](sponsor/privy.md). These distinguish official qualification rules from proposed Sprue acceptance checks. Keep evidence-based completion status and recheck official sources before submission. [Bazantic](sponsor/bazantic.md) is superseded and must not drive current implementation.

## Repository Language Rule

All text records in this repository must be written in English. This includes source comments, documentation, README files, commit messages, issue or task notes, and other project artifacts.

Runtime localization resources may represent non-English UI copy through escaped Unicode literals so the source record remains English/ASCII while the browser renders the requested language.

Assistant-to-user communication may be in Chinese. This communication rule does not change the English-only rule for repository content.

## Frontend and Backend Demo Boundary

As of 2026-09-06, route-level frontend business data must come from the explicit backend demo runtime documented in [docs/api/demo-runtime.md](docs/api/demo-runtime.md). Historical browser fixtures are test-only and there is no silent fallback when the backend is unavailable. The backend demo projection reuses the bounded mock Agent harness and deterministic multi-source DAG runtime, but it is not live Graph, Privy, Hedera, payment, or durable business evidence.
