# Harness Workflow

Draft 0.2. See the [overview](README.md), [tools](tools.md), and [constraints](constraints.md). Stage names below are orchestration labels, not new PostgreSQL status enums.

## 1. Planning Stages

| Step | Input | Work and responsible component | Output / exit condition |
|---|---|---|---|
| P0. Admit | Authenticated message, session, optional product/parent version and access selections | Controller verifies ownership, parent, message size, command deduplication, and platform planning allowance; redacts secrets before any model call | Trusted context and durable planning command, or typed rejection; M1/H2 persistence gates apply |
| P1. Specify meaning | Sanitized intent and relevant conversation decisions | Model extracts required facts, dimensions, metric definition, time boundaries, units, null/error policy, and refresh intent; deterministic schema checks the result | SemanticPlan, or a small clarification; ambiguous denominator/time/access choice is not guessed |
| P2. Find sources | Required facts and user network/protocol scope | Model calls bounded source discovery through the Graph metadata adapter | Ranked candidates with provider evidence; no raw data query or invented source IDs |
| P3. Verify source fit | Candidate handles and required fields/period | Inspect real schema/identity, resolve immutable deployment, check types and mapping; distinguish schema support from observed historical coverage | SourceBinding and CoverageReport; unavailable facts cause needs_input/unsupported, not a fabricated query |
| P4. Compile source queries | Validated snapshot, field mapping, time specification, selected access references | Typed query compiler constructs a static GraphQL AST/document and variable bindings; query validator checks schema, pagination, block and cost bounds | QueryPlan with hashes and diagnostics; no request sent to the data gateway |
| P5. Compose operators | SemanticPlan, QueryPlans, actual runtime registry | Model chooses supported operators or reviewed semantic templates; deterministic expansion assembles only primitive nodes in canonical spec schemaVersion 2 | Candidate DataProductSpec, inferred output schema, and source-to-metric lineage |
| P6. Validate and simulate | Candidate spec, pinned registry, approved fixture or retained test evidence | Deterministic DAG validator and offline simulator check structure, semantics, resource bounds, and testable examples; controller permits at most two model repairs | ValidationReport plus honestly labeled simulation result; no claims of live correctness from fixtures |
| P7. Present | Validated proposal or unresolved diagnostics | Controller produces the API Proposal and version diff; stores only approved visible content/evidence | Actionable proposal, clarification, unsupported result, or command failure; no accepted product version or running build |

Planning is a bounded loop, not a requirement to execute each tool exactly once. P3 may return to P2 for another candidate and P6 to P4/P5 for a repair. Both consume the same command budget. No loop can reset counters by renaming a node, changing tool-call IDs, or creating a child Agent.

### P0: Context Is Supplied by the Server

Context includes verified user/workspace/session identity, optional parent spec and hash, structured prior decisions, approved access-reference metadata, deployed registry versions, and current limits. Identity, budget ceilings, allowed networks, tool permissions, and payment authority are not writable model fields.

Do not load every conversation or entire data artifact into the prompt. Use bounded recent messages plus validated decisions and source/schema slices; missing evidence remains missing. A summary cannot grant authority or replace its originating evidence. The planner has no database connection, secret-manager client, signer key, or deployment credential.

### P1: SemanticPlan

Proposed internal shape, schemaVersion 1:

```json
{
  "schemaVersion": 1,
  "summary": "Compare repeat activity by protocol",
  "requirements": {
    "dataNetwork": "eip155:8453",
    "facts": ["protocol_identity", "wallet_identity", "activity_timestamp"],
    "grouping": ["protocol"],
    "metric": {
      "numerator": "wallets active on at least two distinct UTC dates",
      "denominator": "all wallets active in the same protocol and interval",
      "zeroDenominator": "null"
    },
    "window": {"kind": "complete_utc_days", "days": 30},
    "refresh": {"mode": "scheduled", "cronExpression": "0 0 * * *", "timezone": "UTC"},
    "incompleteData": "fail"
  },
  "assumptions": [],
  "unresolved": []
}
```

This is a proposed intermediate document, not a replacement top-level DataProductSpec schema or proof of source availability. Metric descriptions must be grounded in typed mappings and expressions by P5; runtime behavior never interprets these prose strings. The example metric and cadence need human review, not automatic adoption for every request.

Ask about material uncertainty, such as whether "repeat" means distinct transactions or distinct days, whether addresses are grouped per protocol, and whether an incomplete interval is acceptable. Harmless display naming can use a visible assumption. Never silently narrow the network, time range, or population to fit a convenient source.

