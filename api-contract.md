# Sprue Frontend and Backend API Contract

## Status and Authority

Draft 0.22, updated on 2026-09-12 for human review. Builder working drafts now have an owner-authorized GET/PUT resource backed by PostgreSQL. The PUT validates the exact layout-free structured DAG, uses an ETag/If-Match lock version, and changes no immutable version, deployment, credential, execution, or publication record. A backend build may persist a new ready immutable version, but activation remains a separate explicit Deploy/Redeploy command; an existing API and x402 publication continue using their current active pointers until that command succeeds. API and X402 read one owner-authorized live product-delivery projection and never fall back to browser or backend demo fixtures. Managed API deployment, one-time API-key issuance, live authenticated DAG execution, deployment suspension, Hedera testnet HBAR x402 activation/retirement, facilitator verification/settlement, server-internal post-payment DAG execution, and persisted settlement/revenue evidence are implemented. Suspending a deployment revokes its active keys and retires its x402 gate; retiring x402 alone keeps the private API available. The public paid path never exposes its derived internal credential, and settled-but-undelivered requests remain durable evidence. The public evaluator view still uses the explicitly temporary backend demo runtime documented in [demo-runtime.md](docs/api/demo-runtime.md). Dashboard, Wallet and Access, Model Service, Agent Planner, and Builder also use owner-authorized live workspace APIs. Wallet settings now observe a creator-approved Privy delegated signer/policy reference, record it as pending/unverified with no signer secret reference, and persist a required positive Base Sepolia USDC daily budget as draft by UTC day. This does not implement delegated Graph purchase execution or prove provider-side budget enforcement. Account linking, durable withdrawal history, Graph-key rotation, live delegated Graph spending, and native Hedera buyer signing remain outside this implemented boundary. See [backend/framework.md](backend/framework.md) for the exact implemented and reserved boundary.

The 2026-09-09 long-running planning amendment gives each external model or Graph step a configurable 600-second default bound and gives the complete synchronous planning run a separately configurable 3,600-second default deadline. The browser planning transport waits longer than the backend's maximum permitted two-hour run, keeps the active trace polling while the view remains mounted, and cancels both operations on unmount. These longer limits do not authorize retries or additional provider calls.

Inputs: [data model 1.14](data-model.md), [product design 1.57](product-design.md), [current frontend ownership](frontend/README.md), and [implementation status](frontend/implementation-status.md). Database invariants take precedence over fixture behavior. M1-M4 persistence directions remain in the data model and database foundation. Process probes, public app configuration, configured Privy token verification, provider-identity resolution to a stable Sprue user UUID, creator identity reads, transactional account/workspace bootstrap, user-wallet provisioning/binding, current Privy and Hedera balance observations, explicit idempotent Hedera testnet account activation, complete-account creator-control projection for the demonstrated Privy EVM path, durable encrypted workspace model profiles and Graph credentials, Graph credential validation/default selection/revocation, and the explicitly temporary backend demo projection are implemented. Creator data is bound to an owner-authorized workspace while public demo state cannot mutate it. Other durable domain routes remain reserved and return 503 without side effects. The hackathon publication profile charges no Sprue service fee. A hollow Hedera account does not establish signer/payment authority; a complete account at the bound Privy EVM address establishes the tested interactive EVM control path only. The demo projection and optional model call do not establish durable Graph query capability or authorize a funded operation or deployment.

The specification uses resource-oriented JSON APIs, durable asynchronous commands, and resumable trace reads. HTTP transport is shared by Railway and Docker deployments. No browser calls the database, Graph payment adapter, private Privy signer, or Blocky402 settlement endpoint directly. The temporary demo runtime is explicitly non-durable and is not a substitute for the resource contracts below.

## Document Map

| Document | Contents |
|---|---|
| This document | Shared conventions, authentication, concurrency, asynchronous work, errors, page mapping, and review gates |
| [Identity and wallet](docs/api/identity-wallet.md) | Bootstrap, wallet synchronization, credentials, delegation, budgets, funding, and recipient readiness |
| [Products and Builder](docs/api/products-builder.md) | Product listing, conversations, proposals, immutable versions, DAG layout, runs, artifacts, and traces |
| [Deployment and publication](docs/api/deployment-publication.md) | Private API, activation, API credentials, schedules, HBAR publication, and retirement |
| [Consumers and financial evidence](docs/api/consumer-payments.md) | Public metadata, generated data API, x402, recovery, receipts, and financial read models |
| [Model Service](docs/api/model-service.md) | Durable encrypted workspace model profile, redacted reads, non-saving connection test, and key rotation |

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
- Google and GitHub use Privy OAuth and are the only current creator login methods. Each successful session supplies a provider-signed subject that resolves through `auth_identities` to a stable, application-owned Sprue user UUID. Sprue does not merge different provider subjects by email or other heuristics; account linking remains a separate reviewed flow. Provider login never accepts a client-selected local account. After identity/workspace bootstrap, the server idempotently ensures one user-owned Privy Ethereum wallet using that verified provider subject; it never funds the wallet or creates signer, policy, delegation, or payment authority.
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

