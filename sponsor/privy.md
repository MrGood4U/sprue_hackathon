# Privy: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-07

Participation: Start Fresh, confirmed by the user on 2026-09-05.

Status: Official prize, authentication, wallet-control, policy, idempotency, transaction, chain-support, Node SDK, and representative agent-wallet documentation reviewed. Google/GitHub/MetaMask creator authentication and backend access-token verification are implemented, but live provider evidence, wallet/payment integration, award selection, and final qualification remain pending.

This reference separates official conditions from proposed Sprue implementation checks. The [official prize page](https://ethglobal.com/events/ethonline2026/prizes/privy) remains authoritative; recheck it before submission.

## Official Requirements Digest

Source: [ETHGlobal's Privy requirements](https://ethglobal.com/events/ethonline2026/prizes/privy).

Awards total $5,000:

- A: Best B2B financial product, $2,500.
- B: Best financial flow, $2,500.

Mandatory gates:

- P1 (both): Make Privy central, create/use a Privy wallet, provide a working demo and source access, and explain its contribution.
- P2 (A): Address a business/organization need; implement a functioning B2B operation such as payment, approval, treasury, or wallet administration. Use at least one Privy control: policies, signers, key quorums, or intents.
- P3 (B): Complete a financial workflow using a generally available Privy feature. Examples include transfers, bridging, stablecoin conversion, swaps, self-service Earn, onramps, and supported wallet actions.
- P4 (B): Commercial/guided-onboarding features may be simulated but cannot satisfy P3. Privy Cards requires guided Privy/Bridge onboarding; a simulated card experience still needs another live qualifying flow.

Judging preferences: secure organizational operations for A; reduced user friction in financial actions for B.

Neither award is labeled Continuity-only on this page. Event-wide rules still apply.

## Recommended Sprue Direction

The user confirmed the creator-account wallet model on 2026-09-05. The product role below supersedes the earlier buyer-first proposal; award selection and provider interoperability remain unverified.

The human team approved the concrete Sprue control model on 2026-09-05: a user-owned wallet, a policy-bound Sprue additional signer, immutable local snapshots of the accepted provider policy, and strict Sprue database budget reservations. Provider-specific configuration and live enforcement remain validation gates.

The creator has a Privy-backed account wallet, tops it up, and grants Sprue limited authority to pay Graph data costs when the creator selects Graph x402. The product also supports a customer-supplied Graph API key/existing subscription; that path does not use Privy and cannot substitute for the wallet-funded flow in Privy prize evidence. In x402 mode, Sprue handles purchases during builds and refreshes without the creator manually paying each query. Following the user's Hedera selection, the creator account remains the intended ownership identity for optional API-sale receipts, but a usable Privy-backed Hedera recipient must be validated. Shared ownership does not establish shared network balances or signer compatibility. External API buyers are not required to use Privy.

Do not treat login, wallet creation, a displayed balance, or passive receipt of revenue alone as our completed integration evidence. Show the wallet action and its outcome as part of the user's task.

Evaluate the upstream data-purchase flow for award B. For award A, demonstrate the same workflow in a credible business/workspace context with an enforced Privy control, including a permitted and rejected operation. Bounded delegated spending is now core product work; separate product wallets and general-purpose treasury automation are not required.

If the creator enables Sprue-hosted paid access with Hedera/Blocky402 settlement, account for creator revenue and any disclosed Sprue service fee on sales. No fee rate, collection mechanism, or native split capability is assumed. Do not confuse creator deposits, upstream Graph expenses, gross API sales, net proceeds, and platform income. Track them by network and asset; no automatic conversion or bridge is planned.

Do not assume one recording qualifies for both awards. Choose after the integration spike and check entry rules.

## Verified Technical References

These are documented capabilities, not evidence that our combination of providers already works.

### Creator Authentication

Privy's [OAuth login documentation](https://docs.privy.io/authentication/user-authentication/login-methods/oauth) supports Google and GitHub login, while its [wallet login documentation](https://docs.privy.io/authentication/user-authentication/login-methods/wallet) uses message signing to authenticate an externally owned wallet. Sprue exposes Google, GitHub, and MetaMask through one Privy application and treats each successful provider-signed subject as an authentication binding, not as the Sprue user ID. The backend verifies the resulting [access token](https://docs.privy.io/authentication/user-authentication/access-tokens), then resolves the binding to an application-owned user UUID before reading or creating account state.

Authentication is supporting infrastructure, not the qualifying financial integration. A MetaMask login address is not automatically Sprue's account wallet, and successful sign-in does not prove wallet creation, funding, delegated signing, policy enforcement, Graph purchasing, or Hedera receipt capability. Preserve those as separate user actions and evidence gates.

### User Ownership and Delegated Offline Actions

Privy's [wallet creation guide](https://docs.privy.io/wallets/wallets/create/create-a-wallet) distinguishes a wallet's owner from its entity association. A user entity can be associated with a wallet without controlling it, so Sprue must record and verify the owner configuration separately from the creator's Privy user ID.

For Sprue, the preferred documented pattern is a user-owned wallet with a Sprue-controlled authorization key or key quorum added as an [additional signer](https://docs.privy.io/wallets/using-wallets/signers/add-signers). The user remains the wallet owner; the additional signer enables [offline actions](https://docs.privy.io/controls/authorization-keys/owners/configuration/user/offline) and is restricted by an attached policy. This resolves the earlier conceptual conflict: Sprue does not know the wallet private key, but Sprue does know and securely operate its own additional-signer authorization key.

Privy uses P-256 authorization keys for signed API requests. The private authorization key is generated and retained by the application, not Privy, and must live in a server-side secret manager. It is not the user's wallet private key. The repository and database may store only the provider key/quorum ID, public-key fingerprint, and secret reference. See [authorization signatures](https://docs.privy.io/api-reference/authorization-signatures).

The client-side [signer removal flow](https://docs.privy.io/wallets/using-wallets/signers/remove-signers) removes all additional signers from a wallet. Sprue must therefore refresh every recorded grant for that wallet after revocation instead of assuming only one local record changed.

### Provider Policies and Sprue Budgets

Privy policies are independent resources with provider IDs, owners, a chain type, versioned rules, and conditions. Requests with no matching `ALLOW` rule are denied by default, and `DENY` takes precedence. Policy owners protect policy updates; without an owner, the app secret alone can update the policy. See the [policy overview](https://docs.privy.io/controls/policies/overview) and [policy creation guide](https://docs.privy.io/controls/policies/create-a-policy).

Sprue must not claim user-enforced limits if Sprue can unilaterally loosen the provider policy. The accepted policy definition is stored as an immutable local snapshot. A changed provider definition blocks new paid operations until the user-visible scope is reviewed and the local snapshot is replaced.

The intended Graph policy must constrain the actual RPC/signing method. Privy supports EVM transaction, calldata, message, and EIP-712 typed-data conditions, but a transfer rule for `eth_sendTransaction` does not constrain `eth_signTypedData_v4`. Match the Graph x402 client's emitted method, typed-data domain, types, recipient, token, and amount exactly. See [Privy's Ethereum policy examples](https://docs.privy.io/controls/policies/example-policies/ethereum).

Privy's [stateful policies](https://docs.privy.io/controls/policies/stateful-policies) can express rolling cumulative controls, but the current documented aggregation limit is ten per app, supported methods are narrower than all wallet actions, and concurrent requests can pass before prior values are recorded. Sprue's database spending policy and serializable budget reservations therefore remain necessary for strict per-workspace budgets; provider controls provide an independent safety boundary, not the sole accounting source.

### Idempotency and Transaction Reconciliation

Privy's [idempotency keys](https://docs.privy.io/api-reference/idempotency-keys) deduplicate a matching state-changing request for 24 hours. The request body must remain identical. RPC and wallet-create 5xx responses can remain cached for that key during the window, while policy-violation behavior differs. Sprue must keep a stable logical payment intent plus a provider-attempt key, request fingerprint, and known expiry. An expired key or cached error does not prove that no transaction occurred.

Privy supports a developer-provided transaction [`reference_id`](https://docs.privy.io/transaction-management/transactions/reference-id), up to 64 characters, for API lookup and webhook correlation, in addition to Privy's transaction ID and the network transaction hash. Preserve all three identifiers when available. Production transaction webhooks may require an Enterprise plan, so the hackathon path must also support explicit API reconciliation.

### x402 Client Integration

Privy's [x402 guide](https://docs.privy.io/recipes/agent-integrations/x402) documents payment authorization from embedded wallets in React and Node.js; the selected facilitator handles settlement. Relevant entry points include `useX402Fetch` and `createX402Client`.

An important EVM detail: x402 authorization uses typed-data signing. A rule covering only `eth_sendTransaction` does not restrict that signing path. Validate controls against the actual payment authorization method, token, recipient, domain, and amount. See the same [guide's recipient-screening section](https://docs.privy.io/recipes/agent-integrations/x402).

Pin and test compatible SDK versions before adopting example code. Do not hard-code a header format, network, token, signature mode, or facilitator merely because one documentation example uses it.

For the upstream integration, validate against [The Graph's paid-query endpoint](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/). Using documented components on both sides is not an end-to-end compatibility test. Prefer constrained remote wallet authorization over exporting the creator's private key.

For downstream sales, [Hedera's official x402 documentation](https://docs.hedera.com/solutions/ai/x402) and [Blocky402](https://blocky402.com/docs/) document x402 v2's Hedera `exact` scheme and a Hedera-specific client signer. This is not proof that Privy's x402 client or embedded wallet supports it. Validate EVM-address-to-Hedera-account resolution, account completion, receiving-asset capability, actual receipt, and the creator's ability to access proceeds independently of buyer signing. Do not export user keys or substitute platform custody to make an example run; any additional account or change to the ownership model requires an explicit decision. See [Hedera's integration gates](Hedera.md).

### Wallet Controls

The [policy overview](https://docs.privy.io/controls/policies/overview) describes rules for permitted actions, recipients, networks, amounts, and signing parameters. These are wallet controls, not just interface validations.

For Sprue, prefer one narrow policy and a reproducible acceptance/rejection test. A disabled frontend button or an application-only spending check is not evidence that a Privy policy enforced the restriction. Confirm which rule applies to the precise wallet action being demonstrated.

### Other References

- [Privy documentation](https://docs.privy.io/): General documentation entry point.
- [Privy documentation index](https://docs.privy.io/llms.txt): Current machine-readable documentation map used for this review.
- [Controls and authorization model](https://docs.privy.io/controls/overview): Background for choosing user-owned versus delegated wallet control.
- [Privy Node SDK](https://github.com/privy-io/node-sdk): Current server-side TypeScript SDK; supports Node.js 20 LTS or later and is compatible with Sprue's selected Node.js 24 LTS runtime.
- [Privy examples](https://github.com/privy-io/examples): Current starter collection; archived standalone examples should not be used as the primary integration source.
- [Privy AWS AgentCore example](https://github.com/privy-io/aws-agentcore-sdk): Representative user-login, Base/Solana funding, and agent-delegation frontend. It confirms that signer IDs are public identifiers while app secrets and authorization private keys remain server-only.
- [Privy agentic-wallet skill](https://github.com/privy-io/privy-agentic-wallets-skill): Sponsor-owned agent-wallet reference; useful for API orientation, but Sprue's user-owned delegated-wallet pattern remains distinct from a fully service-controlled agent wallet.
- [Node SDK quickstart](https://docs.privy.io/basics/nodeJS/quickstart): Current backend setup and wallet-operation entry point.

### Chain-Support Boundary

Privy's [chain-support guide](https://docs.privy.io/wallets/overview/chains) places Ethereum and EVM-compatible networks in its highest managed transaction tier, but does not name Hedera on the current page. It also warns that policies, observability, balances, and other capabilities vary independently by chain. This is not sufficient evidence that a Privy EVM wallet is a supported Hedera/Blocky402 recipient with the required control and settlement behavior. Keep Hedera compatibility unverified until a live test or explicit sponsor confirmation.

## Proposed End-to-End Evidence

Confirmed product sequence, subject to technical validation:

```text
Creator funds the account wallet
    -> authorizes bounded Graph spending
    -> Sprue uses Privy authorization to pay Graph
    -> Graph supplies data for the hosted API
    -> creator sees expenses, budget, and API freshness

If the creator opts into Hedera paid access:
External buyer uses a compatible client to pay for the Sprue API
    -> Blocky402 settles the payment on Hedera
    -> validated creator-controlled recipient receives sales proceeds
    -> any accepted Sprue service fee is allocated and settled
```

Blocky402 is the selected downstream facilitator; Privy remains the wallet/authorization layer. The Graph payment path must be validated separately. A single account view must not present Hedera receipts as Base funds available for upstream purchases.

The creator is a buyer of upstream Graph data and a potential seller of downstream API access. These two roles share the creator account's financial view, but their transactions and permissions must be tracked separately. The external API buyer is a different actor and can use any supported payment client.

## Development Gates and Evidence

These are our proposed acceptance checks, not additional sponsor rules. All technical gates remain unchecked. Store sanitized artifacts under a future `docs/evidence/privy/` directory.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [ ] | Select the award and define its user task | Human decision and a short explanation of why Privy is necessary | P1-P3 |
| [ ] | Establish and fund the creator account wallet | Redacted creation/use record, public address, deposit, and authorization model | P1 |
| [ ] | Complete Sprue-managed Graph purchasing | Upstream request, wallet authorization, payment outcome, returned facts, and expense linkage | P2 or P3 |
| [ ] | Validate intended creator control of Hedera revenue | Account/address mapping, receiving-asset prerequisites, actual receipt, and creator access to proceeds without exporting keys | Sprue product/security |
| [ ] | Reconcile optional API revenue and any enabled service fee | Downstream payment, accepted fee terms, creator proceeds, platform allocation, and settlement references | Sprue product requirement |
| [ ] | If pursuing A, test the enforced restriction | Policy/signer configuration, one permitted action, and one rejected request | P2 |
| [ ] | Verify availability and dependencies of the chosen feature | Documentation, account prerequisites, and any sponsor clarification | P3, P4 |
| [ ] | Reproduce the judge flow from documented setup | Environment-variable names, tested versions, funding instructions, and bounded access | P1 |
| [ ] | Prepare the submission evidence index | Source locations, recording, and an explanation tied to visible behavior | P1-P4 |

A signed authorization alone is not our proof of a completed paid data request. Correlate the payment outcome with the API response and distinguish pending, failed, and successful operations.

## Pending Technical Decisions

- Can the provider policy be owned or jointly controlled so that Sprue cannot unilaterally weaken the user's approved signer scope?
- Which exact networks, assets, x402 versions, and signing methods work for the upstream Graph endpoint? The initial downstream protocol profile is Hedera testnet HBAR with x402 v2 `exact`; pinned package versions and Privy interoperability still need validation.
- Can the intended Privy-backed creator control a usable Hedera recipient, receive HBAR, and subsequently access proceeds? Do not equate this with an external buyer's ability to sign a payment.
- Do Blocky402's pinned live response fields reconcile cleanly through Hedera Mirror Node to the configured recipient, exact payment, and Sprue API delivery under failure and replay conditions?
- Does the chosen settlement path support an authorized platform fee? Its rate, basis, rounding, recipient, payout timing, and refunds must be decided before charging.
- Which exact Graph x402 wallet method and EIP-712 shape must the Privy policy cover, and can retries or alternate signing paths bypass it?
- Can a Graph payment be recovered reliably by Privy transaction ID, developer `reference_id`, network hash, and explicit API polling without production webhooks?
- How will the demo wallet be funded, bounded, and isolated from production assets? Confirm acceptable demo networks with the sponsor; SDK testnet support alone is not event approval.
- How will insufficient funds, rejected authorization, duplicate retries, and upstream failure be handled?
- How will concurrent builds reserve budget and stop safely on revocation? Depositing more funds must not expand an existing spending mandate automatically.
- Can the selected flow use generally available features without commercial onboarding?
- Which award entries can be combined, and what final evidence does the sponsor expect?

Never commit app secrets, authorization private keys, wallet recovery material, or user tokens. Price, asset, network, and payment limit must be clear before any funded action. Do not collect credentials or move funds as part of documentation work.

## Maintenance

Consult this file before changing wallet or payment behavior. Validate [Hedera and Blocky402](Hedera.md) interoperability and [The Graph](graph.md) requirements independently. Keep planning and AI contributions in [plan.md](../plan.md); update completion status only when evidence exists.
