# Graph Module

Own source discovery/schema provenance, bounded Graph queries and both explicit access modes. Consult sponsor/graph.md before implementation. Credential failure must not fall back to wallet-funded x402; adapters require live evidence.

Expose provider-neutral ports for `searchSubgraphs`, `getSubgraphSchema`, `generateGraphQL`, and `executeGraphQL`. The Graph Subgraph MCP can implement discovery, schema retrieval and execution, but it does not generate Sprue's GraphQL semantics or provide a model. GraphQL generation and static validation remain Sprue-owned. Keep MCP operation names, URLs and SDK types inside this adapter; a direct Graph API implementation must be substitutable without changing the Agent or DAG modules. Execution is authorized data-plane work and must receive an explicit access context, budget and stored query plan.

Use existing Subgraphs only. Select by evidenced semantic fit, coverage, freshness, and query costs; report source gaps instead of creating/deploying Subgraphs, Subgraph Composition, or another ingestion path. Multiple source adapters may supply a downstream Union/Join DAG, but each source remains separately pinned, queried and accounted for. Keep query capabilities distinct from new indexing work. See the [confirmed boundary](../../../../agents.md#confirmed-existing-subgraph-boundary).

Status: ownership boundary only. Domain services/repositories/handlers are not implemented. The owning HTTP routes are reserved and fail closed. Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
