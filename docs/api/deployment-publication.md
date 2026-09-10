# Deployment, Private API, and Publication APIs

Draft 0.3. Read the [shared contract](../../api-contract.md) and [Builder contracts](products-builder.md). `W` expands to `/api/v1/workspaces/{workspaceId}`. All creator operations require the active owner; mutations require Idempotency-Key. The implemented hosted profile is live: build persists an immutable executable version, deployment activates that version, and each data request makes fresh bounded The Graph queries before running the fixed DAG. Result rows are not materialized or reused. Publication, payment, refresh, and multi-key management sections remain future contracts unless explicitly marked implemented.

## 0. Product Delivery Read Model

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `W/products/{productId}/delivery` | None | 200 `ProductDeliveryView` | Read-only projection of version, deployment, materialization, publication, recipient capability, sales, and ledger facts |

`ProductDeliveryView` is the shared backend fact source for the authenticated API and Monetize pages. It returns explicit readiness and blocker codes rather than synthesizing a healthy endpoint, example rows, publication, price, recipient, or revenue. Its `capabilities` object reports deploy, private request, private export, x402 publication, and public request independently. The API contract appears when a healthy deployment has an active ready version and configured endpoint URL; a live deployment does not require an active materialization. The fixed optional `limit` parameter is the platform contract documented below, while every output field comes from the active immutable version.

The monetization projection selects only a stored Hedera x402 publication revision, derives recipient readiness from the linked wallet address and HBAR capability observation, aggregates confirmed ledger entries by network and asset, and returns at most twenty persisted paid access requests. It masks payer addresses and never counts pending or uncertain values as confirmed revenue. This read does not deploy, publish, charge, retry, reconcile, or grant wallet authority.

## 1. Deployment Lifecycle

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `W/products/{productId}/deployments` | None | 200 Deployment collection | Logical deployment in the server-configured environment |
| POST | `W/products/{productId}/deployments` | `{alias?: string}` | 201 `{deployment, apiKey}` | Activate latest ready version and issue one scoped Sprue API key |
| GET | `W/products/{productId}/private-export` | None | Downloadable deployment bundle | Immutable plan plus portable runner contract; never credentials |
| GET | `W/deployments/{deploymentId}` | None | 200 `Deployment` + ETag | Atomic active pointers and health/freshness |
| POST | `W/deployments/{deploymentId}/activation-preflight` | `{versionId, materializationId}`; read-only, key optional | 200 `ActivationPreflight` | Read ownership, output schema, artifact and runtime readiness |
| POST | `W/deployments/{deploymentId}/activate` | `{versionId, materializationId, expectedSpecHash}` + If-Match | 202 `CommandAccepted` | Explicit atomic activation after all checks |
| GET | `W/deployments/{deploymentId}/contract` | None | 200 `EndpointContract` | Exact active output schema/access/parameter/code-sample projection |
| GET | `W/deployments/{deploymentId}/trace-streams` | Pagination | 200 TraceStream collection | Deployment streams linked through product/version; expose only relevant deployment events |
| GET | `W/deployments/{deploymentId}/access-requests` | `status?`, pagination | 200 `AccessRequestSummary` collection | Logical requests, not server/cloud raw logs |

Creation chooses the configured environment/provider/runtime and upserts the product's logical deployment. The canonical URL is `/data/v1/{ownerUserId}/{productId}`. An optional lowercase alias may resolve at `/data/v1/{ownerUserId}/{alias}` and is unique only inside the owner's workspace/environment. The browser cannot choose provider internals, overwrite another owner's route, or trigger per-product application-code generation. Each successful deployment response reveals the new Sprue API key once; only its prefix and HMAC remain stored.

The immutable ready version contains compiler identity, DAG operator versions, static GraphQL documents, bounded pagination policy, exact source snapshots and bindings, credential references, output schema, and a canonical specification hash. The runtime verifies that hash and never recompiles or accepts arbitrary query/code input from the caller. Each `GET /data/v1/{ownerUserId}/{productIdOrAlias}?limit=N` requires `Authorization: Bearer sprue_live_...`, queries every source again, executes the fixed DAG, returns `Cache-Control: private, no-store`, and reports the live query timestamp and source request counts in response metadata.

