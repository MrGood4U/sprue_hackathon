# The Graph: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-05

Status: Official prize, source-identity, MCP, GraphQL, gateway, API-key, and x402 documentation reviewed; live integration and eligibility remain unverified.

Participation: Start Fresh, confirmed by the user on 2026-09-05. The AI Continuity award is not applicable to the current plan.

This is a development reference, not proof of qualification. The official event page remains authoritative; recheck it before submission. Official requirements are separated from Sprue-specific proposals below.

## Official Requirements Digest

Source: [ETHGlobal prize page](https://ethglobal.com/events/ethonline2026/prizes/the-graph). Award labels below are shortened.

The three awards total $15,000. Each offers $5,000, split $2,500 / $1,500 / $1,000:

- Composability/standardization.
- AI, From Scratch.
- AI, Continuity.

Mandatory gates:

- G1 (all): Public repository and 2-4-minute demo video.
- G2 (all): Live Graph-provider data; mocks, static datasets, and local-only data are ineligible.
- G3 (AI): Graph must be essential; meaningful reasoning, automation, decisions, or natural-language interaction must go beyond raw results. Tooling must be reusable.
- G4 (AI): Open-source code with runnable README or SKILL.md.
- G5 (AI): Start Fresh excludes prior project-specific code but permits open-source starters. Continuity covers existing projects; disclose prior work, only event work counts. Follow pool rules.
- G6 (composability): Combine at least two Graph products OR meaningfully use standardized schemas; demonstrate their advantage. A lone ordinary Subgraph query fails. Standardized-subgraph contributions and reusable Substreams modules are eligible.

Preference: Demonstrate cross-protocol query reuse or cross-chain pipeline reuse.

Optional challenge: Single-prompt deployment requires a working deployed Substreams pipeline using Substreams SKILLs.

MCP, x402, and this challenge are not universal AI-track requirements.

## Recommended Sprue Direction

The following is our project assessment, not additional sponsor rules or a final award selection.

Prioritize the AI From Scratch award for the confirmed Start Fresh category. Still audit the team's development history and starter provenance; the user's category confirmation does not itself complete those checks.

Preserve Sprue's existing promise: a creator defines a metric, receives an inspectable specification and DAG, and operates a persistent derived-data API. The differentiating work is source-aware compilation, deterministic execution, conversational revision, and product operation.

Product-boundary update, 2026-09-05: the user confirmed that Sprue only discovers, selects, inspects, and queries existing Subgraphs, with necessary supported transformations in Sprue. It does not create, deploy, or maintain new Subgraphs or Subgraph Composition, including as a future optimization or source-gap fallback. Select sources by semantic fit, granularity, coverage, freshness, and evidenced query costs; report unknowns explicitly. This changes Sprue's plan, not the official award requirements above, and does not establish new eligibility or live capability.

The user approved multi-source composability as an MVP direction on 2026-09-05, using existing sources only. An internal Sprue DAG is not automatically composition of Graph products, and adding Hedera or Privy should not be counted as another Graph product. Evaluate meaningful existing standardized-schema reuse and cross-chain pipeline reuse without planning new index creation. Sprue must show each source, query, schema/provenance and explicit Union/Join step so the composition is auditable and not hidden inside an adapter.

### Technical References and Implications

- [The Graph documentation](https://thegraph.com/docs/en/): Primary technical documentation entry point supplied by the human team.
- [Paid Graph queries](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/): The official Subgraph gateway documents x402 access using USDC on Base or Base Sepolia, alongside its existing API-key route. Sprue's confirmed product model uses the creator account wallet to fund upstream data purchases; validate a Privy-backed signer against the chosen endpoint. This does not establish that every discovery/MCP operation uses the same billing path. Do not export a user wallet's private key merely to copy a CLI example.
- [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/): Supports deployment discovery, schema inspection, and querying. It does not contain the LLM. Proposed boundary: the Sprue planner interprets intent, while a Graph adapter executes constrained discovery and query operations.
- [Standardized schemas](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/): Common entities and metrics allow query-pattern reuse within a protocol category. Extensions and schema/methodology versions still matter. Proposed stretch: run one metric template against two verified compatible deployments, recording versions and any adaptations. Do not assume that matching category names prove compatibility.
- [Subgraph skills](https://github.com/graphprotocol/subgraphs-skills): Retained background on development, optimization, and testing. Not a Sprue source-creation task; new Subgraph/Subgraph Composition development is outside the confirmed product boundary.
- [Substreams skills](https://github.com/streamingfast/substreams-skills): Retained sponsor background on streaming modules, sinks, testing, and deployment, not an active integration or fallback for missing Subgraph data.

### Source Identity and Reproducibility

The [Subgraph ID versus Deployment ID guide](https://thegraph.com/docs/en/subgraphs/querying/subgraph-id-vs-deployment-id/) distinguishes a stable logical Subgraph ID from a version-specific Deployment ID. A Subgraph-ID route follows the current sufficiently synced deployment and can therefore encounter synchronization lag or breaking schema changes. A deployment route pins one version and is the safer production target.

The [Subgraph MCP guide](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/claude/) additionally exposes Subgraph IDs, Deployment IDs, and manifest IPFS hashes through different tools. Their exact formats vary by interface, so Sprue stores them as distinct opaque identifiers rather than assuming they are interchangeable.

Draft 1.2 therefore adds an immutable `source_snapshots` record containing the selected gateway target, logical source identity, observed deployment/manifest identifiers, data network, schema SDL/hash, discovery method, and optional standardized-schema compatibility facts. An immutable `data_product_version_sources` projection binds each canonical source entry to that snapshot for ownership, dependency, and evidence queries. Published MVP versions pin a validated deployment snapshot. Following a Subgraph ID remains a discovery/preview behavior unless a new product version resolves and validates another deployment.

### Query Determinism and Data Quality

The [GraphQL API reference](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/) recommends cursor-style pagination over large `skip` values, supports block-number/hash queries, and exposes `_meta.deployment`, `_meta.block`, and `_meta.hasIndexingErrors`. It also documents reorganization limitations for non-final block hashes. The [query best-practices guide](https://thegraph.com/docs/en/subgraphs/querying/best-practices/) recommends static query documents with variables instead of runtime string construction.

Sprue therefore stores static query and variable hashes separately, cursor state per page, a pinned requested block across a paginated node execution, returned deployment/block provenance, indexing-error status, and sanitized GraphQL errors. Under the MVP `deny` policy, partial data accompanied by disallowed GraphQL or indexing errors cannot become the successful materialization.

### Access and Per-Query Payment Boundary

The Graph exposes separate API-key and x402 gateway routes. The [API-key management guide](https://thegraph.com/docs/en/subgraphs/providers/subgraph-studio/managing-api-keys/) says to keep keys in environment variables or a secret manager and supports bearer-header authentication; Sprue uses a server-side bearer header so credentials never enter stored endpoint URLs. API-key access is recommended by the provider for sustained high-volume use; x402 access requires no API key and instead returns a payment requirement containing amount, network, asset, and recipient before the signed retry. The provider describes x402 as pay-per-query, so every paginated GraphQL page is treated as a separate potential payment obligation.

The human team confirmed both as first-class Sprue product modes on 2026-09-05. A creator may bind a source to their existing Graph API key/subscription or select creator-wallet x402 pay-per-query. Draft 1.2 stores the customer key only through a workspace-owned `provider_credentials` secret reference with version/fingerprint and lifecycle state. API-key requests record provider usage but create no wallet payment or Graph x402 expense; any subscription charge remains externally billed unless separately imported as evidence.

The selected mode is explicit and versioned. Credential rotation can preserve the same logical credential identity, but credential failure or revocation blocks the request. Sprue never falls back automatically from a customer API key to x402 because that would turn an authentication failure into an unapproved wallet expense.

Draft 1.2 separates one logical `source_requests` row from its physical `source_http_attempts`: the initial `402` and the payment-bearing retry share a request fingerprint. Sprue validates the complete returned requirement before creating the payment intent and exact budget reservation. Confirmed settlement remains an expense even if the subsequent Graph response fails, and no reusable payment authorization is stored.

Other sponsor-linked resources retained as background rather than active ingestion tasks or verified compatibility: [Agent0](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/), [chain modules](https://github.com/streamingfast/substreams-chain-modules), and [EVM primitives](https://github.com/pinax-network/substreams-evm).

The downstream monetization plan now uses [Hedera and Blocky402](Hedera.md). That does not change the upstream Graph payment endpoint. Keep network/asset funding and settlement records separate; Hedera API revenue must not be counted as immediately available Base query budget. No automatic bridging is included in the current MVP.

## Development Gates and Evidence

These are Sprue's proposed acceptance checks. Only the user's participation confirmation is complete; technical and provenance checks remain pending. Store sanitized artifacts under a future `docs/evidence/graph/` directory; never include credentials.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [x] | Record the team's participation category | User confirmed Start Fresh on 2026-09-05; recorded in `plan.md` | G5, category only |
| [ ] | Audit development provenance for the selected pool | Development timeline, starter sources, and baseline/history evidence | G5 |
| [ ] | Prove the chosen source supports the intended metric | Logical Subgraph ID, pinned Deployment ID, manifest/schema hash, network, static query, variables, pagination, retrieval time, `_meta` block/error facts, and coverage assessment | G2, G3 |
| [ ] | Validate customer-API-key mode | Server-side secret reference, successful bounded query, credential version/fingerprint, usage event, rotation/revocation failure, and proof that no key or bearer header was persisted | Sprue product requirement |
| [ ] | Pay for the selected Graph query from the creator account wallet | Funding record, constrained authorization, payment outcome, query response, and linked expense | Sprue product requirement |
| [ ] | Trace a creator request through the planner and runtime | Prompt, specification version, validated DAG, execution trace, and independently checked output | G3 |
| [ ] | Exercise a second request or conversational revision | Changed semantics, resulting specification diff, and changed output | G3 |
| [ ] | Reproduce setup from a clean checkout | Exact commands, environment-variable names, dependency versions, and successful run notes | G4 |
| [ ] | Prepare a judge-accessible submission bundle | Repository link, recording, evidence index, hosted endpoint, and bounded demo access instructions | G1 |
| [ ] | If pursuing the stretch target, document adapter reuse | Compatibility matrix, reused template, and explicit protocol-specific exceptions | G6 |

### First Source-Validation Spike

Before committing to the proposed DEX stickiness example:

1. Identify candidate deployments and inspect their actual schema and indexing coverage.
2. Check whether wallet identifiers and timestamped activity are available for the requested period. Aggregate daily user counts alone cannot reconstruct distinct active days per wallet.
3. Define the metric precisely: time boundaries, distinct-day counting, wallet identity, protocol grouping, exclusions, and incomplete-data behavior.
4. Run a bounded query and manually verify a small output sample. Record pagination completeness and provider limits.
5. If no suitable existing source is found within bounded discovery, report missing facts and search limits. Ask the creator to revise the example or supply another existing source for validation; do not create a new ingestion path, Subgraph, or Subgraph Composition, or invent missing activity.

### Runtime and Hosting Safeguards

These are engineering choices for Sprue, not extra prize conditions:

- Keep provider credentials server-side, including credentials embedded in query URLs; redact logs and recordings.
- Bound query size, pagination, backfill duration, retries, and spending.
- Store source lineage and freshness alongside materialized results. A stale result must not be presented as current.
- Treat deterministic fixtures as unit-test tools and label replay/fallback demonstrations explicitly.
- Keep source discovery separate from approved runtime execution. Do not allow generated queries to silently change a published product's meaning.
- Preserve the Graph-derived lineage through the hosted API and payment flow; monetization must not obscure where the data came from.

## Pending Decisions

- Final award selection, development-provenance audit, and event-wide eligibility review; Start Fresh is confirmed.
- Concrete network, protocol, deployment IDs, schema versions, and data coverage.
- MCP versus direct GraphQL responsibilities, customer credential validation, provider-side key restrictions/quotas, and refresh budget. The model supports both without treating discovery or customer-subscription access as wallet-payment evidence.
- Concrete paid deployment endpoint, Graph x402 protocol/client version, payment requirement shape, Privy signer compatibility, discovery billing, and live cost reconciliation. API-key access alone does not demonstrate the confirmed wallet-funded product flow.
- Whether the stretch target is affordable within the existing MVP scope.
- Provider terms and permissions relevant to caching, transformation, and paid redistribution.
- Whether multiple award entries are permitted; do not assume prize stacking.
- Final human review of evidence and recheck of the official requirements.

## Maintenance

Consult this file before changing the Graph adapter, planner, source model, or demo narrative. When official requirements change, update the digest and review affected gates. Record material AI-assisted research or implementation in [plan.md](../plan.md). Do not mark a gate complete merely because it is described in a plan.
