# Product and Builder APIs

Draft 0.1. All creator operations follow the [shared contract](../../api-contract.md). `W` in the tables is shorthand for `/api/v1/workspaces/{workspaceId}` and is not a literal route segment. Every referenced session, source, version, run, credential, policy, deployment, and artifact must resolve to the same workspace.

## 1. Products and Dashboard

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `W/products` | `q?` (max 100 chars), `status?`, pagination | 200 ProductSummary collection | data_products + active_product_view + product_run_status |
| POST | `W/products` | `{name, description?, originalIntent, accountWalletId}` | 201 `ProductDetail` | data_products; server generates workspace-unique slug |
| GET | `W/products/{productId}` | None | 200 `ProductDetail` + ETag | Product metadata and separate draft/active pointers |
| PATCH | `W/products/{productId}` | `{name?, description?}` + If-Match | 200 `ProductDetail` | Metadata only; no spec/access/status/pointer update |
| GET | `W/products/{productId}/runs` | `status?`, `versionId?`, pagination | 200 RunSummary collection | execution_runs |
| GET | `W/products/{productId}/versions` | Pagination | 200 VersionSummary collection | data_product_versions |

name is 1-120 trimmed characters; description at most 2000; originalIntent is 1-8000 characters after trimming and redaction. Product creation does not start the Agent, build, deploy, or spend. An initial unbound Agent session can precede product/wallet creation; later acceptance creates the product through the explicit product endpoint and binds the producing session to it.

`ProductSummary = {id, slug, name, description: string | null, status, updatedAt, latestVersion: VersionSummary | null, activeDeployment: DeploymentSummary | null, latestRun: RunSummary | null, nextAction: string | null}`. nextAction is a frontend routing hint (`open_builder`, `resolve_access`, `build`, `deploy`, `inspect_run`, or null), not authorization. `ProductDetail` adds `{workspaceId, accountWalletId, originalIntent, createdAt, lockVersion}`. No field named simply version may conflate draft and active versions.

`VersionSummary = {id, versionNo, parentVersionId: Id | null, specHash, status, validatedAt: Timestamp | null, readyAt: Timestamp | null, createdAt}`. Version statuses remain proposed/validating/invalid/building/ready/retired; successful non-paid validation awaiting explicit Build follows review gate M3.

`DeploymentSummary = {id, environment, status, endpointSlug, endpointUrl: string | null, activeVersionId: Id | null, activeMaterializationId: Id | null, activePublicationVersionId: Id | null, accessMode: private | api_key | x402 | null, sourceFreshnessAt: Timestamp | null}`. Values come from one consistent active-pointer read.

Archiving/restoring products, slug renaming, invitations, and account administration are not added to the MVP API just because the database can represent them.

## 2. Agent Sessions, Messages, and Proposals

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| POST | `W/agent-sessions` | `{productId?: Id, title?: string}` | 201 `AgentSession` | agent_sessions; product association optional |
| GET | `W/agent-sessions` | `productId?`, `status?`, pagination | 200 AgentSession collection | Owner-visible conversations |
| GET | `W/agent-sessions/{sessionId}` | None | 200 `AgentSession` | Includes current command/trace references from M1 |
| GET | `W/agent-sessions/{sessionId}/messages` | `afterSequence=0`, `limit=50` (max 100) | 200 `{items: AgentMessage[], nextAfterSequence, hasMore}` | agent_messages in ascending sequence order |
| POST | `W/agent-sessions/{sessionId}/messages` | `MessageInput` | 202 `CommandAccepted` | Durable user message + planning command + trace; returns subject when accepted |
| POST | `W/agent-sessions/{sessionId}/proposals/{messageId}/discard` | `{expectedProposalHash}` | 200 `Proposal` with status discarded | Append a structured user decision to agent_messages; M1 deduplicates decisions |
| POST | `W/agent-sessions/{sessionId}/planning/{commandId}/cancel` | `{}` | 202 `CommandAccepted` | Cancel supported planner work, not an execution run or external payment |
| GET | `W/agent-sessions/{sessionId}/proposals/{messageId}` | None | 200 `Proposal` | Validated structured assistant-message projection |
| POST | `W/products/{productId}/versions` | `AcceptVersionInput` | 201 `VersionDetail` | Immutable version + source projection + optional session binding + planning trace, one transaction |