Never return secret-manager paths, model-key ciphertext or encryption metadata, key hashes, raw provider errors, signer secrets, hidden reasoning, or reusable payment authorizations. The sole API-credential raw-key response is specified separately. Graph-key and model-key inputs are write-only and are excluded from request logging, command snapshots, and error bodies.

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
| EntryPage / LoginPage / auth | App configuration, public entry routing, Privy authentication, identity bootstrap, public demo metadata |
| DashboardPage | Workspace overview, product list/search, product/session creation, latest run/activity |
| WalletAccessPage | Wallet/credential/grant/budget/capability reads; explicit lifecycle commands |
| ModelServicePage | Durable owner-authorized profile read/write plus an explicit non-saving connection test; all reads are redacted |
| ProductBuilderPage / useBuildRun | Messages and proposals, versions/diffs, sources/operator registry, layout, preflight/build, runs, traces, output |
| ApiDeploymentPage | Live product-delivery projection; later deployment preflight/activation, private tests, API credentials, refresh controls, and access history |
| MonetizationRevenuePage | Live product-delivery projection; later publication draft/activation/retirement and settlement reconciliation |
| PublicProductPage / useConsumerRequest | Public metadata, x402 challenge and paid retry, authorized receipt and delivery recovery |

`frontendServices.buildVersion()` becomes submit-command plus run/trace reads, not a delayed success flag. `testRequest()` becomes an owner-authorized private request with explicit parameters. `requestPaidData()` must not hide approval or uncertainty inside one generic promise: split challenge, buyer authorization, submission, reconciliation, and delivery recovery. Navigation, language, copy feedback, tab selection, unsaved form buffers, and canvas selection remain frontend state and need no endpoint.

## 6. Review Gates and Data-Model Gaps

M1-M3 directions were approved on 2026-09-05 and remain incorporated in data-model 1.12. M1 maps to control_commands/command_dispatches; the Hedera activation slice now uses a synchronous, non-dispatched command row and keyed request fingerprint for safe replay. M2 maps to request recovery fields and api_payment_proofs; M3 maps to clarified lifecycle and transaction boundaries. M4 is implemented as the durable encrypted `agent_model_profiles` resource and authenticated HTTP service. Exact planning-call audit binding, explicit profile deletion/revocation, and distributed abuse controls remain follow-up work. The Graph-key envelope, validation/default selection/revocation, wallet provisioning/read, Hedera testnet activation, and demonstrated interactive Privy EVM control projection are implemented, but they do not resolve M5, delegated Graph spending, native Hedera x402 signing, or E2.

| Gate | Finding | Recommended resolution | Affected interfaces |
|---|---|---|---|
| M1 | Only runs and payments have logical idempotency keys; Agent jobs and other mutations lack a shared durable outcome | Add a `control_commands` record with actor/workspace scope, operation/key uniqueness, keyed request fingerprint, lifecycle, cancellation, sanitized result references/error, and timestamps; bind queue dispatch atomically. Store a proposal in existing agent-message structured content, not a new mutable version | All command-key guarantees, command polling, Agent planning, wallet/deployment orchestration |
| M2 | `correlation_id` is public-safe, not receipt authorization; nullable `api_credential_id` cannot safely scope anonymous deduplication | Add a hashed per-request recovery capability and its expiry/revocation/ownership binding, plus anonymous request-key uniqueness. Bind it to exactly one access request and request hash; never store raw bearer recovery values | Anonymous paid request correlation, receipts, post-payment delivery retry |
| M3 | Model version lifecycle has no validation-passed waiting state, while UI requires explicit Build; materialization transaction text could move deployment pointers on a normal build | Keep existing enums and clarify `validating -> proposed` after non-paid validation, using validatedAt/summary for build readiness. Initial failed/cancelled runtime builds return to proposed with run evidence; validation failure remains invalid. Permit queued run cancellation before dispatch; a previously ready version stays ready after a failed refresh. Build creates ready output only; explicit activation moves version pointers; refresh only advances the still-active version's materialization | Version validation, build, run recovery, deployment activation and refresh races |
| M4 | Durable workspace URL/model/API-key storage and keyring rotation are implemented; exact planning-call audit binding and explicit profile revocation are not | Pin the profile ID, secret version, model identity, and credential fingerprint on each future durable planning call; add a reviewed revocation command before exposing deletion | Agent planning audit, rotation/revocation, and usage controls |
| M5 | Creator-confirmed direct testnet withdrawals are implemented browser-to-Privy without Sprue custody, but durable withdrawal intents, stored fee quotes, reload-safe history, and server-side receipt reconciliation remain unmodeled | Keep direct withdrawals fixed to backend-returned wallet/network/asset data, require visible Privy confirmation, expose only submitted/confirmed/reverted client states, and create no Sprue ledger fact; add a reviewed command and schema before durable or automated transfers | Wallet balances, outbound transfer dialog, future ledger and reconciliation |
| E1 | Interactive Privy EVM signing, Hedera fee spend, and creator-confirmed direct testnet withdrawals use the demonstrated EVM path, but delegated Privy policy enforcement, native Hedera x402 signing, and facilitator settlement remain unverified | Preserve direct owner confirmation as a separate boundary; pin and validate provider adapters, policy rules, and consent-proof schemas before enabling delegated Graph payments or publication | Delegation setup/revocation, live Graph payments, paid publication |
| E2 | Capped judge-consumer ownership, funding, rate limits, shutdown, and browser recovery are undecided | Review the separate buyer security contract before implementing a hosted signing endpoint. This draft reserves no unrestricted server-funded payment route | Public demo paid action and reload-safe buyer recovery |

