# Sprue Agent Harness

## Status

Lexical field and row-grain vocabularies are advisory ranking aids only. Identifier matching also supports ordered semantic tokens, so provider modifiers can appear between requested terms (for example, a requested `amountUSD` may surface as `amountInUSD` or `amountOutUSD`) without a request-specific field allowlist. The entity-selection model receives compact summaries without full field arrays. Those summaries are allocated fairly across ranked candidates rather than allowing one broad schema to consume the per-need budget. After deterministic reference validation, the harness expands only the selected entities from trusted discovery evidence for the feasibility model. That model may select exact inspected paths that match no vocabulary entry; deterministic validation checks the selected path, scalar type, list shape, and nullability rather than requiring a lexical hit.

Draft 1.4, 2026-09-09. The provider-neutral staged harness is implemented under `backend/src/modules/agent/harness/`. It can call the creator's workspace-scoped OpenAI-compatible model profile; the mock model is a deterministic test fixture. The live source-exploration path is schema-driven. The first model response decomposes arbitrary requested semantics into independent source requirements with dynamic field, grain, constraint, and result contracts plus bounded search keywords. For each requirement, the restricted Graph adapter collects all bounded candidates' 30-day activity, orders schema inspection by observed use, and inspects every ranked schema within that requirement's budget even when activity is zero or missing. It reads explicit `Query` roots when present. When provider source SDL omits that generated root, the controller uses one fixed introspection document through an identifier-bound Graph adapter operation to read the runtime Query fields; it never guesses a pluralized query name. The normalized query-root/entity/field projection is cached in Redis by immutable manifest IPFS CID and schema hash, without workspace identity, credentials, user text, provider payloads, or request-specific field bindings, so authenticated workspaces can safely reuse the same objective schema evidence. A second model response selects exactly one candidate entity per source need from compact summaries that omit full field arrays. The harness validates those references and expands only the selected entities from its trusted discovery snapshot. A third model response binds every required semantic field to an exact returned path and proposes a version-2 composition from the registered generic operators. Deterministic code then verifies candidate/entity/path references, type and nullability compatibility, expression ASTs, aggregate measures, output fields, ports, connectivity, acyclicity, and limits. Graph discovery is pinned to The Graph mainnet environment and the current allowlisted data-network catalog contains Ethereum Mainnet, Arbitrum One, and Base Mainnet. This exploration result remains non-executable until durable source admission and query compilation are implemented. The older wallet-shaped compiler/runtime remains isolated as a fixture compatibility path and is not an input contract for live exploration.

Read the approved [data model 1.8](../../data-model.md), proposed [API contract](../../api-contract.md), [backend ownership](../README.md), and active [Graph reference](../../sponsor/graph.md) alongside this design. M1-M3 and H2 persistence directions were approved and incorporated into model 1.5; multi-source composition is the 1.5 scope extension. Model 1.6 separates stable Sprue users from replaceable login identities, model 1.7 adds the workspace tenant boundary, and model 1.8 adds encrypted model profiles. H1, H3 and E1/E2 remain open. No Graph purchase, wallet authority, subgraph deployment or API publication is enabled.

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

The implemented planning adapter delegates only to `search_subgraphs_by_keyword`, `get_deployment_30day_query_counts`, the three identifier-specific schema reads, and `get_top_subgraph_deployments` when the creator supplied a contract address and chain. One additional internal operation may call `execute_query_by_ipfs_hash` with Sprue's compile-time constant introspection document only; neither its document nor variables can be supplied by the model or browser. The model never receives a generic MCP connection, tool catalog, endpoint, credential, provider descriptions, or an `execute_query_*` capability. Search keywords are untrusted hints, not tool calls: the controller validates their per-SourceNeed network coverage and cardinality, then maps them to the fixed search method. Sprue parses and ranks bounded results deterministically, sends compact entity summaries to the selection pass, validates the selected references, and sends full field evidence only for those selected entities to the feasibility pass.

Runtime introspection is a real Graph data-plane request and may consume subscription quota or incur provider cost. It is therefore limited to a cache miss for an immutable manifest CID, remains identifier-bound and read-only, and does not authorize arbitrary execution or payment. Redis is required for this path: a cache read failure fails closed before introspection instead of silently issuing a potentially duplicate metered request. Cached evidence is an optimization and discovery artifact, not the durable workspace-owned source snapshot required for execution.

`generateGraphQL` remains Sprue-owned: the planner/compiler selects only the fields, filters, pagination and consistency controls required by the Data Product Spec, then emits and validates a static GraphQL document. `executeGraphQL` is a separate, still-unimplemented data-plane port. It may later use reviewed MCP execution operations or the direct Graph API only after binding a stored query plan to creator-selected access, resource limits, and any required payment authorization. A planning metadata credential is never execution or payment authority.

Keep these ports behind the Graph module so the upper harness does not depend on MCP tool names, remote URLs or a particular SDK. A direct Graph API adapter may replace the MCP adapter without changing the planner or DAG runtime. Query execution is a data-plane operation, not an unrestricted planner tool: live sample or build requests require the selected Graph access mode, approved budget, bounded query plan and applicable creator authorization. A provider-neutral `executeGraphQL` port must never imply permission to spend.

