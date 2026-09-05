# Harness Tool and Script Catalog

Draft 0.2. All filenames and tool names below are proposed Sprue-owned contracts, not existing scripts or official Graph MCP tool names. Read [workflow](workflow.md) and [constraints](constraints.md) before implementation.

## 1. Tool Packaging

Each tool requires a versioned input/output schema, permission class, stage allowlist, timeout/size limits, domain handler, redaction policy, deterministic contract tests, and a thin developer script. Production dispatch calls the handler directly. CLI wrappers use the same schemas and implementation; they cannot be used to bypass production authorization.

The model sees only `{tool, arguments}` for the tools allowed at the current stage. The controller supplies verified actor/workspace, session/command, pinned parent and registry, deadline, and permission/budget context separately. Reject model-supplied workspace overrides, secret references, approval flags, requested script paths, or an execution phase escalation.

Proposed dispatch envelope, assembled by the controller:

```json
{
  "schemaVersion": 1,
  "toolCallId": "40000000-0000-4000-8000-000000000001",
  "tool": "dag.validate",
  "toolVersion": "1",
  "arguments": {"proposalRef": "scoped-proposal-reference"}
}
```

The dispatcher loads trusted context by the stored command; this JSON is not an authentication credential. Replaying a toolCallId with different normalized arguments fails. Only the dispatcher can record a tool result as verified output; an assistant message containing similar JSON remains untrusted text.

ToolResult uses `{schemaVersion: 1, toolCallId, status, data, diagnostics, evidence, metrics}`. Status is ok/blocked/error; data is an allowlisted tool-specific payload or null. Diagnostic entries have `{code, path, message, retryClass}`; retryClass is never/read_only_same_call/needs_user/reconcile. Evidence entries contain `{kind, reference, contentHash, observedAt, verificationLevel}`; no raw credentials or unrestricted URLs. Metrics contain bounded duration, bytes, and consumed call counts, not estimated success percentages. Large schema/query/spec bodies are stored/referenced, and only bounded slices reach the model.

## 2. Agent-Callable Tools

