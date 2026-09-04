# Privy: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-05

Participation: Start Fresh, confirmed by the user on 2026-09-05.

Status: Research complete; integration, award selection, and final qualification remain pending.

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

The creator has a Privy-backed account wallet, tops it up, and grants Sprue limited authority to pay Graph data costs. Sprue handles purchases during builds and refreshes, without the creator manually paying each query. The same account wallet is the intended recipient identity for optional API sales; exact recipient/settlement configuration must be validated. External API buyers are not required to use Privy.

Do not treat login, wallet creation, a displayed balance, or passive receipt of revenue alone as our completed integration evidence. Show the wallet action and its outcome as part of the user's task.

Evaluate the upstream data-purchase flow for award B. For award A, demonstrate the same workflow in a credible business/workspace context with an enforced Privy control, including a permitted and rejected operation. Bounded delegated spending is now core product work; separate product wallets and general-purpose treasury automation are not required.

If the creator enables paid publication through Bazantic, account for creator revenue and any disclosed Sprue service fee on sales. No fee rate, collection mechanism, or native split capability is assumed. Do not confuse creator deposits, upstream Graph expenses, gross API sales, net proceeds, and platform income.

Do not assume one recording qualifies for both awards. Choose after the integration spike and check entry rules.

## Verified Technical References

These are documented capabilities, not evidence that our combination of providers already works.

### x402 Client Integration

Privy's [x402 guide](https://docs.privy.io/recipes/agent-integrations/x402) documents payment authorization from embedded wallets in React and Node.js; the selected facilitator handles settlement. Relevant entry points include `useX402Fetch` and `createX402Client`.

An important EVM detail: x402 authorization uses typed-data signing. A rule covering only `eth_sendTransaction` does not restrict that signing path. Validate controls against the actual payment authorization method, token, recipient, domain, and amount. See the same [guide's recipient-screening section](https://docs.privy.io/recipes/agent-integrations/x402).

Pin and test compatible SDK versions before adopting example code. Do not hard-code a header format, network, token, signature mode, or facilitator merely because one documentation example uses it.

For the upstream integration, validate against [The Graph's paid-query endpoint](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/). Using documented components on both sides is not an end-to-end compatibility test. Prefer constrained remote wallet authorization over exporting the creator's private key.

### Wallet Controls

The [policy overview](https://docs.privy.io/controls/policies/overview) describes rules for permitted actions, recipients, networks, amounts, and signing parameters. These are wallet controls, not just interface validations.

For Sprue, prefer one narrow policy and a reproducible acceptance/rejection test. A disabled frontend button or an application-only spending check is not evidence that a Privy policy enforced the restriction. Confirm which rule applies to the precise wallet action being demonstrated.

### Other References

- [Privy documentation](https://docs.privy.io/): General documentation entry point.
- [Controls and authorization model](https://docs.privy.io/controls/overview): Background for choosing user-owned versus delegated wallet control.
- [Privy GitHub](https://github.com/privy-io): Sponsor-linked source and examples; select and review a concrete repository before reuse.
- [Sponsor-linked quickstart](https://docs.privy.io/basics/get-started/quickstart): Could not be retrieved during this review; use the documentation entry point to locate the current setup guide.

## Proposed End-to-End Evidence

Confirmed product sequence, subject to technical validation:

```text
Creator funds the account wallet
    -> authorizes bounded Graph spending
    -> Sprue uses Privy authorization to pay Graph
    -> Graph supplies data for the hosted API
    -> creator sees expenses, budget, and API freshness

If the creator opts into Bazantic publication:
External buyer pays for API access
    -> creator receives sales proceeds
    -> any accepted Sprue service fee is allocated and settled
```

This does not assign settlement to Privy or assume that Bazantic itself is the facilitator. Establish those responsibilities during technical selection.

The creator is a buyer of upstream Graph data and a potential seller of downstream API access. These two roles share the creator account's financial view, but their transactions and permissions must be tracked separately. The external API buyer is a different actor and can use any supported payment client.

## Development Gates and Evidence

These are our proposed acceptance checks, not additional sponsor rules. All technical gates remain unchecked. Store sanitized artifacts under a future `docs/evidence/privy/` directory.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [ ] | Select the award and define its user task | Human decision and a short explanation of why Privy is necessary | P1-P3 |
| [ ] | Establish and fund the creator account wallet | Redacted creation/use record, public address, deposit, and authorization model | P1 |
| [ ] | Complete Sprue-managed Graph purchasing | Upstream request, wallet authorization, payment outcome, returned facts, and expense linkage | P2 or P3 |
| [ ] | Reconcile optional API revenue and any enabled service fee | Downstream payment, accepted fee terms, creator proceeds, platform allocation, and settlement references | Sprue product requirement |
| [ ] | If pursuing A, test the enforced restriction | Policy/signer configuration, one permitted action, and one rejected request | P2 |
| [ ] | Verify availability and dependencies of the chosen feature | Documentation, account prerequisites, and any sponsor clarification | P3, P4 |
| [ ] | Reproduce the judge flow from documented setup | Environment-variable names, tested versions, funding instructions, and bounded access | P1 |
| [ ] | Prepare the submission evidence index | Source locations, recording, and an explanation tied to visible behavior | P1-P4 |

A signed authorization alone is not our proof of a completed paid data request. Correlate the payment outcome with the API response and distinguish pending, failed, and successful operations.

## Pending Technical Decisions

- Which exact account-wallet ownership, delegated signing, budget, and revocation configuration will implement the confirmed creator role?
- Which chain, token, x402 version, signature mode, and facilitator work for the upstream Graph endpoint and downstream Bazantic publication, respectively?
- Does Bazantic support the intended recipient configuration and expose enough evidence to reconcile payment and API delivery?
- Does the chosen settlement path support an authorized platform fee? Its rate, basis, rounding, recipient, payout timing, and refunds must be decided before charging.
- Which exact wallet method must a control cover, and can retries or alternate signing paths bypass it?
- How will the demo wallet be funded, bounded, and isolated from production assets? Confirm acceptable demo networks with the sponsor; SDK testnet support alone is not event approval.
- How will insufficient funds, rejected authorization, duplicate retries, and upstream failure be handled?
- How will concurrent builds reserve budget and stop safely on revocation? Depositing more funds must not expand an existing spending mandate automatically.
- Can the selected flow use generally available features without commercial onboarding?
- Which award entries can be combined, and what final evidence does the sponsor expect?

Never commit app secrets, authorization private keys, wallet recovery material, or user tokens. Price, asset, network, and payment limit must be clear before any funded action. Do not collect credentials or move funds as part of documentation work.

## Maintenance

Consult this file before changing wallet or payment behavior. Validate [Bazantic](bazantic.md) interoperability and [The Graph](graph.md) requirements independently. Keep planning and AI contributions in [plan.md](../plan.md); update completion status only when evidence exists.
