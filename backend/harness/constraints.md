# Harness Constraints and Enforcement

Draft 0.3. These are proposed engineering controls, not sponsor rules or implemented protections. The approved DAG, wallet, privacy and deployment boundaries remain mandatory. Numerical defaults below require review H3 and load/cost testing.

## 1. Authority Must Be Enforced Outside the Prompt

| Boundary | Enforcement location | Required behavior |
|---|---|---|
| User/workspace ownership | API admission, repositories and tool dispatcher | Check all referenced objects and ancestry, including tool calls, evidence, polling and retries |
| Current phase/tool capability | Controller and dispatcher | Only the registered versioned tool subset for that stage; ignore model requests to change role/phase |
| Schema/type/operator limits | Query/DAG compiler and runtime | Independently validate untrusted arguments/specs; frontend and model checks are insufficient |
| Planning capacity and cost | Server admission and durable counters | Reserve before model/network dispatch; include retries, repairs and failed calls |
| Graph access and spending | Source adapter, wallet/payment service and serializable budget reservations | Explicit access mode; current credential/grant/policy; validate exact requirement before reserving/signing |
| Execution and side-effect recovery | Worker, run locks, persistent intents and reconciliation | Same logical operation cannot spend twice after timeout/crash |
| Secret/data exposure | Context builder, adapter projections and logging sinks | Redact before model ingestion, persistence and display; never return reusable credentials |
| Resource isolation | Query adapter, pure-node runner and process/container controls | Stream and cap payloads; deadlines and cancellation; pure simulation has no network or credentials |
| Deployment/publication | Dedicated authenticated services | No planner tool can activate, publish, set fees or change recipients |

## 2. Forbidden Capabilities

Do not expose terminal execution, shell strings, filesystem browsing/writes, SQL execution, package installation, arbitrary code evaluation, dynamic imports, generic HTTP requests, arbitrary MCP servers, wallet signing, grant/policy modification, funding, bridging, subgraph deployment, service deployment, publication, or fee-setting as planner tools.

The product-wide existing-Subgraph boundary also excludes creating, generating, deploying, or maintaining new Subgraphs or Subgraph Composition through workers, adapters, or developer-script fallbacks. Upstream creation is not unlocked by a source gap, a natural-language request, or a Build/Deploy approval. Those approvals concern Sprue's own data product/API. Report missing facts and bounded-search limits; any revised requirement or other existing source must be reviewed and validated. Multi-source composition is authorized only when represented by explicit source nodes and Union/Join operators; hidden adapter merging remains forbidden.

Operator expressions must remain the finite typed AST described in [operators.md](operators.md). A field called formula, script, callback or code cannot evade this boundary. No recursive Agent delegation, self-installed tool, unbounded self-repair, self-modified prompt policy or model-controlled budget increase is supported.

Following a user-requested instruction in natural language is not enough to authorize a financial or publication action. Only the explicit authenticated control-plane operation and its reviewed provider grants confer that authority. A source description or tool result cannot approve anything.

## 3. Proposed Default Limits

Effective limits are the minimum of platform profile, authenticated workspace allowance, accepted spec resourcePolicy, and applicable grant/spending limits. Missing required configuration is a startup/readiness error, not unlimited access. A proposed spec above a limit is rejected with a visible diagnostic rather than silently rewritten into different semantics.

### Planning Profile

| Resource | Initial proposed ceiling | Failure handling |
|---|---|---|
| User message | 8,000 characters; existing API bound | INVALID_REQUEST before model dispatch |
| Active planning | 1 command per session; 2 per workspace | OPERATION_IN_PROGRESS or RATE_LIMITED |
| Admission | 10 planning commands per workspace per hour, plus deployment-wide capacity | Rate limit; new sessions do not bypass workspace accounting |
| Model invocations | 6 per logical planning command, including repairs/retries | PLANNING_LIMIT_EXCEEDED; return current diagnostics |
| Model token reservation | 32,000 total input and 8,000 total output per command | Reserve upper bounds before each call; no undisclosed auto-upgrade |
| Tool dispatches | 20 total per command, including attempts | TOOL_LIMIT_EXCEEDED; controller budgets its mandatory final checks within this ceiling |
| Source exploration | 3 search calls, 5 results each, 3 distinct full inspections | Report search bound and missing facts, not exhaustive-unavailability claims |
| Model-facing tool result | 16 KiB sanitized payload per result; summarize/reference larger artifacts | TOOL_RESULT_TOO_LARGE or bounded explicit truncation |
| Planning wall time | 90 seconds across the command; model call <= 30 seconds, metadata call <= 10 seconds | Stop launching new work; preserve durable outcome and diagnostics |
| Automatic semantic repairs | At most 2 within the above model/tool/time limits | Return unsupported/needs_input result with remaining failures |
| External read retries | At most 2 attempts total per logical metadata call, within shared budgets | Same call identity; backoff and then dependency error |

