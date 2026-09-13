# Sprue

Describe it. Shape it. Sell it.

Sprue turns natural-language onchain data requirements into persistent, reusable, and optionally monetizable APIs. A creator can discover existing The Graph Subgraphs, inspect the Agent's ranked source evidence, review or edit a structured transformation DAG, deploy a live API, and sell access through Hedera x402. The browser console and backend use authenticated, workspace-isolated state; model and Graph credentials are encrypted server-side.

The hackathon MVP is implemented end to end for the selected local/testnet profile: Google or GitHub creator authentication through Privy, live multi-Subgraph planning and execution, durable Builder drafts and immutable compiled versions, private API deployment, Hedera testnet HBAR pricing and publication through Blocky402, persisted revenue/transaction evidence, and a funded request from the independent `hx402-cli` buyer. The Creator Console supports English, Simplified Chinese, Spanish, French, German, Korean, and Japanese. See [mvp-flow.md](mvp-flow.md) for the workflow and current support matrix.

## Product Boundary

Sprue uses existing The Graph Subgraphs to turn data intent into a persistent API. It selects suitable sources by semantic fit, granularity, coverage, freshness, and evidenced query costs, generates validated queries, and applies only necessary supported transformations. Source gaps lead to explicit limitations, requirement revision, or another existing source for validation.

Sprue does not create, deploy, or maintain new Subgraphs or Subgraph Composition, including as a fallback or future optimization task. Hosted API builds, refreshes, versioning, and optional x402 remain in scope. The MVP can query multiple existing Subgraphs and combine their normalized results through explicit Union/Join DAG operators. See the [confirmed boundary](agents.md#confirmed-existing-subgraph-boundary).

## Selected Sponsors

- [The Graph](sponsor/graph.md): Upstream data accessed through the creator's existing Graph API key/subscription or purchased per query by Sprue under the creator's authorized wallet budget.
- [Privy](sponsor/privy.md): Creator account wallet and bounded Graph-spending authorization.
- [Hedera](sponsor/Hedera.md): Downstream x402 v2 `exact` settlement through Blocky402; Sprue hosts the API and implements its payment gate.

The demonstrated payment profile is Hedera testnet native HBAR. Sprue publishes an x402 v2 `exact` challenge, Blocky402 verifies and settles the payment, and `hx402-cli` signs locally before retrying the protected API. The successful paid request is recorded against the product and reconciled to its Hedera transaction reference. Mainnet operation, production abuse controls, and Privy-delegated upstream Graph x402 spending remain outside the demonstrated profile. Graph-spending funds and API-sale proceeds stay separated by network and asset.

## Independent Hedera x402 Consumer

[`x402-cli/`](x402-cli/) contains the standalone `hx402-cli` buyer client required to call Sprue or any compatible Hedera x402 v2 API. It generates or imports an ECDSA wallet, encrypts the private key locally, resolves and reads Hedera accounts through Mirror Node, can request testnet faucet funding with a user-supplied Hedera Portal PAT, validates a native-HBAR payment challenge against a local per-request ceiling, signs the standard payment payload, retries the protected request, and prints the response. It does not import Sprue application modules or expose the private key to a resource server or facilitator.

On Windows, `npm run build:exe` creates a standalone `x402-cli/release/hx402-cli.exe`. Starting it without arguments opens an interactive `hx402-cli>` command line; supplying arguments retains the one-shot automation interface. Run `hx402-cli help` for the quick-start guide or `hx402-cli help request` for request options and examples.

```bash
cd x402-cli
npm ci
npm run build
npm link
hx402-cli wallet create --network testnet --max-hbar 1
hx402-cli request "https://example.test/x402/v1/owner/product" --dry-run --max-hbar 0.25
```

See the [CLI setup and safety guide](x402-cli/README.md). A real request requires a funded buyer account and explicit payment approval; automated tests never move funds. The hackathon demo used a separately funded Hedera testnet buyer and a creator-owned Sprue endpoint.

## Deployment Profiles

See [deployment.md](deployment.md) for Windows local setup, native Node development, Docker packaging, and Vercel/Railway configuration. From PowerShell at the repository root, run `./scripts/local.ps1 init`, then `./scripts/local.ps1 up`; the default browser address is `http://127.0.0.1:4173`. Stop with `./scripts/local.ps1 stop` to preserve database data. The Compose profile builds the frontend and backend, starts PostgreSQL and Redis, applies migrations and reference seeds, and verifies the frontend, API, worker, and cache health checks.

- Evaluator demo: Creator Console on Vercel; public API, private worker, PostgreSQL, and Redis on Railway, using platform-provided domains.
- Self-hosted: equivalent frontend, API, worker, PostgreSQL, and Redis roles through Docker Compose from the same source and configuration contract.

Vercel and Railway are temporary delivery targets, not application dependencies. Deployment portability, explicit migrations, health checks, server-side secrets, and non-ephemeral source-of-truth persistence are required. Cloud deployment remains unverified; checked-in manifests do not provision services or satisfy sponsor evidence.

## Product Frontend

The React application under [`frontend/`](frontend/) covers Entry, Creator Login, Dashboard, Wallet and Access, Model Service, Agent Planner, Product Builder, API and Deployment, Monetization and Revenue, and the Public Consumer view. Authenticated product pages read live workspace APIs; only the explicitly labeled public evaluator projection retains demo data. English is the first-visit fallback, and creators can explicitly select Simplified Chinese, Spanish, French, German, Korean, or Japanese. The locale preference is stored locally. Model and Graph API keys are write-only in the browser, encrypted before PostgreSQL storage, and never returned by the backend.

```bash
cd frontend
npm install
npm run dev -- --port 4173
```

Open `http://127.0.0.1:4173`. Use a browser window at least 1024 CSS pixels wide; 1440 by 1024 is the primary judge-demo target. Build and packaging checks are available through `npm run build` and `npm run test:sites`.

## Database Foundation

The backend currently applies 25 ordered SQL migrations and uses typed Drizzle mappings, explicit reference seeds, and isolated tests. It implements workspace authorization, Privy identity bootstrap, encrypted model/Graph credentials, Agent sessions and trace evidence, durable Builder drafts, compiled product versions, live Graph execution, managed API deployment, Hedera x402 publication, paid-delivery audit records, and revenue projections. Read [backend/database.md](backend/database.md) and [backend/framework.md](backend/framework.md) for schema authority, startup commands, security boundaries, and generated OpenAPI. The local PostgreSQL 17/Redis Compose profile is verified; evaluator cloud deployment is configured separately and is not implied by local health checks.

## Project Records

- [Product intent and repository rules](agents.md)
- [Proposed project structure and financial model](project-structure.md)
- [Approved MVP data model version 1.13 and validation gates](data-model.md)
- [Frontend/backend API contract](api-contract.md)
- [Agent harness workflow, tools, operators, and constraints](backend/harness/README.md)
- [Approved page architecture and interaction design](product-design.md)
- [Proposed Evidence-First Console design tokens](design-tokens.md)
- [Historical design QA and visual evidence](design-qa.md)
- [Frontend structure and file-ownership plan](frontend/README.md)
- [Backend boundary and source-layout plan](backend/README.md)

Engineering history and superseded design research remain available in the repository for provenance, but the documents above and [mvp-flow.md](mvp-flow.md) describe the current product. Known limitations are kept explicit: existing Subgraphs only, Hedera testnet for downstream payments, bounded live query execution, no automatic asset bridging, and no claim that a local Compose check proves a public cloud deployment.