For M2, an unguessable correlation ID alone is not the recommended solution: it is routinely displayed in evidence. Recovery authorization must remain separate, and a public receipt must still require possession/ownership verification. Details and browser persistence constraints are in the consumer document.

Two existing model constraints are preserved, not silently removed: creating a durable product requires a same-workspace accountWalletId even in Graph API-key mode, but never requires wallet funding/delegation for that mode; planning before wallet provisioning can use an unbound Agent session. Changing refresh semantics creates a product version, while pause/resume only changes the schedule's operational state.

The hackathon profile has no Sprue service fee; future-compatible fee fields remain disabled and zero. UI sample price, five-minute cadence, API rate limit, source IDs, balances, and success badges are not contractual production defaults. No mainnet, HTS, role management, arbitrary-code nodes, live-per-request Graph execution, bridging, or marketplace API is added here.

## 7. Verification and Implementation Handoff

Before implementing additional endpoints, review the DTO/runtime schemas and implement approved service transactions against data-model 1.13. The remaining E1/E2 items gate only the corresponding delegated provider, durable transfer history, publication, and buyer capabilities, not direct creator-confirmed testnet withdrawals, non-paid product development, or the already demonstrated account-control read state. The generated [framework OpenAPI](backend/openapi.json) covers route reservations, transport/identity schemas, Model Service, Wallet and Access, Hedera testnet account activation, and Graph credential create/list/validate/select/revoke schemas. Add reviewed business schemas with each handler before generating complete frontend clients. Reserved operations intentionally declare no successful business response.

The endpoint catalog maps the complete designed UI; it is not a requirement to implement every convenience read before the first vertical slice. Use this order:

1. Bootstrap, wallet reference synchronization, Graph credential path, products/session/messages, proposal acceptance, version detail, build, run polling, and output.
2. Deployment activation, private request, endpoint contract/credential, and scheduled refresh; then verified Graph x402 authority/spend evidence for the sponsor flow.
3. Hedera recipient gates, publication, independent paid consumer, receipt/recovery, and financial summaries.
4. Additional paginated history/detail reads, richer filtering, diff presentation, and optional SSE after polling and primary flows work. These remain documented UI targets, not new page families or additional sponsors.

Convenience read endpoints may initially compose existing read models internally. Do not split them into separate services or add a table for every DTO. Privileged mutation and payment-safety checks cannot be deferred as UI polish.

Acceptance tests must include cross-workspace object access, unknown fields, stale If-Match, concurrent duplicate commands, queue-crash recovery, trace reconnect, immutable version edits, no build-triggered activation, refresh/activation races, secret redaction, credential rotation with no x402 fallback, string-safe monetary arithmetic, revoked/drifted authority, separate network totals, pinned 402 retries, replay rejection, facilitator uncertainty, and payment-confirmed/delivery-failed recovery without a second charge. Test both Vercel/Railway and Docker networking; do not rely on a Vercel serverless request lasting for an entire build.

Framework implementation now reserves all cataloged routes; its approved M1-M3 persistence remains in backend/migrations. No reserved handler accepts a command, verifies a payment or returns simulated business success. Current provider references were checked only for authentication and x402 wire conventions; live interoperability is still unverified.