`AgentSession = {id, productId: Id | null, title: string | null, status, createdAt, closedAt: Timestamp | null, activeCommandId: Id | null, traceStreamId: Id | null}`. One planning command per session may be active; another distinct submission returns `409 OPERATION_IN_PROGRESS`. Retrying the same key returns the existing command. This does not serialize unrelated sessions or prohibit resuming a completed planning result.

`AgentMessage = {id, sequenceNo: Count, role: user | assistant | tool, contentText: string | null, contentJson: AgentContent | null, redactionStatus, createdAt}`. Tool messages expose sanitized summaries, not raw provider output. AgentContent is a discriminated schema with `schemaVersion: 1` and `kind: proposal | clarification | tool_result | error | proposal_decision`; fields are allowlisted per kind, and proposal_decision is server-created only. Hidden reasoning has no type or endpoint.

`MessageInput = {contentText, parentVersionId?: Id, accessSelections?: SourceAccessSelection[], responseLocale?: en | zh-CN}`. Text is 1-8000 characters. parentVersionId is required for a conversational edit and pins the intended parent; it must belong to the session's product. Selections are planning preferences only until a version is accepted. An unbound planning session may omit them and return a clarification.

`SourceAccessSelection = {sourceKey, mode, providerCredentialId: Id | null, spendingPolicyId: Id | null}` uses exactly one reference: customer_api_key -> providerCredentialId; x402 -> spendingPolicyId. Do not use the current Wallet page's local `api` string as a persisted API enum. There is no mutable workspace-global Graph access mode.

`Proposal = {messageId, sessionId, parentVersionId: Id | null, proposalHash, status: actionable | needs_input | unsupported | accepted | discarded, specification: DataProductSpec | null, assumptions: string[], issues: FieldError[], changeSummary: SpecChange[], acceptedVersionId: Id | null, traceStreamId}`. Status is derived from validated message content and subsequent acceptance/discard records, not a new mutable product version. M1 must define terminal proposal decisions in existing append-only messages. A clarification/unsupported reply may have specification null; it cannot be accepted as an executable version.