`Deployment = {id, productId, environment, provider, runtimeTarget: shared_hosted, endpointSlug, endpointUrl: string | null, publicProductUrl: string | null, activeVersionId: Id | null, activeMaterializationId: Id | null, activePublicationVersionId: Id | null, status, lastHealthAt: Timestamp | null, materialization: MaterializationSummary | null, publication: PublicationSummary | null, schedule: RefreshSchedule | null, lockVersion, updatedAt}`. Derived URLs come from configured origins. publicProductUrl is null unless an active public x402 revision exists. Fixture artifactDigest/region/lastDeployed must not become invented persistent fields: use actual artifact contentHash, observation timestamps, and optional deployment configuration metadata, clearly labeled.

`MaterializationSummary = {id, versionId, runId, artifactId, contentHash, rowCount: Count | null, byteCount: Count, status, sourceFreshnessAt, createdAt, expiresAt: Timestamp | null, freshness: current | stale | unavailable}`. Freshness is derived using observed source age/refresh policy; it is not an alternate materialization status.

`ActivationPreflight = {deploymentId, versionId, materializationId, ready, checkedAt, blockers: Blocker[], currentVersionId: Id | null, currentMaterializationId: Id | null, accessModeAfterActivation, scheduleAfterActivation: RefreshPolicy, expectedDeploymentEtag}`. RefreshPolicy comes from the selected immutable specification. Preflight does not reserve a deployment or waive later checks.

Activation requires a ready version, a ready schema-valid materialization from a successful run for that version, same-workspace ownership, valid source provenance, and a compatible runtime. Update version/materialization pointers and the schedule projection in one transaction after rechecking If-Match. Preserve existing paid policy only when its public contract and capabilities remain valid; otherwise reject `409 PUBLICATION_REVALIDATION_REQUIRED` and require a deliberate private/publication transition. Do not silently change price or recipient while deploying.

A new deployment may show deploying while its command runs. A replacement command must keep the last usable active pointers until commit; failure remains in command/trace evidence and does not destroy a healthy prior API. Building never calls this endpoint automatically.

## 2. Private Testing and Endpoint Contract

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `/data/v1/{ownerId}/{productRef}` | `Authorization: Bearer sprue_live_...`; optional `limit` | 200 live `DataResponse` | API-key-authorized execution of the immutable plan with fresh bounded The Graph reads |
| POST | `W/deployments/{deploymentId}/private-requests` | `{parameters: {limit?: number}}` | 200 `PrivateTestResult` | Owner-authorized api_access_requests/attempts + usage; no api_sale or Graph query |
| GET | `W/access-requests/{accessRequestId}` | None | 200 creator `RequestReceipt` | Sanitized request/payment/delivery chronology |

`EndpointContract = {deploymentId, activeVersionId, endpointUrl, method: GET, parameterSchema, responseSchema, serveMode: live, accessMode: api_key}`.

The initial parameter contract is platform-defined: optional integer `limit`, default 100, minimum 1, maximum 1000. No arbitrary GraphQL query, offset, filter expression, sort expression, SQL, or refresh flag is accepted. It selects the first N rows of the current execution's canonical output. Limit never changes the spec. The canonical DAG determines ordering; public output schema declares row types. Future product-defined parameters require a versioned spec/model change, not ad hoc UI fields.

ResponseSchema describes `{data: <output rows>, meta: <delivery metadata>}`, with the row schema derived from the active specification.outputSchema. Backend-generated examples contain placeholders for secrets and correctly reflect the access mode; plain cURL cannot sign a Hedera transaction. A Python tab may show the unpaid challenge and integration requirements rather than falsely claiming compatible signing support. The live consumer command is published only after its pinned adapter is tested.

`PrivateTestResult = {accessRequestId, correlationId, authorizationMode: creator_preview, httpStatus, responseHeaders: object, durationMs: number, body: DataResponse}`. responseHeaders is an allowlist of content/freshness/version/correlation headers; never echo Authorization or Set-Cookie. DataResponse is defined in the consumer document. Private test bypasses public charging only after creator authorization and logs that mode; it is not evidence of a real paid request. For an unsuccessful test, return the actual non-2xx Sprue error, including a safe accessRequestId if one was persisted. Do not wrap failures in fake HTTP 200 success.