Creating, generating, deploying, or maintaining new Subgraphs or Subgraph Composition is outside Sprue's product scope, not a future fallback. Reuse supported capabilities of each inspected source query when semantics match, then apply only necessary Sprue transformations. This is query planning over existing indexes, not automatic compilation into a new upstream index. The first runtime now supports multiple existing source entries with explicit Union and Join nodes, subject to source-level provenance, access, consistency and resource limits. Sprue product/API Build, Deploy, refresh, and optional paid publication remain distinct, authorized operations.

## Reading Order

| Document | Purpose |
|---|---|
| [Planner orchestration and Builder handoff](planner-orchestration.md) | Concrete model passes, deterministic stage controller, intermediate artifacts, source/operator decisions, canonical DAG assembly, and frontend projection |
| [Workflow](workflow.md) | Every stage, inputs/outputs, transitions, approvals, persistence, and frontend mapping |
| [Tool and script catalog](tools.md) | Exact Sprue-owned tool contracts, proposed script files, permissions, and developer prerequisites |
| [Operator contract](operators.md) | Query compilation, typed operator semantics, expression restrictions, and a worked metric example |
| [Semantic templates](semantic-templates.md) | Versioned Wallet Activity/Repeat Activity expansion, provenance, editing limits and tests |
| [Constraints](constraints.md) | Enforced permissions, resource limits, payment boundaries, injection defense, and recovery |
| [Verification and delivery](verification.md) | Implementation order, golden cases, attack/retry tests, and review gates |

## Three Distinct Authorities

| Actor | May do | Must not do |
|---|---|---|
| Planner model | Interpret intent, propose bounded keyword hints, compare sanitized candidate evidence, select supported operators, and propose parameters | Dispatch MCP tools, execute code, read secrets, authorize spending, accept its own proposal, or deploy |
| Trusted harness/controller | Verify caller and phase, dispatch tools, meter work, validate proposals, record sanitized evidence | Treat model claims or provider text as authorization or integration proof |
| Deterministic worker | Execute an accepted version after an authorized Build/refresh command, fetch Graph data within explicit access/budget policy, persist output | Ask an LLM to invent runtime transforms, change semantics, switch payment mode, or publish automatically |

An API-key build still consumes provider quota and requires explicit execution. "Non-paid planning" means no Graph data purchase or subscription data query during planning; LLM/provider metadata infrastructure can have a separate, platform-controlled operating cost.

## Implemented Harness Slice

`AgentHarness` is the current controller boundary. Its flow is:

```text
source exploration
  bounded intent + allowed network catalog
  -> model search plan -> dynamic SemanticPlan + independent SourceNeeds
  -> per SourceNeed: keyword search -> activity-ranked candidates -> bounded schema inspection (including zero activity)
  -> model entity selection from compact evidence
  -> harness expands only selected entity fields
  -> model feasibility plan -> exact inspected field bindings -> generic typed operator composition
  -> deterministic evidence, expression, output-schema, and DAG validation
  -> non-executable feasibility result with pending checks

fixture compilation compatibility path
  bounded intent + already inspected source candidates
  -> semantic/source/composition model passes
  -> deterministic query compilation, stable IDs, access binding, schemaVersion 2 assembly, and DAG validation
  -> Builder projection and fixture-backed deterministic execution
```

The model port is provider-neutral. `AGENT_MODE=mock` is the default. `AGENT_API_URL`, `AGENT_API_KEY`, `AGENT_MODEL`, and `AGENT_TIMEOUT_MS` configure OpenAI-compatible Chat Completions without introducing a provider SDK. `AGENT_TIMEOUT_MS` bounds each external model or Graph step and defaults to 600 seconds; `AGENT_RUN_TIMEOUT_MS` pins the whole planning run to 3,600 seconds by default and must be at least the step bound. The same adapter accepts a decrypted workspace-scoped profile from the Model Service service boundary. For the official DeepSeek endpoint, each planning stage uses `POST /responses` with `text.format.type=json_schema`, a generated stage-specific object schema, and `reasoning.effort=low`; the configured Chat Completions URL is safely mapped to the sibling Responses endpoint. The adapter reads only the Responses message `output_text`, requires a completed response, and treats an `incomplete` response (including a reasoning-budget exhaustion) as a bounded failure. A provider-supplied `incomplete_details.reason` is retained only when it is a short safe diagnostic token, so structured logs can distinguish output-budget exhaustion from another incomplete outcome without recording the response body. The output ceiling is 16,384 tokens for both DeepSeek Responses and other OpenAI-compatible planning calls. For other OpenAI-compatible endpoints, every stage supplies the same schema as the parameters of a `submit_sprue_plan` function call; the adapter requires exactly one call with that name and rejects ordinary assistant content, missing calls, renamed calls, or multiple calls. Before transport, the generated schema is normalized to a portable DeepSeek-compatible subset with an object root and without unsupported draft-7 string/array cardinality keywords; the full Zod schema remains authoritative after receipt. Sprue treats all returned structured data as untrusted and validates it with that runtime schema. The active three-stage exploration path permits at most one bounded repair call across the run while remaining inside the four-call limit. Provider-specific paths are explicit and no strict-schema mode is inferred from an arbitrary saved endpoint. The API key is used only in the HTTP Authorization header and is absent from prompts, traces, outputs, and browser state. Redirects, oversized envelopes, malformed JSON, unknown fields, over-limit keywords, fabricated candidate references, uninspected query entities, unknown operators, bad ports, duplicate inputs, disconnected nodes, cycles, and over-limit DAGs are rejected. The mock passes remain deterministic evaluator fixtures and are not natural-language understanding evidence.

