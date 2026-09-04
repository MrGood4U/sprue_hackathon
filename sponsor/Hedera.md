# Hedera: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-05

Participation: Start Fresh, confirmed by the user on 2026-09-05.

Status: Selected to replace Bazantic for downstream x402 payments. Requirements reviewed; integration, wallet compatibility, and final qualification remain unverified.

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

This is a logical flow, not a verified wire format or fixed ordering of middleware internals. Pin compatible versions and test the actual verification, settlement, and response lifecycle. Blocky402 is not assumed to host the API, provision a publishing dashboard, or list it in a marketplace. Sprue's existing shared web/worker hosting model remains the proposed deployment architecture.

## Technical References and Compatibility Gates

- [Blocky402](https://blocky402.com/): Documents hosted Hedera testnet/mainnet support and a Hedera-specific client signer example. Treat this as an integration starting point, not proof that Privy, creator recipients, fee splitting, or our complete request flow work. Never copy a sample by exporting a user wallet key.
- [Graph x402 payments](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/): Upstream queries use USDC on Base or Base Sepolia. Our downstream Hedera receipts must be accounted for separately; no automatic bridge or conversion is planned.
- [Privy x402](https://docs.privy.io/recipes/agent-integrations/x402): Describes wallet authorization with facilitator settlement. It does not validate our Hedera signer or receiving-account setup. Test buyer signing, creator receipt, and creator access to those funds as distinct capabilities.

Sponsor-linked starting points, not yet adopted or compatibility-tested: [Hedera payment example](https://github.com/hedera-dev/x402-inference-pay-per-request-poc), [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js), [Hedera documentation](https://docs.hedera.com/), and [x402 source](https://github.com/x402-foundation/x402).

Before implementation, resolve:

1. Exact test/mainnet environment, payment asset and units, account creation/activation requirements, and any token-association prerequisites.
2. Privy-backed creator ownership, Hedera address/account mapping, receipt, and subsequent access to proceeds. EVM support or a displayed address alone is not proof. A separate account or custody change requires an explicit decision.
3. Consumer signing method, supported x402 scheme/version, and facilitator endpoint/configuration. The buyer's working signer does not establish the creator's recipient control.
4. Per-product price/recipient configuration and sanitized settlement evidence. No native split or platform-fee mechanism is assumed.
5. Retry/replay behavior and recovery if payment settles but data delivery fails. Avoid duplicate charges and fail closed on unresolved payment status.
6. Provider quotas/fees and terms, plus source permissions for caching and paid redistribution.

Keep Graph funding and Hedera income separate by network and asset. The user's intended account-level experience must not be implemented as an unsupported claim that those balances are interchangeable. Any platform fee remains subject to explicit terms and a validated collection path; deposits and Graph purchases are not fee bases by default.

## Development Gates and Evidence

These are Sprue's proposed acceptance checks, not extra official requirements. All technical gates remain pending. Preserve sanitized artifacts under a future `docs/evidence/hedera/` directory.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [x] | Record sponsor replacement and participation | User selected Hedera and confirmed Start Fresh; see `plan.md` | Planning only |
| [ ] | Validate the creator's recipient/control model | Account mapping, asset prerequisites, receipt, and proof of creator access without key export | Sprue product/security |
| [ ] | Connect the payment adapter to the chosen environment | Pinned versions and non-secret configuration | H1 |
| [ ] | Run an independent consumer against a derived-data API | Correlated challenge, authorization, settlement, response, and product version | H1, H2 |
| [ ] | Exercise unpaid, invalid, and duplicate requests | Redacted rejection/retry traces; no public bypass or duplicate charge | Sprue safety |
| [ ] | Reconcile creator income and any enabled fee | Network/asset-specific records and settlement references; accepted fee terms if applicable | Sprue accounting |
| [ ] | Reproduce the demo from a clean checkout | Setup commands, environment names, funding prerequisites, source locations, and bounded access | H3 |
| [ ] | Prepare submission and recheck eligibility | Public source, recording, and source-to-payment evidence index | H3 |

Suggested first spike: configure a bounded test environment; verify recipient control; protect one minimal API; run a separate consumer; then replace its test response with the actual Sprue data product. Fixtures are useful during development but are not the final live integration evidence. No account, wallet, deployment, paid request, or fee has been created as part of this documentation work.

## Maintenance

Consult this reference before changing monetization, recipient handling, consumer behavior, or payment demonstrations. Validate [The Graph](graph.md) and [Privy](privy.md) independently. Preserve earlier decisions in [plan.md](../plan.md), record material AI-assisted work, and mark gates complete only when supporting evidence exists.
