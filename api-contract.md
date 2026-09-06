# Sprue Frontend and Backend API Contract

## Status and Authority

Draft 0.4, updated on 2026-09-06 for human review. This is the target HTTP contract, not a claim that every durable endpoint is implemented. The frontend currently uses the explicitly temporary backend demo runtime documented in [demo-runtime.md](docs/api/demo-runtime.md); it does not use browser business-data fixtures. That runtime now includes a redacted, process-memory Model Service profile used only by an explicit connection test or Agent-plan action. Testing does not save submitted profile values. The database and API/standby-worker framework exist; see [backend/framework.md](backend/framework.md) for the exact implemented and reserved boundary.

Inputs: [data model 1.5](data-model.md), [product design 1.19](product-design.md), [current frontend ownership](frontend/README.md), and [implementation status](frontend/implementation-status.md). Database invariants take precedence over fixture behavior. M1-M3 persistence/lifecycle directions were approved on 2026-09-05 and now map to data-model 1.5 and the initial database foundation. Process probes, public app configuration, verifier-gated identity reads and the explicitly temporary backend demo projection are implemented; durable domain routes remain reserved and return 503 without side effects. The demo projection and optional model call do not establish durable provider capability or authorize a fee, Graph request, funded operation, or deployment.

The specification uses resource-oriented JSON APIs, durable asynchronous commands, and resumable trace reads. HTTP transport is shared by Railway and Docker deployments. No browser calls the database, Graph payment adapter, private Privy signer, or Blocky402 settlement endpoint directly. The temporary demo runtime is explicitly non-durable and is not a substitute for the resource contracts below.

## Document Map

| Document | Contents |
|---|---|
| This document | Shared conventions, authentication, concurrency, asynchronous work, errors, page mapping, and review gates |
| [Identity and wallet](docs/api/identity-wallet.md) | Bootstrap, wallet synchronization, credentials, delegation, budgets, funding, and recipient readiness |
| [Products and Builder](docs/api/products-builder.md) | Product listing, conversations, proposals, immutable versions, DAG layout, runs, artifacts, and traces |
| [Deployment and publication](docs/api/deployment-publication.md) | Private API, activation, API credentials, schedules, HBAR publication, and retirement |
| [Consumers and financial evidence](docs/api/consumer-payments.md) | Public metadata, generated data API, x402, recovery, receipts, and financial read models |

Each operation table specifies the method, path, input, successful result, and persistence ownership. Types referenced by a table are defined in its document or below. Shared errors apply to every operation in addition to its domain errors.

## 1. Transport and Routing

| Surface | Base path | Audience |
|---|---|---|
| Creator control plane | `/api/v1` | Verified Privy user and active workspace owner |
| Public descriptions and receipts | `/api/v1/public` | Public metadata; request evidence requires separate recovery authorization |
| Hosted product data | `/data/v1/{endpointSlug}` | Access checked against the active publication |
| Process probes | `/healthz`, `/readyz` | Minimal infrastructure status, no credentials or configuration |

Deployment supplies `API_BASE_URL`, `CONSOLE_PUBLIC_URL`, `DATA_PUBLIC_BASE_URL`, and an explicit origin allowlist. These are proposed configuration names, not database columns. HTTPS is required outside local development. URLs returned by the server are assembled from trusted configuration, never an unchecked Host header.

Creator URLs use product UUIDs: `/app/products/{productId}/build`, `/api`, and `/monetize`. A selected `versionId` or `runId` may be a query parameter. Public `/p/{endpointSlug}` and `/data/v1/{endpointSlug}` resolve through `deployments.endpoint_slug`, unique within the configured deployment environment. Do not resolve public routes using `data_products.slug`, which is unique only within a workspace. The fixture currently uses the same string for both; that is not an identity guarantee. No endpoint creates an environment or chooses a cloud provider from browser input.

`environment: demo` means the evaluator deployment profile and can contain real testnet operations. It does not mean fake data. A separate response `meta.dataSource` identifies `live` or `demo`; live requests never fall back to fixtures.

### Authentication and Browser Security

