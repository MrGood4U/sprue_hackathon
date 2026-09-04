# The Graph: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-05

Status: Research complete; integration and eligibility not yet verified.

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

Keep composability as a conditional stretch target. An internal Sprue DAG is not automatically composition of Graph products, and adding Bazantic or Privy should not be counted as another Graph product. Prefer a small, demonstrable shared-schema integration over expanding the runtime merely to chase another award.

### Technical References and Implications

- [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/): Supports deployment discovery, schema inspection, and querying. It does not contain the LLM. Proposed boundary: the Sprue planner interprets intent, while a Graph adapter executes constrained discovery and query operations.
- [Standardized schemas](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/): Common entities and metrics allow query-pattern reuse within a protocol category. Extensions and schema/methodology versions still matter. Proposed stretch: run one metric template against two verified compatible deployments, recording versions and any adaptations. Do not assume that matching category names prove compatibility.
- [Subgraph skills](https://github.com/graphprotocol/subgraphs-skills): Development, optimization, and testing guidance for subgraphs. Consult if source creation becomes necessary; creating a new indexer is not our default MVP path.
- [Substreams skills](https://github.com/streamingfast/substreams-skills): Guidance for streaming modules, sinks, testing, and deployment. Evaluate only if event-level coverage or refresh requirements justify the additional integration.

Other sponsor-linked resources, listed for later investigation rather than verified compatibility: [Agent0](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/), [chain modules](https://github.com/streamingfast/substreams-chain-modules), and [EVM primitives](https://github.com/pinax-network/substreams-evm).

## Development Gates and Evidence

These are Sprue's proposed acceptance checks. Only the user's participation confirmation is complete; technical and provenance checks remain pending. Store sanitized artifacts under a future `docs/evidence/graph/` directory; never include credentials.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [x] | Record the team's participation category | User confirmed Start Fresh on 2026-09-05; recorded in `plan.md` | G5, category only |
| [ ] | Audit development provenance for the selected pool | Development timeline, starter sources, and baseline/history evidence | G5 |
| [ ] | Prove the chosen source supports the intended metric | Deployment ID, network, query, variables, retrieval time, indexed block where available, and coverage assessment | G2, G3 |
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
5. If the required facts are unavailable, revise the example or explicitly approve a new ingestion path; do not invent missing activity.

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
- MCP versus direct GraphQL responsibilities, credentials, quotas, and refresh budget.
- Whether the stretch target is affordable within the existing MVP scope.
- Provider terms and permissions relevant to caching, transformation, and paid redistribution.
- Whether multiple award entries are permitted; do not assume prize stacking.
- Final human review of evidence and recheck of the official requirements.

## Maintenance

Consult this file before changing the Graph adapter, planner, source model, or demo narrative. When official requirements change, update the digest and review affected gates. Record material AI-assisted research or implementation in [plan.md](../plan.md). Do not mark a gate complete merely because it is described in a plan.