Owner preview remains available after x402 publication. It is a separate control-plane route. An API key cannot use that route, and a creator token is not a free-access bypass on the public x402 route.

## 3. Sprue API Credentials

These keys access a hosted product and are unrelated to customer Graph API keys.

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `W/deployments/{deploymentId}/api-credentials` | Pagination | 200 ApiCredential collection | api_credentials metadata only |
| POST | `W/deployments/{deploymentId}/api-credentials` | `{name, expiresAt?: Timestamp}` | 201 `{credential: ApiCredential, secret: string \| null, secretAvailable: boolean}` | Generate once; persist prefix + one-way hash only |
| POST | `W/deployments/{deploymentId}/api-credentials/{credentialId}/revoke` | `{}` | 200 `ApiCredential` | Revoke subsequent access, not prior receipts |

`ApiCredential = {id, deploymentId, name, keyPrefix, scopes: [{method: GET, path: string}], status: active | revoked | expired, createdAt, expiresAt: Timestamp | null, lastUsedAt: Timestamp | null, revokedAt: Timestamp | null}`. name is 1-80 characters; expiry must be in the future and within server policy. Scope is server-derived and restricted to the selected endpoint; no arbitrary path/method or admin scope input.

The first successful creation returns secretAvailable true and the raw key. Replayed matching commands return the same metadata, secret null, and secretAvailable false; command result storage never saves the secret. If the first response was lost, revoke that credential and issue another. The UI cannot recover a secret by listing keys or reopening a dialog. Multiple-key lifecycle is represented, but richer scope-management UI is deferred. Revocation is monotonic and safely repeatable; this table has no invented lockVersion.

`Authorization: Bearer <Sprue API key>` authenticates generated private/api_key data requests. The API distinguishes its own credential format and verifies only the matching token type; ambiguous or multiple authorization inputs are rejected. It never forwards that key upstream.

## 4. Refresh Schedule and Run Now

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `W/deployments/{deploymentId}/refresh-schedule` | None | 200 `{schedule: RefreshSchedule \| null}` + ETag when present | refresh_schedules projection |
| PATCH | `W/deployments/{deploymentId}/refresh-schedule` | `{status: paused \| active}` + If-Match | 200 `RefreshSchedule` | Operational pause/resume only |
| POST | `W/deployments/{deploymentId}/refresh-preflight` | `{}`; read-only, key optional | 200 `BuildPreflight` plus active version/deployment references | No spend; same guards as build |
| POST | `W/deployments/{deploymentId}/refreshes` | `{expectedActiveVersionId, acknowledgeSpendingBounds}` + If-Match | 202 `CommandAccepted` with execution_run subject | Pin deployed version and start explicit refresh |

`RefreshSchedule = {id, deploymentId, cronExpression, timezone, status: active | paused | disabled, nextRunAt: Timestamp | null, lastRunAt: Timestamp | null, lockVersion}`. Cron is portable five-field syntax and timezone an IANA name. Cadence edits go through a new product version, Build, then explicit activation. Do not PATCH cron/timezone or mutate refreshPolicy through this endpoint. Pause/resume does not cancel an already accepted run. Resuming rechecks active source permissions and spending authority.

Automatic refreshes use the active version's approved cadence and current bounded policy; they do not require another browser confirmation for each scheduled run. Run-now confirmation still exposes relevant bounds. Coalesce or block overlapping refreshes for one deployment, and pin the current active version at dispatch. A successful refresh can update only the materialization pointer for that same still-active version; otherwise keep the artifact/history without activating it. This conditional update is a critical M3 concurrency test.

## 5. Publication Draft, Activation, and Retirement

Publication is access configuration on Sprue's existing API, not a Blocky402 marketplace listing. A ready private deployment exists before x402 is offered.

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `W/deployments/{deploymentId}/publications` | Pagination | 200 Publication collection | publication_versions |
| POST | `W/deployments/{deploymentId}/publication-preflight` | `PublicationInput`; read-only, key optional | 200 `PublicationPreflight` | Recheck recipient, profile, capability and current API |
| POST | `W/deployments/{deploymentId}/publications` | `PublicationInput` | 201 `Publication` draft | Insert immutable configuration revision |
| GET | `W/deployments/{deploymentId}/publications/{publicationId}` | None | 200 `Publication` | Exact revision; no secret facilitator config |
| POST | `W/deployments/{deploymentId}/publications/{publicationId}/activate` | `{expectedActivePublicationVersionId: Id \| null}` + deployment If-Match | 202 `CommandAccepted` | Final confirmation; revalidate and atomically switch publication pointer |
| POST | `W/deployments/{deploymentId}/publications/{publicationId}/retire` | `{}` + deployment If-Match | 200 `Deployment` | Retire active x402 policy and atomically install a private revision; no deletion |

