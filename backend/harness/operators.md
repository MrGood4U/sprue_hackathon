# Query and Operator Contract

Draft 0.5. The generic Filter predicate and Sort / Top K contract described below were approved and implemented on 2026-09-10. The remaining exact executable schemas still require H1 review; preserve the approved [canonical spec envelope](../../data-model.md#canonical-data-product-specification).

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

The human approved the original seven operator types on 2026-09-05 and approved Sort / Top K as the eighth type on 2026-09-10. Filter's exact version-2 visual predicate and Sort's exact version-1 contract are approved; the other exact configuration and numeric/null schemas remain H1 review work. Source is the only network-capable operator; its I/O is performed by the trusted Graph adapter, not an expression evaluator.

| Type | Ports | Proposed configuration | Semantics and constraints |
|---|---|---|---|
| `source` | No input; rows output | Existing sourceId/queryDocument/variableBindings/pagination; proposed resultPath, rowSchema and window | Fetch a pinned, bounded subgraph query, extract one inspected root collection, validate every row, preserve provenance |
| `filter` | rows -> rows | `{predicate: {combinator, conditions}}` | Filter already-fetched predecessor rows with typed field conditions; null is explicit; no schema change |
| `map` | rows -> rows | `{fields: Record<string, Expression>}` | Explicit projection/derivation; output contains only named fields; fields read original input, not earlier sibling assignments |
| `aggregate` | rows -> rows | `{groupBy: string[], measures: Record<string, Measure>}` | Group on typed keys; count_rows, count_distinct, sum, min and max over declared fields; explicit memory limits |
| `sort` | rows -> rows | `{orderBy: [{field, direction, nulls}], limit: integer-or-null}` | Stable multi-key scalar sorting; null means full sort and a bounded positive limit means Top K; no schema change |
| `union` | rows[] -> rows | Proposed `{inputs: string[], sourceDiscriminator?: string}` | Append rows from multiple inputs only after schema-compatible normalization; preserve source lineage when the product semantics require it; reject incompatible fields and unbounded input fan-in |
| `join` | left rows + right rows -> rows | Proposed `{keys: JoinKey[], type: inner-or-left, cardinality, collisionPolicy, nullPolicy}` | Match two inputs on explicit typed keys; reject implicit many-to-many fan-out, missing keys and unbounded output estimates; exact key/cardinality semantics remain H1 |
| `output` | exactly one rows input; final rows output | `{fields: string[]}` | Validate and publish the selected final fields while preserving predecessor row order; pass final artifact to materializer, not API publication |

The diagram uses `rows -> rows` as port notation, not an arrow field in serialized edges. Canonical edges still use fromNode/fromPort/toNode/toPort. Source/port schema inference must prove each downstream field reference exists and has a compatible type.

GroupBy is initially aggregate configuration, a rolling interval is source window configuration, and Score is a map expression. No separate window/group/score node is required merely because the frontend has a similarly named fixture card. Union and Join are explicit MVP operators for multiple existing Subgraph results. Arbitrary window functions, external HTTP enrichment and custom-code operators remain deferred; register them only after semantics, bounds, tests and human scope review.

All result ordering and top-N transformations use an explicit Sort / Top K node. Output has no sorting configuration and preserves the order it receives; transport preview/limit does not change the metric. No silent truncation converts an incomplete aggregate into a successful final output.

### Approved Generic Filter Contract

Filter version 2 uses one bounded top-level `and` or `or` group with 1 to 32 conditions. Conditions reference scalar fields from the direct predecessor's inferred output schema. Text, ID, address and bytes fields support equality and bounded membership; integer, decimal, timestamp and date fields also support ordered comparison and an inclusive range; Boolean fields support equality; nullable fields additionally support explicit null checks. Membership lists contain 1 to 50 exact scalar values. Integer and decimal literals remain strings so JavaScript number coercion cannot change them.

The Builder must derive field choices and compatible operators from the direct predecessor, preserve a condition that becomes invalid after an upstream schema change, show the error, and prevent confirmation. It must never silently rename or delete the reference. Object, JSON and list fields remain unavailable until a reviewed flatten/explode operator exists.

Filter executes inside Sprue after the Source adapter has fetched and validated bounded rows. It does not rewrite or push predicates into GraphQL in this version. A future optimizer may push an equivalent predicate only after proving semantic equivalence; that optimization cannot change the canonical Filter contract or result.

### Approved Sort / Top K Contract

Sort version 1 accepts one to eight ordered keys. Every key references a scalar field from the direct predecessor output schema and declares `asc` or `desc` plus independent `first` or `last` null placement. Earlier keys have higher priority. When all keys compare equal, the upstream input ordinal is the final tie-breaker, so results are stable and deterministic. The output schema equals the input schema. JSON, object and list values are not sortable in this version.

`limit: null` performs a complete sort. A positive integer from 1 through 10,000 keeps the first K rows after the same ordering. The runtime may use a bounded heap for Top K, but that optimization cannot change ordering or tie behavior. K is never inferred from a transport preview limit, and a configured K without at least one sort key is invalid.

### Registry Implementation Contract

The confirmed existing-Subgraph boundary applies to every operator. A source queries an already available deployment; no operator or compilation target may create or deploy a Subgraph or Subgraph Composition. Prefer supported source-query filters/projections and existing derived fields only after verifying equivalent semantics. Do not invent query capabilities, silently rewrite accepted versions, or add unnecessary transforms; source and output validation remain required. The runtime supports multiple explicit source entries and the eight-type allowlist, while the source adapter remains responsible for one pinned query per source node.

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
- to_integer, to_decimal, and to_timestamp with explicit parse and precision rejection;
- epoch_seconds_to_timestamp and epoch_milliseconds_to_timestamp so epoch units are never guessed;
- trim, lower, upper, and concat for bounded text normalization;
- coalesce for explicit compatible-type null fallback;
- abs, round, floor, and ceil for bounded numeric normalization. Round uses half-even tie breaking.

Field paths are arrays of inspected field segments, never executable strings or dynamic object lookups. Reject prototype-sensitive keys, excessive nesting and unbounded collections. The first expression language has no regex, arbitrary JSONPath, dynamic property generation or locale-dependent string comparison.

No implicit null coercion: a nullable field must be checked or resolved through an explicit allowed branch before a non-null operation. Missing required fields, invalid timestamps, unit mismatch, overflow and invalid predicate types fail validation or execution. For `safe_divide`, a zero denominator returns null and the inferred output is nullable unless the denominator is a grouped cardinality proven nonzero for every emitted row. Dividing a measurement by that cardinality preserves the numerator's unit; dividing by an unproved or measured denominator does not invent a unit. The proposed metric ratio uses six decimal places with half-even rounding, represented as a decimal string; review H1 fixes this behavior before tests and implementation.

Example map node, a configuration excerpt rather than a complete executable spec:

```json
{
  "id": "classify_repeat_wallet",
  "type": "map",
  "operatorVersion": "1",
  "config": {
    "mode": "project",
    "fields": [
      {"name": "protocol", "expression": {"op": "trim", "inputs": [{"op": "field", "field": "protocol"}]}},
      {"name": "is_repeat", "expression": {
        "op": "if",
        "inputs": [
          {"op": "gte", "inputs": [{"op": "field", "field": "active_days"}, {"op": "literal", "valueType": "integer", "value": "2"}]},
          {"op": "literal", "valueType": "boolean", "value": true},
          {"op": "literal", "valueType": "boolean", "value": false}
        ]
      }}
    ]
  }
}
```

Measure shapes: `{op: count_rows}` needs no field; `{op: count_distinct, field}` counts exact distinct typed values; sum/min/max require an existing compatible field. Count outputs carry structural cardinality provenance, so a semantic contract may retain a domain count label without a hardcoded vocabulary. This does not permit a count operator to manufacture a provider measurement unit. groupBy fields must be non-null, or an explicit prior mapping must define the intended missing-key population. Measures may not reference each other's outputs. Large intermediate group/distinct state fails with RESOURCE_LIMIT_EXCEEDED; approximate counts are a different, currently unsupported semantic.

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

The data-model example uses abbreviated query/config fields for illustration; it is not a complete executable operator schema. Except for the generic Filter predicate and Sort / Top K contract above, this document proposes those missing details under H1 without silently approving executable schemas through model 1.5. The canonical illustration and frontend fixture now show the same seven-node denominator-safe composition.