Model-provider fees use a separate platform cost allowance configured for the chosen model. Token caps alone do not define a currency budget. Reserve against configured maximum input/output charges before dispatch and record observed usage when available; an uncertain provider response does not refund its reservation automatically. Data-model 1.5 defines approved H2 planning_checkpoints/planning_calls for this metering/recovery; controller enforcement remains unimplemented, and initial model choice/pricing remains a deployment configuration decision. These costs are not fabricated Graph expenses in the creator wallet ledger.

### Compilation and Execution Profile

| Resource | Initial proposed ceiling / rule |
|---|---|
| Accepted spec | 1 MiB JSON; unknown fields rejected |
| Graph schema | 5 MiB stored maximum from data-model 1.5; smaller slices for the model |
| Query | 16 KiB document, depth 6, 64 expanded selected fields, one business root collection plus allowed provenance |
| Source pagination | Default 500, maximum 1,000 rows/page; cursor strategy must be supported by inspected schema |
| Graph | Count expanded primitive nodes and edges, not semantic cards: 12 nodes, 24 edges; exactly one output; proposed maximum 4 source nodes per run, with Union/Join only through explicit typed edges |
| Expression AST | Depth 8, 128 nodes per expression, 32 output fields per map, 1,024-character scalar literal |
| Runtime source requests | 100 logical requests per run, including metered probes and completion checks; paid retry is an HTTP attempt of the same request |
| Physical source HTTP attempts | At most 3 per logical request and 300 per run; payment safety can prohibit retry before this cap |
| Source/intermediate rows | 50,000 source rows total; 50,000 rows per intermediate output |
| Aggregation state | 10,000 groups and 50,000 distinct-value entries total per node; no approximate fallback |
| Final output | 5,000 rows, 5 MiB; reject overflow, not partial materialization |
| Stored runtime artifacts | 20 MiB total per run, including source pages/intermediates/evidence; each <= 5 MiB |
| Run processing deadline | 120 seconds from the first persisted execution start for new work; queue wait is excluded and retries share the original deadline |
| Offline simulation | 1,000 fixture rows, 10 seconds, no network; same operator semantics and smaller effective budgets |
| Node memory | Target 256 MiB isolated runner budget plus measured process overhead; process/container hard limit must be configured and tested |
| Concurrency | Initially one executing DAG node per run; serialize source-page payment decisions and use database accounting across concurrent runs and source keys |

For the first cross-chain demo, use two source nodes and one explicit composition node. A platform profile may allow up to four source nodes, but each source is independently bounded for query pages, access mode, block/provenance and cost. Union inputs must be normalized to the same row schema. Join must declare typed key mappings, join type, cardinality and null/collision behavior; an unbounded many-to-many join is rejected.

The row/request/storage/runtime ceilings align with or tighten the illustrative data-model resourcePolicy. Not every worst-case row set fits every byte ceiling; exceeding the tighter limit is a legitimate failure. Model-level resource fields remain the approved set; new limits above are platform-profile values unless a reviewed schema explicitly adds a versioned field.

Apply size limits to received and decompressed bytes before unbounded JSON parsing; reject compression bombs, over-deep JSON and pathological GraphQL AST expansion. Streaming parsing/collection must still enforce completeness and output integrity. Large malicious fields cannot evade a row-count limit.

The execution deadline prevents new work, not reconciliation of already submitted payments. A separate bounded reconciliation job may continue observing that payment under the same identity; it may not re-authorize, advance the interval or create a fresh paid run to escape the deadline. Release reservations only on a definite outcome according to the existing payment model.

## 4. Untrusted Content and Network Isolation

Treat the user prompt, Graph descriptions/SDL comments, source rows, error bodies, model output and imported fixtures as data. They cannot modify system rules or enable tools. Delimit provenance in model context, remove irrelevant descriptions, and validate structured fields independently. Prompt-injection detection is defense in depth, not a substitute for denied capabilities.