### P2-P3: Evidence, Not Source Name Matching

For each candidate preserve logical Subgraph ID, resolved gateway Deployment ID, manifest CID when observed, chain, schema hash, observation time, and field-level evidence. A protocol label or matching schema family alone does not prove metric compatibility. A source listing is lower-confidence evidence than inspected fields; neither proves data completeness.

CoverageReport independently reports schema fit, historical coverage, indexer freshness, and extraction completeness. During planning, coverage may remain `unverified` if proving it needs a metered query. A proposal can be actionable with a clearly disclosed live-coverage check pending Build, but not with a known missing required field. P6 must distinguish passed static checks from these deferred checks; it must not present overall live validation as passed.

Source inspection may append a candidate/validated snapshot through the trusted domain service. That records verified identity/schema facts only; `validated` snapshot status is not a guarantee of all historical rows. An immutable snapshot cannot be edited to conceal schema drift.

If no existing subgraph fits, return `SOURCE_FACTS_UNAVAILABLE` with the missing facts and an optional proposed alternative. Do not create a source manifest, run a Graph deployment CLI, deploy a contract, scrape arbitrary sites, or label a synthetic dataset live.

### P4-P5: Lower Into the Existing Spec

The compiler resolves candidate handles to authorized sourceSnapshotId values and validates user-selected access references. It may not choose wallet spending because a key is missing. Without an access selection, return a clarification rather than an executable spec with fake IDs.

The source compiler emits only validated GraphQL queries and typed variable bindings. The operator compiler emits `{id, type, operatorVersion, config}` nodes and explicit fromNode/fromPort/toNode/toPort edges. Preserve the schemaVersion 2 envelope in data-model.md; labels, layout, and localized explanations are separate.

At each phase the model may submit a bounded structured candidate to the controller. The controller validates its envelope, records it under the proposed checkpoint schema, and assigns a scoped proposalRef/requirementsRef before validation tools use it. This creates neither an accepted product version nor authority. Models cannot invent references to material that was never admitted, and repairs create distinct candidate revisions rather than changing an already accepted spec.

The canonical spec must encode all executable semantics, including interval calculation, selected fields, unit conversions, null policy, aggregation definitions, ordering, and output schema. Do not leave essential behavior only in a chat summary or SemanticPlan. [Operator design](operators.md) proposes the required configuration schemas for review H1.

P5 may use `templates.read` and `templates.expand` with pinned versions and typed bindings. Validate their expanded nodes, edges and budgets through the same compiler. Retain a separately validated compilation-provenance sidecar under H1/H2; never put semantic template nodes into the runtime DAG. Parameter edits create new proposals and show window/threshold/population diffs; accepted and active versions remain untouched. See [semantic templates](semantic-templates.md).

### P6-P7: Verification and Honest Presentation

Run pure schema/query/DAG checks even when a model says its plan is valid. A deterministic test can disprove a proposal, but a tiny sample cannot prove complete source coverage or semantic correctness for arbitrary data. Production source bindings stay intact when simulation injects fixtures; it never swaps the accepted source with a fixture reference.

For a failed validation, return structured paths/codes and permit a bounded repair of the unaccepted candidate only. Do not relax a policy, increase budgets, remove required data, or change user semantics as an automatic repair. After the cap, return the remaining limitations to the user.

The final proposal contains assumptions, source evidence, pending live checks, access mode, output schema, typed DAG, refresh semantics, resource bounds, and a semantic diff for edits. Bounds are not a fabricated cost quote. The model cannot populate an acceptedVersionId, validatedAt, readyAt, successful run, or deployment pointer.

A planning command can succeed by returning a useful clarification or unsupported result; command success is not build readiness. Waiting for a human reply finishes that planning command rather than retaining a worker lease indefinitely. The next explicit message gets its own bounded command while retaining prior decisions and workspace-level admission accounting.

## 2. Approval and Execution Stages

