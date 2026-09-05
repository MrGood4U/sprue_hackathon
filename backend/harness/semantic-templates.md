# Semantic Template Contract

Draft 0.1, 2026-09-05. The human approved a small MVP operator scope and this design/frontend alignment work. H2 compilation-provenance persistence is approved in data-model 1.4. Exact executable schemas (H1) and a live source, methodology and operating profile (H3) still need review. These are proposed backend contracts; the frontend demonstrates expansion with synthetic data only.

## 1. One Execution Definition

A semantic template is a developer-owned, versioned compiler recipe, not a runtime operator. The MVP registry contains only `source`, `filter`, `map`, `aggregate`, and `output`. Grouping is aggregate configuration, a source interval is window configuration, and a derived score is a bounded map expression.

The first presentation reads `Source -> Wallet Activity -> Repeat Activity -> Output`. Expanding the two semantic cards reveals seven primitive nodes. Source and Output remain visible; expansion changes neither the execution definition nor its hash. A worker executes only the fully expanded, validated primitive DAG and never interprets a template label or downloads a recipe at runtime.

Join, Union, standalone Window/GroupBy/Score, token-price enrichment, true cohort retention, flow analysis, and arbitrary code are deferred. Reusing indexed subgraph facts does not authorize assumptions about their granularity, units, population or completeness.

## 2. Initial Templates

| Template / version | Typed input and preconditions | Parameters | Primitive expansion | Output |
|---|---|---|---|---|
| `wallet_activity` / `1` | Complete bounded event rows: protocol and wallet are non-null strings on one declared data network; timestamp is normalized UTC; inspected mappings must prove event granularity | No independent interval: use the source's `complete_utc_days` window | `normalize_day` map -> `wallet_activity` aggregate by protocol/wallet with exact count_distinct(date) | protocol, wallet, activeDays (integer string) |
| `repeat_activity` / `1` | Exactly one row per protocol/wallet with activeDays; the complete active population must still be present | `minimumActiveDays`: integer >= 2 and <= source window days | `classify_repeat_wallet` map -> `protocol_activity` aggregate -> `compute_ratio` map | protocol, activeWallets, repeatWallets, repeatShare |

Source interval parameters are separate from a template's own parameters. The frontend sample offers 7 or 30 complete UTC days and a threshold from 2 through that interval; these are demo controls, not approved platform limits. Resolve [start, end) once per run at UTC midnight; never recalculate on retry. Do not add an independent semantic-card window that can disagree with the source config.

Wallet activity counts distinct dates, not transactions. Repeat share is repeat wallets divided by all active wallets in the same protocol/interval. Never filter one-day wallets out of the denominator. It is not cohort retention, which would need a defined cohort, return interval and maturity treatment. Protocols with no input rows do not appear as fabricated zero-population rows.

Counts are integer strings. The proposed ratio uses six decimal places and half-even rounding; safe_divide returns null for a zero denominator. The schema permits that null even though nonempty grouped populations have positive counts. Numeric/null behavior remains H1; the frontend fixture is not the authoritative runtime implementation.

## 3. Deterministic Expansion and Provenance

The future compiler accepts `{templateId, templateVersion, instanceId, inputBindings, parameters}` against a pinned catalog. Reject unknown keys, unsupported versions, unverified input types/units, invalid thresholds and incomplete populations. Resolve dependencies only to enabled operator versions. Templates cannot nest recursively, execute code, call tools, fetch data, set access/fee policy, or accept/deploy a version.

Emit stable instance-prefixed node IDs and explicit rows-port edges. Keep those IDs when only parameters change, so diffs remain readable. Count all expanded nodes, edges, expressions and group state against the existing shared resource limits; a template does not count as a single runtime node. Validate the entire composed DAG, not just each expansion in isolation.

Proposed `CompilationProvenance` sidecar:

```json
{
  "schemaVersion": 1,
  "compilerVersion": "1",
  "templateCatalogHash": "sha256:example-only",
  "expandedSpecHash": "sha256:example-only",
  "instances": [
    {
      "instanceId": "repeat",
      "templateId": "repeat_activity",
      "templateVersion": "1",
      "parameters": {"minimumActiveDays": 2},
      "inputBindings": {"rows": {"nodeId": "wallet_activity", "port": "rows"}},
      "expandedNodeIds": ["classify_repeat_wallet", "protocol_activity", "compute_ratio"]
    }
  ]
}
```

IDs in the shared worked example are short role names; a general compiler must namespace them by stable instance ID to avoid collisions. Each instance must map to a disjoint connected subgraph with verified input/output boundaries. Compare the recorded expansion with deterministic compilation under the pinned catalog; mismatched or unavailable provenance falls back to the primitive view, never an invented semantic group.

This sidecar explains compilation but is not a second editable execution definition. The spec contains every executable field. Provenance must reference the exact expanded spec hash; compiler upgrades must not silently change accepted versions. Local collapse/selection state is presentation-only and must not change hashes.

## 4. Editing and Persistence Gate

The initial semantic UI allows parameter edits and read-only expansion, not bidirectional editing of generated internals. Editing parameters creates a new proposed spec and visible semantic diff; accepting/building/deploying remain separate human actions. Existing active versions stay unchanged. If provenance cannot be reproduced, display primitives and block template editing with an explanation.

The frontend stores only a local, explicitly synthetic draft with separate `specification` and display-template metadata. It neither persists a product version nor claims to hash/validate a live source. Navigating away resets the sample, and API/consumer pages continue to show the labeled default fixture until backend integration exists.

Do not put template provenance or synthetic group IDs into `product_version_layouts`: the approved layout contains actual DAG node IDs only. The approved H2 mapping uses immutable compilation_records, owned by either a proposal message or accepted version, with unique ownership and content/spec hash links. Acceptance copies provenance into a new version-owned row; it never reassigns a proposal record. The database checks envelope links, not deterministic expansion or canonical hashing. H1 must still define exact instance/config schemas and validation, and optional proposal/VersionDetail/registry read projections need contract review. No new HTTP mutation is introduced.

## 5. Verification and Implementation Order

1. Review template/config schemas and source mappings; preserve the canonical spec envelope.
2. Implement developer-owned pure templates and operator registry, then `templates.read` and `templates.expand` wrappers. Validate output through the existing DAG compiler.
3. Test deterministic expansion, stable IDs across parameter edits, unsupported versions/fields, type/unit mismatch, disconnected/overlapping groups, cycles after grouping, expansion budget overflow, stale hashes and absent provenance.
4. Run actual runtime golden tests for the full expanded DAG: same-day events, independent protocol populations, one-day denominator, threshold changes, empty input, UTC boundaries, large counts and rounding. The reference fixture expects alpha = 2/1/0.500000 and beta = 1/0/0.000000 at threshold 2; threshold 3 yields zero repeats for both.
5. Connect the frontend to validated provenance and real NodeRun/artifact IDs. Test keyboard disclosure, individual-node inspection and stale proposal behavior. Locale/layout changes must not change execution semantics.
6. Validate the chosen live Graph source and independent metric result before claiming sponsor evidence. None of these steps enables downstream x402 automatically.
