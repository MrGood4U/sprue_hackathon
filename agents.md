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
2. Fund a Privy-backed account wallet, authorize bounded data spending, and see Sprue discover a real Graph source and build a data-product specification.
3. See Sprue pay for Graph data from that wallet and run the transformation pipeline against live data.
4. Access the result through a persistent API endpoint.
5. Modify the product conversationally and see the definition/output update.
6. Optionally enable x402 access on the hosted API, settle API sales on Hedera through Blocky402, and inspect creator receipts and any disclosed Sprue service-fee allocation. The demo must exercise a real paid consumer request. Validate the creator's Hedera recipient setup before claiming the Privy wallet supports this path.

The primary demo story is:

> Describe it. Shape it. Sell it.

The main vertical slice is more important than breadth. The creator account wallet and bounded Graph payments are core scope. Separate wallets per product, general-purpose autonomous treasury management, marketplace features, complex multi-tenancy, and automatic pricing remain future work.

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

The selected sponsor integrations are The Graph, Hedera, and Privy. The user selected Hedera to replace Bazantic on 2026-09-05. The Graph supplies upstream data purchased by Sprue on the creator's behalf. Privy provides the creator account wallet and bounded Graph-spending authorization. Hedera is the downstream settlement network, with Blocky402 as facilitator. Sprue owns the hosted API and its optional x402 payment gate; Blocky402 is not assumed to provide a hosted API publishing dashboard or marketplace. External buyers need a compatible Hedera payment client, not necessarily a Privy wallet.

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

## Account Wallet and Revenue Model

The user confirmed this model on 2026-09-05: the creator funds an account wallet; Sprue handles Graph purchases within the creator's authorized budget. If the creator opts into x402 publication, API sales produce creator revenue, with a Sprue service fee deducted from those sales if enabled and disclosed. Top-ups are user funds, not platform revenue.

The creator's account remains the intended funding and revenue identity. Graph's documented x402 path uses USDC on Base or Base Sepolia; API sales will settle separately on Hedera. Track balances, recipients, and settlement evidence by network and asset. Hedera revenue is not automatically available for Graph spending. Automatic bridging or conversion is outside the MVP unless separately approved.

Privy-to-Hedera recipient control and signer compatibility are validation gates, not established capabilities. Test receipt, ownership, and subsequent access to proceeds separately from an external buyer's payment. Do not export the creator's private key or silently replace user-controlled receipt with platform custody to satisfy an SDK example. Any additional network account requires an explicit, validated ownership model.

The fee rate, calculation basis, recipient configuration, and settlement timing remain undecided. Do not assume Blocky402 provides native revenue splitting or that one wallet library proves end-to-end compatibility. Keep funding, upstream expenses, gross sales, creator proceeds, and platform fees separately auditable. Do not move funds or enable a fee without the relevant user authorization.

## Hackathon Participation

The user confirmed Start Fresh participation on 2026-09-05. Do not plan Continuity-only awards as eligible targets. This records the team's participation category, not proof that all event or sponsor conditions have been satisfied; preserve development history and verify submission evidence.

## Sponsor References

Before implementing or changing a sponsor integration, consult the corresponding active reference in `sponsor/`: [The Graph](sponsor/graph.md), [Hedera](sponsor/Hedera.md), and [Privy](sponsor/privy.md). These distinguish official qualification rules from proposed Sprue acceptance checks. Keep evidence-based completion status and recheck official sources before submission. [Bazantic](sponsor/bazantic.md) is superseded and must not drive current implementation.

## Repository Language Rule

All text records in this repository must be written in English. This includes source comments, documentation, README files, commit messages, issue or task notes, and other project artifacts.

Assistant-to-user communication may be in Chinese. This communication rule does not change the English-only rule for repository content.
