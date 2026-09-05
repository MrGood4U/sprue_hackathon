# Consumer, x402, and Financial Evidence APIs

Draft 0.1. Read the [shared contract](../../api-contract.md). Public means a safe projection, not unrestricted access to payment records or data. `W` expands to `/api/v1/workspaces/{workspaceId}`. Anonymous recovery depends on model gate M2; hosted judge signing and browser authority restoration remain gated by E2.

## 1. Public Product Metadata

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `/api/v1/public/products/{endpointSlug}` | None | 200 `PublicProduct` | Allowlisted active product/deployment/publication/materialization projection |

`PublicProduct = {name, description: string | null, endpointSlug, endpointUrl, method: GET, activeVersion: {id, versionNo}, health, materialization: {id, sourceFreshnessAt, createdAt, freshness}, parameterSchema, responseSchema, sources: [{provider, dataNetworkRef, attribution, evidenceUrl: string | null}], payment: {network, assetIdentifier, symbol, decimals, amountAtomic, protocolVersion: "2", scheme: exact, facilitator: blocky402}, example: {kind: synthetic, rows: JSON[]} | null, clientExamples: {curl, javascript, python}, consumer: {mode: external_client | capped_demo, enabled, blockers: Blocker[]}}`.

Only an active x402 publication exposes this description. Private, retired, invalid, or suspended resources return 404, without product existence details. A degraded public service may return its safe description with health/blockers, but cannot charge or serve paid data until readiness recovers. A synthetic example is fabricated from the published schema or explicitly approved public sample; it must not copy paid materialized rows by default. No marketplace discovery/search is introduced.

No public response exposes creator Graph credentials, upstream query/variables, balances, policies, signer records, workspace IDs, internal logs, vault references, or unredacted payer/account metadata. Public active version/materialization IDs are correlation references only and do not authorize private resource reads.

## 2. Generated Data API

| Method | Path | Input | Result |
|---|---|---|---|
| GET | `/data/v1/{endpointSlug}` | `limit=100` (1-1000); access credentials/payment headers below | 200 `DataResponse`, 402 x402 challenge, or a safe non-success error |

The configured environment resolves endpointSlug. Before any payment challenge, validate the route, parameters, active policy, health, ready materialization, source/data availability, and applicable rate limit. No Graph call, DAG execution, or automatic refresh occurs here. Returned rows come from the latest successful materialization pinned when this logical request begins.

| Active access mode | Generated endpoint authorization | Payment behavior |
|---|---|---|
| private | Active same-deployment Sprue API key or authenticated workspace owner | No sale; unauthorized request gets 401/404, not 402 |
| api_key | Active same-deployment Sprue API key | No sale; owner uses the separate private-test route |
| x402 | Matching paid request/recovery authorization | No public API-key or creator-token bypass; owner preview stays on the control plane |

Different modes never combine or fall back automatically. GET with malformed/multiple conflicting credential types fails before any settlement attempt. HEAD and unsupported methods return 405; OPTIONS is a no-charge preflight. No endpoint proxies an arbitrary caller-supplied URL.

Example data shape (synthetic values, not real Graph evidence):

```json
{
  "data": [{"protocol": "Example DEX", "stickiness_score": 0.68}],
  "meta": {
    "correlationId": "req_example",
    "version": {"id": "40000000-0000-4000-8000-000000000001", "versionNo": 1, "specHash": "sha256:example-only"},
    "materializationId": "40000000-0000-4000-8000-000000000002",
    "sourceFreshnessAt": "2026-09-05T11:55:00Z",
    "materializedAt": "2026-09-05T12:00:00Z",
    "returnedRows": "1",
    "totalRows": "1",
    "truncated": false,
    "freshness": "current",
    "authorizationMode": "x402",
    "dataSource": "live"
  }
}
```

The row schema comes from the pinned version, not the frontend fixture. DataResponse has this same outer shape for private/API-key/x402 responses. authorizationMode is `creator_preview | owner | api_key | x402`. No payment secret or economic fee arithmetic appears in the data rows. The receipt separately records the hash of the exact serialized response; do not embed a self-referential response hash in that body.

Unexpired latest-success data may be returned with freshness stale and its original source timestamp; it must not be advertised as a fresh query. An expired/invalidated/missing result returns 503 before charging. During a paid request, retain the pinned result for the recovery interval; garbage collection must respect this obligation rather than deleting an artifact merely because a newer version exists.

## 3. x402 Wire Boundary

Downstream uses x402 v2 headers: `PAYMENT-REQUIRED` carries the base64 JSON challenge, `PAYMENT-SIGNATURE` carries the client's base64 payment payload, and `PAYMENT-RESPONSE` carries the base64 settlement response. Preserve protocol casing/field names rather than translating them into Sprue DTO names. Use tested protocol serializers. The [official x402 repository](https://github.com/x402-foundation/x402) documents this HTTP exchange, and the [v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) defines the payload structures.

