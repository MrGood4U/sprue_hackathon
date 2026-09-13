# Backend Framework

Status: live hosted API and Hedera x402 lifecycle implementation scope, updated 2026-09-11. The user authorized API/worker scaffolding, creator authentication, immutable live DAG serving, managed deployment suspension, and the fee-free Hedera testnet HBAR x402 publication path described below.

## Scope and Contract Refinements

Current boundary (2026-09-13): authenticated product, Agent, Builder, API, and X402 routes are backed by durable workspace state. Immutable source admission, fresh Graph execution, managed API deployment, Hedera testnet publication, Blocky402 verification/settlement, paid-delivery recovery, and revenue evidence are implemented. The older incremental notes below are retained as dated implementation history where explicitly labeled.

- Separate API and private worker commands share validated configuration, database ownership and graceful shutdown. Startup never migrates, seeds or enqueues work.
- API health probes and public app configuration are implemented. Production composition uses Privy's server SDK to verify provider-signed access tokens when both required credentials are configured; missing or partial configuration fails closed. The identity read service and owner guard resolve the verified provider identity through `auth_identities` to a stable Sprue user UUID and use parameterized PostgreSQL reads. There is no environment-controlled fake user, development token bypass, or client-selected account link.
- `POST /api/v1/bootstrap` transactionally and idempotently creates or refreshes the local Privy user, ensures one default owner workspace when none exists, then finds or creates one Privy Ethereum wallet owned by the verified Privy user and binds it to the stable Sprue user/workspace. It accepts no user, provider, role, workspace, wallet identifier, or address from the browser. Wallet provisioning creates no funding transaction, additional signer, spending policy, or payment authority.
- Historical incremental snapshot: early durable business routes covered identity/bootstrap, Model Service, Wallet and Access, Graph credential lifecycle, Hedera account activation, products, and Agent planning before Builder compilation and delivery were enabled. Its security invariants remain active: the wallet settings command accepts no provider signer secret, debug logs exclude credentials and hidden reasoning, model/Graph keys are encrypted and never returned, and the public demo runtime remains isolated from durable product mutations. The current route implementation status is authoritative in generated OpenAPI and the current boundary above.
- `AppConfig.privyAppId` is explicitly nullable while authentication is unconfigured. It is projected only when both `PRIVY_APP_ID` and the API-only `PRIVY_APP_SECRET` are present. All six business feature flags remain independent of login and cannot be switched on merely through environment flags. A configured login application cannot enable wallet signing or payments.
- Product metadata now includes an implemented owner-authorized `DELETE` command. It is idempotent and requires the current lock-version ETag; it writes `data_products.deleted_at` rather than physically deleting the product. Ordinary product reads, Dashboard counts, new Agent-session binding, and new planning work exclude tombstoned rows while historical records and slug identity remain intact.
- The owner-authorized product delivery read model projects stored versions, output schema, managed deployment state, x402 publication revision, Hedera recipient capability, confirmed asset/network ledger totals, and recent paid access requests. Its capability flags enable only operations supported by current persisted facts. Deployment suspension revokes active credentials and retires x402; x402 publication and retirement are real owner-authorized commands. The public path uses Blocky402 verification and settlement before server-internal authenticated live DAG execution, never exposes the internal credential, and persists settled delivery failures rather than erasing payment evidence.
- Framework failures add `CAPABILITY_NOT_IMPLEMENTED` (503), `INTERNAL_ERROR` (500), `METHOD_NOT_ALLOWED` (405), `UNSUPPORTED_MEDIA_TYPE` (415), and `USER_SUSPENDED` (403) to the existing safe error envelope. No database/provider error details are exposed.
- Health readiness checks database connectivity and exact migration-journal compatibility only. It does not claim authentication, queue, DAG or payment readiness. A worker exposes probes only, logs standby mode, and consumes no tasks until a durable pg-boss runner and reviewed handlers are implemented.

## Source Ownership

