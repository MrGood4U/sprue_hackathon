# Hedera: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-12

Participation: Start Fresh, confirmed by the user on 2026-09-05.

Status: Hedera testnet HBAR is the implemented downstream x402 profile. Sprue publishes the documented x402 v2 challenge and verifies and settles through Blocky402 before invoking the immutable live DAG. The independent `hx402-cli` buyer generates or imports an encrypted ECDSA wallet, resolves and funds a Hedera testnet account, validates the payment requirement and local price ceiling, signs locally, and retries the protected endpoint. A funded buyer-to-creator request completed successfully; Sprue persisted the paid request, creator revenue, and Hedera transaction reference. Mainnet, HTS, and production qualification remain outside this evidence.

This document separates official requirements from Sprue's implementation proposals. The [official prize page](https://ethglobal.com/events/ethonline2026/prizes/hedera) remains authoritative; recheck it before submission. Sponsor selection does not establish eligibility or authorize funded actions.

## Official Requirements Digest

Source: [ETHGlobal's Hedera requirements](https://ethglobal.com/events/ethonline2026/prizes/hedera). Labels are shortened below.

Four awards total $15,000:

- A: AI/agentic payments, $6,000; up to three $2,000 awards.
- B: Harness contributions, $2,000; up to two $1,000 awards.
- C: Asset tokenization, $6,000; up to three $2,000 awards.
- D: Continuity, $1,000; unavailable to Start Fresh.

Mandatory gates:

- H1 (A): Live x402 service with Hedera testnet/mainnet settlement through Blocky402.
- H2 (A): Build a consuming platform/agent and complete a real paid request end to end.
- H3 (A): Public GitHub repository; README explains setup, architecture, and payments. Video, at most five minutes, shows execution.
- H4 (B): Meaningful Harness contribution (unmerged PR allowed) or a derived/inspired harness; public code/PR, explanatory setup documentation, and working video within five minutes.
- H5 (C): Use Asset Tokenization Studio; demonstrate on Hedera testnet; public repository and applicable HashScan verification. Video within five minutes shows issuance, configuration, and a lifecycle operation.

A's bonuses include usage-sensitive pricing, agent coordination/identity/discovery, HTS/custom fees, HCS auditability, and scheduled/streamed payments. These are optional. Recipe delivery is not required for A.

## Selected Product Direction

The user selected Hedera for Sprue's x402 step on 2026-09-05. The active sponsor combination is The Graph, Hedera, and Privy. Earlier Bazantic research is superseded and is not part of the product or submission narrative.

Our recommended target is award A. The product fit is selling access to a persistent Graph-derived data API and demonstrating a separate consumer that buys its output. This is a planning assessment, not a guarantee of qualification or an approved final submission. Harness work and asset tokenization are outside the current product scope; D is not applicable.

The creator still defines, validates, schedules, and privately uses the product before enabling paid access. Do not add another data provider or a Recipe solely to preserve the previous sponsor's deliverables.

## Integration Boundary

| Component | Sprue responsibility or intended role |
|---|---|
| The Graph | Supplies upstream facts purchased during approved builds/refreshes |
| Privy | Creator account wallet and constrained authorization for Graph spending |
| Sprue API runtime | Hosts data, sets per-product payment requirements, enforces access, and correlates payments with responses |
| Hedera / Blocky402 | Downstream payment network / verification and settlement facilitator |
| Creator recipient | Receives API revenue under a validated creator-controlled ownership model |
| Separate consumer | Uses a compatible Hedera payment client to buy the API result; Privy is not mandatory for this actor |

Proposed paid request:

```text
Consumer -> Sprue product endpoint -> payment challenge
Consumer -> signed payment retry -> Sprue payment adapter
Sprue adapter -> Blocky402 -> Hedera settlement
Sprue -> paid data response, linked to settlement and creator receipt
```

This diagram reflects the implemented testnet flow. Sprue owns the API, publication state, price, request audit, and data execution; Blocky402 provides verification and settlement rather than API hosting, a publishing dashboard, or a marketplace.

## Technical References and Compatibility Gates

- [Hedera x402 overview](https://docs.hedera.com/solutions/ai/x402): Defines Hedera's official per-request x402 payment profile for HBAR and HTS tokens. It is a discrete HTTP request/payment/response primitive, not a subscription, custodial processor, streaming payment system, or API host.
- [Hedera `exact` scheme](https://docs.hedera.com/solutions/ai/x402/exact-scheme): Specifies x402 version `2`, scheme `exact`, CAIP-2 networks `hedera:testnet` and `hedera:mainnet`, HBAR entity ID `0.0.0`, HTS fungible-token entity IDs, atomic amounts, a direct partially signed `TransferTransaction`, and a facilitator fee payer.
- [Hedera resource-server guide](https://docs.hedera.com/solutions/ai/x402/merchant-integration): Documents `@x402/hedera` resource-server registration and the standard facilitator `/verify` and `/settle` boundary. Sprue remains the resource server and API host.
- [Hedera facilitator list](https://docs.hedera.com/solutions/ai/x402/facilitators): Lists Blocky402 at `https://api.testnet.blocky402.com` and `https://api.blocky402.com` for Hedera testnet/mainnet, respectively. On 2026-09-05, a read-only live check of each `/supported` endpoint advertised x402 v2 `exact`, the corresponding Hedera network, and a Hedera fee-payer account. Recheck this dynamic capability at activation and request time.
- [Hedera account properties](https://docs.hedera.com/learn/core-concepts/accounts/account-properties): Distinguishes an account ID, EVM Address from Public Key, and long-zero EVM Address from Account ID. An EVM address must be resolved to its network account rather than treated as an interchangeable string.
- [Hedera Mirror Node account API](https://docs.hedera.com/api-reference/accounts/get-account-by-alias-id-or-evm-address): Provides account-ID/address resolution, balance, token relationship, completion-related key, automatic-association, and receiver-signature facts for validation evidence.
- [Hedera Mirror Node transaction API](https://docs.hedera.com/api-reference/transactions/get-transaction-by-id): Exposes transaction ID, transaction hash, consensus timestamp, result, HBAR transfers, HTS transfers, and assessed fees for post-facilitator reconciliation.
- [Hedera Ethereum transaction SDK reference](https://docs.hedera.com/hedera/sdks-and-apis/sdks/smart-contracts/ethereum-transaction): Defines the Ethereum transaction value field in weibar, requiring an explicit 18-decimal conversion from HBAR values represented to users with eight decimals.
- [Hedera Mirror Node contract-result API](https://docs.hedera.com/api-reference/contracts/get-the-contract-result-from-a-contract-on-the-network-for-a-given-transactionid-or-ethereum-transaction-hash): Supports result lookup by Ethereum transaction hash for creator-confirmed EVM withdrawals.
- [Hedera testnet faucet](https://portal.hedera.com/faucet): The Hedera-operated web faucet can fund a testnet account ID or EVM address. The official documentation states that funding an EVM address with no existing Hedera account triggers auto account creation.
- [Hedera Portal faucet API](https://docs.hedera.com/learn/getting-started/faucet-api): Supports programmatic testnet funding with a Portal personal access token. As checked on 2026-09-07, it allows 1-100 HBAR per request, at most 100 HBAR per rolling 24 hours per Portal account, and one funding event per destination per 24 hours. This is development funding, not a production treasury or an application entitlement.
- [Blocky402 documentation](https://blocky402.com/docs/): Confirms the x402 v2 wire format, live capability discovery, Hedera account-ID examples, facilitator fee payer, and standard verification/settlement calls. Treat examples containing a private key as buyer-side local signing examples, never as permission to export a creator's Privy key.
- [Graph x402 payments](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/): Upstream queries use USDC on Base or Base Sepolia. Our downstream Hedera receipts must be accounted for separately; no automatic bridge or conversion is planned.
- [Privy x402](https://docs.privy.io/recipes/agent-integrations/x402): Describes wallet authorization with facilitator settlement. It does not validate our Hedera signer or receiving-account setup. Test buyer signing, creator receipt, and creator access to those funds as distinct capabilities.

Sponsor-linked starting points, not yet adopted or compatibility-tested: [Hedera payment example](https://github.com/hedera-dev/x402-inference-pay-per-request-poc), [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js), [Hedera documentation](https://docs.hedera.com/), and [x402 source](https://github.com/x402-foundation/x402).

## Independent Consumer CLI

The repository's [`x402-cli/`](../x402-cli/) package and `hx402-cli` command implement the separate buyer required by H2 without importing Sprue backend or frontend modules. It pins compatible `@x402/core`, `@x402/fetch`, and `@x402/hedera` version `2.25.0` as one tested protocol set. Dependency releases must be upgraded together and revalidated before use with funds.

The CLI supports explicit Hedera testnet or mainnet selection and native HBAR only. It creates or imports an ECDSA key, encrypts it locally with AES-256-GCM and scrypt, exposes only public wallet metadata, resolves the canonical account through Mirror Node, optionally submits a user-authorized testnet faucet request with a caller-supplied Portal PAT, and enforces a local maximum amount before signing. Requirement identity pins the scheme, network, asset, amount, recipient, timeout, and facilitator fee payer across the inspected challenge and paid retry. Mainnet is never inferred from a URL.

Automated coverage constructs and decodes SDK-generated partially signed transactions, verifies the standard x402 v2 payload shape, rejects changed requirements, checks exact HBAR conversion, and exercises encrypted key storage. In addition, the hackathon flow completed a human-approved funded request against a Sprue-derived API and recorded the resulting settlement and creator revenue. Automated tests themselves never move funds.

## Confirmed Protocol Profile

Sprue's downstream adapter can now target this documented profile without inventing a wire format:

| Field | MVP requirement |
|---|---|
| Protocol | x402 version `2` |
| Scheme | Hedera `exact` |
| Network | Start on `hedera:testnet`; mainnet remains a later explicit environment choice |
| Asset | HBAR (`0.0.0`, eight decimals) for the initial integration |
| Recipient | Resolved Hedera account ID controlled by the creator; do not publish directly to an unresolved EVM address |
| Fee payer | Read from Blocky402 `/supported` and include it in `PaymentRequirements.extra.feePayer` |
| Client authorization | Partially signed Hedera `TransferTransaction`; reusable payload is not persisted |
| Verification/settlement | Standard facilitator `POST /verify` followed by `POST /settle` |
| Confirmation evidence | Facilitator transaction reference reconciled through Hedera Mirror Node to result, transaction ID/hash, consensus timestamp, asset, amount, and recipient |

The official scheme also permits HTS fungible tokens, but the human team selected HBAR for the initial integration on 2026-09-05. This avoids token-association requirements in the first spike. HTS remains a future option and is not part of the first implementation or demo promise.

Implemented controls and remaining production checks:

1. The active profile is `hedera:testnet` and HBAR (`0.0.0`), with prices stored and advertised in tinybars.
2. The verified Privy-backed creator-control evidence for the current testnet ECDSA-alias account records the EVM-address-to-Hedera-account mapping, account completion, creator-confirmed transaction, and network-fee spend in [the evidence note](../docs/evidence/hedera/privy-testnet-control.md). A displayed EVM address alone is not proof, and a separate account or custody change requires an explicit decision.
3. Compatible `@x402/core`, `@x402/hedera`, and Blocky402 versions are pinned; the runtime reads and pins the facilitator fee payer from `/supported`.
4. Per-product price and recipient configuration are validated, and paid-request records retain the facilitator/Hedera transaction reference. The hackathon profile has no platform fee or native split.
5. Exercise verification failure, settlement failure, replay rejection, facilitator timeout, and payment-success/data-delivery-failure recovery. Avoid duplicate charges and fail closed on unresolved payment status.
6. Confirm provider terms and source permissions for caching and paid redistribution.

Keep Graph funding and Hedera income separate by network and asset. The user's intended account-level experience must not be implemented as an unsupported claim that those balances are interchangeable. Any platform fee remains subject to explicit terms and a validated collection path; deposits and Graph purchases are not fee bases by default.

## Development Gates and Evidence

These are Sprue's acceptance checks, not extra official requirements. The completed rows reflect the implemented testnet flow and the human-approved funded demo. Preserve only sanitized artifacts under `docs/evidence/hedera/`.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [x] | Record sponsor replacement and participation | User selected Hedera and confirmed Start Fresh; see `plan.md` | Planning only |
| [x] | Confirm the protocol and facilitator documentation profile | Official x402 v2 `exact` fields, hosted Blocky402 endpoints, and a 2026-09-05 read-only `/supported` capability check | Planning only |
| [x] | Choose the initial environment and asset | Human selected Hedera testnet HBAR on 2026-09-05 | Planning only |
| [x] | Validate the creator's recipient/control model for the current Hedera testnet ECDSA-alias path | Account-ID mapping, completed account, creator-confirmed Privy EVM transaction, network-fee spend, and no key export; see [the evidence note](../docs/evidence/hedera/privy-testnet-control.md) | Sprue product/security |
| [ ] | Exercise one nonzero creator-confirmed HBAR withdrawal | Privy confirmation, Ethereum transaction hash, Mirror Node result, exact amount, network fee, destination, and refreshed balance | P3 candidate evidence; not H1/H2 x402 evidence |
| [x] | Connect the payment adapter to Hedera testnet | Pinned package versions, non-secret configuration, live capability lookup, and fee-payer pinning | H1 |
| [x] | Run the independent `hx402-cli` consumer against a derived-data API | Correlated challenge, local authorization, settlement, protected response, and immutable product version | H1, H2 |
| [x] | Exercise unpaid, invalid, duplicate, and uncertain requests | Automated verify/settle/replay/retry coverage; no public bypass or duplicate charge | Sprue safety |
| [x] | Reconcile facilitator and product evidence | Persisted Hedera transaction reference, exact amount, creator proceeds, paid-request record, and returned product data | Sprue accounting |
| [ ] | Reproduce the demo from a clean checkout | Setup commands, environment names, funding prerequisites, source locations, and bounded access | H3 |
| [ ] | Prepare submission and recheck eligibility | Public source, recording, and source-to-payment evidence index | H3 |

The hackathon path now protects a real Sprue-derived API with the Hedera testnet HBAR x402 v2 `exact` profile and completes the request through the independent consumer. Remaining work is submission packaging and production hardening, not another fixture-only payment spike.

## Maintenance

Consult this reference before changing monetization, recipient handling, consumer behavior, or payment demonstrations. Validate [The Graph](graph.md) and [Privy](privy.md) independently. Preserve earlier decisions in [plan.md](../plan.md), record material AI-assisted work, and mark gates complete only when supporting evidence exists.