The selected Hedera requirements are version 2, scheme exact, network hedera:testnet, HBAR asset 0.0.0, atomic tinybar amount, resolved account-ID payTo, positive timeout, and extra.feePayer from current facilitator support. The client supplies a partially signed Hedera TransferTransaction, not an EVM typed-data payload. See the existing [Hedera reference](../../sponsor/Hedera.md#confirmed-protocol-profile). Blocky402 remains a verification/settlement facilitator, not an API host or proof of a native fee split.

Initial challenge response:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
Cache-Control: no-store
PAYMENT-REQUIRED: <base64 of the PaymentRequired JSON body>
X-Sprue-Request-ID: req_example
X-Sprue-Recovery-Expires-At: 2026-09-06T12:00:00Z
```

Its body is the protocol PaymentRequired object, not the creator API's `{data, meta}` envelope. It contains resource, accepts, and x402Version; accepted price/asset/payTo/fee payer are server-derived and pinned. No paid rows appear. `X-Sprue-*` headers are Sprue transport extensions, not x402-standard fields.

Successful paid retry returns DataResponse and a valid PAYMENT-RESPONSE. Do not turn the facilitator's transaction field into a claimed Hedera hash or consensus time; preserve providerTransactionRef and separately reconcile networkTransactionId/hash/consensusTimestamp. A reported facilitator success remains pending until the model's exact network/asset/amount/recipient evidence confirms settlement.

Only server adapters call Blocky402 `/supported`, `/verify`, and `/settle`. The upstream Graph adapter owns its separate protocol version/network/asset and must not reuse this downstream contract by assumption. Live adapter and wire-shape compatibility still require tests; official documentation alone is not proof that the selected Privy/Graph/Hedera combination works.

## 4. Correlation and Recovery Authorization

The proposed Sprue reference consumer supplies two headers from the first request and retains them across the 402 and all retries:

```http
Idempotency-Key: <one random UUID for this logical data request>
X-Sprue-Request-Access: <32 cryptographically random bytes encoded as base64url>
```

They are required on the initial x402 path in this draft; clients lacking them receive 400 before any payment. This is a Sprue-specific recovery contract in addition to standard x402, so generic clients must be configured to preserve these headers. Do not claim unmodified-client compatibility without testing. API-key/private requests use their existing credential/owner scope and an optional request Idempotency-Key.

The access value is a sensitive capability, not a public correlation ID. M2 must persist only its keyed hash, bound request identity, expiry/revocation, and the anonymous idempotency scope. Scope uniqueness to deployment, capability hash, and Idempotency-Key; replaying the key with changed path/parameters/request fingerprint returns 409. The first accepted operation pins version, publication revision, materialization, and payment intent. All subsequent reads/retries must verify the same capability in constant time. A displayed request ID, payer address, or transaction reference alone cannot retrieve data or payment details.

One capability is bound to one logical request: reusing it with a new key returns `409 REQUEST_ACCESS_ALREADY_BOUND`. A new paid operation gets a fresh key and capability only after explicit caller intent; the UI must never regenerate either automatically to escape a timeout. The M2 model review must cover hash-key versioning, expiry, revocation, uniqueness, and artifact-retention holds.

Record a unique authorization-hash-to-logical-request binding when payment proof is accepted. This must be durable and race-safe: the same proof may recover the same operation, but cannot pay for another product, request, or intent. A uniqueness constraint on physical HTTP attempts alone is insufficient because authorized delivery retries legitimately repeat proof. M2 must also specify this binding before anonymous settlement is implemented.

Proposed recovery validity is 24 hours from initial acceptance, configurable down only if the client is told the expiry before payment and the supported payment timeout fits within it. Cleanup holds the pinned artifact and receipt authorization until that time. Longer financial evidence retention does not make the data/recovery credential public. Signature/requirement expiry forbids a new submission but does not imply a confirmed payment must be paid again.

Keep capabilities and payment payloads out of URLs, telemetry, analytics, application logs, screenshots, repository files, and Sprue localStorage. Reference CLI consumers retain their own capability in a secure client credential store. Browser flow may keep it in memory for the current interaction, but reload restoration requires E2's approved buyer-session or fresh proof-of-control design. Saving a public correlation ID alone is not enough. Until that gate is resolved, the live hosted button stays unavailable and the tested external client is the reproducible route. Do not silently solve reload recovery by persisting wallet keys or reusable payment payloads.

## 5. One Request, One Payment

```text
Validate data availability and pin request/version/publication/materialization
  -> return 402 with one pinned payment requirement
  -> receive same logical request plus payment authorization
  -> verify exact requirement and acquire logical payment lock
  -> submit once, retaining provider references
  -> reconcile facilitator and network evidence
  -> confirm payment
  -> serve the pinned result
  -> record response hash, usage, allocations, and receipt
```

An initial 402 and a payment-bearing retry create separate api_http_attempts but one api_access_requests record and one api_sale intent. Verify method, normalized path, parameters, selected requirement, resource, network, asset, amount, recipient, fee payer, expiry, and proof binding before submission. A different selected requirement or changed query never silently reuses the payment.

Read current Blocky402 capability before first authorization/submission; if its fee payer/profile changed, reject before settling. A concurrent publication revision or result update does not change a request's pinned price/result. Retirement/suspension stops new challenges and cancels still-unsubmitted challenges, with no charge; already submitted payments reconcile rather than restart. Confirmed deliveries remain recoverable using the original capability unless a separate safety/legal data-access hold forbids delivery. Such a hold reports an explicit support condition, never a demand to pay again. This conservative in-flight retirement policy requires human review with the contract.

| State | Response and frontend behavior |
|---|---|
| No proof, valid new x402 request | 402 and complete pinned requirement; show terms |
| Malformed proof or changed request | 400/409; no submit; explain input/conflict |
| Proof rejected without submission | Protocol-compatible 402 with safe failure reason; no paid data; retry only after correction |
| Submission in flight / outcome unknown | 503 `SETTLEMENT_PENDING` with Retry-After or 409 `PAYMENT_UNCERTAIN`; show reconcile, not Pay again |
| Facilitator reports success, network reconciliation pending | Same pending response; no paid rows or confirmed revenue |
| Exact settlement confirmed | 200 DataResponse + PAYMENT-RESPONSE; record served only after a response attempt |
| Confirmed but response lost/failed | Retry same request/capability or retry-delivery; never another settle call |
| Known unpaid expiry | 410 `PAYMENT_REQUIREMENT_EXPIRED`; a new request requires fresh user approval |
| Recovery expired or pinned data unexpectedly unavailable | 410 with support/recovery information; no automatic replacement payment |

Pending/error bodies follow the safe error contract except protocol-required 402 bodies. Return X-Sprue-Request-ID on every attempt once assigned. Errors expose retryAction and payment status only after request-access authorization. Workers reconcile submitted/uncertain payments from durable records after process crashes; polling a receipt never sends or resends a payment.

## 6. Receipts and Delivery Recovery

| Method | Path | Authorization / input | Success |
|---|---|---|---|
| GET | `/api/v1/public/requests/{correlationId}/receipt` | X-Sprue-Request-Access; `endpointSlug` query disambiguates deployment | 200 public `RequestReceipt`; states may remain pending |
| POST | `/api/v1/public/requests/{correlationId}/retry-delivery` | Same capability, endpointSlug query, Idempotency-Key, `{}` | 200 DataResponse only if matching payment is confirmed; no transfer |
| GET | `W/access-requests/{accessRequestId}` | Owner token | 200 creator `RequestReceipt`; defined also in deployment document |
| GET | `W/payments/{paymentIntentId}` | Owner token | 200 `PaymentDetail` for Graph expenses, top-ups, or API sales |
| POST | `W/payments/{paymentIntentId}/reconcile` | Owner token, key, `{}` | 202 CommandAccepted; observation/reconciliation only, no new authorization/settle |

`RequestReceipt = {correlationId, versionId, publicationRevision, materializationId, status: received | payment_required | authorized | served | failed, payment: PaymentReceipt | null, delivery: {status: not_started | pending | served | failed, responseContentHash: Hash | null, responseByteCount: Count | null, lastAttemptAt: Timestamp | null}, attempts: HttpAttemptReceipt[], recovery: {canRetryDelivery, requiresReconciliation, expiresAt: Timestamp | null}}`.

`HttpAttemptReceipt = {attemptNo, hasPaymentAuthorization, httpStatus, startedAt, completedAt: Timestamp | null, errorCode: string | null}`. Public receipts omit raw request parameters, provider headers, creator internal references, callerUserId, and full payer identity; expose only payment facts necessary for this request. `served` records the server response attempt, not proof that an end user's application received the bytes.

`PaymentReceipt = {status, amount: Money, facilitator, providerTransactionRef: string | null, settlement: {status: reported | confirmed | mismatched | failed, networkTransactionId: string | null, networkTransactionHash: string | null, consensusTimestamp: string | null, resultCode: string | null, confirmedAt: Timestamp | null, evidenceLinks: EvidenceLink[]} | null}`. consensusTimestamp remains a precise network string, not a floating-point number. A capability-authorized receipt never contains the reusable payment payload.

`PaymentDetail` adds creator-only `{id, kind, createdAt, updatedAt, productId: Id | null, sourceRequestId: Id | null, accessRequestId: Id | null, payerAddress: string | null, recipientAddress, networkFeePayerAddress: string | null, attempts: PaymentAttemptReceipt[], allocations: Allocation[]}`. PaymentAttemptReceipt contains `{attemptNo, provider, providerOperation, status, requestedAt, submittedAt, settledAt, providerTransactionRef, errorCode}`, with nullable unavailable observations. No signer secret/provider idempotency credential is exposed. Allocation contains `{type, amountAtomic, status, settlementPaymentIntentId: Id | null}` and is not evidence of a second transfer.

External consumers cannot invoke creator payment APIs. A public receipt must not provide the owner token, a creator's balance, or an internal command URL. Delivery retry creates a physical delivery attempt/usage record linked to the existing access request; no api_sale duplication. After confirmation, the data API can serve a matching capability without requiring retransmission of the raw payment authorization.

## 7. Financial Read Models

| Method | Path | Input | Success | Source |
|---|---|---|---|---|
| GET | `W/financial-summary` | `from`, `to`, optional `productId`, `networkId`, `assetId` | 200 `FinancialSummary` | Confirmed category projections |
| GET | `W/ledger` | `accountingView: cash_movement \| economic_allocation` required; `entryType?`, date/network/asset/product filters, pagination | 200 LedgerEntry collection | financial_ledger_entries |
| GET | `W/payments` | `kind?`, `status?`, same filters, pagination | 200 PaymentSummary collection | payment_intents and settlement status |
| GET | `W/deployments/{deploymentId}/sales` | Date/status filters, pagination | 200 SaleSummary collection | api_access_requests + api_sale intent + confirmed allocations |

Date windows are `[from, to)` UTC, default last 24 hours when both omitted, maximum 31 days per request. Reject only one endpoint of the window, inverted ranges, cross-workspace product IDs, and asset/network mismatch. No arbitrary group-by or SQL expression is accepted.

`FinancialSummary = {period: {startsAt, endsAt}, observedAt, groups: [{networkId, network, assetId, assetIdentifier, symbol, decimals, topUpsAtomic, graphExpensesAtomic, grossSalesAtomic, creatorProceedsAtomic, platformFeesAtomic, providerFeesAtomic, networkFeesAtomic: Atomic | null, refundsAtomic, pendingPaymentCount: Count}], serviceFeesEnabled: false}`.

- Values are separate categories, not addends of one balance. topUps/Graph expenses derive from confirmed cash-movement entries; gross sales/creator proceeds/platform/provider fees derive from the corresponding confirmed economic allocations. Network fees require explicit settlement/allocation evidence (the ledger entry_type enum does not include network_fee); return null when unavailable, not a fabricated zero.
- Do not sum gross sale and creator proceeds, or cash movement and economic allocation. Account for explicit reversal links without mutating prior facts. Refunds are separate positive values; no unsigned amount field silently becomes a negative net value.
- `pendingPaymentCount` includes submitted/uncertain/unconfirmed transfers but excludes them from monetary recognition. API-key Graph requests are operational usage, not wallet expenses. HBAR receipts never replenish a USDC budget automatically.

`LedgerEntry = {id, productId: Id | null, paymentIntentId, entryType, accountingView, direction, amount: Money, recognitionStatus, reversesEntryId: Id | null, occurredAt}`. `PaymentSummary = {id, kind, status, productId: Id | null, amount: Money, createdAt, settlementStatus: string | null}`. `SaleSummary = {correlationId, accessRequestId, paymentIntentId, amount: Money, paymentStatus, settlementStatus: string | null, deliveryStatus, createdAt, transactionRef: string | null}`. The detail drawer resolves through authorized creator receipt/payment endpoints.

## 8. Judge Consumer Boundary and Provider References

No `/pay-for-any-url`, unrestricted `/demo/pay`, private-key upload, automatic refund, bridging, or fee-collection endpoint is included. E2 must define an isolated buyer, approved testnet funding, per-request/period limits, recipient/product allowlist, replay protection, abuse limits, reliable authority restoration after reload, and a shutdown procedure before enabling a hosted consumer. The buyer cannot inherit creator Graph-spending authority. Configuration must keep the live button disabled until this works; simulation stays visibly labeled.

Protocol references checked on 2026-09-05: [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md), [x402 HTTP flow](https://github.com/x402-foundation/x402), and the [Blocky402 documentation index](https://blocky402.com/docs/). The Hedera exact-scheme and merchant pages could not be retrieved during this pass; the already-reviewed [local sponsor reference](../../sponsor/Hedera.md) supplies that profile. Recheck the selected adapter documentation and live facilitator before implementation; no live payment was attempted for this document.
