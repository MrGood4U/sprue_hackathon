# Sprue

Describe it. Shape it. Sell it.

Sprue is a hosted web product that turns natural-language onchain data logic into persistent, reusable, and optionally monetizable APIs. It is a browser application, not a Windows or macOS native client. Product structure, technical selection, and data-model version 1.3 are approved. Product and interface design is the current stage: page architecture and interactions are approved, the Evidence-First Console direction is selected, a three-layer design-token draft is applied, and a seven-page interactive prototype is ready for review. The initial downstream payment profile is Hedera testnet with HBAR through Blocky402. No runnable MVP or live payment integration exists yet.

## Selected Sponsors

- [The Graph](sponsor/graph.md): Upstream data accessed through the creator's existing Graph API key/subscription or purchased per query by Sprue under the creator's authorized wallet budget.
- [Privy](sponsor/privy.md): Creator account wallet and bounded Graph-spending authorization.
- [Hedera](sponsor/Hedera.md): Downstream x402 v2 `exact` settlement through Blocky402; Sprue hosts the API and implements its payment gate.

Official documentation establishes the Hedera x402 wire profile and Blocky402's hosted testnet/mainnet capability. The team selected testnet HBAR for the first integration; creator-controlled Hedera account resolution, HBAR receipt/access, live settlement reconciliation, wallet compatibility, and fee settlement remain validation gates. Graph-spending funds and API-sale proceeds must be tracked separately by network and asset. Bazantic was replaced on 2026-09-05; [its reference](sponsor/bazantic.md) remains historical only.

## Deployment Profiles

- Evaluator demo: Creator Console on Vercel; public API, private worker, and PostgreSQL on Railway, using platform-provided domains.
- Self-hosted: equivalent frontend, API, worker, and PostgreSQL roles through Docker Compose from the same source and configuration contract.

Vercel and Railway are temporary delivery targets, not application dependencies. Deployment portability, explicit migrations, health checks, server-side secrets, and non-ephemeral source-of-truth persistence are required. No live deployment exists yet.

## Interactive Design Prototype

The self-contained React prototype under [`frontend/`](frontend/) covers Entry, Dashboard, Wallet and Access, Product Builder, API and Deployment, Monetization and Revenue, and the Public Consumer Demo. It uses English mock data and simulates the core state transitions without calling real services or moving funds. Each route-level page now lives in its own file, with shared UI, navigation, product-shell, and Builder feature components separated by responsibility.

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:4173`. Use a browser window at least 1024 CSS pixels wide; 1440 by 1024 is the primary judge-demo target. Build and packaging checks are available through `npm run build` and `npm run test:sites`.

## Project Records

- [Product intent and repository rules](agents.md)
- [Plan, decisions, and AI contribution log](plan.md)
- [Proposed project structure and financial model](project-structure.md)
- [Approved MVP data model version 1.3 and validation gates](data-model.md)
- [Approved page architecture and interaction design](product-design.md)
- [Proposed Evidence-First Console design tokens](design-tokens.md)
- [Prototype design QA and visual evidence](design-qa.md)
- [Frontend structure and file-ownership plan](frontend/README.md)
- [Backend boundary and source-layout plan](backend/README.md)

Product-design Draft 1.2 records seven page families, route ownership, per-page interactions, UI states, large-screen web behavior, accessibility, screen-to-data contracts, the selected visual direction, formal token proposal, and the interactive prototype. Design-token decisions DT1-DT4 and final human prototype review remain before MVP implementation.

Participation: Start Fresh. All repository text is written in English; team communication may use Chinese. Preserve meaningful Git history and update the AI contribution record as work progresses. Runnable setup and verified demo evidence will be added with implementation.
