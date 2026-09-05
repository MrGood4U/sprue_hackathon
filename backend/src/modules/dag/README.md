# Dag Module

Own the seven-type source/filter/map/aggregate/union/join/output registry, deterministic compiler and interpreter. H1 exact executable schemas remain unapproved. Semantic templates compile to primitives; no new runtime type or unrestricted code fallback is enabled.

The first runtime slice is implemented in [runtime.ts](runtime.ts). It validates a schema-provided field mapping, normalizes provider rows into the canonical Swap contract, performs exact decimal arithmetic, supports a bounded timestamp window, aggregates by wallet and chain, unions source lineage, and joins one aggregate per wallet across two chains. It is the offline deterministic core for the Cross-chain DEX Trader Footprint MVP.

The runtime deliberately does not discover Subgraphs, call Graph MCP, generate GraphQL, schedule jobs, invoke an Agent, authorize wallets, settle x402 payments, or expose HTTP handlers. Those provider and application ports remain outside this pure module. The captured JSON files under [backend/tests/fixtures](../../tests/fixtures) are live-shape samples, not current-window coverage or payment evidence.

Keep the runtime independent of Express, process environment and hosting providers. Before enabling handlers, connect it through the durable product-version and execution-run records, add source/query provenance, enforce workspace budgets, and replace fixtures with the Graph adapter. Do not add database fields ad hoc; update [data-model.md](../../../data-model.md) first if the implementation reveals a missing concept.