Metadata/data adapters use configured HTTPS destinations and method/path templates. Models select inspected identifiers, not URLs. Reject URL credentials, redirects outside the allowlist, loopback/private/link-local targets, metadata-service addresses and DNS rebinding; control egress at the process/network boundary. A provider response never adds a new trusted host automatically. Any locally configured test adapter is a separate offline/test profile, not an exception accepted from user input.

The planner receives no API keys, Privy access tokens, additional-signer authorization key, secret-manager paths, database credentials or payment payloads. Redact pasted secrets before storing messages or calling a model. Hashes of secret-bearing inputs must use an appropriate keyed scheme, not a reversible or guessable public cache key.

No raw private rows are sent to a model in this first profile. The simulator can process approved fixtures in isolation and returns synthetic previews or sanitized assertions. Frontend owner-authorized artifact viewing is a distinct capability from model data access. Bound and sanitize all error/trace fields; do not persist hidden chain-of-thought or unrestricted provider output.

## 5. Graph Payment and Quota Rules

The [Graph](../../sponsor/graph.md) and [Privy](../../sponsor/privy.md) references remain the integration baseline; no live capability is established by this design.

- Planning tools perform no customer-subscription data query and no x402 purchase. Unknown metadata billing blocks the operation.
- An accepted spec selects exactly one Graph access mode per source. API-key failure stops; never fall back to x402. A credential rotation preserves logical identity but each request records the used version.
- Explicit Build/preview or an approved active refresh schedule authorizes bounded execution. A chat message, successful preflight, wallet balance or top-up alone is not a spending mandate.
- The worker's Graph adapter requests and validates the exact x402 requirement, then reserves its amount against current user authority and budget before signing. Model-estimated price/recipient/network cannot override that validation.
- The additional signer and its separately controlled provider policy remain outside the planner. Revocation, policy drift, unsupported signing method or insufficient budget blocks new spend. The harness cannot loosen a policy.
- The initial 402 and payment-bearing retry share one logical source request; pagination pages are separate requests. Confirmed expense remains spent even if data delivery fails. A timeout or worker crash never implies no charge.
- Uncertain attempts must be reconciled before any replacement authorization; finite provider idempotency windows do not permit blind replay. No generic tool-level retry can wrap a payment submission.
- Upstream Graph spending and downstream Hedera sales stay separate. No planner tool enables x402 sales, sets fees, spends receipts on another network or bridges funds.

## 6. Safe Recovery and Stop Conditions

| Condition | Required action |
|---|---|
| Ambiguous metric, period, unit or access choice | Ask a focused clarification and stop paid/executable progression |
| Missing source fields or unsupported operator | Return precise limitation and proposed alternative; no fabricated data/code |
| Metadata unavailable or billing unknown | Use only verified retained metadata if sufficient; otherwise block |
| Invalid model response | Validate, allow at most the bounded repair count, then report diagnostics |
| Revoked key/grant, policy drift, insufficient budget | Stop before new provider work and surface the appropriate Wallet action |
| Query errors, block/deployment mismatch, partial pagination or stale coverage | Fail the build; keep previous working deployment/output pointers unchanged |
| Worker crash or expired lease | Recover durable command/run state and reconcile submitted side effects before proceeding |
| User requests cancellation | Stop new model/tool/node/page work; retain visible cancelled state only after safe boundaries and financial reconciliation |
| Missing replay artifact or unavailable pinned runtime | Return REPLAY_EVIDENCE_MISSING / RUNTIME_VERSION_UNAVAILABLE; no live refetch hidden inside replay |

Every limit/security failure emits a sanitized stable code, stage, related IDs and actionable diagnostic. The planner may explain the failure but cannot turn it into success or widen the affected permissions. Global/provider outages do not justify fixture fallback in a live response.

## Semantic Template Boundary

Only developer-owned pinned templates may expand. Apply the same allowlist, AST, type, query and resource validation after expansion. Reject recursive/nested template calls, unknown parameters/versions, overlapping or disconnected provenance mappings, and hidden network/model/tool work. A template cannot grant wallet authority, publish, accept a proposal or bypass the shared planning budget. Layout and localization never change executable semantics. See [semantic templates](semantic-templates.md).
