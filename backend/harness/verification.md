# Harness Verification and Delivery Plan

Draft 0.2. This is a preparation/acceptance plan; unchecked items are not implemented. The design links the human's natural-language-to-operator workflow to reusable, bounded tools rather than a general coding Agent.

## 1. Implementation Order

| Milestone | Deliverables | Exit test |
|---|---|---|
| I0. Review contracts | Open H1/H3 decisions below, approved H2 and API M1/M3 records, concrete scope and non-billable metadata capabilities | No unresolved ownership, persistence or hidden-spend assumptions in the first slice |
| I1. Build compiler kit | Versioned operator/expression schemas, registry, typed query builder/validator, DAG validator and five operator implementations | Golden fixtures pass without an LLM, network, wallet or database |
| I2. Build tool kit | Thin scripts, stage-aware dispatcher, context redaction, time/size limits, deterministic tool schemas | Valid/invalid calls and forbidden capability tests pass in isolation |
| I3. Add safe planning | Bounded model adapter, phase controller, clarification flow, durable checkpoints, proposal/diff persistence and polling | Real or stub model can propose distinct valid DAGs; crash/retry cannot reset limits |
| I4. Validate live source | Real inspected Graph deployment, approved source access, pinned query/pagination/block and manually checked output | Bounded API-key path works without a wallet expense; source coverage is evidenced |
| I5. Validate wallet-funded execution | Existing approved Privy/Graph control model, payment attempt accounting and reconciliation | Permitted/rejected spends, revocation, exhaustion, concurrency and timeout cases produce correct outcomes |
| I6. Connect product flow | Builder proposal/accept/build/trace/output clients, immutable edits, explicit deployment | Reload-safe live build; earlier active output survives a failed revision |

I0-I6 describe work order; H1-H3 below are review gates. Do not require downstream monetization to validate the compiler and private data-product flow. Existing Hedera publication/consumer gates remain separate.

No model SDK or provider is selected in this draft. Keep the model port replaceable, with structured output/tool-call support and enforceable usage/deadline handling. Pin and verify provider/package behavior during implementation; do not assume a framework's default tool loop enforces these rules.

## 2. Golden Semantic Cases

Fixtures include a manifest with case ID/version, purpose, synthetic/captured provenance, source schema, semantic assumptions, operator/runtime versions, fixed interval/block context, inputs, independently reviewed expected outputs and expected failures. Recorded live captures must be sanitized and permitted for reuse; never commit keys, signing material or raw authorization headers.

| Case | Expected result |
|---|---|
| Simple activity count by protocol | A different, shorter valid composition than the repeat-activity example; no fixed six-card pipeline |
| Repeat activity example | alpha: 2 active wallets, 1 repeat, 0.500000; beta: 1 active, 0 repeat, 0.000000 |
| Many events on one day | Does not become a repeat-day wallet; distinct days are not transaction count |
| Same address in two protocols | Counts separately in each protocol's population |
| Denominator trap | Filtering out one-day wallets before calculating the denominator must fail the semantic expected-result test |
| Interval edges | Start included, end excluded; UTC boundary and 30-day meaning remain stable on retry |
| Empty input | Empty grouped result; no invented protocol/wallet or zero-population row |
| Missing wallet/timestamp or wrong timestamp units | Explicit failure or creator-approved typed mapping, never inferred success |
| Large integer and decimal rounding | Exact string-safe values; overflow and zero-denominator behavior match declared schema |
| Missing required event granularity | Coverage failure when only protocol daily totals are available |
| Conversational edit | Changed window/threshold produces a new spec hash/version and visible diff; prior active version stays unchanged |

The complete golden pipeline begins with deterministic structured requirements and schema fixtures. Planner tests separately check that natural-language variants map to those semantics. Do not use the same model response as both implementation and sole correctness oracle.

## 3. Contract, Security and Failure Tests