DataProductSpec is exactly [canonical spec schemaVersion 2](../../data-model.md#canonical-data-product-specification), validated against the actual operator registry. A model-generated object is untrusted input. Source discovery/inspection during planning must use only a bounded non-paid adapter; if unavailable without charge or credentials, return a blocker/clarification, not an automatic Graph purchase.

`AcceptVersionInput` is a tagged union:

```json
{
  "origin": "agent_proposal",
  "sessionId": "20000000-0000-4000-8000-000000000001",
  "proposalMessageId": "20000000-0000-4000-8000-000000000002",
  "expectedProposalHash": "sha256:example-only",
  "parentVersionId": null
}
```

- `origin: agent_proposal` uses the fields above and no caller-supplied replacement spec. Bind an unbound session to the product only when this acceptance succeeds; reject a session already belonging to another product. The same proposal accepted twice resolves to the existing version under M1, never another version number.
- `origin: structured_edit` uses `{origin, parentVersionId: Id, specification: DataProductSpec, expectedParentSpecHash: Hash}`. It creates a new immutable version from validated editor input; no PATCH endpoint changes an existing execution definition.

Both branches validate ownership, supported schema/operator versions, source/access references and bounds before insertion. Version numbers are server-assigned under a product lock. Client cannot submit status, versionNo, specHash, readyAt, source-validation facts, or deployment pointers. An accepted version starts proposed; semantic/provider validation and explicit Build are separate. Unsupported draft suggestions remain messages rather than invalid unstructured database versions.

Discarding an unaccepted local edit is client-only. The discard endpoint appends validated AgentContent `{schemaVersion: 1, kind: proposal_decision, proposalMessageId, decision: discard}` under the authenticated user. This additional discriminant is permitted only for server-created acceptance/discard decisions, not arbitrary user JSON. An accepted proposal cannot be discarded (`409 PROPOSAL_ALREADY_ACCEPTED`). Discard archives no product and cancels no paid work; there is no delete-message endpoint. Acceptance/discard decisions serialize on the session/proposal so they cannot both win.

## 3. Sources, Operator Schemas, Versions, and Layout

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| GET | `/api/v1/operator-registry` | None; authenticated | 200 `OperatorRegistry` | Deployed runtime allowlist, not arbitrary plugin discovery |
| GET | `W/source-snapshots/{snapshotId}` | None | 200 `SourceSnapshot` | source_snapshots with sanitized provider identity |
| GET | `W/source-snapshots/{snapshotId}/schema` | None | 200 `{snapshotId, format: graphql_sdl, document, schemaHash}` | Bounded stored schema; never a new Graph query |
| GET | `W/products/{productId}/versions/{versionId}` | None | 200 `VersionDetail` | Immutable spec plus current lifecycle/validation projection |
| GET | `W/products/{productId}/versions/{versionId}/diff` | `baseVersionId` | 200 `{baseVersionId, versionId, changes: SpecChange[]}` | Structural semantic diff, excluding layout and secrets |
| POST | `W/products/{productId}/versions/{versionId}/validate` | `{expectedSpecHash}` | 202 `CommandAccepted` | Non-paid validation summary/trace; M3 lifecycle gate |
| GET | `W/products/{productId}/versions/{versionId}/layout` | None | 200 `VersionLayout` + ETag | product_version_layouts or deterministic default projection |
| PUT | `W/products/{productId}/versions/{versionId}/layout` | `{layoutSchemaVersion: 1, layout}` + If-Match | 200 `VersionLayout` | Layout only; creates first stored row transactionally if absent |

`OperatorRegistry = {runtimeVersion, registryHash, specSchemaVersion: 2, operators: [{type, operatorVersion, labelKey, inputPorts, outputPorts, configSchema}], platformLimits}`. Each port has `{name, schema, multiple}`. configSchema and port schemas are versioned validation schemas; do not invent an operator from a display title. Registry content determines the exact supported subset. No arbitrary JavaScript/Python or remote-code field is allowed. platformLimits bounds the spec resourcePolicy; the proposed artifact ceiling remains 5242880 bytes.

`SourceSnapshot = {id, provider, sourceKind, logicalSourceId: string | null, gatewayTargetType, gatewayTargetId, providerDeploymentId: string | null, manifestIpfsCid: string | null, dataNetworkRef, schemaHash, status, discoveryMethod, observedAt, validatedAt: Timestamp | null, standardSchema: object | null, evidenceLinks: EvidenceLink[]}`. standardSchema is the validated compatibility metadata from standard_schema_json. All IDs remain distinct. Source data network is not the Graph payment network. Published versions must pin a validated deployment_id snapshot.

`VersionDetail` extends VersionSummary with `{productId, specSchemaVersion, specification, outputSchema, sources: SourceSnapshot[], validation: ValidationSummary | null, traceStreamIds: Id[]}`. outputSchema equals specification.outputSchema, not an independently editable field. `ValidationSummary = {schemaVersion: 1, passed: boolean, checkedAt, checks: [{code, status: passed | failed | blocked, message, nodeId: string | null, path: string | null}], blockers: Blocker[]}`.

`SpecChange = {path, kind: add | remove | replace, before?: JSON value, after?: JSON value}` over a validated spec, with secret redaction and response bounds. A specHash is a server-generated canonical digest; changing locale, node position, or viewport does not change it.

`VersionLayout = {versionId, layoutSchemaVersion: 1, layout: {nodes: [{nodeId, x, y}], viewport: {x, y, zoom}}, lockVersion, persisted: boolean}`. Coordinates are finite bounded numbers, zoom is 0.1-4, and node IDs must be a subset of that version's DAG. Omitted groups/display state are not a commitment to a grouping editor. For absent layout, return persisted false, lockVersion 0, and an ETag tied to the version/default; first write checks that no row has appeared. Never accept execution config through layout JSON.

## 4. Build and Run Lifecycle

| Method | Path | Input | Success | Model ownership |
|---|---|---|---|---|
| POST | `W/products/{productId}/build-preflight` | `{versionId, expectedSpecHash}`; read-only, key optional | 200 `BuildPreflight` | Read current ownership/source/access/budget/configuration; no reservation or payment |
| POST | `W/products/{productId}/runs` | `StartRunInput` | 202 `CommandAccepted` with execution_run subject | execution_runs + transactional queue dispatch |
| GET | `W/runs/{runId}` | None | 200 `RunDetail` | Logical run + current attempt, not a process-local timer |
| POST | `W/runs/{runId}/cancel` | `{}` | 202 `CommandAccepted` or 409 if non-cancellable | Stop future work at safe boundaries; preserve submitted payments |
| POST | `W/runs/{runId}/resume` | `{}` | 202 `CommandAccepted` | blocked -> queued after blocker/reconciliation checks; same logical run |
| GET | `W/runs/{runId}/attempts` | Pagination | 200 RunAttempt collection | run_attempts |
| GET | `W/runs/{runId}/nodes` | `attemptId?` (default current) | 200 NodeRun collection | node_runs + artifact bindings |
| GET | `W/runs/{runId}/source-requests` | `nodeId?`, pagination | 200 SourceRequestSummary collection | source_requests |
| GET | `W/source-requests/{sourceRequestId}` | None | 200 `SourceRequestDetail` | Logical source request + sanitized physical HTTP attempts/payment references |
| GET | `W/runs/{runId}/output` | `limit=100`, maximum 1000 | 200 `OutputPreview`; 409 until ready | Bounded artifact/materialization read; no source query |
| GET | `W/artifacts/{artifactId}` | `limit=100`, maximum 1000 | 200 `ArtifactPreview` | Authorized source/node/output inspection |
| GET | `W/artifacts/{artifactId}/content` | None | 200 bounded application/json body | Explicit authenticated JSON download, no envelope; expires/permissions rechecked |

`BuildPreflight = {versionId, specHash, ready, checkedAt, blockers: Blocker[], sources: [{sourceKey, accessMode, credentialId: Id | null, spendingPolicyId: Id | null, paymentBounds: object | null}], resourcePolicy, deploymentEffect: none}`. paymentBounds has `{network, assetId, maxPerRequestAtomic, availableAtomic: Atomic | null, maxSourceRequests}` and is an upper bound/observation, not a quote. Estimates are not authoritative reservations. Revalidate every guard on submission and immediately before external requests.

`StartRunInput = {versionId, expectedSpecHash, runType: build | preview, acknowledgeSpendingBounds: boolean}`. Explicit confirmation is required when the version has any x402 source. The browser cannot pass a wallet key, price, payee override, runtime code, deployment activation flag, queue ID, or arbitrary node start point. Resource/budget limits come from the pinned spec and policies. A new click after a definitive failed/cancelled run uses a new command key and creates a new run; an uncertain payment blocks that retry until reconciled. Automated queue retries reuse the original run and payment intents.

`RunSummary = {id, productId, versionId, runType, status, failureCode: string | null, queuedAt, startedAt: Timestamp | null, finishedAt: Timestamp | null}`. `RunDetail` adds `{specHash, runtimeVersion, operatorRegistryHash, deploymentId: Id | null, currentAttemptId: Id | null, traceStreamId, metrics: {sourceRows: Count | null, outputRows: Count | null, durationMs: Count | null} | null, materializationId: Id | null, blockers: Blocker[], actions: {canCancel, canResume, canRetry}, paymentReconciliationRequired: boolean}`.

Actions are backend-computed hints rechecked by the command handler. Unknown duration/row totals are null rather than fabricated zeroes. No percent-complete field is promised for a DAG whose source pagination is not yet known. Build readiness is separate from deployment health.

`RunAttempt = {id, attemptNo, status, startedAt: Timestamp | null, heartbeatAt: Timestamp | null, finishedAt: Timestamp | null, errorCode: string | null}`. Queue job IDs and worker internals stay server-side. `NodeRun = {id, attemptId, nodeId, operatorType, operatorVersion, status, startedAt: Timestamp | null, finishedAt: Timestamp | null, metrics: object | null, error: ErrorDetail | null, artifacts: [{direction, portName, ordinal, artifactId}]}`. metrics is a validated counts/duration projection, not arbitrary provider output.

`SourceRequestSummary = {id, runId, nodeId, sourceSnapshotId, accessMode, status, requestNo, paymentIntentId: Id | null, responseArtifactId: Id | null, errorCode: string | null}`. Detail additionally returns `{queryHash, variablesHash, requestedBlockRef, indexedBlockRef, responseManifestIpfsCid, hasIndexingErrors, graphqlErrors, credentialId, credentialSecretVersion, spendingPolicyId, httpAttempts}` with nullable fields where unavailable. httpAttempts contain `{attemptNo, status, hasPaymentAuthorization, httpStatus, providerRequestId, sentAt, completedAt, errorCode}`; no bearer/payment payload is returned. Creator-only query text/variables may be shown after redaction; they never appear in public metadata/receipts.

`ArtifactPreview = {artifactId, kind, schema, contentHash, rowCount: Count | null, byteCount: Count, payload: JSON value, truncated, createdAt, expiresAt: Timestamp | null}`. Source-page artifacts may be objects, not rows; the preview is a schema-aware sanitized projection capped at 256 KiB, with truncation explicitly flagged. `OutputPreview` replaces payload with rows: JSON[] and adds `{runId, versionId, materializationId: Id | null, sourceFreshnessAt: Timestamp | null}`. The MVP output-view endpoints require array-shaped output; a non-array output schema is rejected at version validation until a matching typed viewer/response contract is approved. Large integer values in generated data must follow their declared output schema rather than unsafe browser number coercion.

## 5. Execution Safety and UI Corrections

- Build/preview may purchase Graph data only within explicit x402 authority. They do not deploy or activate paid access. A successful build creates ready output; deployment requires a separate confirmation. M3 resolves the current model wording before implementation.
- Serialize active initial build/preview commands for one version; return OPERATION_IN_PROGRESS with its authorized run reference for a different concurrent command. Ready versions remain ready while refresh operations run; individual run status carries their progress/failure. A failed validation marks invalid, whereas a failed runtime attempt preserves validation evidence and follows M3's proposed retryable transition.
- A view cancellation aborts polling only. Run cancellation is cooperative: stop launching new nodes/requests, reconcile any already submitted side effect, preserve confirmed expenses, and release reservations only on definite non-payment. Show requested cancellation separately until it is safe to mark cancelled.
- Failed or blocked work never replaces prior deployment pointers. An API-key failure does not invoke the wallet branch. Graph HTTP 200 with disallowed GraphQL/indexing errors is still a failed data operation.
- The build trace reads persisted source/node/payment events, not the current frontend's fixed six-node fixture or elapsed timers. Readiness source IDs, schema fields, balances, and status badges must all come from the relevant response.
- Schema/explorer buttons open authorized stored schema or server-validated evidence URLs. There is no generic browser-controlled proxy-fetch endpoint.
- Parent/version mismatch -> 409 `VERSION_PARENT_MISMATCH`; unsupported or malformed DAG -> 422 `VALIDATION_FAILED`; changed source/credential/authority -> 409 `READINESS_BLOCKED`; unresolved paid attempt -> 409 `PAYMENT_UNCERTAIN` with reconcile action.
