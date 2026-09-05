# Identity, Wallet, and Graph Access APIs

Draft 0.1. Read the [shared contract](../../api-contract.md) first. All paths below include `/api/v1`. `w` means workspaceId; IDs are UUIDs unless explicitly provider identifiers. Except app-config, every operation requires the verified creator. Workspace operations additionally require the active owner. Command operations use approved M1/model 1.4 records and still require service implementation; provider control operations also depend on E1.

## 1. Entry and Bootstrap

| Method | Path | Input | Success | Persistence / purpose |
|---|---|---|---|---|
| GET | `/api/v1/app-config` | None | 200 `AppConfig` | Public deployment configuration only |
| POST | `/api/v1/bootstrap` | `{}`; Idempotency-Key | 200 `Bootstrap` | Ensure users + workspaces + owner membership transactionally; no payment or wallet provision |
| GET | `/api/v1/me` | None | 200 `Bootstrap`; 409 `BOOTSTRAP_REQUIRED` before initialization | Read existing identity/workspaces only |
| GET | `/api/v1/workspaces/{w}/overview` | `period=24h` (only initial supported period) | 200 `WorkspaceOverview` | Authorized dashboard/readiness projection |
| GET | `/api/v1/workspaces/{w}/wallet-access` | None | 200 `WalletAccessOverview` | Combined Wallet page read model |

`AppConfig = {apiVersion, environment, privyAppId, consolePublicUrl, dataPublicBaseUrl, demoProductUrl: string | null, features}`. Features include `graphCustomerApiKey`, `graphX402`, `hederaPublication`, `hostedDemoConsumer`, `serviceFees`, and `liveGraphExecution`, each boolean reflecting server-enabled capabilities rather than installed SDKs. hostedDemoConsumer and serviceFees are false until their gates are explicitly satisfied. liveGraphExecution means recomputing Graph data on each hosted API request and remains false in MVP; it does not disable real backend requests or scheduled Graph computation. Public app IDs and feature flags are not secrets. Do not expose provider secrets or database configuration.

`Bootstrap = {user: {id, displayName: string | null, status}, workspaces: [{id, slug, name, status, role: owner, lockVersion}], defaultWorkspaceId: Id}`. The initial flow selects the sole owner workspace. Authentication restoration does not create a second workspace. No client-supplied authSubject, role, or ownerUserId is accepted. Logout uses Privy's SDK and clears Sprue's client query cache; no Sprue logout token or wallet revocation is implied.

`WorkspaceOverview = {period: {startsAt, endsAt}, activeProductCount: Count, draftVersionCount: Count, apiRequestCount: Count, graphExpenses: Money[], grossSales: Money[], readiness: Readiness[], recentActivity: Activity[]}`. apiRequestCount counts logical access requests, not the initial 402 plus retry twice. Financial cards use confirmed economic categories only. Activities are capped at 10 and contain `{kind, status, occurredAt, resource, summary}` from existing runs/traces; they are not a new audit table or editable records.

`Readiness = {kind, status: ready | blocked | pending | stale | unavailable, observedAt: Timestamp | null, blockers: Blocker[]}`. Kinds include `account_wallet`, `graph_customer_api_key`, `graph_x402`, `hedera_recipient`, `private_api`, and `paid_publication`. A successful HTTP read never means every readiness check passed.

`WalletAccessOverview = {wallets: Wallet[], credentials: GraphCredential[], signerGrants: SignerGrant[], spendingPolicies: SpendingPolicy[], balances: Balance[], recipientCapabilities: RecipientCapability[], readiness: Readiness[]}`. Return empty arrays, not invented wallets/balances, for a new workspace. Paginated individual lists remain available as records grow.

## 2. Wallet and Funding

| Method | Path | Input | Success | Persistence / purpose |
|---|---|---|---|---|
| GET | `/api/v1/workspaces/{w}/wallets` | Standard pagination | 200 Wallet collection | account_wallets + wallet_addresses |
| GET | `/api/v1/workspaces/{w}/wallets/{walletId}` | None | 200 `Wallet` | Verified provider ownership/control projection |
| POST | `/api/v1/workspaces/{w}/wallets/synchronize` | `{providerWalletId: string}` | 202 `CommandAccepted` | Read Privy; validate current user's actual wallet ownership, then upsert wallet/address observations |
| POST | `/api/v1/workspaces/{w}/wallets/{walletId}/refresh-balances` | `{assetIds: Id[]}`; 1-10 configured same-network assets | 202 `CommandAccepted` | Append wallet_balance_snapshots; never transfers funds |
| GET | `/api/v1/workspaces/{w}/wallets/{walletId}/funding-instructions` | `assetId` | 200 `FundingInstructions` | Derive supported funding address/network/asset; no top-up creation |