| Group | Required adversarial/failure cases |
|---|---|
| Ownership | Foreign workspace snapshot, parent version, artifact, session or policy; forged context; inaccessible evidence must not leak |
| Capability | Unknown tool/version; tool allowed in wrong stage; model requests build/pay/deploy, shell, filesystem, SQL, URL fetch or raw signer access |
| Injection | User/SDL/schema-description/error text instructs secret upload, policy changes or tool escalation; treat it as data and preserve denied authority |
| Model output | Malformed JSON, unknown fields, invented IDs, fabricated tool result, oversized output, invalid operator/config, unsupported expression |
| Query | Wrong field/type, mutation, alias/fragment depth bypass, unbounded nesting, invalid cursor, oversized query and decompression bomb |
| Templates | Deterministic expansion, pinned versions, stable IDs across parameter changes, primitive equivalence, disjoint connected mappings, stale spec/provenance hashes, unavailable catalog, parameter bounds and expanded resource accounting |
| DAG | Cycle, dead node, duplicate IDs, invalid ports, type/null/unit mismatch, multiple outputs, excessive nodes or distinct/group state |
| Egress | Unapproved host, redirect, loopback/private address, DNS rebinding, URL credentials and arbitrary MCP registration |
| Cost limits | Repeated sessions, six-model-call exhaustion, retry/repair accounting, unknown metadata billing, counter reservation before dispatch, crash after external call |
| Replay/deduplication | Duplicate command, changed body under same key, duplicate proposal acceptance, race between accept/discard, expired evidence and mismatched registry |
| Source data | HTTP 200 with GraphQL errors, indexing errors, block/manifest drift, repeated or non-progressing cursor, exact-boundary full page, incomplete history |
| Payments | Key failure with no x402 fallback, policy drift, revoked grant, concurrent reservations, 402+retry accounting, uncertain submission and confirmed-payment/failed-data delivery |
| Runtime recovery | Crash before/after context initialization, source page, artifact commit and materialization commit; same paid page cannot be recharged under a new node attempt |
| Cancellation | Close browser vs explicit cancel; stop new work but reconcile already-submitted payment; preserve budget consumption on settlement |
| Product lifecycle | Build never deploys implicitly; failed revision leaves previous output active; refresh cannot advance a different active version's pointer |
| Portability | Same fixture result and hashes under API/worker profiles for Docker and evaluator deployment; no durable local files or provider-specific domain logic |

No paid tests run by default in CI or a developer replay. Live tests require a separately configured test workspace, explicit account authority, test funding, bounded total budget and a human-triggered execution mode. A failed live dependency test does not silently become a successful fixture test.

## 4. What to Record

Record model/provider and prompt/tool/registry/runtime versions, sanitized input and visible decisions, source identity/schema/coverage evidence, query/spec hashes, validation outcomes, stage durations, model/tool usage, fixture/live classification, and linked run/output/payment evidence where applicable. Data-model 1.4 defines the approved H2 durable fields; exact H1 payload validation and service-level enforcement remain required.

For planner evaluation, report valid-spec rate, semantic golden-case pass rate, clarification/unsupported accuracy, source-ID/field hallucinations, forbidden-tool rejection, token/call/latency bounds, and unsafe side-effect count. Deterministic validation/security/golden tests must all pass before enablement; unsafe side effects must be zero. Do not promise 100% general language understanding from a small evaluation set.

For reproducibility, rerun pure transformation from retained inputs without contacting Graph or an LLM. Re-querying a provider is a new live retrieval and must be labeled/authorized as such; the same historical query may no longer be available. Replaying the planner is a separate, potentially nondeterministic model evaluation, not deterministic runtime replay.

Development records and commits stay English. User-visible runtime replies may follow the requested locale. Maintain [plan.md](../../plan.md) with substantial AI contributions, human decisions, verification performed and remaining gates; fixture tests do not count as sponsor integration evidence.

## Review Gates

| Gate | Proposed decision / unresolved detail | Recommendation |
|---|---|---|
| H1. Executable language | Five-type scope confirmed; exact typed expression, source-query and template schemas, interval and numeric/null semantics still pending | Implement GroupBy/window/score through config/expressions; review versioned schemas before backend implementation; examples are aligned but not schema approval |
| H2. Durable orchestration | Approved on 2026-09-05: model 1.4 defines commands/outbox, planning checkpoints/calls, run/source contexts, cross-attempt page identity and compilation_records | Initial SQL structure and isolated tests exist; implement and test controller recovery, native multi-connection races, exact payload schemas and side-effect reconciliation before claiming restart safety |
| H3. First live case and operating profile | Concrete real subgraph/field methodology, repeat-day metric definition, acceptable coverage checks, initial numerical limits and model-cost budget | Treat the worked example and caps as proposals; validate one real source and approve a bounded demo profile before live execution |

M1-M3 and H2 persistence directions were explicitly approved; model 1.4 now governs the records and validation/build/activation transitions. E2 concerns downstream hosted buyer authority; E1 gates live wallet control. Neither is approved by the persistence work.

The separate database foundation implements approved persistence, but this harness draft introduces no runtime script, wallet action or automatic new-subgraph creation. The next safe implementation step is the reviewed offline compiler/tool kit, followed by bounded metadata discovery and Agent wiring.

## Frontend Alignment Evidence Boundary

The frontend has a local five-type-scope/seven-node illustration, semantic disclosure, explicit edge projection, parameter recompilation and an independent fixed fixture oracle. Its tests cover sample structure and graph display, not an implemented backend compiler, actual runtime execution, natural-language understanding or live Graph data. Offline backend golden tests, H1/H3 decisions and implemented H2 recovery remain required.
