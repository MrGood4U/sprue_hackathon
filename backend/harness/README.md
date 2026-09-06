# Sprue Agent Harness

## Status

Draft 0.6, 2026-09-06. The first provider-neutral harness slice is now implemented under `backend/src/modules/agent/harness/`. It uses a mock model by default and can call a creator-configured OpenAI-compatible Chat Completions endpoint for the evaluator session. Both paths validate untrusted proposals, apply schema-provided mappings, and execute the bounded cross-chain runtime. This directory remains the design and operating contract; it does not contain provider credentials or a generic model SDK.

Read the approved [data model 1.5](../../data-model.md), proposed [API contract](../../api-contract.md), [backend ownership](../README.md), and active [Graph reference](../../sponsor/graph.md) alongside this design. M1-M3 and H2 persistence directions were approved and incorporated into model 1.5; multi-source composition is the 1.5 scope extension. The [database foundation](../database.md) implements their tables, not the harness/controller. H1, H3 and E1/E2 remain open. No Graph purchase, wallet authority, subgraph deployment or API publication is enabled.

## What the Harness Does

The harness is the trusted software surrounding the language model: context assembly, a stage controller, typed tool dispatch, validation, limits, durable recovery, and evidence. The model proposes semantics and compositions; the harness decides which actions are permitted and verifies their results. A prompt alone is not a security boundary.

The intended compilation path is:

```text
Human natural language
  -> clarified metric and data requirements
  -> discover and inspect an existing Graph subgraph
  -> verified field mappings and bounded query plan
  -> compose predefined processing operators
  -> validate Data Product Spec + typed DAG
  -> present proposal and evidence
  -> HUMAN accepts version and starts Build
  -> deterministic worker fetches and transforms live data
  -> materialization
  -> separate HUMAN deployment/publication actions
```

"Operators" means machine-readable, versioned nodes such as source, map, filter, aggregate, union, join, and output, not decorative canvas symbols or generated executable code. Source discovery and semantic planning may iterate; accepted versions and execution do not silently change.