| Directory | Responsibility |
|---|---|
| `src/app/` | Environment loading/validation, composition root, API and worker entries, server lifecycle |
| `src/http/control/` | Creator routes split by identity, Builder, deployment, payments and evidence |
| `src/http/products/` | Public metadata, receipt/recovery and generated data route reservations |
| `src/http/middleware/` | Request IDs, safe logs, CORS, transport limits, authentication and error mapping |
| `src/http/contracts/` | Shared wire schemas and authoritative route descriptors; generated OpenAPI marks reservations |
| `src/modules/auth/` | Privy token verification, provider-binding resolution, stable-user/workspace bootstrap, and authentication ports |
| `src/modules/identity/` | Safe identity projection and owner authorization service |
| `src/modules/model-profile/` | Workspace model profile, AES-256-GCM envelope, CAS repository, and model resolution |
| `src/modules/graph-credential/` | Workspace Graph key lifecycle, AES-256-GCM envelope, redacted views, and runtime secret resolution |
| `src/modules/agent/` | Durable Agent sessions/messages, idempotent planning commands, saved-model execution, bounded Graph metadata discovery, sanitized feasibility evidence, and trace persistence |
| `src/modules/wallet/` | Idempotent Privy user-wallet provisioning, scoped persistence, live Base Sepolia USDC observation, provider grant observation, and local UTC-day spending-policy persistence |
| `src/modules/*/README.md` | Other domain ownership and explicit not-yet-implemented boundaries |
| `src/integrations/` | Fail-closed unavailable-provider adapters and future external-provider boundaries |
| `src/jobs/` | Worker lifecycle boundary; no process-local replacement for a durable queue |
| `src/db/` | Existing SQL/Drizzle foundation plus read-only readiness and identity repository adapter |
| `src/shared/` | Safe error codes and bounded structured logging |

Controllers own transport, domain services own behavior, repositories own SQL and provider adapters own external protocols. Domains do not import Express, deployment SDKs or process environment. Route-level handlers must remain in their owning file; app composition must not accumulate business handlers.

## Running Locally

Use Node 24. Copy the public placeholders in `.env.example` to an untracked `.env`, then configure the explicit database and public URLs. Database commands are documented in [database.md](database.md). From backend/:

```sh
npm ci
npm run dev:api
npm run dev:worker
```

Run the two dev commands in separate terminals. API defaults to loopback port 3001 and worker probes to loopback port 3002. Ports are explicit and do not silently change when occupied. With an unavailable database, health remains alive and readiness returns 503. Configure both `PRIVY_APP_ID` and `PRIVY_APP_SECRET` to enable creator login, user-wallet provisioning, and Privy balance reads; omitting either leaves those protected capabilities unavailable. Configure `MODEL_CREDENTIAL_KEYRING` and `MODEL_CREDENTIAL_ACTIVE_KEY_ID` together to enable durable Model Service and Graph API-key reads/writes. Configure the API-only `HEDERA_PORTAL_PAT` to enable explicit account activation; `HEDERA_FAUCET_URL` is pinned to `https://portal.hedera.com/api/disbursement/cli` and `HEDERA_FAUCET_AMOUNT_HBAR` is limited to 1-100. These values never reach public app configuration or the browser. Hedera remains pinned to `hedera:testnet` with chain ID 296, native HBAR asset ID `0.0.0`, the testnet Mirror Node, and the Blocky402 testnet facilitator. Supplying `hedera:mainnet` is a configuration error; account activation remains distinct from explicit x402 publication and buyer-authorized settlement.

```sh
npm run typecheck
npm test
npm run api:spec
npm run build
npm run test:build
npm run start:api
npm run start:worker
```

Build emits standalone JavaScript plus the unchanged migration assets, without test code or dev-only database dependencies. `openapi.json` is generated from the route registry and implemented wire schemas; reserved operations have no invented successful business responses or request schemas. The demo projection is documented separately and marked with `dataSource: "demo"`. Check freshness with `npm run api:spec:check`. This is a framework transport specification, not a complete executable version of every domain DTO in the Markdown contract.

## Deployment and Security

The subsequent [complete local/deployment profile](../deployment.md) adds the root four-service Compose stack, Windows PowerShell orchestration, a frontend image and Vercel/Railway manifests. The commands below remain the smaller backend-only profile; do not run it on the same ports as the root stack. API/worker startup still does not migrate; local orchestration and the Railway API release invoke migrations explicitly.

