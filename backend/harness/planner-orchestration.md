# Planner Orchestration and Builder DAG Handoff

## Status

Draft 0.1, 2026-09-07. This document defines the target planning controller that turns a creator's natural-language request into a validated, Builder-readable Data Product Spec. It is a design record only. The current one-call mock/remote harness remains an evaluator slice and is not changed by this document.

Read this with the [harness overview](README.md), [workflow](workflow.md), [tool catalog](tools.md), [operator contract](operators.md), [constraints](constraints.md), [canonical specification](../../data-model.md#canonical-data-product-specification), and [Builder editor contract](../../frontend/workflow-editor.md).

This design does not approve the open H1 executable schemas or H3 live-source and operating profile. It introduces no Graph request, model call, product version, payment, deployment, or runtime code.

## 1. Design Decision

The target harness is a controller-owned compilation state machine, not an unconstrained Agent loop and not one prompt that is trusted to emit an executable workflow.

The controller runs three narrow model passes around deterministic services:

1. Semantic interpretation: convert prose into explicit facts, grain, population, metrics, time, output, and unresolved questions.
2. Source selection: choose only from bounded, inspected existing-Subgraph candidates and propose field mappings.
3. DAG composition: choose and configure only registered primitive operators or reviewed templates using verified source row schemas.

Between and after those passes, Sprue-owned code performs source search/inspection, GraphQL compilation, template expansion, node-ID allocation, schema inference, resource estimation, complete DAG validation, and proposal assembly. A model response is always untrusted input to the next deterministic gate.

The controller returns one of three visible outcomes:

- `proposal`: a fully validated canonical `DataProductSpec` that the Builder can project into nodes and edges;
- `clarification`: a small set of material questions, with no executable specification;
- `unsupported`: an evidenced explanation of a missing source fact, coverage requirement, or operator capability, with no executable specification.

The harness never returns a partially valid DAG as actionable. It never accepts, builds, pays for, deploys, or publishes its own proposal.

## 2. Authority and Component Split

| Component | Owns | Does not own |
|---|---|---|
| Planning controller | Stage transitions, call/tool budgets, trusted context, retries, checkpoints, result variant, sanitized trace | Metric meaning, operator implementation, source-provider behavior |
| Semantic model pass | Interpreting prose, identifying ambiguity, expressing required facts and output intent | Source IDs, raw GraphQL, executable code, access authority |
| Source model pass | Comparing verified candidates, proposing field-to-fact mappings, explaining tradeoffs | Inventing candidates, bypassing schema checks, querying live rows |
| Composition model pass | Selecting necessary registered operators/templates and proposing typed configuration | Defining new operators, emitting UI layout, claiming its graph is valid |
| Graph metadata adapter | Bounded search, immutable identity resolution, schema inspection, provider evidence | Planning semantics, GraphQL generation, payment authorization |
| Query compiler | Static GraphQL AST/document, typed variables, extraction path, pagination, consistency, query hash | Source discovery, live query execution, semantic narrowing |
| Template compiler | Deterministic expansion of a pinned recipe into primitive nodes/edges and provenance | Runtime execution, hidden source joins, locked editor groups |
| DAG compiler/validator | Stable IDs, registry lookup, port wiring, topological/type checks, output schema, resource analysis, spec assembly | Arbitrary code evaluation, source data retrieval, deployment |
| Builder projector | Visual nodes/edges, default layout, localized labels/icons, template disclosure | Execution semantics, source authorization, spec mutation during rendering |
| Deterministic worker | Execution of an accepted version after an explicit Build/refresh command | Replanning, silent source substitution, payment-mode changes |

Identity, workspace ownership, parent-version hashes, source-access selections, credential/policy references, platform limits, and approval state come only from trusted server context. They are never copied from model output.

## 3. End-to-End State Machine

```text
received
  -> admitted
  -> semantics_ready | needs_clarification
  -> source_needs_ready
  -> candidates_inspected
  -> sources_bound | source_gap
  -> queries_compiled
  -> composition_ready
  -> spec_assembled
  -> spec_validated
  -> proposal_presented

Any bounded stage
  -> limit_exhausted | dependency_blocked | cancelled | internal_failure
```

| Stage | Primary input | Controller action | Required output |
|---|---|---|---|
| O0 Admit | Authenticated message and optional parent version | Verify ownership, deduplicate command, trim/redact input, pin registry/catalog/parent, reserve planning limits | `PlanningContext` or typed rejection |
| O1 Interpret | Sanitized intent, prior decisions, parent semantic summary | Run semantic model pass and strict schema validation | `SemanticPlan`, `clarification`, or `unsupported` |
| O2 Derive source needs | Valid `SemanticPlan` | Deterministically split required facts by network, grain, entity relationship, and coverage | Ordered `SourceNeed[]` |
| O3 Discover | `SourceNeed[]` | Dispatch bounded metadata search, including direct IDs supplied by the creator as untrusted hints | Candidate references with evidence; no data query |
| O4 Inspect and score | Candidate references | Resolve identities, inspect schema slices, check hard fit and coverage, then rank surviving candidates | `CandidateSet[]` with passed/failed/unverified facts |
| O5 Bind sources | Candidate sets and semantic plan | Run source model pass; validate that every choice and mapping refers to inspected evidence | `SourceBinding[]` or source gap |
| O6 Compile queries | Bindings, inspected SDL, semantic window and fields | Build/validate static GraphQL plans through reviewed recipes | `QueryPlan[]`; no request is executed |
| O7 Compose | Semantic plan, query output schemas, registry/templates, parent spec | Run composition model pass; reject unknown types/fields and unnecessary transforms | `CompositionIntent` |
| O8 Assemble | All validated planning artifacts | Expand templates, allocate stable IDs, bind source/query/access records, infer ports/output, clamp resources | Candidate schemaVersion 2 `DataProductSpec` |
| O9 Validate | Candidate spec and pinned registry | Run structural, type, semantic, source, resource, diff, and optional fixture checks | `ValidationReport` and optional labeled simulation |
| O10 Repair | Structured validation diagnostics | Permit a bounded model repair only for model-owned fields, then rerun O8-O9 | Valid spec or final non-actionable outcome |
| O11 Present | Valid spec or final diagnostics | Produce the API `Proposal`, visible assumptions/issues/change summary, and trace reference | Actionable proposal, clarification, unsupported, or command error |

The normal path uses three model calls. Up to two repair calls may be used within the shared limits in [constraints.md](constraints.md). A retry resumes from the latest valid checkpoint and cannot reset counters by changing IDs or wording.

## 4. Typed Intermediate Artifacts

Intermediate artifacts prevent prose from leaking into runtime behavior. Each has a versioned strict schema, rejects unknown fields, and is stored or referenced through the planning command rather than trusted from conversation text.

### 4.1 SemanticPlan

`SemanticPlan` records what the product means before any source is selected.

```json
{
  "schemaVersion": 1,
  "summary": "Find wallets active on both Ethereum and Arbitrum DEX sources and return per-chain plus combined activity.",
  "population": {
    "entity": "wallet",
    "inclusion": "at least one qualifying swap on each requested network",
    "exclusion": []
  },
  "facts": [
    {"id": "wallet", "type": "address", "required": true},
    {"id": "trade_id", "type": "string", "required": true},
    {"id": "timestamp", "type": "timestamp", "required": true},
    {"id": "volume_usd", "type": "decimal", "unit": "USD", "required": true}
  ],
  "networks": ["eip155:1", "eip155:42161"],
  "grain": "one row per swap event before Sprue aggregation",
  "window": {"kind": "complete_utc_days", "days": 30},
  "metrics": ["trade_count", "volume_usd", "first_seen_at", "last_seen_at"],
  "combination": {"kind": "intersection", "keys": ["wallet"]},
  "output": {"shape": "wallet_rows", "orderBy": ["wallet"]},
  "refresh": {"mode": "scheduled", "timezone": "UTC"},
  "assumptions": [],
  "unresolved": []
}
```

Prose fields explain meaning but never execute. Every metric must later lower to inspected fields, typed expressions, measures, and explicit operator configuration. A missing denominator, event grain, network, interval, unit, or intersection/append choice produces a clarification when it can materially change the result.

### 4.2 SourceNeed

The controller derives `SourceNeed` records from the semantic plan. One request may need one source per network, multiple entities from one source, or multiple sources on one network. The split is based on semantic coverage, not a desired node count.

```json
{
  "id": "arbitrum_swap_events",
  "dataNetwork": "eip155:42161",
  "requiredFacts": ["wallet", "trade_id", "timestamp", "volume_usd"],
  "requiredGrain": "swap_event",
  "requiredWindow": {"kind": "complete_utc_days", "days": 30},
  "joinRole": {"kind": "right", "keys": ["wallet"]},
  "optionalFacts": ["pool", "token_in", "token_out"]
}
```

The model cannot collapse two required networks into one source need merely because a candidate is convenient. Conversely, the controller does not force multiple source nodes when one inspected Subgraph supplies all required facts at the required grain and coverage.

### 4.3 CandidateSet and SourceBinding

`CandidateSet` contains only adapter-returned, controller-scoped candidate references. It records hard gates separately from advisory ranking:

- semantic field fit;
- row grain and entity relationship fit;
- data network;
- historical/window capability;
- immutable deployment/schema identity;
- freshness and indexing-error evidence;
- supported query/pagination shape;
- evidenced access/cost classification;
- unknown or deferred live checks.

Candidates with a known missing required fact, wrong network, insufficient grain, or incompatible history cannot win through a higher popularity or cost score. Ranking is used only among hard-gate survivors and is reported as a bounded comparison, never a globally optimal claim.

`SourceBinding` then maps one source need to one inspected snapshot and explicit facts:

```json
{
  "sourceNeedId": "arbitrum_swap_events",
  "snapshotId": "00000000-0000-0000-0000-000000000000",
  "sourceKey": "arbitrum_swaps",
  "fieldMappings": [
    {"fact": "wallet", "entity": "swaps", "fieldPath": ["account", "id"], "scalarType": "Bytes", "normalization": "evm_address_lowercase"},
    {"fact": "trade_id", "entity": "swaps", "fieldPath": ["id"], "scalarType": "ID", "normalization": "string"},
    {"fact": "timestamp", "entity": "swaps", "fieldPath": ["timestamp"], "scalarType": "BigInt", "unit": "unix_seconds"},
    {"fact": "volume_usd", "entity": "swaps", "fieldPath": ["amountInUSD"], "scalarType": "BigDecimal", "unit": "USD"}
  ],
  "coverage": {
    "schemaFit": "passed",
    "historicalCoverage": "unverified",
    "indexerFreshness": "unverified",
    "extractionCompleteness": "passed"
  }
}
```

The values above are illustrative and are not evidence that a live Subgraph exposes those fields. A logical Subgraph ID, Deployment ID, and manifest CID remain distinct. A creator-supplied ID is inspected through the same path and is never accepted as a trusted endpoint.

### 4.4 QueryIntent and QueryPlan

The source pass may propose a structured `QueryIntent`: entity, required facts, allowed predicates, symbolic window, sort key, and expected row grain. It does not emit GraphQL text.

The Sprue query compiler lowers it through a reviewed recipe to a `QueryPlan` containing the static document, schema/query hashes, typed variable schema and bindings, extraction path, row schema, pagination, block consistency, and request upper bound. Query validation is repeated independently against the pinned SDL and policy.

No query is sent during planning. Coverage that requires a data request stays `unverified` until an explicitly authorized preview/build path performs it.

### 4.5 CompositionIntent

The composition pass describes semantic roles and required transformations without owning final IDs, source/access references, output schema, or resource ceilings.

```json
{
  "schemaVersion": 1,
  "nodes": [
    {"role": "normalize_ethereum", "operator": "map", "operatorVersion": "1", "config": {"fields": {}}},
    {"role": "aggregate_ethereum_wallet", "operator": "aggregate", "operatorVersion": "1", "config": {"groupBy": ["wallet"], "measures": {}}},
    {"role": "join_cross_chain_wallet", "operator": "join", "operatorVersion": "1", "config": {"type": "inner", "keys": [{"left": "wallet", "right": "wallet"}], "cardinality": "one_to_one"}}
  ],
  "connections": [
    {"fromRole": "aggregate_ethereum_wallet", "toRole": "join_cross_chain_wallet", "inputRole": "left"}
  ],
  "templateInstances": []
}
```

The omitted configuration in this illustration must be complete under the eventual H1 schemas before implementation. The deterministic assembler resolves role references, registry ports, source/query bindings, stable IDs, and inferred schemas. It rejects a model-selected transform that is unnecessary for the stated semantics.

## 5. Source Decision Procedure

For each `SourceNeed`, use this order:

1. Reuse an already validated source snapshot only when its identity, schema hash, network, observation age, and required facts still satisfy the need.
2. Inspect a creator-provided Subgraph/Deployment/CID hint if present.
3. Run bounded metadata search with network and required-fact terms.
4. Inspect only the highest-potential candidates within the command limits.
5. Apply hard semantic, grain, network, history, and query-shape gates.
6. Rank survivors using evidenced freshness, coverage confidence, query cost/access compatibility, and mapping simplicity.
7. Ask the source model pass to choose among survivors and explain the choice.
8. Revalidate every chosen candidate and field mapping deterministically.

If no candidate survives, return the missing facts, inspected candidates, and search boundary. The next action is to revise the requirement or supply another existing source. The harness must not create, generate, deploy, maintain, or compose a new upstream Subgraph.

Multi-source rules:

- Each source node references exactly one canonical `sources[]` entry and one compiled query plan.
- Each source retains independent network, schema, block, time, access, request, and provenance evidence.
- Normalize schemas explicitly before Union or Join.
- Use `union` only to append compatible rows; it cannot mean relational matching.
- Use `join` only with explicit left/right ports, typed keys, join type, cardinality, null/collision policies, and bounded fan-out.
- Do not describe multiple networks as one atomic snapshot.
- Do not hide a merge in the Graph adapter, template, Map expression, or Output node.

## 6. Operator Composition Procedure

The composition pass sees only:

- the validated semantic plan;
- selected source/query summaries and exact output row schemas;
- the pinned operator registry and applicable template signatures;
- platform resource limits;
- a structural summary of the parent spec for an edit.

It does not see credentials, payment payloads, arbitrary provider descriptions, raw source rows, shell/filesystem tools, or disabled operators.

The assembler applies these rules in order:

1. Create one Source node per selected query plan.
2. Add Map only for explicit projection, renaming, normalization, or bounded derivation required by downstream semantics.
3. Add Filter only for an inclusion/exclusion predicate not already and equivalently enforced by the validated source query.
4. Add Aggregate only when the output grain differs from the incoming row grain or a requested measure requires it.
5. Add Union only for explicit append semantics after compatible normalization.
6. Add Join only for explicit relational combination with proven key types/cardinality and bounded fan-out.
7. Add exactly one Output node with deterministic ordering and the inferred final schema.
8. Remove dead or redundant operations; every remaining node must reach Output.

Templates are optional authoring shortcuts. The model may select a reviewed template by ID/version and parameters, but the template compiler expands it before the canonical spec is assembled. Expanded nodes are ordinary editable Builder nodes. Template provenance is a sidecar, not a runtime type, UI lock, or second execution definition.

The expression language remains a finite typed AST. There is no arbitrary JavaScript, Python, SQL, JSONPath, regex, code-generation fallback, dynamic import, network call, environment read, loop, recursion, or user-defined function.

## 7. Prebuilt Code and Tool Surface

The model-facing tools remain the twelve typed contracts in [tools.md](tools.md):

| Concern | Agent-callable tools | Deterministic implementation supplied by Sprue |
|---|---|---|
| Registry and templates | `registry.read`, `templates.read`, `templates.expand` | Versioned operator/template catalogs, JSON schemas, expansion compiler, hashes |
| Existing source discovery | `sources.search`, `sources.inspect`, `sources.check_coverage` | Graph metadata adapter, identity resolver, SDL slicer, coverage checker, candidate scorer |
| Query planning | `query.compile`, `query.validate` | Reviewed query recipes, GraphQL AST builder, static validator, pagination/consistency compiler |
| DAG correctness | `dag.validate`, `dag.simulate` | Spec assembler, stable-ID allocator, port/type inference, resource estimator, deterministic fixture runtime |
| Edits and evidence | `spec.diff`, `evidence.read` | Canonical diff engine, scoped evidence reader, redaction and lineage summaries |

Additional controller-owned libraries are not model tools:

- `semantic-plan-validator`: validates meaning artifacts and determines whether clarification is mandatory;
- `source-need-deriver`: partitions facts by network, grain, and relationship;
- `candidate-ranker`: applies hard gates and transparent advisory scoring;
- `access-binder`: copies only creator-approved credential/policy references into source entries;
- `node-id-allocator`: creates stable ASCII role IDs, preserves unchanged parent IDs, and resolves collisions deterministically;
- `spec-assembler`: lowers source/query/operator artifacts into canonical schemaVersion 2;
- `schema-inference`: computes every port schema and the final output schema from registry code;
- `proposal-projector`: produces the public Proposal without exposing private checkpoints or raw provider output;
- `builder-projector`: maps canonical nodes/edges plus the registry and optional provenance to frontend graph objects;
- `checkpoint-store`: records resumable stage inputs, outputs, hashes, counters, and sanitized diagnostics under approved H2 records.

Production dispatch invokes domain handlers directly. Thin scripts may reuse those handlers for offline developer verification, but the model never receives a shell, script path, generic MCP catalog, arbitrary HTTP client, or direct database access.

## 8. Model Pass Contracts

### Pass A: Semantic interpreter

Input is the current creator message, bounded prior decisions, and an optional parent semantic summary. Output is exactly one of `semantic_plan`, `clarification`, or `unsupported`. This pass cannot name a source candidate or emit a DAG.

### Pass B: Source selector

Input is `SemanticPlan`, `SourceNeed[]`, and bounded candidate summaries with evidence references. Output may refer only to supplied `candidateRef` and inspected field paths. A source selection with a missing candidate, field, wrong type, or unsupported mapping is rejected. This pass cannot emit GraphQL or authorize a metered probe.

### Pass C: DAG composer

Input is the semantic plan, validated QueryPlan row schemas, registry/template signatures, limits, and optional parent topology. Output is `CompositionIntent`. It cannot provide source snapshot IDs, access references, resource limits above the supplied ceilings, output-schema claims, layout coordinates, or custom operator definitions.

### Repair passes

A repair input contains only the prior stage artifact and structured diagnostics such as `UNKNOWN_FIELD`, `PORT_TYPE_MISMATCH`, `JOIN_FANOUT_UNBOUNDED`, or `OUTPUT_SCHEMA_MISMATCH`. The model may change only model-owned fields for that stage. Identity, evidence, access, query hashes, registry versions, and limits are immutable. The controller reruns all affected deterministic gates after repair.

Prompts are versioned per pass. They should be small, contain the exact output schema and stage-specific prohibitions, and avoid embedding entire SDLs, registry implementations, conversation history, or provider prose.

## 9. Canonical DAG and Builder Handoff

The only executable result is the canonical `DataProductSpec` schemaVersion 2 in [data-model.md](../../data-model.md#canonical-data-product-specification). Its required separation is:

```text
Proposal
  specification
    intent
    sources[]
    dag.nodes[]
    dag.edges[]
    outputSchema
    refreshPolicy
    resourcePolicy

VersionLayout (separate)
  node coordinates
  viewport

CompilationProvenance (separate, optional)
  template instances
  expanded node IDs
  compiler/catalog hashes
```

The public `Proposal` projection follows the existing API contract:

```json
{
  "messageId": "20000000-0000-4000-8000-000000000001",
  "sessionId": "20000000-0000-4000-8000-000000000002",
  "parentVersionId": null,
  "proposalHash": "sha256:example-only",
  "status": "actionable",
  "specification": {
    "schemaVersion": 2,
    "runtimeVersion": "1",
    "intent": {"summary": "Validated semantic summary"},
    "sources": [],
    "dag": {"nodes": [], "edges": []},
    "outputSchema": {},
    "refreshPolicy": {},
    "resourcePolicy": {}
  },
  "assumptions": [],
  "issues": [],
  "changeSummary": [],
  "acceptedVersionId": null,
  "traceStreamId": "scoped-trace-reference"
}
```

The empty arrays/objects above show the envelope only and are not an actionable example. An actionable proposal contains complete validated fields. A clarification or unsupported result has `specification: null`.

### Builder projection rules

The frontend must not parse model text or a model-specific response. It parses only the validated `specification`:

1. Require `specification.schemaVersion === 2` and a supported `runtimeVersion`.
2. Load the matching operator registry and reject any missing operator type/version.
3. Create exactly one visual node for each `dag.nodes[]` entry, preserving its canonical `id`, `type`, `operatorVersion`, and `config`.
4. Create one visual edge for each canonical edge. A deterministic display ID may be derived as `fromNode:fromPort->toNode:toPort`; it is not stored as execution semantics.
5. Render input/output handles from the registry, not from guessed frontend rules.
6. Derive localized labels/icons/status from registry and validation data. Do not put UI colors, icons, selection, collapse state, or coordinates into the spec.
7. Use a saved `VersionLayout` when available; otherwise calculate a deterministic topological layout with sources on the left and Output on the right.
8. Show template groups only when verified CompilationProvenance matches the expanded spec. Missing provenance falls back to primitive nodes.
9. Feed edits back through the canonical draft codec; persist layout separately so node movement does not change the spec hash.

This contract matches the existing Builder edge fields: `{fromNode, fromPort, toNode, toPort}`. The harness does not emit React Flow objects, component names, DOM IDs, or coordinates.

## 10. Validation Gates Before an Actionable Proposal

An actionable result requires all applicable static checks to pass:

### Envelope and identity

- Known schema/runtime/registry/template versions and strict unknown-field rejection.
- Trusted workspace, parent, source snapshot, access, credential/policy, and evidence references.
- Canonical size and platform resource ceilings.

### Sources and queries

- Existing inspected Subgraph only; distinct logical/deployment/CID identities.
- Required network, facts, grain, units, and query capabilities.
- Query parses as one allowed named operation and validates against pinned SDL.
- Static fields, predicates, variables, pagination, block policy, extraction path, and request bounds.
- Deferred live coverage is visible and never reported as passed.

### DAG structure

- Unique stable node IDs, known type/version/config, and valid ports.
- Exactly one Output, all required inputs present, every node reachable from a Source and able to reach Output.
- No cycles, dead branches, duplicate edges, hidden multi-source merge, or unsupported operator.
- Topological type/schema inference succeeds for every edge and expression.

### Operator semantics

- Filter predicates are Boolean and do not silently alter the intended denominator.
- Map expressions reference existing typed fields and use explicit normalization/null behavior.
- Aggregate group keys/measures preserve the requested grain and units.
- Union inputs have compatible normalized schemas and required lineage.
- Join keys/types/cardinality/null/collision policy are explicit and fan-out is bounded.
- Output schema equals compiler inference and ordering is deterministic.

### Reproducibility and resources

- Time/window semantics, source consistency, incomplete-data policy, and refresh policy are explicit.
- Node, edge, source, expression, row, request, output, storage, and runtime estimates are within the shared limits.
- Parent diff exposes changed semantics, sources, access, time, output, and resource budgets while excluding layout.
- Optional simulation uses approved fixtures and actual operator implementations; it is labeled offline and cannot prove live Graph correctness.

Server-side validation is authoritative. Frontend validation may explain the same errors earlier but cannot make an invalid spec executable.

## 11. Failure, Clarification, and Repair Policy

| Condition | Outcome | Retry behavior |
|---|---|---|
| Material semantic ambiguity | `clarification` with at most a small focused question set | Continue from O1 after creator response |
| No suitable existing source | `unsupported` or `clarification` with missing facts/search bounds | Creator revises requirement or supplies another existing source ID |
| Metadata path requires unknown/paid access | `clarification`/blocked capability | No hidden data query or wallet fallback |
| Model refers to unknown source/field/operator | Validation diagnostic, then bounded repair | At most the shared repair limit |
| Query cannot satisfy bounds | Repair query intent or return unsupported | Never remove required semantics silently |
| DAG type/cycle/cardinality/resource error | Repair composition or return unsupported | Rerun complete affected validation |
| Model/tool/time/output limit reached | Command error with sanitized trace | New creator command required; counters do not reset inside the run |
| Dependency failure | Command error/blocked with retry class | Resume only when the same trusted command can safely continue |

The controller may automatically correct purely mechanical serialization details only when meaning cannot change, such as canonical key ordering or deterministic collision suffixes. It must not auto-correct a network, source, metric, denominator, join type, time interval, unit, access mode, or resource ceiling.

## 12. Worked Topology Handoff

For the request "Find wallets that traded on both Ethereum and Arbitrum DEX sources in the last 30 complete UTC days, and return per-chain activity plus combined volume," a valid plan may require two inspected swap-event sources. The validated source queries enforce the requested window, so the DAG does not repeat that predicate in unnecessary Filter nodes.

```text
Ethereum Source -> Normalize Ethereum -> Aggregate Wallet --left---+
                                                                  |
                                                                  v
                                                             Join Wallets -> Compute Combined Fields -> Output
                                                                  ^
                                                                  |
Arbitrum Source -> Normalize Arbitrum -> Aggregate Wallet --right--+
```

The Builder-relevant topology projected from the complete canonical spec is:

```json
{
  "nodes": [
    {"id": "source_ethereum", "type": "source", "operatorVersion": "1"},
    {"id": "normalize_ethereum", "type": "map", "operatorVersion": "1"},
    {"id": "aggregate_ethereum_wallet", "type": "aggregate", "operatorVersion": "1"},
    {"id": "source_arbitrum", "type": "source", "operatorVersion": "1"},
    {"id": "normalize_arbitrum", "type": "map", "operatorVersion": "1"},
    {"id": "aggregate_arbitrum_wallet", "type": "aggregate", "operatorVersion": "1"},
    {"id": "join_wallets", "type": "join", "operatorVersion": "1"},
    {"id": "compute_combined_fields", "type": "map", "operatorVersion": "1"},
    {"id": "output_footprint", "type": "output", "operatorVersion": "1"}
  ],
  "edges": [
    {"fromNode": "source_ethereum", "fromPort": "rows", "toNode": "normalize_ethereum", "toPort": "rows"},
    {"fromNode": "normalize_ethereum", "fromPort": "rows", "toNode": "aggregate_ethereum_wallet", "toPort": "rows"},
    {"fromNode": "source_arbitrum", "fromPort": "rows", "toNode": "normalize_arbitrum", "toPort": "rows"},
    {"fromNode": "normalize_arbitrum", "fromPort": "rows", "toNode": "aggregate_arbitrum_wallet", "toPort": "rows"},
    {"fromNode": "aggregate_ethereum_wallet", "fromPort": "rows", "toNode": "join_wallets", "toPort": "left"},
    {"fromNode": "aggregate_arbitrum_wallet", "fromPort": "rows", "toNode": "join_wallets", "toPort": "right"},
    {"fromNode": "join_wallets", "fromPort": "rows", "toNode": "compute_combined_fields", "toPort": "rows"},
    {"fromNode": "compute_combined_fields", "fromPort": "rows", "toNode": "output_footprint", "toPort": "rows"}
  ]
}
```

This is a topology projection, not an executable specification: node configuration, source entries, query plans, output schema, refresh policy, and resource policy are intentionally omitted. The current evaluator fixture uses a related multi-view shape, but it is not live source or runtime evidence. If the request instead asks for one combined feed of compatible Ethereum and Arbitrum rows, the correct composition is `Normalize Ethereum + Normalize Arbitrum -> Union -> Output`; it must not use Join. Filter is added only for a required predicate that was not already and equivalently enforced by the validated source query.

## 13. Proposed File Ownership

The existing `backend/harness/` folder remains the design home; no duplicate harness tree is needed.

```text
backend/harness/
  planner-orchestration.md   # This stage/controller and Builder handoff contract
  schemas/
    semantic-plan.schema.json
    source-need.schema.json
    source-binding.schema.json
    query-intent.schema.json
    composition-intent.schema.json
    planner-result.schema.json
  prompts/
    interpret-intent-v1.md
    select-sources-v1.md
    compose-dag-v1.md
    repair-artifact-v1.md
  catalogs/
    graph-query-recipes/
    operator-registry/
    semantic-templates/
  fixtures/
    planning-cases/
    source-schemas/
    query-plans/
    dag-golden/

backend/src/modules/agent/harness/
  controller.ts
  stages/
    interpret.ts
    discover.ts
    bind-sources.ts
    compile-queries.ts
    compose.ts
    assemble.ts
    validate.ts
    present.ts
  schemas/
  context.ts
  dispatcher.ts
  checkpoints.ts
  limits.ts
  model-port.ts

backend/src/modules/graph/
  metadata-adapter.ts
  query-compiler.ts
  query-validator.ts

backend/src/modules/dag/
  registry.ts
  template-compiler.ts
  spec-assembler.ts
  validator.ts
  schema-inference.ts
  simulator.ts
```

Schemas in the design folder are proposed source records until implemented and generated/validated from the authoritative TypeScript contracts. Do not maintain two divergent schema definitions. Route handlers coordinate application commands; they do not contain prompts, source ranking, GraphQL construction, or graph algorithms.

## 14. Implementation Order After Design Approval

1. Resolve H1 for exact Source, Filter, Map, Aggregate, Union, Join, Output, expression, port, null, numeric, and resource schemas.
2. Add strict schemas and golden examples for all intermediate artifacts and final result variants.
3. Implement the actual registry, node-ID allocator, spec assembler, schema inference, DAG validator, and Builder projector without a model or network.
4. Implement query recipes/compiler/validator against pinned SDL fixtures.
5. Implement Graph metadata search/inspection and candidate scoring with verified non-paid capability boundaries.
6. Add the three model passes behind the provider-neutral model port and stage-specific prompts.
7. Add bounded repairs, H2 checkpoints/recovery, traces, redaction, and planner evaluation.
8. Connect Proposal `specification` to the existing Builder codec and server-side structured-edit validation.
9. Validate H3 with one real existing Subgraph case before enabling authorized live preview/build execution.

The first implementation test should be a fully deterministic golden path from `SemanticPlan + inspected schema fixtures` to a canonical spec and Builder projection. Model quality and live provider behavior are tested separately so a semantic-planning failure cannot be confused with a compiler/runtime failure.

## 15. Non-Goals

- Creating or deploying new Subgraphs or Subgraph Composition.
- Allowing the model to return raw executable code or arbitrary GraphQL.
- Giving the model a generic browser, shell, filesystem, database, HTTP, MCP, wallet, payment, deployment, or publication tool.
- Running live data queries during ordinary planning.
- Treating fixture simulation as live validation.
- Coupling canonical specifications to React Flow, canvas coordinates, localization, or visual styling.
- Automatically accepting, building, spending, deploying, or enabling x402 after a proposal is generated.
