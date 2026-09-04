# Sprue Project Context

## Product Intent

Sprue is a cloud-based developer tool that turns natural-language data logic into persistent, reusable, and optionally monetizable onchain data products.

Sprue is not primarily a natural-language blockchain query assistant. The Graph and its MCP tools can answer questions about existing indexed data. Sprue adds the product layer: it lets a user define derived data, transform it through a pipeline, keep it updated, expose it through an API, and optionally sell access through x402.

The central distinction is:

- The Graph answers: "What does the existing data say?"
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

Sprue should prefer existing The Graph subgraphs as sources. It should generate and deploy a new subgraph only when the required onchain facts are not already indexed.

The transformation layer may support a focused set of composable operations such as Source, Filter, Map, Join, GroupBy, Window, Aggregate, Score, and Output. The frontend DAG and backend execution model should share a simple, validated representation.

## Confirmed DAG Execution Boundary

On 2026-09-05, the user selected Option A: the Agent dynamically selects, configures, and connects predefined, developer-implemented operators. Different requests can produce different DAGs; this is not a single fixed pipeline. The exact operator subset remains limited to the MVP's demonstrated needs.

The Agent produces a structured specification, not arbitrary executable JavaScript or Python. Validate operator allowlists, configuration, input/output compatibility, acyclicity, permissions, and resource budgets before execution. Generated Graph query configuration must also be validated and bounded. Unsupported transformations must be reported explicitly, not implemented through an unrestricted code-execution fallback.

Keep the versioned execution definition separate from visual layout. A background job queue schedules work; the DAG runtime executes node dependencies and records progress. This decision does not select a frontend framework, queue library, database vendor, or hosting provider.

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

- a Builder Agent chat interface;
- a visual Data Product/DAG workspace;
- a build trace showing source, schema, transformations, validation, and deployment;
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

## Current Planning Stage

Project-structure conception, technical selection, and data-model definition were marked complete on 2026-09-05. Product and interface design is the current stage; MVP implementation follows after the page inventory and interaction specification are approved.

Use approved [data-model.md](data-model.md) version 1.3 as the implementation baseline. It combines evidence-driven Graph source/access refinements with Hedera account/asset capability, x402 v2 requirement, facilitator capability, and normalized settlement-evidence refinements. The affected migrations may now be designed, while live provider checks remain required. The model maps MVP workflows to explicit domain entities, relationships, ownership, lifecycle states, PostgreSQL fields and constraints, API-facing representations, and durable execution records. It treats product/DAG versions as reproducible definitions, models job retries and side-effect idempotency, represents money in atomic units with explicit network and asset identity, keeps financial categories separate, and references secrets without storing secret values.

Before building application pages or components, create and obtain human approval for `product-design.md`. It must define the MVP page count, routes, navigation, each page's interaction elements, cross-page state transitions, loading/empty/error/financial states, responsive and accessibility behavior, and the approved data/API dependencies. Do not infer new product behavior inside UI implementation when the design specification is silent; update the design record first.

The data model includes workspace membership and roles for forward compatibility, but the MVP implements only one active owner per workspace. Do not build invitations, role-management UI, or non-owner authorization flows unless the scope is explicitly expanded.

Do not infer database fields ad hoc while building endpoints. If implementation reveals a missing concept, update the reviewed data model and record the decision before adding the migration or dependent behavior.

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

Assistant-to-user communication may be in Chinese. This communication rule does not change the English-only rule for repository content.