The browser creates a user-owned wallet only through an approved Privy user flow; synchronization is not permission to create a service-owned replacement. Server reads must check owner configuration, not just entity association or a client-supplied address. Unknown/unowned provider resources return a non-disclosing 404. Initial creation of a product requires a wallet reference under model 1.4, but API-key mode does not require a funded wallet or signer grant.

`Wallet = {id, provider, providerWalletId, providerChainType, label: string | null, controlModel, status, addresses: WalletAddress[], updatedAt}`. Status/controlModel enums match account_wallets; show safe provider-owner verification facts without exposing server signer references.

`WalletAddress = {id, networkId, network, addressKind, address, networkAccountRef: string | null, identityStatus, accountCompletionStatus, controlStatus, canReceive, canSpend, verifiedAt: Timestamp | null, status, evidenceLinks: EvidenceLink[]}`. All capability booleans are backend observations, never writable UI fields.

`Balance = {walletAddressId, asset: Money without amountAtomic, balanceAtomic: Atomic, observedAt, blockOrConsensusRef: string | null, provider, freshness: current | stale}`. Freshness is a derived policy result. A null/missing observation is unknown, never zero.

`FundingInstructions = {walletAddressId, address, network, assetIdentifier, symbol, decimals, warnings: string[], explorerUrl: string | null}`. Instructions do not authorize transferring funds or expanding an existing spending policy. The UI replaces its current "Simulate deposit" flow with instructions/copy/refresh. Top-up ledger recognition must come from validated chain observations, never from a browser `{amount}` submission or a balance delta alone.

## 3. Customer Graph API Credentials

| Method | Path | Input | Success | Persistence / purpose |
|---|---|---|---|---|
| GET | `/api/v1/workspaces/{w}/graph-credentials` | `status?` + pagination | 200 GraphCredential collection | provider_credentials safe metadata |
| POST | `/api/v1/workspaces/{w}/graph-credentials` | `{label, apiKey}` | 201 `GraphCredential` initially pending_validation | Store raw value only in secret manager; persist reference/fingerprint |
| GET | `/api/v1/workspaces/{w}/graph-credentials/{credentialId}` | None | 200 `GraphCredential` + ETag | Detail and concurrency token |
| POST | `/api/v1/workspaces/{w}/graph-credentials/{credentialId}/validate` | `{}` + If-Match | 202 `CommandAccepted` | Bounded provider credential validation |
| POST | `/api/v1/workspaces/{w}/graph-credentials/{credentialId}/rotate` | `{apiKey}` + If-Match | 202 `CommandAccepted` | Versioned vault write and atomic logical-credential update |
| POST | `/api/v1/workspaces/{w}/graph-credentials/{credentialId}/revoke` | `{}` + If-Match | 200 `GraphCredential` | Revoke Sprue use, not the customer's Graph account/subscription |

`GraphCredential = {id, label, provider: the_graph, credentialType: graph_api_key, ownershipModel: customer_supplied, billingModel: customer_subscription, publicPrefix: string | null, fingerprint, secretVersion, status, validatedAt: Timestamp | null, lastUsedAt: Timestamp | null, revokedAt: Timestamp | null, observedConstraints: object | null, lockVersion}`. observedConstraints contains only a validated adapter projection of provider subgraph/domain/billing restrictions; omit unsupported observations rather than inventing enforcement. No secretRef, raw key, or secret-manager path is returned.

label is trimmed, 1-80 characters; apiKey is a non-empty write-only string bounded to 4096 bytes and never sent through Agent chat. Duplicate label/fingerprint returns 409. Raw credentials remain only in transient form memory until submission completes and are cleared on dismiss. Disable browser autocomplete where appropriate; do not persist form state containing keys.

