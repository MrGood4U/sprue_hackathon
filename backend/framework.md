# Backend Framework

Status: framework and creator-authentication implementation scope, updated 2026-09-07. The user authorized API/worker scaffolding and Google, GitHub, and MetaMask creator login through Privy. This does not approve H1/H3 semantics/limits, E1/E2 wallet/payment authority, or fees.

## Scope and Contract Refinements

- Separate API and private worker commands share validated configuration, database ownership and graceful shutdown. Startup never migrates, seeds or enqueues work.
- API health probes and public app configuration are implemented. Production composition uses Privy's server SDK to verify provider-signed access tokens when both required credentials are configured; missing or partial configuration fails closed. The identity read service and owner guard resolve the verified provider identity through `auth_identities` to a stable Sprue user UUID and use parameterized PostgreSQL reads. There is no environment-controlled fake user, development token bypass, or client-selected account link.
- `POST /api/v1/bootstrap` transactionally and idempotently creates or refreshes the local Privy user, ensures one default owner workspace when none exists, and returns the same safe identity projection as `GET /api/v1/me`. It accepts no user, provider, role, workspace, or wallet identifier from the browser. Bootstrap neither provisions nor authorizes a wallet.
- Every durable business route is reserved in a domain-specific route catalog. Reserved routes return `503 CAPABILITY_NOT_IMPLEMENTED` after applicable transport/authentication/owner checks, never synthetic DTOs, 202 acceptance or 402 payment challenges. The explicitly temporary evaluator routes under `/api/v1/public/demo/` are an exception: when `DEMO_RUNTIME_ENABLED=true`, they return a server-generated fixture-backed projection and may call only the submitted OpenAI-compatible model during an explicit connection test or Agent-plan action. Connection testing does not save the submitted profile. These routes perform no durable mutation, Graph request, wallet action or payment. Resource ancestry checks must be added before enabling each durable handler; a route reservation is not an implemented API.
- `AppConfig.privyAppId` is explicitly nullable while authentication is unconfigured. It is projected only when both `PRIVY_APP_ID` and the API-only `PRIVY_APP_SECRET` are present. All six business feature flags remain independent of login and cannot be switched on merely through environment flags. A configured login application cannot enable wallet signing or payments.
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

Run the two dev commands in separate terminals. API defaults to loopback port 3001 and worker probes to loopback port 3002. Ports are explicit and do not silently change when occupied. With an unavailable database, health remains alive and readiness returns 503. Configure both `PRIVY_APP_ID` and `PRIVY_APP_SECRET` to enable creator login; omitting either leaves protected routes unavailable. The public app ID may reach the browser through app config, while the secret remains API-only.

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

Only a deliberately configured origin receives CORS headers. Bearer headers, not cookies, authenticate creators; no wildcard credentials or proxy-trust shortcut is enabled. Privy access tokens are verified before local account or owner lookup, and neither tokens nor the app secret are logged or returned. Preflight never authenticates or acts on a request. Unsupported data methods, including HEAD, never invoke a data handler. Responses are no-store by default. Server-generated request IDs cannot be chosen through an incoming header. Logs contain only IDs, matched route templates, method, status, duration and fixed lifecycle/error codes, never URL queries, bodies, credentials, model-provider response bodies or raw exception messages. The demo model key exists only in bounded process memory, is scoped by a random browser-session UUID, is never returned, and is cleared on restart; this is not a substitute for authenticated secret management.

Transport ceilings follow the draft contract: 256 KiB JSON (64 KiB Agent messages), 64 KiB encoded payment header, 96 KiB total headers and 8 KiB request target. Compressed request bodies are disabled. Configure ingress limits consistently. These are transport safeguards, not H3 query/model/spending limits or a distributed abuse limiter. Review ingress rate limiting and trusted proxy configuration before exposing business operations publicly.

SIGINT/SIGTERM stops admission, drains connections within a bounded grace period, stops the worker lifecycle and closes the pool. Probe responses expose no database URL, migration names or secrets. Configuration errors report only field names. No migrations are rewritten by this change; no new tables are required.

## Verification Boundary

The initial framework tests used real local HTTP sockets with injected ports and isolated PGlite SQL; they did not use external credentials, queues or live providers. 28 tests passed, covering route/catalog parity with all five Markdown API documents, security/error behavior, identity ownership and readiness. The compiled API and worker both passed local startup/probe/idempotent-shutdown smoke tests; migration assets were unchanged and test output was excluded. Compose configuration validation passed. Those initial checks did not start a native PostgreSQL server or container.

The subsequent Windows-local deployment checks passed native PostgreSQL 17 schema/migration validation, Docker API/worker/frontend startup, native Node API/worker readiness and shutdown, exact-origin CORS and frontend deep-link probes. The authentication slice adds injected verification tests and isolated PostgreSQL bootstrap coverage. See [deployment.md](../deployment.md) and the current [plan record](../plan.md). Live Google/GitHub/MetaMask login, Railway networking, multi-connection bootstrap races and pg-boss recovery remain unverified until real Privy credentials and approved origins are configured; the worker remains standby and other business handlers remain unavailable.

Implementation references: [Express 5 asynchronous errors](https://expressjs.com/en/guide/error-handling/), [Express 5 migration notes](https://expressjs.com/en/guide/migrating-5/), and [Node HTTP server lifecycle](https://nodejs.org/docs/latest-v24.x/api/http.html).