The user confirmed the [existing-Subgraph-only boundary](../../agents.md#confirmed-existing-subgraph-boundary) on 2026-09-05. The source stage selects among existing Subgraphs using semantic fit, granularity, coverage, freshness, and evidenced query costs within bounded discovery. Unknown coverage or cost stays explicit. A source gap requests requirement revision or another existing source for validation, not a new ingestion path.

### Graph MCP Adapter Boundary

The Graph Subgraph MCP is an infrastructure adapter, not Sprue's planner and not a language model. Its useful capabilities may be extracted behind four provider-neutral internal ports:

```text
searchSubgraphs(requirements)
getSubgraphSchema(sourceReference)
generateGraphQL(schema, queryRequirements)
executeGraphQL(sourceReference, queryPlan, accessContext)
```

The first, second and fourth ports may delegate to reviewed Graph MCP operations for subgraph search, schema retrieval and query execution. The third port is owned by Sprue: the planner/compiler selects only the fields, filters, pagination and consistency controls required by the Data Product Spec, then emits and validates a static GraphQL document. The MCP does not generate GraphQL semantics for Sprue and its provider descriptions never become trusted instructions.

Keep these ports behind the Graph module so the upper harness does not depend on MCP tool names, remote URLs or a particular SDK. A direct Graph API adapter may replace the MCP adapter without changing the planner or DAG runtime. Query execution is a data-plane operation, not an unrestricted planner tool: live sample or build requests require the selected Graph access mode, approved budget, bounded query plan and applicable creator authorization. A provider-neutral `executeGraphQL` port must never imply permission to spend.

Creating, generating, deploying, or maintaining new Subgraphs or Subgraph Composition is outside Sprue's product scope, not a future fallback. Reuse supported capabilities of each inspected source query when semantics match, then apply only necessary Sprue transformations. This is query planning over existing indexes, not automatic compilation into a new upstream index. The first runtime now supports multiple existing source entries with explicit Union and Join nodes, subject to source-level provenance, access, consistency and resource limits. Sprue product/API Build, Deploy, refresh, and optional paid publication remain distinct, authorized operations.

## Reading Order

| Document | Purpose |
|---|---|
| [Workflow](workflow.md) | Every stage, inputs/outputs, transitions, approvals, persistence, and frontend mapping |
| [Tool and script catalog](tools.md) | Exact Sprue-owned tool contracts, proposed script files, permissions, and developer prerequisites |
| [Operator contract](operators.md) | Query compilation, typed operator semantics, expression restrictions, and a worked metric example |
| [Semantic templates](semantic-templates.md) | Versioned Wallet Activity/Repeat Activity expansion, provenance, editing limits and tests |
| [Constraints](constraints.md) | Enforced permissions, resource limits, payment boundaries, injection defense, and recovery |
| [Verification and delivery](verification.md) | Implementation order, golden cases, attack/retry tests, and review gates |

## Three Distinct Authorities

| Actor | May do | Must not do |
|---|---|---|
| Planner model | Interpret intent, request approved metadata tools, select supported operators, propose parameters and a version diff | Execute code, read secrets, authorize spending, accept its own proposal, or deploy |
| Trusted harness/controller | Verify caller and phase, dispatch tools, meter work, validate proposals, record sanitized evidence | Treat model claims or provider text as authorization or integration proof |
| Deterministic worker | Execute an accepted version after an authorized Build/refresh command, fetch Graph data within explicit access/budget policy, persist output | Ask an LLM to invent runtime transforms, change semantics, switch payment mode, or publish automatically |

An API-key build still consumes provider quota and requires explicit execution. "Non-paid planning" means no Graph data purchase or subscription data query during planning; LLM/provider metadata infrastructure can have a separate, platform-controlled operating cost.

## Implemented Harness Slice

`AgentHarness` is the current controller boundary. Its flow is:

```text
bounded intent + source schema summaries
  -> mock or OpenAI-compatible model response
  -> proposal schema and DAG-shape validation
  -> source-key and chain binding
  -> schema-driven field mapping
  -> deterministic Union/Aggregate/Join execution
  -> trace and materialization-shaped result
```

The model port is provider-neutral. `AGENT_MODE=mock` is the default. `AGENT_API_URL`, `AGENT_API_KEY`, `AGENT_MODEL`, and `AGENT_TIMEOUT_MS` configure an OpenAI-compatible Chat Completions request without introducing a provider SDK. The same adapter accepts a redacted evaluator-session profile from the Model Service page. It sends the intent and bounded source/schema summaries, requires a JSON proposal, rejects redirects and oversized/invalid response envelopes, and exposes only sanitized failures. The mock response is deliberately fixed to the Cross-chain DEX Trader Footprint target and is not natural-language understanding evidence.

The temporary demo profile is held only in bounded API-process memory under a random browser-session UUID. The API key is never returned, persisted, or written to browser storage, and API restart clears it. Saving the profile does not call the model; the next explicit `agent_plan` action does. Non-Agent demo actions reuse the last validated session proposal so they cannot create hidden model charges. This session UUID is not creator authentication. Durable workspace model selection still requires reviewed persistence, verified identity, a secret-manager reference, rotation/revocation behavior, and abuse controls.

The harness accepts source inputs from its caller and does not read test fixtures, the database, or the environment during execution. The real worker will later replace those inputs with trusted source requests and durable run context.

## Proposed File Ownership

This directory remains design-only; the database implementation lives in backend/src/db and backend/migrations. The following are future implementation locations, not runnable paths yet:

```text
backend/harness/
  README.md, workflow.md, tools.md, operators.md, semantic-templates.md, constraints.md, verification.md
  schemas/       # Versioned tool, semantic-plan, expression, and checkpoint schemas
  prompts/       # Small versioned prompts per planning phase; no secrets or authority
  catalogs/      # Reviewed query recipes and metadata-adapter capability declarations
  fixtures/      # Public/synthetic test inputs with provenance and expected outputs
  scripts/       # One thin developer CLI wrapper per cataloged tool/maintenance task

backend/src/modules/agent/harness/
  controller.ts  # Phase transitions and orchestration, not route code
  context.ts     # Minimum authorized context and redaction
  dispatcher.ts  # Named tool allowlist and typed results
  limits.ts      # Budget reservation and enforcement
  checkpoints.ts # Durable progress/recovery after model review
  model-port.ts   # Provider-neutral model interface; no SDK required
  remote-model.ts # Bounded OpenAI-compatible Chat Completions adapter

backend/src/modules/dag/    # Operator registry, compiler, validator, interpreter
backend/src/modules/graph/  # Metadata/query adapters and source provenance
backend/src/jobs/           # Authorized execution and reconciliation dispatch
backend/tests/harness/      # Contract, orchestration, and security tests
```

Scripts import these domain implementations; they do not contain a second compiler/runtime. The production model invokes registered functions through the dispatcher, not a shell, script path, terminal, or arbitrary MCP server. Railway and Docker use the same contracts and process boundaries.

## First Implementation Target

First prove a deterministic, fixture-backed `intent requirements -> inspected schema -> static query -> operator DAG -> expected output` path without any model or network dependency. Then add bounded metadata discovery and the planner around it. Finally connect authorized live Graph execution. This order makes incorrect reasoning distinguishable from incorrect data processing.

The human approved the seven-type MVP scope (Source, Filter, Map, Aggregate, Union, Join, Output) and semantic-template/frontend alignment on 2026-09-05. Exact configuration/numeric schemas, Union compatibility rules and Join cardinality/null/collision semantics (H1), the live source/methodology and numerical operating limits (H3) remain review items. H2 durable provenance/recovery directions are approved and mapped to model 1.5; restart-safe runtime behavior still requires implementation. The frontend and backend now demonstrate all seven operator types in a fixture-backed evaluator slice, and the model request may be live when the creator supplies a compatible service. There is still no durable Agent session, queue worker, live Graph provider execution, wallet action, or payment. [Verification](verification.md#review-gates) identifies the decisions needed before implementing dependent behavior.