Validation checks provider credential metadata using a pinned supported adapter. Syntax alone cannot mark active. Validation does not launch a paid query or prove access to every Subgraph; source-specific permission is checked during execution. If validation would consume a metered query, it must use an explicitly confirmed bounded run and its source-request/usage records instead of a hidden validation call. Unverifiable credentials remain pending_validation with a blocker.

Rotation keeps the logical credential ID, increments lockVersion, and pins secretVersion/fingerprint on subsequent source requests. The replacement becomes usable only after validation; an invalid replacement must not silently switch modes. In-flight requests retain their original secret version for audit. Revoke immediately blocks new requests but cannot undo provider requests already sent.

## 4. Delegation and Spending Policies

Privy user ownership, an additional signer, a provider policy, and Sprue budget limits are separate resources. The Wallet page must not collapse them into one "authorized" boolean.

| Method | Path | Input | Success | Persistence / purpose |
|---|---|---|---|---|
| GET | `/api/v1/workspaces/{w}/graph-delegation-config` | `walletId` | 200 `DelegationConfig` | Server-selected signer and policy-template public metadata; E1 gated |
| POST | `/api/v1/workspaces/{w}/wallets/{walletId}/synchronize-grants` | `{expectedProviderPolicyId, expectedPolicyDefinitionHash}` | 202 `CommandAccepted` | Read current Privy policy/grants; record provider snapshots and consent evidence |
| GET | `/api/v1/workspaces/{w}/signer-grants/{grantId}` | None | 200 `SignerGrant` | wallet_signer_grants + exact wallet_policies snapshot |
| POST | `/api/v1/workspaces/{w}/signer-grants/{grantId}/block` | `{}` | 200 `SignerGrant` | Stop new Sprue payments immediately by locally revoking the grant; not proof of provider signer removal |
| GET | `/api/v1/workspaces/{w}/spending-policies` | `status?` + pagination | 200 SpendingPolicy collection | spending_policies + availability read model |
| POST | `/api/v1/workspaces/{w}/spending-policies` | `SpendingPolicyInput` | 201 `SpendingPolicy` in draft | New budget scope; no grant creation or payment |
| GET | `/api/v1/workspaces/{w}/spending-policies/{policyId}` | None | 200 `SpendingPolicy` + ETag | Limits and separately computed reservations/spend |
| POST | `/api/v1/workspaces/{w}/spending-policies/{policyId}/activate` | `{}` + If-Match | 200 `SpendingPolicy` | Check user consent, active grant, current provider-policy hash and matching asset/network |
| PATCH | `/api/v1/workspaces/{w}/spending-policies/{policyId}` | `{status: paused \| active \| revoked}` + If-Match | 200 `SpendingPolicy` | Operational state only; activation checks apply on resume |

`DelegationConfig = {walletId, providerSignerId, providerSignerType, policyTemplateVersion, policyDefinitionHash, providerPolicyId: string | null, requiredOwnerControlModel, network, assetId, allowedDestinationIds: string[], status: available | blocked, blockers: Blocker[]}`. This is configuration for a reviewed provider consent flow, not a wallet-update body the browser can arbitrarily alter. Exact user-authorization proof and template validation are E1 integration gates. Until proven, return blocked; do not accept `{approved: true}` as provider consent.

`SignerGrant = {id, walletId, providerSignerId, providerSignerType, status, grantedAt: Timestamp | null, revokedAt: Timestamp | null, validFrom: Timestamp | null, validUntil: Timestamp | null, policy: {id, providerPolicyId, revisionNo, definitionHash, ownerControlModel, status, observedAt}, providerRemovalStatus: confirmed | pending | unknown, blockers: Blocker[]}`. providerRemovalStatus is derived from observations, not a new source-of-truth column.

Grant sequence: retrieve reviewed configuration, display full scope, let the owner authorize through Privy, synchronize provider state, then activate the Sprue spending policy. A service-owned or unverified provider policy is not a user-enforced boundary. For revocation, first block Sprue, then use Privy's approved owner-side signer removal, then synchronize all grants on the wallet. Local revoked state is monotonic for that grant: synchronization cannot reactivate it silently. Re-authorization requires renewed consent and an explicitly reviewed transition.

