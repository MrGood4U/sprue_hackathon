# Query and Operator Contract

Draft 0.3. This proposes the exact bounded language behind "turn intent into operators." It is not a shipped registry. Review H1 before implementing configuration schemas; preserve the approved [canonical spec envelope](../../data-model.md#canonical-data-product-specification).

## 1. Compilation Layers

| Layer | Produced by | Representation | Authority |
|---|---|---|---|
| Meaning | Model and human clarification | SemanticPlan with facts, population, units, interval, numerator/denominator and errors | Untrusted proposal until clarified and validated |
| Source plan | Query compiler against inspected SDL | Static GraphQL document, typed variables, extraction mapping and pagination | Validated source semantics; no data request yet |
| Execution definition | Model composition plus deterministic compiler | schemaVersion 2 DataProductSpec with typed operator nodes and edges | Immutable only after creator acceptance |
| Execution plan | Deterministic compiler | Topological order, schemas, resource counters, pinned function references | Rebuilt from matching spec/registry; never arbitrary code |
| Runtime values | Authorized worker | Frozen context and validated artifacts | Source/payment provenance required for live claims |

Display names such as "Group by Protocol" are not operator identifiers. The same operator can appear multiple times with different parameters, and different user requests can produce different DAGs. The model selects registered operations; it does not define a new operation implementation.

## 2. Confirmed MVP Scope and Proposed Configuration

The human approved these seven operator types on 2026-09-05; their exact configuration and numeric/null schemas remain H1 review work. Each has operatorVersion `1` once implemented. Source is the only network-capable operator; its I/O is performed by the trusted Graph adapter, not an expression evaluator.

| Type | Ports | Proposed configuration | Semantics and constraints |
|---|---|---|---|
| `source` | No input; rows output | Existing sourceId/queryDocument/variableBindings/pagination; proposed resultPath, rowSchema and window | Fetch a pinned, bounded subgraph query, extract one inspected root collection, validate every row, preserve provenance |
| `filter` | rows -> rows | `{predicate: Expression}` | Keep rows for which a typed Boolean expression is true; null is not silently truthy; no schema change |
| `map` | rows -> rows | `{fields: Record<string, Expression>}` | Explicit projection/derivation; output contains only named fields; fields read original input, not earlier sibling assignments |
| `aggregate` | rows -> rows | `{groupBy: string[], measures: Record<string, Measure>}` | Group on typed keys; count_rows, count_distinct, sum, min and max over declared fields; explicit memory limits |
| `union` | rows[] -> rows | Proposed `{inputs: string[], sourceDiscriminator?: string}` | Append rows from multiple inputs only after schema-compatible normalization; preserve source lineage when the product semantics require it; reject incompatible fields and unbounded input fan-in |
| `join` | left rows + right rows -> rows | Proposed `{keys: JoinKey[], type: inner-or-left, cardinality, collisionPolicy, nullPolicy}` | Match two inputs on explicit typed keys; reject implicit many-to-many fan-out, missing keys and unbounded output estimates; exact key/cardinality semantics remain H1 |
| `output` | rows input; final rows output | `{orderBy: [{field, direction}], nullPolicy: reject_unexpected}` | Validate exact outputSchema, stable total ordering, row/byte bounds; pass final artifact to materializer, not API publication |

The diagram uses `rows -> rows` as port notation, not an arrow field in serialized edges. Canonical edges still use fromNode/fromPort/toNode/toPort. Source/port schema inference must prove each downstream field reference exists and has a compatible type.

GroupBy is initially aggregate configuration, a rolling interval is source window configuration, and Score is a map expression. No separate window/group/score node is required merely because the frontend has a similarly named fixture card. Union and Join are now explicit MVP operators for multiple existing Subgraph results. Sort/top-k, arbitrary window functions, external HTTP enrichment and custom-code operators remain deferred; register them only after semantics, bounds, tests and human scope review.

Output sorting is for deterministic serving, not an undeclared top-k operation. A requested ranking/top-N transformation remains unsupported until explicitly modeled; transport preview/limit does not change the metric. No silent truncation converts an incomplete aggregate into a successful final output.

### Registry Implementation Contract

The confirmed existing-Subgraph boundary applies to every operator. A source queries an already available deployment; no operator or compilation target may create or deploy a Subgraph or Subgraph Composition. Prefer supported source-query filters/projections and existing derived fields only after verifying equivalent semantics. Do not invent query capabilities, silently rewrite accepted versions, or add unnecessary transforms; source and output validation remain required. The runtime supports multiple explicit source entries and the seven-type allowlist, while the source adapter remains responsible for one pinned query per source node.

Each entry contains configSchema, inputPorts, outputPorts, inferOutputSchema, validateSemantics, estimateResources, and execute, plus type/version and determinism guarantees. Functions are developer-owned code resolved by a frozen registry, never names dynamically imported from a user path. Changes to semantics require a new operatorVersion; do not keep version 1 while changing rounding, null behavior or aggregation meaning.

The registry hash covers versioned definitions and implementation identity. Executions pin runtimeVersion and registryHash; a worker missing the pinned version returns RUNTIME_VERSION_UNAVAILABLE instead of substituting its newest operator. Compiler output may be cached by specHash/registryHash but is not an independent editable source of truth.

[Semantic templates](semantic-templates.md) provide Wallet Activity and Repeat Activity as compile-time expansions into these operators, not extra runtime types. The expanded primitive spec remains the only execution definition; template provenance is persisted separately under approved H2/model 1.5; its exact executable validation remains H1.

## 3. Types and Expression Language

Use a small typed expression AST, not JavaScript, Python, SQL, JSONata, arbitrary templates or evaluated strings. No loops, recursion, callbacks, user-defined functions, filesystem, imports, network, environment access, randomness or current-time lookup.

Proposed scalars: Boolean, UTF-8 string, bounded signed integer, fixed decimal, UTC timestamp, and explicitly nullable forms. Integer/decimal values travel as strings with validated precision/scale; never infer a monetary unit from a field name or cast onchain amounts through JavaScript number. Monetary source amounts require inspected asset/decimals mapping before aggregation. No implicit mixing of assets, networks or units.

Allowed AST operations initially:

- field with a validated field path, and literal with a declared scalar type;
- eq, ne, lt, lte, gt, gte, and, or, not over compatible types;
- add, subtract, multiply, safe_divide with checked precision/scale;
- if with a Boolean condition and compatible result branches;
- utc_date for an explicitly normalized UTC timestamp;
- narrowly specified integer/decimal/timestamp conversions with parse/overflow rejection.

Field paths are arrays of inspected field segments, never executable strings or dynamic object lookups. Reject prototype-sensitive keys, excessive nesting and unbounded collections. The first expression language has no regex, arbitrary JSONPath, dynamic property generation or locale-dependent string comparison.

No implicit null coercion: a nullable field must be checked or resolved through an explicit allowed branch before a non-null operation. Missing required fields, invalid timestamps, unit mismatch, overflow and invalid predicate types fail validation or execution. For safe_divide, zero denominator returns null and the inferred output is nullable. The proposed metric ratio uses six decimal places with half-even rounding, represented as a decimal string; review H1 fixes this behavior before tests and implementation.

Example map node, a configuration excerpt rather than a complete executable spec:

```json
{
  "id": "classify_repeat_wallet",
  "type": "map",
  "operatorVersion": "1",
  "config": {
    "fields": {
      "protocol": {"op": "field", "path": ["protocol"]},
      "isRepeat": {
        "op": "if",
        "args": [
          {"op": "gte", "args": [{"op": "field", "path": ["activeDays"]}, {"op": "literal", "type": "integer", "value": "2"}]},
          {"op": "literal", "type": "integer", "value": "1"},
          {"op": "literal", "type": "integer", "value": "0"}
        ]
      }
    }
  }
}
```

Measure shapes: `{op: count_rows}` needs no field; `{op: count_distinct, field}` counts exact distinct typed values; sum/min/max require an existing compatible field. groupBy fields must be non-null, or an explicit prior mapping must define the intended missing-key population. Measures may not reference each other's outputs. Large intermediate group/distinct state fails with RESOURCE_LIMIT_EXCEEDED; approximate counts are a different, currently unsupported semantic.

## 4. Source Query Rules

Before accepting queryDocument:

1. Parse a single named GraphQL query; reject mutation/subscription, multiple operations, unapproved directives/introspection, fragment cycles and unsupported scalar coercions.
2. Validate all entities, fields, nested selections, arguments and variables against pinned SDL. Allow only the reviewed collection shape and metadata selection. Prevent aliases or fragments from bypassing depth/field/root limits.
3. Require bounded first/page size and deterministic cursor pagination. Prohibit large skip offsets and unconstrained nested collection fan-out. Extra business root collections need separate source nodes and accounting; `_meta` is explicit provenance, not hidden business data.
4. Bind time and block variables from frozen server context, and page cursor/size from the adapter. Other literals are typed, bounded and pinned in config. No variable source can resolve a secret, arbitrary URL, wallet destination or system environment.
5. Use an inspected resultPath and row schema. Normalize timestamps/units using explicit mappings. Do not assume an ID's type, monotonic cursor order, historical block support or timestamp field from a generic example.
6. Include and verify available `_meta` provenance, requested/returned block identity, manifest mapping and indexing errors. IDs from different provider surfaces require verified mapping, not string equivalence guesses.
7. Bound query bytes/depth/complexity, total pages, rows, response bytes and retries. A full last page at the row/page ceiling is not proof of completeness: fail or perform an already-budgeted bounded completion check; never publish a silently truncated metric.

Static validation never proves provider completeness. Build verifies extraction, requested interval coverage, source freshness and errors. If the provider cannot supply the required evidence or capabilities, the selected metric/source combination stays blocked or is revised by the creator.

### Time and Block Determinism

For proposed complete_utc_days, end is UTC midnight at or before the run's stable anchor and start is exactly N calendar UTC days earlier; use the half-open interval [start, end). Do not recalculate boundaries on retry. A seven-day and a thirty-day request create different configurations, not a hidden environment setting.

The source window configuration declares this calculation; variableBindings uses the model's run.window.start/end references resolved within that source context. Source block selection follows an adapter-verified policy and is frozen before the associated paginated data query. Metadata probing, including block discovery when metered, counts as source work under the existing access mode. Timestamp filters and pinned blocks solve different problems; neither alone proves an event history is complete.

## 5. Worked Compilation Example

Illustrative user request: "For each protocol, report the share of active wallets that were active on at least two UTC dates in the last 30 complete UTC days; refresh daily." This refines the frontend's DEX stickiness story for review; it is not a confirmed production metric or a claim that a particular live subgraph has these fields.

Required raw facts are protocol identity, wallet identity and event timestamp at wallet-event granularity. Daily protocol-level totals alone are insufficient. If multiple chains were in scope, network must participate in wallet/group identity; the first example is one explicit data network.

| Node | Operator | Meaning / output |
|---|---|---|
| activity | source | Query bounded event rows within the complete interval at one pinned block |
| normalize_day | map | Keep protocol and wallet; convert timestamp to UTC date with declared units |
| wallet_activity | aggregate | groupBy protocol/wallet; activeDays = count_distinct(date) |
| classify_repeat_wallet | map | Keep protocol; isRepeat = 1 when activeDays >= 2, otherwise 0 |
| protocol_activity | aggregate | groupBy protocol; activeWallets = count_rows, repeatWallets = sum(isRepeat) |
| compute_ratio | map | Keep counts and protocol; repeatShare = safe_divide(repeatWallets, activeWallets) |
| result | output | Validate schema and stable protocol ordering; no API or x402 side effect |

All adjacent edges connect rows to rows. This seven-node path uses four of the five scoped operator types; filter is unnecessary here. Crucially, do not filter out one-day wallets before computing the denominator. That would produce the wrong metric, often 100%, despite a syntactically valid DAG.

Small synthetic fixture after timestamp-to-date mapping, entirely within the chosen interval:

```json
[
  {"protocol": "alpha", "wallet": "wallet_a", "date": "2026-08-27"},
  {"protocol": "alpha", "wallet": "wallet_a", "date": "2026-08-28"},
  {"protocol": "alpha", "wallet": "wallet_b", "date": "2026-08-27"},
  {"protocol": "alpha", "wallet": "wallet_b", "date": "2026-08-27"},
  {"protocol": "beta", "wallet": "wallet_a", "date": "2026-08-29"}
]
```

These symbolic wallets are test labels, not valid chain addresses. The two wallet_b rows represent different events on the same date; the runtime must separately detect a replayed source cursor/event ID when provider pagination duplicates a physical event.

Expected final result:

```json
[
  {"protocol": "alpha", "activeWallets": "2", "repeatWallets": "1", "repeatShare": "0.500000"},
  {"protocol": "beta", "activeWallets": "1", "repeatWallets": "0", "repeatShare": "0.000000"}
]
```

With no input rows, this grouped metric returns an empty array, not invented zero-population protocols. A synthetic test does not satisfy the Graph sponsor's live-data requirement. Live data, lineage, pagination/coverage evidence and independently checked results remain mandatory for the real demo.

## 6. Acceptance Checks

Reject unknown types/versions/config fields, duplicate IDs, cycles, disconnected/dead nodes, missing inputs, invalid ports, unreachable output, extra output nodes, unsatisfied field/unit constraints, unbounded expressions, unsupported source semantics, resource excess and inconsistent output schemas. Every accepted node must reach the single output. The first runtime supports DAGs, not loops or recursive feedback edges.

The data-model example uses abbreviated query/config fields for illustration; it is not a complete executable operator schema. This document proposes those missing details under H1, without silently approving executable schemas through model 1.5. The canonical illustration and frontend fixture now show the same seven-node denominator-safe composition. This corrects examples only, not schema approval or a shipped runtime; after H1 approval, publish complete schemas and reject older incompatible shapes explicitly.