The Model Service profile is stored durably per authenticated, owner-authorized workspace. Its API key is encrypted before SQL using AES-256-GCM and a server-only versioned keyring; the API key and encryption metadata are never returned or written to browser storage. Saving the profile does not call the model. An explicit connection test sends one minimal fixed prompt with current form values, may incur provider charges, and does not save the profile or return provider content. The next explicit source-exploration operation uses the saved profile for its two bounded model decisions. Non-Agent creator actions reuse validated state so they cannot create hidden model charges. Public demo routes cannot read or change model profiles. Exact durable planning-call audit binding, explicit profile revocation, and distributed abuse controls remain pending.

The harness accepts source inputs from its caller and does not read test fixtures, the database, or the environment during execution. The real worker will later replace those inputs with trusted source requests and durable run context.

## Proposed File Ownership

Design records remain in this directory; runnable code lives in the domain modules. Implemented and future ownership is:

```text
backend/harness/
  README.md, planner-orchestration.md, workflow.md, tools.md, operators.md, semantic-templates.md, constraints.md, verification.md
  schemas/       # Versioned tool, semantic-plan, expression, and checkpoint schemas
  prompts/       # Small versioned prompts per planning phase; no secrets or authority
  catalogs/      # Reviewed query recipes and metadata-adapter capability declarations
  fixtures/      # Public/synthetic test inputs with provenance and expected outputs
  scripts/       # One thin developer CLI wrapper per cataloged tool/maintenance task

backend/src/modules/agent/harness/
  controller.ts  # Phase transitions and orchestration, not route code
  schemas.ts     # Strict intermediate model-artifact schemas
  compiler.ts    # Source needs, query plans, stable assembly, and DAG validation
  registry.ts    # First-runtime operator signatures and config checks
  prompts.ts     # Small stage-specific prompts with explicit prohibitions
  model-port.ts   # Provider-neutral model interface; no SDK required
  remote-model.ts # Bounded OpenAI-compatible/DeepSeek Responses adapter
  context.ts, dispatcher.ts, limits.ts, checkpoints.ts # Later live/durable controller boundaries

backend/src/modules/dag/    # Operator registry, compiler, validator, interpreter
backend/src/modules/graph/  # Restricted MCP metadata client, bounded discovery, and source provenance boundary
backend/src/jobs/           # Authorized execution and reconciliation dispatch
backend/tests/harness/      # Contract, orchestration, and security tests
```

Scripts import these domain implementations; they do not contain a second compiler/runtime. The production model invokes registered functions through the dispatcher, not a shell, script path, terminal, or arbitrary MCP server. Railway and Docker use the same contracts and process boundaries.

## First Implementation Target

The deterministic wallet fixture path still runs for legacy evaluator coverage. The live exploration path is now `intent -> dynamic model SourceNeed/search plan -> per-need restricted Graph MCP search/activity/schema discovery -> compact model entity selection -> harness expansion of selected entity fields -> exact model field binding plus generic operator plan -> deterministic validation`. Regression coverage proves that full fields are absent from entity-selection input, only selected entities are expanded for feasibility, and a non-wallet time-series result can use arbitrary semantic field names with `utc_date`, `sum`, and `average` composition. Next persist durable source snapshots, resolve a real gateway Deployment ID without conflating it with the returned manifest IPFS CID, compile the selected bindings into a bounded static GraphQL plan, and add an explicitly authorized data probe plus planning checkpoints/audit binding. Separately authorized live Graph execution follows after those gates.

The human approved the seven-type MVP scope (Source, Filter, Map, Aggregate, Union, Join, Output) and semantic-template/frontend alignment on 2026-09-05. Exact configuration/numeric schemas, Union compatibility rules and Join cardinality/null/collision semantics (H1), the live source/methodology and numerical operating limits (H3) remain review items. H2 durable provenance/recovery directions are approved and mapped to model 1.5; restart-safe runtime behavior still requires implementation. The frontend and backend now demonstrate all seven operator types in a fixture-backed evaluator slice, and the model request may be live when the creator supplies a compatible service. There is still no durable Agent session, queue worker, live Graph provider execution, wallet action, or payment. [Verification](verification.md#review-gates) identifies the decisions needed before implementing dependent behavior.
