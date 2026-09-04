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

## Hackathon MVP

The MVP is complete when a user can:

1. Describe an onchain data product in natural language.
2. Fund a Privy-backed account wallet, authorize bounded data spending, and see Sprue discover a real Graph source and build a data-product specification.
3. See Sprue pay for Graph data from that wallet and run the transformation pipeline against live data.
4. Access the result through a persistent API endpoint.
5. Modify the product conversationally and see the definition/output update.
6. Optionally publish the product through Bazantic's x402 gateway, receive revenue in the creator's account wallet, and inspect any disclosed Sprue service-fee allocation. The demo must exercise a real paid consumer request.

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

The selected sponsor integrations are The Graph, Bazantic, and Privy. The Graph is the upstream data provider that Sprue pays on the creator's behalf. Privy provides the creator account wallet for top-ups, delegated data spending, and API revenue. Bazantic is the optional x402 publication layer for an already-hosted API; it is not required to build or privately use that API. External buyers need a compatible payment client, not necessarily a Privy wallet.

## Account Wallet and Revenue Model

The user confirmed this model on 2026-09-05: the creator funds an account wallet; Sprue handles Graph purchases within the creator's authorized budget. If the creator opts into x402 publication, API sales produce creator revenue, with a Sprue service fee deducted from those sales if enabled and disclosed. Top-ups are user funds, not platform revenue.

The fee rate, calculation basis, recipient configuration, and settlement timing remain undecided. Do not assume Bazantic provides native revenue splitting or that one wallet library proves end-to-end compatibility. Keep funding, upstream expenses, gross sales, creator proceeds, and platform fees separately auditable. Do not move funds or enable a fee without the relevant user authorization.

## Hackathon Participation

The user confirmed Start Fresh participation on 2026-09-05. Do not plan Continuity-only awards as eligible targets. This records the team's participation category, not proof that all event or sponsor conditions have been satisfied; preserve development history and verify submission evidence.

## Sponsor References

Before implementing or changing a sponsor integration, consult the corresponding reference in `sponsor/`: [The Graph](sponsor/graph.md), [Bazantic](sponsor/bazantic.md), and [Privy](sponsor/privy.md). These distinguish official qualification rules from proposed Sprue acceptance checks. Keep evidence-based completion status and recheck official sources before submission.

## Repository Language Rule

All text records in this repository must be written in English. This includes source comments, documentation, README files, commit messages, issue or task notes, and other project artifacts.

Assistant-to-user communication may be in Chinese. This communication rule does not change the English-only rule for repository content.