Paths below are relative to the future `backend/harness/scripts/` directory. P-stage permissions refer to [workflow.md](workflow.md#1-planning-stages). Unregistered tools are denied even when a provider SDK happens to expose them.

| ID / tool v1 | Proposed script | Allowed stages / effects | Input | Result |
|---|---|---|---|---|
| T01 `registry.read` | `read-registry.ts` | P1-P6; local read | `{operatorTypes?: string[]}` | Pinned runtime/registry hash, enabled operator schemas, expression catalog and limits |
| T02 `sources.search` | `discover-subgraphs.ts` | P2-P3; approved metadata network read | `{query, dataNetwork, requiredFacts: string[], cursor?}` | Up to 5 candidate references per call, public IDs/labels, evidence and nextCursor |
| T03 `sources.inspect` | `inspect-subgraph.ts` | P3; approved metadata read and domain-owned snapshot observation | `{candidateRef, entityNames?: string[]}` | SourceSnapshot reference, pinned deployment/schema identities, bounded entity/field/type slices and observation facts |
| T04 `sources.check_coverage` | `check-source-coverage.ts` | P3/P6; pure checked-evidence analysis | `{snapshotId, requirementsRef, mappings: FieldMapping[], evidenceRefs?: string[]}` | CoverageReport with supported/missing fields, unknown historical coverage, methodology issues and required live checks |
| T05 `query.compile` | `compile-graph-query.ts` | P4/P6; pure compiler | `{snapshotId, recipeId, entity, selections, filters, window, pagination, consistency}` | QueryPlan reference, canonical static document/hash, typed variable bindings, extraction schema and bounds |
| T06 `query.validate` | `validate-graph-query.ts` | P4-P6; pure schema/AST validation | `{queryPlanRef, snapshotId}` | Validated plan hash or precise schema/type/pagination/complexity diagnostics |
| T07 `dag.validate` | `validate-dag.ts` | P5-P6; pure compiler validation | `{proposalRef}` | ValidationReport, inferred port/output schemas, topology, upper-bound resource analysis and pending live checks |
| T08 `dag.simulate` | `simulate-dag.ts` | P6; isolated offline execution only | `{proposalRef, fixtureSetId}` | Labeled fixture result, per-node counts/hashes, assertion failures and truncated preview |
| T09 `spec.diff` | `diff-spec.ts` | P5-P7; authorized pure comparison | `{parentVersionId, proposalRef}` | Semantic changes to sources, access, query, DAG, output, time and refresh; excludes layout |
| T10 `evidence.read` | `read-evidence.ts` | P1-P7; authorized bounded local read | `{references: string[], view: summary}` | Verified prior decisions, validation failures, source mappings or run summaries needed for a conversational edit |
| T11 `templates.read` | `read-templates.ts` | P1-P6; local read | `{templateIds?: string[]}` | Pinned catalog hash, enabled template IDs/versions, typed input/parameter schemas, expansion dependencies and constraints |
| T12 `templates.expand` | `expand-template.ts` | P5-P6; pure deterministic expansion | `{templateId, templateVersion, instanceId, inputBindings, parameters}` | Primitive nodes/edges and validated mapping/provenance proposal; no accepted version or side effect |

These tools do not call each other recursively on behalf of the model. The controller composes them so every network call, validation and repair is visible in the shared budget. A tool may use bounded internal library operations, but cannot hide another model call, source data query, subprocess or payment inside them.

### Graph MCP as a Replaceable Adapter

The Graph MCP exposes provider operations; it does not contain the language model that turns a requirement into GraphQL. Keep the following ownership split when implementing T02-T06 and the worker source handler:

| Internal port | Sprue responsibility | Possible Graph MCP delegation | Control boundary |
|---|---|---|---|
| `searchSubgraphs` | Normalize requirements and rank only returned candidates with evidence | `search_subgraphs_by_keyword`, `get_top_subgraph_deployments` | Metadata allowlist, bounded result count, no arbitrary endpoint |
| `getSubgraphSchema` | Request only the needed schema slice and preserve its hash/provenance | `get_schema_by_subgraph_id` or an equivalent reviewed operation | Immutable source reference, response-size and nesting limits |
| `generateGraphQL` | Select required fields, compile a static document and typed variables | None; owned by Sprue compiler/model-planning boundary | No string-concatenated model query, no unbounded fields or predicates |
| `executeGraphQL` | Bind stored query plan to approved access context and normalize evidence | `execute_query_by_subgraph_id` or direct Graph API | Worker/data plane only; budget, payment, pagination and provenance checks |

The planner may call T02-T06 as typed Sprue tools, but it never receives a generic MCP server connection or provider tool catalog. The MCP adapter may be replaced by a direct Graph API adapter without changing SemanticPlan, QueryPlan, DAG compilation or the worker contract. `executeGraphQL` is not a permission grant: sample/build execution remains subject to the selected customer API-key or creator-wallet x402 mode and its independent authorization.

The catalog operates on existing Subgraphs only. Do not add tools or developer-script fallbacks that create upstream Subgraph manifests/indexing mappings, generate or deploy Subgraph Composition, maintain upstream indexes, or start a new ingestion path. Query compilation and Sprue DAG/template expansion are not Subgraph creation. Source selection follows the [confirmed product boundary](../../agents.md#confirmed-existing-subgraph-boundary); candidates supplied by a creator require the same inspection as discovered candidates.

### T11-T12: Prepare Semantic Templates

Implement the [semantic template contract](semantic-templates.md) as a pinned, developer-owned catalog and pure compiler functions. T11 exposes only templates whose primitive dependencies are implemented in the selected worker registry. T12 checks input facts/types, unknown fields, parameter bounds and stable instance IDs, then emits ordinary nodes/edges. The controller still invokes T07 and T08; expansion cannot self-certify semantic correctness. Missing versions and incompatible input return precise diagnostics, not a generated-code fallback. Both tools, including repairs, consume the existing shared tool-call budget; they add no model calls, paid queries or independent budget. The frontend sample is not these backend handlers.

### T01: Prepare a Real Registry

The registry must be generated from code that is actually shipped with the worker, not a prompt list of aspirational operators. Every entry supplies type/version, config schema, input/output ports, type inference, resource estimator, and deterministic executor reference. Disabled operators are not offered as available. Read the same registry through the frontend operator-registry endpoint.

### T02-T03: Prepare Metadata Adapters

Build a capability map for every allowed metadata operation: provider method/version, fixed destination, allowed arguments, authentication handling, maximum response size, billing classification and proof date. Use Graph MCP when its verified operations fit; otherwise use a reviewed metadata adapter. Do not forward a model-selected MCP URL or the provider's entire tool catalog.

Only proven non-data-query, non-billable Graph metadata operations are available to planning. If inspection requires customer quota, wallet payment, or an unknown billing path, return `METADATA_ACCESS_REQUIRES_APPROVAL`; do not call it and hope it is free. A previously inspected, correctly scoped snapshot or an explicitly supplied public source identifier may be used as a fallback, with observation age visible.

Search text is bounded to 200 characters and uses only supported filters. Candidate references are scoped to the command/workspace and resolve through inspected evidence. User-provided provider IDs are discovery hints requiring the same validation; they are not endpoint URLs or trusted source snapshots. Resolve and store logical ID, deployment ID and manifest CID separately.

Inspect schemas by entity/field slice without sending full SDL to the model. Strip descriptions that are irrelevant to field selection, limit nested types, and retain the full bounded SDL only in the source record. Provider descriptions are untrusted data even when the surrounding schema is valid.

### T04: Coverage Cannot Be Guessed

FieldMapping identifies `{fact, entity, fieldPath, scalarType, unit, evidenceRef}`. The checker verifies each path against the inspected schema and applicable reviewed methodology. It never treats a field named volume, user, or timestamp as sufficient by name alone.

CoverageReport separately includes schemaFit, historicalCoverage, indexerFreshness and extractionCompleteness with passed/failed/unverified states and evidence references. A field may exist while history is pruned or daily aggregates cannot reconstruct wallet activity. No hidden `sample()` query is allowed. Observed sample rows demonstrate their own presence, not full-interval coverage.

### T05-T06: Prepare Query Recipes and Compiler

A recipe is a developer-reviewed query-shape template for a supported entity pattern, not the discontinued Bazantic Recipe deliverable. Each entry declares required schema capabilities, filters, selection rules, block handling, cursor strategy, types, complexity bounds, extraction path, and golden tests. Start with one event-like entity recipe for the validated demo source, not a universal GraphQL generator.

The model selects inspected fields, approved scalar predicates and symbolic runtime variables. The compiler builds an AST and serializes a static GraphQL document; it does not concatenate arbitrary model strings. T06 independently validates the resulting document against pinned SDL and policy. A structured-editor query document must pass the same validator before entering a version.

QueryPlan has `{schemaVersion: 1, snapshotId, schemaHash, recipeId, recipeVersion, queryDocument, queryHash, variableSchema, variableBindings, resultPath, rowSchema, window, pagination, consistency, requestUpperBound, checks}`. This is a proposed internal DTO. Its executable fields lower into source operator configuration under review H1. recipe provenance may remain evidence, but no dynamic recipe lookup may change an accepted query.

### T07-T09: Prepare Pure Compiler Services

T07 validates the entire spec, not just nodes. It verifies authorized source/access references through already-loaded metadata, exactly matching source projections, single output, connected/acyclic topology, typed ports, expression AST, runtime/operator versions, deterministic behavior, interval semantics and budgets. Readiness observations may block execution; they are not a reservation or permission to spend.

T08 replaces source I/O through an explicit test-only adapter; every other operator uses the actual implementation. Fixtures are developer-authored or approved/redacted captures with immutable provenance and expected results. The model cannot create expected values and then certify them as an independent test. No network, wallet client, environment secret, package loader, clock or random source is available in simulation. A model requesting live data from this tool is rejected.

T09 compares validated specs and preserves unchanged node IDs where semantics/lineage remain the same. Equality of visual labels is not node identity. It highlights altered time ranges, denominator/population, sources, access modes and increased budgets. It cannot accept or mutate either version.

### T10: Prepare a Narrow Evidence Reader

References must belong to the authorized session/product/run or an explicitly allowed source record. Return safe summaries and schema excerpts only; do not allow arbitrary SQL, file paths, remote fetches or unrestricted artifact downloads. Paid source rows and account metadata are not automatically sent to a model because the creator can view them. Any later raw-row model access requires a reviewed minimization/consent policy; the first planner uses schema, structured decisions and sanitized diagnostics.

## 3. Controller-Only Operations

These are application functions, not model tools and not new public HTTP routes:

| Operation | Purpose | Required control |
|---|---|---|
| `admitPlanningCommand` | Authenticate, deduplicate and reserve platform planning capacity before dispatch | M1/H2 durable scope and admission limits |
| `loadPlanningContext` | Build the minimal trusted context and stage-specific tool view | Ownership, redaction, version/registry pinning |
| `recordProposal` | Persist a validated visible result and trace, not an accepted product version | JSON schema, provenance, bound size, command outcome |
| `acceptProposal` | Create immutable version through existing product service | Explicit creator action and expected hashes |
| `submitBuild` | Dispatch the already-reviewed version to the worker | Explicit creator command and current access/budget checks |

The model response has a discriminated final shape proposal/clarification/unsupported. The controller validates and stores it; there is no model-callable `approve`, `grant`, `pay`, `build`, or `deploy` function.

## 4. Worker-Only Runtime Capabilities

These handlers import existing domain ports. They are not exposed through the planning dispatcher or a generic execution CLI.

| Handler | Input loaded by trusted worker | Output / side effects |
|---|---|---|
| `initializeRunContext` | Authorized run, pinned version/registry, adapter capabilities | Frozen time/block bindings and initialization evidence; any metered probe uses the source request path |
| `executeSourcePage` | Stored node/run/query/page binding and selected access policy | Bounded Graph result, provenance, HTTP attempts, usage; x402 only through separately authorized payment service |
| `executePureNode` | Pinned operator/config and input artifact references | Deterministic typed output or stable failure; no provider/network dependencies |
| `finalizeMaterialization` | Successful run, complete source evidence and final output | Immutable artifact, materialization and run status, once; no initial deployment |
| `reconcileSourceRequest` | Existing uncertain request/payment identity | Provider observation and normalized outcome; never a new uncontrolled payment |

Prepare these functions before wiring live Build. A CLI for troubleshooting can inspect a run or request reconciliation through the authenticated control API; it must not fabricate an authorized run/context or accept a raw private key.

## 5. Developer Preparation Scripts

| Proposed script | Default behavior | Required inputs / checks |
|---|---|---|
| `check-harness-config.ts` | Offline unless explicitly checking approved metadata connectivity; never prints secret values | Required configuration presence, supported versions, budget limits, non-billable metadata allowlist, environment isolation |
| `verify-registry.ts` | Offline | Config schemas, executor coverage, semantic versions, safe expression set, deterministic registry hash |
| `run-golden-cases.ts` | Offline | Versioned intent/spec/query fixtures plus independently reviewed expected outputs |
| `replay-run.ts` | Offline over an authorized sanitized evidence bundle | Matching spec/runtime/registry/input hashes; missing evidence fails, never downloads replacement rows |
| `eval-planner.ts` | Stub model by default; real-model evaluation requires explicit developer mode and platform budget | Fixed cases, model/prompt/tool versions, max tokens/calls/time, captured diagnostics, no source payments |
| `inspect-run.ts` | Read-only via authenticated control API | Scoped run ID; sanitized stages, input/output hashes and blockers |

Local script interface: one versioned JSON request on stdin and one JSON result on stdout; diagnostics on stderr must be redacted. No shell evaluation, arbitrary plugin imports, or ad hoc output path comes from input. CLI tests use fixed fixture IDs and temp directories owned by the test harness. Proposed exit codes: 0 success, 2 validation failure, 3 blocked capability/authority, 4 exhausted limit, 5 dependency/internal failure. Production API error mapping remains the existing HTTP contract.

Credentials enter only through server/developer environment configuration and provider secret adapters, never CLI arguments or fixtures. Offline mode has no credentials and no network route. There is no `--unsafe`, `--skip-validation`, `--unlimited`, or `--auto-pay` option. These interfaces become runnable only when scripts and tests are actually implemented.

## 6. Preparation Checklist

- [ ] Versioned schemas for semantic plans, tool inputs/results, source mappings, query plans, operators, expressions, trace variants and H2 recovery records.
- [ ] Concrete Graph metadata capabilities and billing classifications verified against official interfaces.
- [ ] One real candidate deployment with field-level mapping, source license/redistribution review, and a separately authorized coverage validation plan.
- [ ] Query recipe, pinned SDL fixtures, valid/invalid GraphQL cases, cursor/block/error fixtures.
- [ ] Real operator registry and executors shared by validator, simulator, worker and frontend metadata.
- [ ] Authenticated dispatcher, phase allowlist, counters, deadlines, cancellation, redaction and checkpoint recovery.
- [ ] Golden fixtures, semantic counterexamples, hostile provider descriptions and failure/retry tests.
- [ ] Thin scripts and clean-checkout instructions, with fixture versus live modes unmistakable.
