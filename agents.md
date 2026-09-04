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
2. See Sprue discover a real Graph source and build a data-product specification.
3. See the resulting transformation pipeline run against live data.
4. Access the result through a persistent API endpoint.
5. Modify the product conversationally and see the definition/output update.
6. Publish the product through x402 and complete a real paid request from a consumer agent.

The primary demo story is:

> Describe it. Shape it. Sell it.

The main vertical slice is more important than breadth. Product wallets, autonomous treasury management, marketplace features, complex multi-tenancy, automatic pricing, and broad sponsor integrations are future work unless they directly support the core demo.

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
- publication, x402 payment, and revenue status.

The core sponsor/integration priority is The Graph first, Hedera/x402 second, and other integrations only when they strengthen the main workflow.

## Repository Language Rule

All text records in this repository must be written in English. This includes source comments, documentation, README files, commit messages, issue or task notes, and other project artifacts.

Assistant-to-user communication may be in Chinese. This communication rule does not change the English-only rule for repository content.
