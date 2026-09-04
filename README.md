# Sprue

Describe it. Shape it. Sell it.

Sprue is a hosted web product that turns natural-language onchain data logic into persistent, reusable, and optionally monetizable APIs. Product structure, technical selection, and data-model version 1.3 are approved; MVP implementation is the current stage. The initial downstream payment profile is Hedera testnet with HBAR through Blocky402. No runnable MVP or live payment integration exists yet.

## Selected Sponsors

- [The Graph](sponsor/graph.md): Upstream data accessed through the creator's existing Graph API key/subscription or purchased per query by Sprue under the creator's authorized wallet budget.
- [Privy](sponsor/privy.md): Creator account wallet and bounded Graph-spending authorization.
- [Hedera](sponsor/Hedera.md): Downstream x402 v2 `exact` settlement through Blocky402; Sprue hosts the API and implements its payment gate.

Official documentation establishes the Hedera x402 wire profile and Blocky402's hosted testnet/mainnet capability. The team selected testnet HBAR for the first integration; creator-controlled Hedera account resolution, HBAR receipt/access, live settlement reconciliation, wallet compatibility, and fee settlement remain validation gates. Graph-spending funds and API-sale proceeds must be tracked separately by network and asset. Bazantic was replaced on 2026-09-05; [its reference](sponsor/bazantic.md) remains historical only.

## Deployment Profiles

- Evaluator demo: Creator Console on Vercel; public API, private worker, and PostgreSQL on Railway, using platform-provided domains.
- Self-hosted: equivalent frontend, API, worker, and PostgreSQL roles through Docker Compose from the same source and configuration contract.

Vercel and Railway are temporary delivery targets, not application dependencies. Deployment portability, explicit migrations, health checks, server-side secrets, and non-ephemeral source-of-truth persistence are required. No live deployment exists yet.

## Project Records

- [Product intent and repository rules](agents.md)
- [Plan, decisions, and AI contribution log](plan.md)
- [Proposed project structure and financial model](project-structure.md)
- [Approved MVP data model version 1.3 and validation gates](data-model.md)

Participation: Start Fresh. All repository text is written in English; team communication may use Chinese. Preserve meaningful Git history and update the AI contribution record as work progresses. Runnable setup and verified demo evidence will be added with implementation.