Private/API-key input is `{accessMode: private | api_key, serveMode: materialized}`. x402 input:

```json
{
  "accessMode": "x402",
  "serveMode": "materialized",
  "networkId": "30000000-0000-4000-8000-000000000001",
  "assetId": "30000000-0000-4000-8000-000000000002",
  "priceAtomic": "20000000",
  "recipientWalletAddressId": "30000000-0000-4000-8000-000000000003",
  "paymentProtocolVersion": "2",
  "paymentScheme": "exact",
  "maxTimeoutSeconds": 120,
  "facilitator": "blocky402",
  "serviceFeeEnabled": false
}
```

IDs above are illustrative, not usable seed records. The selected network/asset must resolve to Hedera testnet HBAR (0.0.0, 8 decimals). 20000000 tinybars is exactly 0.20 HBAR. Convert user decimal text with integer arithmetic, reject more than 8 fractional digits, and submit Atomic strings. The maximum timeout is a positive integer within the live adapter/platform bounds; 120 is an example, not a sponsor/default requirement.

Reject a nonpositive price, mainnet/HTS, unresolved EVM recipient, custom facilitator URL, client-selected fee payer, serveMode live, or serviceFeeEnabled true. The backend supplies and pins the facilitator capability/hash/observation from supported configuration. serviceFeeTerms and acceptance fields cannot be supplied while fees are disabled. The hackathon frontend omits fee controls and allocations entirely.

`Publication = {id, deploymentId, revisionNo, accessMode, serveMode, status, price: Money | null, recipient: {walletAddressId, networkAccountRef} | null, paymentProtocolVersion: string | null, paymentScheme: string | null, maxTimeoutSeconds: number | null, facilitator: string | null, capability: {hash, observedAt, networkFeePayerAddress} | null, serviceFee: {enabled: false, terms: null}, createdAt}`. Private/api_key revisions have null payment fields.

`PublicationPreflight = {ready, checkedAt, normalizedConfiguration: PublicationInput, price: Money | null, recipient: RecipientCapability | null, facilitatorCapability: {hash, observedAt, networkFeePayerAddress} | null, blockers: Blocker[], expectedDeploymentEtag}`. Read-only preflight can refresh public provider capability observations, but it cannot create a transfer or charge. Do not treat it as a guaranteed future price/support reservation.

Activation checks a healthy deployment, ready unexpired materialization, supported immutable source snapshot, resolved complete creator-controlled account, current HBAR receive AND later-spend capability, and matching live facilitator profile. Draft values remain immutable: changing price/recipient/timeout/access creates a new revision. Retiring one revision does not delete receipts, reclaim transferred money, or cancel confirmed deliveries; the consumer document defines in-flight handling. Repeated retirement must resolve through the command key, not create endless private revisions.

## 6. Blocking Conditions

`VERSION_NOT_READY`, `MATERIALIZATION_UNAVAILABLE`, `DEPLOYMENT_NOT_HEALTHY`, `PUBLICATION_REVALIDATION_REQUIRED`, `RECIPIENT_CONTROL_UNVERIFIED`, `ACCOUNT_INCOMPLETE`, `ASSET_CAPABILITY_STALE`, `FACILITATOR_CAPABILITY_CHANGED`, and `SOURCE_REDISTRIBUTION_UNVERIFIED` block activation without changing the active pointer. Source redistribution approval requires an operator-verified policy/evidence gate; no UI checkbox can establish rights or create unreviewed licensing columns.

Platform rate limits, freshness labels, and allowed timeout ranges are explicit configuration projections. The frontend must render observed values; its sample 120 req/min, five-minute cache, US region, and "Healthy" badges are not defaults inferred by this contract.
