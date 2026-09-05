# Sprue

Describe it. Shape it. Sell it.

Sprue is a hosted web product that turns natural-language onchain data logic into persistent, reusable, and optionally monetizable APIs. It is a browser application, not a Windows or macOS native client. Product structure, technical selection, and data-model version 1.5 are approved. MVP implementation now includes the maintained frontend, backend database foundation, API/standby-worker framework, and an offline schema-driven DAG runtime for the cross-chain target. The seven-page application in `frontend/` is the maintained product frontend, using the selected Evidence-First Console design and English/Simplified Chinese localization. It currently runs against demo data while business handlers and provider adapters proceed. The initial downstream payment profile is Hedera testnet with HBAR through Blocky402. No complete live MVP or live payment integration exists yet. See [mvp-flow.md](mvp-flow.md) for the end-to-end flow and support matrix.

## Product Boundary

Sprue uses existing The Graph Subgraphs to turn data intent into a persistent API. It selects suitable sources by semantic fit, granularity, coverage, freshness, and evidenced query costs, generates validated queries, and applies only necessary supported transformations. Source gaps lead to explicit limitations, requirement revision, or another existing source for validation.

Sprue does not create, deploy, or maintain new Subgraphs or Subgraph Composition, including as a fallback or future optimization task. Hosted API builds, refreshes, versioning, and optional x402 remain in scope. The MVP can query multiple existing Subgraphs and combine their normalized results through explicit Union/Join DAG operators. See the [confirmed boundary](agents.md#confirmed-existing-subgraph-boundary).

## Selected Sponsors

- [The Graph](sponsor/graph.md): Upstream data accessed through the creator's existing Graph API key/subscription or purchased per query by Sprue under the creator's authorized wallet budget.
- [Privy](sponsor/privy.md): Creator account wallet and bounded Graph-spending authorization.
- [Hedera](sponsor/Hedera.md): Downstream x402 v2 `exact` settlement through Blocky402; Sprue hosts the API and implements its payment gate.

Official documentation establishes the Hedera x402 wire profile and Blocky402's hosted testnet/mainnet capability. The team selected testnet HBAR for the first integration; creator-controlled Hedera account resolution, HBAR receipt/access, live settlement reconciliation, wallet compatibility, and fee settlement remain validation gates. Graph-spending funds and API-sale proceeds must be tracked separately by network and asset. Bazantic was replaced on 2026-09-05; [its reference](sponsor/bazantic.md) remains historical only.

## Deployment Profiles

See [deployment.md](deployment.md) for Windows local setup, native Node development, complete Docker packaging, and Vercel/Railway configuration. From PowerShell at the repository root, run `./scripts/local.ps1 init`, then `./scripts/local.ps1 up`; the default browser address is `http://127.0.0.1:4173`. Stop with `./scripts/local.ps1 stop` to preserve database data. These commands start the current frontend and backend framework, not the unfinished live business integrations.

- Evaluator demo: Creator Console on Vercel; public API, private worker, and PostgreSQL on Railway, using platform-provided domains.
- Self-hosted: equivalent frontend, API, worker, and PostgreSQL roles through Docker Compose from the same source and configuration contract.

Vercel and Railway are temporary delivery targets, not application dependencies. Deployment portability, explicit migrations, health checks, server-side secrets, and non-ephemeral source-of-truth persistence are required. Cloud deployment remains unverified; checked-in manifests do not provision services or satisfy sponsor evidence.

## Product Frontend

The React application under [`frontend/`](frontend/) covers Entry, Dashboard, Wallet and Access, Product Builder, API and Deployment, Monetization and Revenue, and the Public Consumer Demo. It supports English and Simplified Chinese UI copy, persists the user's locale choice in the browser, and uses a demo service adapter for sample workflows. Each route-level page lives in its own file, with shared UI, navigation, feature hooks, services, and locale catalogs separated by responsibility. Continue implementing this frontend directly; remaining integration and interaction work is tracked in [`frontend/implementation-status.md`](frontend/implementation-status.md).

```bash
cd frontend
npm install
npm run dev -- --port 4173
```

Open `http://127.0.0.1:4173`. Use a browser window at least 1024 CSS pixels wide; 1440 by 1024 is the primary judge-demo target. Build and packaging checks are available through `npm run build` and `npm run test:sites`.

## Database Foundation

The backend now has 51 domain tables, 15 ordered SQL migrations, typed Drizzle query mappings, explicit reference seeds and isolated tests. Read [backend/database.md](backend/database.md) for local PostgreSQL setup, commands, schema authority and remaining verification. Database structure and the API/standby-worker framework are implemented; business handlers and live integrations are not. See [backend/framework.md](backend/framework.md) for startup commands, security boundaries, generated OpenAPI and reserved routes. Native PostgreSQL 17 schema/migrations and Docker service startup now pass the Windows-local checks in [deployment.md](deployment.md); Railway deployment and multi-connection behavior remain unverified.

## Project Records

- [Product intent and repository rules](agents.md)
- [Plan, decisions, and AI contribution log](plan.md)
- [Proposed project structure and financial model](project-structure.md)
- [Approved MVP data model version 1.5 and validation gates](data-model.md)
- [Proposed frontend/backend API contract and review gates](api-contract.md)
- [Proposed Agent harness workflow, tools, operators, and constraints](backend/harness/README.md)
- [Approved page architecture and interaction design](product-design.md)
- [Proposed Evidence-First Console design tokens](design-tokens.md)
- [Historical design QA and visual evidence](design-qa.md)
- [Frontend structure and file-ownership plan](frontend/README.md)
- [Backend boundary and source-layout plan](backend/README.md)

Product-design Draft 1.3 records the maintained frontend, seven page families, route ownership, interactions, accessibility, and screen-to-data contracts. Token review remains follow-up work; the capped consumer's funding boundary and real provider compatibility remain integration gates.

Participation: Start Fresh. All repository text is written in English; team communication may use Chinese. Preserve meaningful Git history and update the AI contribution record as work progresses. Runnable setup and verified demo evidence will be added with implementation.