| Step | Required authority | Work | Durable outcome |
|---|---|---|---|
| A0. Accept proposal | Creator action, expected proposal/parent hash | Product service revalidates and creates an immutable version; bind an unbound session if needed | data_product_versions and source projections; no payment or deployment |
| A1. Start Build/preview | Separate creator command, pinned version/hash, explicit x402 acknowledgment when applicable | Recheck readiness, budgets, access and resource limits; transactionally dispatch one logical run | execution_runs, run_attempts, trace stream; never execute on a frontend timer |
| E0. Freeze execution context | Worker executing accepted command | Resolve stable time interval, source block/identity, exact adapters/registry, and input bindings before data work | Immutable RunContext evidence; retry uses the same context, not a new current time/block |
| E1. Retrieve source pages | Worker-only Graph adapter | Query validated deployment, enforce cursor/block consistency, check coverage and errors; use explicit API-key or x402 path | source_requests, HTTP attempts, artifacts, usage and confirmed expense evidence |
| E2. Execute operators | Deterministic runtime | Evaluate dependency-ready pure nodes over validated artifacts with row/type/memory limits | node_runs, typed artifact bindings, node outputs and diagnostics |
| E3. Materialize | Trusted worker after all gates pass | Validate exact output schema, completeness and size, record freshness, finalize once | Ready materialization and successful run; no initial deployment activation |
| A2. Deploy / publish | Separate creator commands | Existing deployment and optional x402 publication services perform their own checks | Active pointers change only under the reviewed contract; planner tools cannot trigger this |

Accepted scheduled refreshes use the already authorized schedule/version and current budgets, not a new LLM decision on every tick. They need not ask the creator every time, but must stop on revoked authority, changed policy, unavailable source, or exhausted budget. The planner cannot create or resume that authorization by writing prose.

A failed build does not trigger an automatic new paid build to "repair" its query. Show the failure and propose a new version if semantic changes are necessary. Payment uncertainty must be reconciled first. A successful build and deployment activation remain separate under API model gate M3.

## 3. Persistence and Recovery Mapping

| Harness record | Proposed home | Boundary |
|---|---|---|
| Visible input, clarification, proposal, tool summary | agent_messages.content_text/content_json | Versioned allowlisted variants; no raw model reasoning or secrets |
| Planning progress, call reservations, tool idempotency/outcome | M1 command/checkpoint refinement, review H2 | No new harness_jobs table or free-form checkpoint blob assumed |
| Source identity and schema | source_snapshots | Immutable validated facts, workspace-owned |
| Accepted specification and semantic lineage | Canonical spec plus validated proposal/evidence references | Every runtime semantic must be in the accepted spec; H1 shapes reviewed first |
| Live execution parameters | artifacts with artifact_kind evidence, proposed RunContext schema | Same run; singleton creation under run lock; no new artifact kind; review H2 before use |
| Run, attempt, node, page, payment, output | Existing execution/source/artifact/payment entities | Preserve distinct logical work and physical attempts |
| Build explanation | trace_streams and trace_events | Reproducible summaries, source references and validation facts, not hidden reasoning |

RunContext must include schemaVersion, runId, specHash, registryHash, interval per source, resolved block per source, query/variable hashes, runtime/adapter versions, and provenance references. It is frozen once before the first related data side effect; unknown block metadata must be resolved through an authorized, metered source operation when needed. No provider request can bypass source accounting by being called a "metadata probe."

Use queued_at as the proposed stable run time anchor, not the current retry time. If source resolution itself requires paid metadata queries, persist a partial initialization checkpoint and reconcile those requests before finishing the immutable RunContext. H2 must define this initialization and uniqueness; do not make payment before its recovery identity is durable.

On restart, reload trusted command state and committed tool results. Never reset model/tool/spend counters or re-run uncertain actions blindly. Completed retained source/node artifacts may be reused only for the same run, matching spec/context/input hashes and authorized lineage. A new node attempt cannot create a second purchase merely because its node_run_id changed; H2 covers the cross-attempt request mapping.

## 4. Frontend and HTTP Integration

Use the existing [Builder interface proposal](../../docs/api/products-builder.md): message submission and command polling for P0-P7; proposal acceptance for A0; build-preflight and runs for A1; run/trace/output reads for E0-E3; deployment endpoints for A2.

There is no new browser endpoint that accepts arbitrary tool names or shell scripts. DAG inspection renders actual node IDs, configurations and typed edges. The frontend's synthetic seven-node example now has a four-card semantic overview and read-only expansion; it is not a fixed runtime pipeline or source/schema evidence. Local parameter edits do not persist versions, and simulated trace completion never means a deployed endpoint.

Internal progress labels map to visible events such as intent_clarified, source_inspected, query_compiled, dag_validated, simulation_completed, and proposal_ready. These are proposed typed event variants, not new trace status values. Unavailable evidence displays as pending/blocked. Cancelling a browser request only stops observation; explicit cancellation follows the existing command/run contract.