API and worker use the same Docker image with different commands. `compose.backend.yml` adds them to the database-only development profile and includes a separately invoked migration service. It does not deploy the frontend or complete the full self-hosted product. Railway can use the Dockerfile or the documented build/start commands. Bind `HOST=0.0.0.0` in a container; use exact HTTPS public URLs and explicit CORS origins for non-local profiles. Do not provision any cloud service as part of framework setup.

For local backend containers, configure POSTGRES_PASSWORD and the matching percent-encoded CONTAINER_DATABASE_URL in .env, then run:

```sh
docker compose -f compose.db.yml -f compose.backend.yml up -d postgres
docker compose -f compose.db.yml -f compose.backend.yml --profile tools run --rm migrate
docker compose -f compose.db.yml -f compose.backend.yml up -d --build api worker
```

The migration command is explicit and must target the intended local volume. The worker has no published port; inspect its probes inside the private network. No command above seeds wallets or enables jobs. For Railway source builds use `npm ci` and `npm run build` before pruning development dependencies; separate services start with `npm run start:api` or `npm run start:worker`. The runtime image needs no tsx, TypeScript or PGlite dependency.

Only a deliberately configured origin receives CORS headers. Bearer headers, not cookies, authenticate creators; no wildcard credentials or proxy-trust shortcut is enabled. Privy access tokens are verified before local account or owner lookup, and neither tokens nor the app secret are logged or returned. Preflight never authenticates or acts on a request. Unsupported data methods, including HEAD, never invoke a data handler. Responses are no-store by default. Server-generated request IDs cannot be chosen through an incoming header. Logs contain only IDs, matched route templates, method, status, duration and fixed lifecycle/error codes, never URL queries, bodies, credentials, model-provider response bodies or raw exception messages. Model and Graph keys are encrypted with AES-256-GCM before SQL, scoped by authenticated workspace additional data with distinct cryptographic contexts, and never returned. Versioned encryption keys remain API-only; backups do not contain those keys, and old key versions must remain available during rotation.

Transport ceilings follow the draft contract: 256 KiB JSON (64 KiB Agent messages), 64 KiB encoded payment header, 96 KiB total headers and 8 KiB request target. Compressed request bodies are disabled. Configure ingress limits consistently. These are transport safeguards, not H3 query/model/spending limits or a distributed abuse limiter. Review ingress rate limiting and trusted proxy configuration before exposing business operations publicly.

SIGINT/SIGTERM stops admission, drains connections within a bounded grace period, stops the worker lifecycle and closes the pool. Probe responses expose no database URL, migration names or secrets. Configuration errors report only field names. Migrations 0018 and 0019 add the durable model-profile and encrypted Graph-credential records without rewriting earlier migration history.

## Verification Boundary

The initial framework tests used real local HTTP sockets with injected ports and isolated PGlite SQL; they did not use external credentials, queues or live providers. 28 tests passed, covering route/catalog parity with all five Markdown API documents, security/error behavior, identity ownership and readiness. The compiled API and worker both passed local startup/probe/idempotent-shutdown smoke tests; migration assets were unchanged and test output was excluded. Compose configuration validation passed. Those initial checks did not start a native PostgreSQL server or container.

Windows-local deployment checks pass PostgreSQL schema/migration validation, Docker API/worker/frontend/PostgreSQL/Redis startup, native Node API/worker readiness and shutdown, exact-origin CORS, and frontend deep-link probes. The current automated suite also covers immutable live source admission and execution, deployment lifecycle, x402 settlement ordering, replay protection, and durable paid-delivery evidence. See [deployment.md](../deployment.md) and the current [plan record](../plan.md). Google and GitHub are the current creator login methods. Railway networking, distributed queue recovery, and production multi-instance cancellation remain unverified; the worker remains standby.

Implementation references: [Express 5 asynchronous errors](https://expressjs.com/en/guide/error-handling/), [Express 5 migration notes](https://expressjs.com/en/guide/migrating-5/), and [Node HTTP server lifecycle](https://nodejs.org/docs/latest-v24.x/api/http.html).