`SpendingPolicyInput = {walletSignerGrantId, networkId, assetId, allowedDestinationIds: string[], maxPerRequestAtomic, maxPerPeriodAtomic, periodKind: day | week | month | fixed_window, periodStartsAt, periodEndsAt, maxTotalAtomic: Atomic | null}`. purpose is fixed to graph_purchase. Destination IDs refer to a server allowlist and resolve to validated allowed_destinations_json; no arbitrary URL, RPC method, or payee is accepted. Recurring periods use UTC calendar boundaries; fixed_window uses the supplied explicit interval. Validate interval boundaries, grant validity, positive caps, per-request <= period, and any lifetime cap.

`SpendingPolicy` returns the input plus `{id, purpose, status, lockVersion, available: {periodSpentAtomic, reservedAtomic, periodRemainingAtomic, lifetimeRemainingAtomic: Atomic | null, walletBalanceAtomic: Atomic | null, spendableAtomic: Atomic | null, observedAt}, blockers: Blocker[]}`. Spendable is unknown when the observation cannot support it; it is zero when a known policy blocker prevents payment. Serialized transaction checks remain authoritative, not the displayed cached value.

Changing limits, destinations, grant, or network/asset creates a new policy rather than retroactively changing the scope of recorded runs. Existing product versions keep the old policy ID; using the replacement requires a new version. Deposits never expand policy limits. Pausing/revoking blocks new reservations; submitted or uncertain payments still require reconciliation and cannot be refunded by releasing a reservation on a timer.

## 5. Hedera Recipient Capability

| Method | Path | Input | Success | Persistence / purpose |
|---|---|---|---|---|
| GET | `/api/v1/workspaces/{w}/recipient-capabilities` | `network=hedera:testnet` | 200 RecipientCapability collection | wallet_addresses + wallet_asset_capabilities |
| POST | `/api/v1/workspaces/{w}/wallets/{walletId}/resolve-hedera` | `{network: hedera:testnet, accountRef: string}` | 202 `CommandAccepted` | Read account mapping/identity evidence; no transfer, completion transaction, or proof of ownership |
| POST | `/api/v1/workspaces/{w}/wallet-addresses/{addressId}/refresh-capabilities` | `{assetId}` | 202 `CommandAccepted` | Refresh public account/asset observations; cannot turn an unproven spend capability true |

`RecipientCapability = {walletAddress: WalletAddress, assetId, assetIdentifier, symbol, decimals, associationStatus, receiverSignatureRequired: boolean | null, canReceive, canSpend, status: active | stale | rejected, observedAt, evidenceLinks: EvidenceLink[], publicationReady: boolean, blockers: Blocker[]}`. The initial asset is HBAR with entity ID 0.0.0 and 8 decimals. Resolve to a complete, creator-controlled account ID; an arbitrary pasted account ID or positive balance proves neither ownership nor spendability.

Actual bounded receipt/spend verification is intentionally not specified as a generic transfer endpoint. Its consent, amount cap, proof format, and compatible signer must be reviewed under E1 before adding that mutation. These read/synchronization operations leave publication blocked when such evidence is absent. HTS and alternate custody/account ownership flows are not enabled by this draft.

## 6. Domain Errors

Wallet: `WALLET_NOT_READY`, `WALLET_OWNER_UNVERIFIED`, `PROVIDER_STATE_UNAVAILABLE`. Credentials: `CREDENTIAL_LABEL_CONFLICT`, `GRAPH_CREDENTIAL_INVALID`, `GRAPH_CREDENTIAL_REVOKED`. Authority: `SIGNER_GRANT_REQUIRED`, `SIGNER_GRANT_EXPIRED`, `PROVIDER_POLICY_DRIFTED`, `PROVIDER_POLICY_OWNER_UNSAFE`, `SPENDING_POLICY_EXHAUSTED`. Recipient: `HEDERA_IDENTITY_UNRESOLVED`, `RECIPIENT_CONTROL_UNVERIFIED`, `ACCOUNT_INCOMPLETE`, `ASSET_CAPABILITY_STALE`.

Readiness endpoints return these as blockers within 200 responses. Mutations reject known unmet prerequisites with 409; invalid field values use 422. No error instructs the browser to supply a private key, bypass a policy, or silently select x402 after a credential failure.