- Creator requests use `Authorization: Bearer <Privy access token>`. Verify the token using the configured Privy application and current verification mechanism; validate issuer, audience, expiry, and subject. A frontend-provided user ID or wallet address is not identity evidence. [Privy access-token documentation](https://docs.privy.io/authentication/user-authentication/access-tokens) supports frontend bearer requests and backend verification.
- Use the Privy SDK's session lifecycle. Do not build a second password/login service or copy tokens into Sprue-managed browser storage. A 401 permits one SDK refresh and retry with the same command key; repeated failure signs out the UI. Signing authority is separate from login.
- Check owner membership and resource ancestry on every creator operation, including polling, traces, artifacts, and nested IDs. Return 404 for inaccessible cross-workspace objects; return 403 for a known suspended account/workspace. No membership-management endpoints are in MVP scope.
- Configure CORS for exact approved console origins. Allow `Authorization`, `Content-Type`, `Idempotency-Key`, `If-Match`, and `Last-Event-ID`. Public data also allows the payment/recovery headers defined in the consumer document. Expose `ETag`, `Location`, `Retry-After`, `X-Request-ID`, and those public headers. OPTIONS never authenticates a payment, charges, or creates an access request. Do not use wildcard credentialed CORS.
- The proposed control plane uses bearer headers, not cross-site authentication cookies. Any later cookie-based session requires a reviewed CSRF and deployment policy.
- Private JSON, credentials, traces, request evidence, and paid data use `Cache-Control: no-store`. Materialization reuse is server-side computation caching, not permission to CDN-cache a paid response. Public metadata may use a short revalidated cache that respects publication retirement.

## 2. Data Conventions

HTTP DTO fields use `camelCase`; persistence remains `snake_case`. Canonical specifications retain the data model's existing camelCase schema. Enums remain stable machine values and are never translated. User-authored text is Unicode; repository documentation stays English. The frontend localizes known codes, labels, and timestamps through its catalogs. `message` is a sanitized English fallback, not a key to branch on. Optional `responseLocale: en | zh-CN` on an Agent message guides user-visible generated replies, not API field names.

| Type | Wire representation |
|---|---|
| `Id` | UUID string; never a slug, provider ID, address, or transaction reference |
| `Timestamp` | RFC 3339 UTC string ending in `Z`; null when not yet observed |
| `Atomic` | Non-negative base-10 integer string, at most 78 digits; no exponent, decimal point, sign, or leading zeros except `0` |
| `Count` | Non-negative integer string for PostgreSQL bigint/numeric counters |
| Small integers | JSON numbers for versions, lock versions, limits, and timeout seconds |
| `Hash` | Algorithm-prefixed canonical digest, such as `sha256:...`; never computed from translated display text |
| `Money` | `{networkId, network, assetId, assetIdentifier, symbol, decimals, amountAtomic}` |
| `ResourceRef` | `{type, id}`; public projections use only expressly allowed identifiers |
| `EvidenceLink` | `{kind, label, url}` or null; URL generated from validated identifiers and an allowlisted provider base |

All fields are required unless marked `?`; `T | null` means present but currently unknown/unavailable. An omitted field in PATCH means unchanged; null clears only fields explicitly permitting it. Unknown writable fields fail validation; never silently discard attempted state, owner, price, or policy overrides. A DTO is an allowlisted projection, not a serialized database row.

Proposed transport limits: ordinary control JSON bodies 256 KiB, accepted specification bodies 1 MiB, layouts 128 KiB, and decoded payment payloads 16 KiB. Apply limits before expensive parsing/validation; configure intermediary/header limits consistently for base64 payment headers. Schema documents and stored artifacts retain the model's 5 MiB maximum. These are draft engineering defaults, not sponsor limits; platformLimits may tighten them, never silently broaden a version's resource budget.

Never return secret-manager paths, key hashes, raw provider errors, signer secrets, hidden reasoning, or reusable payment authorizations. The sole API-credential raw-key response is specified separately. Graph-key input is write-only and is excluded from request logging, command snapshots, and error bodies.

### Success, Collections, and Errors

Single-resource response:

```json
{
  "data": {"id": "10000000-0000-4000-8000-000000000001", "status": "draft"},
  "meta": {"requestId": "req_example", "apiVersion": "1", "dataSource": "live", "observedAt": "2026-09-05T12:00:00Z"}
}
```

Collection response uses `data: T[]` plus `page: {nextCursor: string | null, hasMore: boolean}`. List defaults are `limit=20`, maximum 100. Cursors are opaque, bind ordering and filters, and use a stable ID tie-breaker; there is no implied consistent snapshot across changing pages. Default order is creation time descending except messages/traces (sequence ascending) and product lists (updated time descending). Changed cursor scope returns `400 INVALID_CURSOR`. Search is bounded text, not SQL or a regular expression.

Error response:

```json
{
  "error": {
    "code": "SPENDING_POLICY_EXHAUSTED",
    "message": "The selected Graph spending policy has no available budget.",
    "retryAction": "resolve_blocker",
    "fields": [],
    "blockers": [{"code": "PERIOD_BUDGET_EXHAUSTED", "resource": {"type": "spending_policy", "id": "10000000-0000-4000-8000-000000000002"}, "action": "open_wallet"}]
  },
  "meta": {"requestId": "req_example", "apiVersion": "1", "dataSource": "live", "observedAt": "2026-09-05T12:00:00Z"}
}
```

`FieldError = {path, code, message}` uses JSON Pointer paths. `Blocker = {code, resource: ResourceRef | null, action}`; allowed actions are `open_wallet`, `edit_version`, `open_run`, `open_api`, `open_monetize`, `reconcile_payment`, `retry_read`, and `contact_operator`. The frontend maps actions to known routes, not arbitrary redirect URLs.

`retryAction` is one of `none`, `retry_read`, `retry_same_key`, `resolve_blocker`, `refresh_auth`, `reload_resource`, `reconcile`, or `retry_delivery`. Transport timeout is not proof that a mutation failed.

`ErrorDetail = {code: string, message: string, retryAction, fields: FieldError[], blockers: Blocker[]}` is the error object inside the envelope above, also reused by command and node results.

| HTTP | Typical codes and behavior |
|---|---|
| 400 | `INVALID_REQUEST`, `INVALID_CURSOR`, `INVALID_PAYMENT_PAYLOAD` |
| 401 | `AUTH_REQUIRED`, `AUTH_EXPIRED`, `API_CREDENTIAL_INVALID`, `REQUEST_ACCESS_REQUIRED` |
| 403 | `WORKSPACE_SUSPENDED`, `CAPABILITY_DISABLED`; never suggest bypassing a wallet policy |
| 404 | `RESOURCE_NOT_FOUND`, `PUBLIC_PRODUCT_NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED`; data HEAD never invokes GET |
| 415 | `UNSUPPORTED_MEDIA_TYPE`; require uncompressed JSON for JSON-body operations |
| 409 | `IDEMPOTENCY_CONFLICT`, `OPERATION_IN_PROGRESS`, `INVALID_STATE`, `READINESS_BLOCKED`, `PAYMENT_UNCERTAIN`, `PAYMENT_REPLAY_CONFLICT` |
| 410 | `REQUEST_ACCESS_EXPIRED`, `PINNED_RESULT_UNAVAILABLE`; no automatic new charge |
| 412 | `RESOURCE_CHANGED`; reload and ask the user to review the new state |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `VALIDATION_FAILED`, `UNSUPPORTED_OPERATOR`, `SOURCE_ACCESS_INVALID`, `PRICE_INVALID`, `SERVICE_FEE_NOT_ENABLED` |
| 428 | `PRECONDITION_REQUIRED` for a missing required If-Match |
| 429 | `RATE_LIMITED`; include Retry-After, retain the logical command key |
| 500 | `INTERNAL_ERROR`; sanitized message, never stack/provider/SQL details |
| 502 / 503 | `DEPENDENCY_UNAVAILABLE`, `MATERIALIZATION_UNAVAILABLE`, `SETTLEMENT_PENDING`; distinguish definite pre-submit failure from uncertain side effects. Reserved framework handlers use `CAPABILITY_NOT_IMPLEMENTED` with retryAction none |

402 belongs only to the downstream x402 data protocol. Insufficient upstream Graph budget appears as a control-plane blocker, not a browser payment challenge. Accepted background commands report subsequent failures in their resource state rather than changing the original 202 response.

## 3. Idempotency and Concurrency

All POST commands and state-changing PATCH/PUT operations require a random `Idempotency-Key` (UUID recommended, 16-128 printable ASCII characters). Explicit exceptions are read-only validation/preflight POSTs, which are labeled in their operation table. No normal GET starts a build, creates a wallet, pays Graph, or publishes an endpoint. Hosted data GETs are separately documented payment operations.

Scope command deduplication to verified actor, workspace when applicable, operation name, and key. Persist a keyed fingerprint of the normalized target, body, and preconditions. A matching retry returns the original durable command/resource identity; a different payload returns 409. Authenticate before deduplication, including replay. A concurrent duplicate never starts a second worker job. Ordinary keys are retained for at least the product's audit lifetime in MVP; an expired record is an explicit `IDEMPOTENCY_KEY_EXPIRED` conflict, not permission to execute again. This generic guarantee requires the approved M1 records plus a tested command service; run/payment keys alone do not cover every endpoint.

Redacted fingerprints must still distinguish secret rotations: use a server-keyed fingerprint of sensitive input, never store the input itself. Do not persist raw one-time API credentials in an idempotency response cache. Lost credential responses are recovered by revoking the identified key and issuing a new key under a new logical command; the old raw value is never shown again.

Resources with `lock_version` expose `lockVersion` and an opaque ETag. Metadata, layout, credential rotation/revocation, policy state, schedule state, and deployment/publication pointer mutations require `If-Match` from the affected resource's latest read. Missing yields 428; stale yields 412 without side effects. A retry first resolves its existing command before rechecking the old precondition. Immutable definitions use expected parent IDs and hashes, not a fabricated lock version.

Buttons disable while submitting, but the server enforces deduplication. Preserve only non-secret command IDs/keys in local recovery state. Aborting fetch, closing a page, or signing out does not cancel an accepted job or undo spending. Use explicit cancel operations where defined. Do not retry a provider submission with a new key until reconciliation establishes it is safe.

## 4. Durable Commands and Traces

Long-running mutations return 202 only after durable acceptance and transactional queue dispatch. Synchronous creates return 201; synchronous updates/read commands return 200. Resource creates include Location. In the current framework, no route returns 202: asynchronous acceptance is reserved until a durable command service and queue handoff are implemented. No 202 is a success claim for a wallet action, build, deployment, or settlement.

```json
{
  "data": {
    "commandId": "10000000-0000-4000-8000-000000000003",
    "status": "queued",
    "subject": {"type": "execution_run", "id": "10000000-0000-4000-8000-000000000004"},
    "traceStreamId": "10000000-0000-4000-8000-000000000005",
    "pollAfterMs": 2000
  },
  "meta": {"requestId": "req_example", "apiVersion": "1", "dataSource": "live", "observedAt": "2026-09-05T12:00:00Z"}
}
```

`CommandAccepted` has the fields above; subject and traceStreamId may be null before a producing operation creates its subject. `CommandDetail` additionally contains `operation`, `createdAt`, `updatedAt`, `finishedAt | null`, `result: ResourceRef[]`, `error: ErrorDetail | null`, and `cancellation: not_supported | available | requested | completed`. Proposed command states: `queued`, `running`, `blocked`, `succeeded`, `failed`, `cancelled`. Payment uncertainty remains on payment records and blocks the command; it is never generalized into an unpaid failure.

| Method | Path | Input | Result |
|---|---|---|---|
| GET | `/api/v1/commands/{commandId}` | Owner token | 200 `CommandDetail`; authorization uses stored actor/workspace ownership |
| GET | `/api/v1/trace-streams/{streamId}` | Owner token | 200 `TraceStream` |
| GET | `/api/v1/trace-streams/{streamId}/events` | `afterSequence=0`, `limit=100` (max 500) | 200 ordered `TraceEvent[]`, `nextAfterSequence`, `hasMore`, `streamStatus` in data |
| GET | `/api/v1/trace-streams/{streamId}/events/stream` | Optional Last-Event-ID | SSE; optional optimization, polling is the required fallback |
| GET | `/healthz` | None | 200 `{status: ok}` when API process is alive |
| GET | `/readyz` | None | 200 `{status: ready}` or 503 `{status: not_ready}`; DB/migration readiness only |

`TraceStream = {id, streamKind, status, lastSequenceNo: Count, subject: ResourceRef, createdAt, closedAt: Timestamp | null}`. Stream kind uses planning/build/refresh/deployment/api_access; status uses open/completed/failed. The subject is a server-selected reference to one of the stream's related resources.

`TraceEvent = {id, streamId, sequenceNo: Count, stage, eventType, status, summary, details, createdAt}`. `details` is an allowlisted event-specific schema, with IDs, counts, public evidence and error codes only. Schema source is `trace_events.details_json`; do not stream provider authorization or hidden reasoning. Trace retention follows the product lifetime policy.

SSE IDs are `streamId:sequenceNo`; emit only committed events, accept reconnects after the last processed sequence, and deduplicate by event ID. Initial sequence is 1. Include heartbeat comments and close completed streams after delivering their terminal event. If replay is unavailable, return `409 TRACE_CURSOR_UNAVAILABLE` before starting the stream and instruct a snapshot reload. Do not put access tokens in stream URLs; use authenticated fetch streaming because native EventSource cannot attach arbitrary bearer headers. Stop polling on terminal state, apply backoff on errors, and resume from the last cursor after reconnect.

## 5. Page-to-API Ownership

| Frontend page / feature | Backend contracts |
|---|---|
| EntryPage / auth | App configuration, Privy authentication, identity bootstrap, public demo metadata |
| DashboardPage | Workspace overview, product list/search, product/session creation, latest run/activity |
| WalletAccessPage | Wallet/credential/grant/budget/capability reads; explicit lifecycle commands |
| ModelServicePage | Temporary demo profile read/write/connection test; durable authenticated workspace model-profile and secret lifecycle remain an M4 review item |
| ProductBuilderPage / useBuildRun | Messages and proposals, versions/diffs, sources/operator registry, layout, preflight/build, runs, traces, output |
| ApiDeploymentPage / useRequestTest | Deployment preflight/activation, private tests, endpoint contract, API credentials, refresh controls, access history |
| MonetizationRevenuePage | Publication draft/activation/retirement, recipient gates, sales/settlement/allocations |
| PublicProductPage / useConsumerRequest | Public metadata, x402 challenge and paid retry, authorized receipt and delivery recovery |

`frontendServices.buildVersion()` becomes submit-command plus run/trace reads, not a delayed success flag. `testRequest()` becomes an owner-authorized private request with explicit parameters. `requestPaidData()` must not hide approval or uncertainty inside one generic promise: split challenge, buyer authorization, submission, reconciliation, and delivery recovery. Navigation, language, copy feedback, tab selection, unsaved form buffers, and canvas selection remain frontend state and need no endpoint.

## 6. Review Gates and Data-Model Gaps

M1-M3 directions below were approved on 2026-09-05 and incorporated into data-model 1.5. M1 maps to control_commands/command_dispatches; M2 maps to request recovery fields and api_payment_proofs; M3 maps to clarified lifecycle and transaction boundaries. SQL structure and representative guards exist; HTTP semantics and services still need implementation. M4 records the newly approved product requirement but its proposed durable persistence shape still needs human review. E1/E2 remain unresolved. Process memory is permitted only for the explicitly labeled evaluator model profile; do not substitute it for a durable authenticated implementation.

| Gate | Finding | Recommended resolution | Affected interfaces |
|---|---|---|---|
| M1 | Only runs and payments have logical idempotency keys; Agent jobs and other mutations lack a shared durable outcome | Add a `control_commands` record with actor/workspace scope, operation/key uniqueness, keyed request fingerprint, lifecycle, cancellation, sanitized result references/error, and timestamps; bind queue dispatch atomically. Store a proposal in existing agent-message structured content, not a new mutable version | All command-key guarantees, command polling, Agent planning, wallet/deployment orchestration |
| M2 | `correlation_id` is public-safe, not receipt authorization; nullable `api_credential_id` cannot safely scope anonymous deduplication | Add a hashed per-request recovery capability and its expiry/revocation/ownership binding, plus anonymous request-key uniqueness. Bind it to exactly one access request and request hash; never store raw bearer recovery values | Anonymous paid request correlation, receipts, post-payment delivery retry |
| M3 | Model version lifecycle has no validation-passed waiting state, while UI requires explicit Build; materialization transaction text could move deployment pointers on a normal build | Keep existing enums and clarify `validating -> proposed` after non-paid validation, using validatedAt/summary for build readiness. Initial failed/cancelled runtime builds return to proposed with run evidence; validation failure remains invalid. Permit queued run cancellation before dispatch; a previously ready version stays ready after a failed refresh. Build creates ready output only; explicit activation moves version pointers; refresh only advances the still-active version's materialization | Version validation, build, run recovery, deployment activation and refresh races |
| M4 | Creator-selected model URL, model identity, secret rotation, and the exact profile revision used by a planning call have no approved durable resource | Review the proposed `agent_model_profiles` extension in data-model 1.5, store only a secret-manager reference, and pin the profile/secret revision plus credential fingerprint on every model planning call | Model Service, Agent planning, audit, rotation/revocation, and usage controls |
| E1 | Privy policy/signing details and creator-controlled Hedera receive/access checks remain unverified | Pin and validate provider adapters and consent-proof schemas before enabling corresponding mutations; retain blocked readiness until then | Delegation setup/revocation, recipient verification, live Graph payments |
| E2 | Capped judge-consumer ownership, funding, rate limits, shutdown, and browser recovery are undecided | Review the separate buyer security contract before implementing a hosted signing endpoint. This draft reserves no unrestricted server-funded payment route | Public demo paid action and reload-safe buyer recovery |

For M2, an unguessable correlation ID alone is not the recommended solution: it is routinely displayed in evidence. Recovery authorization must remain separate, and a public receipt must still require possession/ownership verification. Details and browser persistence constraints are in the consumer document.

Two existing model constraints are preserved, not silently removed: creating a durable product requires a same-workspace accountWalletId even in Graph API-key mode, but never requires wallet funding/delegation for that mode; planning before wallet provisioning can use an unbound Agent session. Changing refresh semantics creates a product version, while pause/resume only changes the schedule's operational state.

Default fee remains disabled. UI sample price, 5% fee, five-minute cadence, API rate limit, source IDs, balances, and success badges are not contractual production defaults. No mainnet, HTS, role management, arbitrary-code nodes, live-per-request Graph execution, bridging, or marketplace API is added here.

## 7. Verification and Implementation Handoff

Before endpoint implementation, review the DTO/runtime schemas and implement the approved M1-M3 service transactions against data-model 1.5. E1/E2 gate only the corresponding live provider/buyer capabilities, not non-paid product development. The generated [framework OpenAPI](backend/openapi.json) now covers route reservations and implemented transport/identity schemas only. Add reviewed business request/response schemas with each handler before generating complete frontend clients. Reserved operations intentionally declare no successful business response.

The endpoint catalog maps the complete designed UI; it is not a requirement to implement every convenience read before the first vertical slice. Use this order:

1. Bootstrap, wallet reference synchronization, Graph credential path, products/session/messages, proposal acceptance, version detail, build, run polling, and output.
2. Deployment activation, private request, endpoint contract/credential, and scheduled refresh; then verified Graph x402 authority/spend evidence for the sponsor flow.
3. Hedera recipient gates, publication, independent paid consumer, receipt/recovery, and financial summaries.
4. Additional paginated history/detail reads, richer filtering, diff presentation, and optional SSE after polling and primary flows work. These remain documented UI targets, not new page families or additional sponsors.

Convenience read endpoints may initially compose existing read models internally. Do not split them into separate services or add a table for every DTO. Privileged mutation and payment-safety checks cannot be deferred as UI polish.

Acceptance tests must include cross-workspace object access, unknown fields, stale If-Match, concurrent duplicate commands, queue-crash recovery, trace reconnect, immutable version edits, no build-triggered activation, refresh/activation races, secret redaction, credential rotation with no x402 fallback, string-safe monetary arithmetic, revoked/drifted authority, separate network totals, pinned 402 retries, replay rejection, facilitator uncertainty, and payment-confirmed/delivery-failed recovery without a second charge. Test both Vercel/Railway and Docker networking; do not rely on a Vercel serverless request lasting for an entire build.

Framework implementation now reserves all cataloged routes; its approved M1-M3 persistence remains in backend/migrations. No reserved handler accepts a command, verifies a payment or returns simulated business success. Current provider references were checked only for authentication and x402 wire conventions; live interoperability is still unverified.
