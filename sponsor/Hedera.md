# Hedera: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-05

Participation: Start Fresh, confirmed by the user on 2026-09-05.

Status: Selected to replace Bazantic for downstream x402 payments. Award requirements and current official Hedera x402/Blocky402 documentation reviewed. Protocol shape and hosted facilitator support are documented; live integration, creator-wallet compatibility, and final qualification remain unverified.

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

The user selected Hedera for Sprue's x402 step on 2026-09-05. The active sponsor combination is The Graph, Hedera, and Privy. Bazantic integration and Recipe deliverables are removed from the current plan; [the old reference](bazantic.md) is retained as historical research.

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

This diagram is a logical flow. The documented wire profile is recorded below, but compatible versions, concrete response fields, middleware ordering, and the live verification/settlement lifecycle still require testing. Blocky402 does not host the API, provision a publishing dashboard, or list it in a marketplace. Sprue's existing shared web/worker hosting model remains the proposed deployment architecture.

## Technical References and Compatibility Gates

- [Hedera x402 overview](https://docs.hedera.com/solutions/ai/x402): Defines Hedera's official per-request x402 payment profile for HBAR and HTS tokens. It is a discrete HTTP request/payment/response primitive, not a subscription, custodial processor, streaming payment system, or API host.
- [Hedera `exact` scheme](https://docs.hedera.com/solutions/ai/x402/exact-scheme): Specifies x402 version `2`, scheme `exact`, CAIP-2 networks `hedera:testnet` and `hedera:mainnet`, HBAR entity ID `0.0.0`, HTS fungible-token entity IDs, atomic amounts, a direct partially signed `TransferTransaction`, and a facilitator fee payer.
- [Hedera resource-server guide](https://docs.hedera.com/solutions/ai/x402/merchant-integration): Documents `@x402/hedera` resource-server registration and the standard facilitator `/verify` and `/settle` boundary. Sprue remains the resource server and API host.
- [Hedera facilitator list](https://docs.hedera.com/solutions/ai/x402/facilitators): Lists Blocky402 at `https://api.testnet.blocky402.com` and `https://api.blocky402.com` for Hedera testnet/mainnet, respectively. On 2026-09-05, a read-only live check of each `/supported` endpoint advertised x402 v2 `exact`, the corresponding Hedera network, and a Hedera fee-payer account. Recheck this dynamic capability at activation and request time.
- [Hedera account properties](https://docs.hedera.com/learn/core-concepts/accounts/account-properties): Distinguishes an account ID, EVM Address from Public Key, and long-zero EVM Address from Account ID. An EVM address must be resolved to its network account rather than treated as an interchangeable string.
- [Hedera Mirror Node account API](https://docs.hedera.com/api-reference/accounts/get-account-by-alias-id-or-evm-address): Provides account-ID/address resolution, balance, token relationship, completion-related key, automatic-association, and receiver-signature facts for validation evidence.
- [Hedera Mirror Node transaction API](https://docs.hedera.com/api-reference/transactions/get-transaction-by-id): Exposes transaction ID, transaction hash, consensus timestamp, result, HBAR transfers, HTS transfers, and assessed fees for post-facilitator reconciliation.
- [Blocky402 documentation](https://blocky402.com/docs/): Confirms the x402 v2 wire format, live capability discovery, Hedera account-ID examples, facilitator fee payer, and standard verification/settlement calls. Treat examples containing a private key as buyer-side local signing examples, never as permission to export a creator's Privy key.
- [Graph x402 payments](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/): Upstream queries use USDC on Base or Base Sepolia. Our downstream Hedera receipts must be accounted for separately; no automatic bridge or conversion is planned.
- [Privy x402](https://docs.privy.io/recipes/agent-integrations/x402): Describes wallet authorization with facilitator settlement. It does not validate our Hedera signer or receiving-account setup. Test buyer signing, creator receipt, and creator access to those funds as distinct capabilities.

Sponsor-linked starting points, not yet adopted or compatibility-tested: [Hedera payment example](https://github.com/hedera-dev/x402-inference-pay-per-request-poc), [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js), [Hedera documentation](https://docs.hedera.com/), and [x402 source](https://github.com/x402-foundation/x402).

## Confirmed Protocol Profile

Sprue's downstream adapter can now target this documented profile without inventing a wire format:

| Field | MVP requirement |
|---|---|
| Protocol | x402 version `2` |
| Scheme | Hedera `exact` |
| Network | Start on `hedera:testnet`; mainnet remains a later explicit environment choice |
| Asset | HBAR (`0.0.0`, eight decimals) or a verified HTS fungible-token entity ID and decimals |
| Recipient | Resolved Hedera account ID controlled by the creator; do not publish directly to an unresolved EVM address |
| Fee payer | Read from Blocky402 `/supported` and include it in `PaymentRequirements.extra.feePayer` |
| Client authorization | Partially signed Hedera `TransferTransaction`; reusable payload is not persisted |
| Verification/settlement | Standard facilitator `POST /verify` followed by `POST /settle` |
| Confirmation evidence | Facilitator transaction reference reconciled through Hedera Mirror Node to result, transaction ID/hash, consensus timestamp, asset, amount, and recipient |

The official scheme allows HBAR or HTS fungible tokens. The MVP asset is still a product decision. HBAR minimizes association complexity; an HTS token may improve stable-denomination UX but requires verified token metadata and account association/receive capability. Do not present either choice as approved until the human team decides it.

Before implementation, resolve:

1. Choose Hedera testnet for the initial spike and choose HBAR or one verified HTS fungible token, including units and account-association prerequisites.
2. Validate Privy-backed creator ownership, EVM-address-to-Hedera-account resolution, account completion, receipt, and subsequent access to proceeds. A displayed EVM address alone is not proof. A separate account or custody change requires an explicit decision.
3. Pin compatible `@x402/core`, `@x402/hedera`, and Blocky402 versions; recheck `/supported`, its fee payer, and the concrete response/error fields. The buyer's working signer does not establish the creator's recipient control.
4. Validate per-product price/recipient configuration and reconcile the facilitator transaction reference through Mirror Node. No native split or platform-fee mechanism is assumed.
5. Exercise verification failure, settlement failure, replay rejection, facilitator timeout, and payment-success/data-delivery-failure recovery. Avoid duplicate charges and fail closed on unresolved payment status.
6. Confirm provider terms and source permissions for caching and paid redistribution.

Keep Graph funding and Hedera income separate by network and asset. The user's intended account-level experience must not be implemented as an unsupported claim that those balances are interchangeable. Any platform fee remains subject to explicit terms and a validated collection path; deposits and Graph purchases are not fee bases by default.

## Development Gates and Evidence

These are Sprue's proposed acceptance checks, not extra official requirements. Documentation checks are complete; all live technical gates remain pending. Preserve sanitized artifacts under a future `docs/evidence/hedera/` directory.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [x] | Record sponsor replacement and participation | User selected Hedera and confirmed Start Fresh; see `plan.md` | Planning only |
| [x] | Confirm the protocol and facilitator documentation profile | Official x402 v2 `exact` fields, hosted Blocky402 endpoints, and a 2026-09-05 read-only `/supported` capability check | Planning only |
| [ ] | Choose the test asset and validate the creator's recipient/control model | Account-ID mapping, completion, asset association/capability, receipt, and proof of creator access without key export | Sprue product/security |
| [ ] | Connect the payment adapter to Hedera testnet | Pinned package versions, non-secret configuration, live capability snapshot, and fee payer | H1 |
| [ ] | Run an independent consumer against a derived-data API | Correlated challenge, authorization, settlement, response, and product version | H1, H2 |
| [ ] | Exercise unpaid, invalid, duplicate, and uncertain requests | Redacted verify/settle/replay/retry traces; no public bypass or duplicate charge | Sprue safety |
| [ ] | Reconcile facilitator and ledger evidence | Mirror Node transaction ID/hash, consensus timestamp, exact transfers, creator income, and any enabled fee | Sprue accounting |
| [ ] | Reproduce the demo from a clean checkout | Setup commands, environment names, funding prerequisites, source locations, and bounded access | H3 |
| [ ] | Prepare submission and recheck eligibility | Public source, recording, and source-to-payment evidence index | H3 |

Suggested first spike: use Hedera testnet and HBAR unless the human team explicitly selects an HTS token; resolve and verify the creator's Hedera account ID; protect one minimal API with x402 v2 `exact`; discover Blocky402's current fee payer; run a separate consumer; reconcile settlement through Mirror Node; then replace the test response with the actual Sprue data product. HBAR is a recommendation for reducing association risk, not an approved product decision. Fixtures are useful during development but are not final live integration evidence. No account, wallet, deployment, paid request, or fee has been created as part of this documentation work.

## Maintenance

Consult this reference before changing monetization, recipient handling, consumer behavior, or payment demonstrations. Validate [The Graph](graph.md) and [Privy](privy.md) independently. Preserve earlier decisions in [plan.md](../plan.md), record material AI-assisted work, and mark gates complete only when supporting evidence exists.
