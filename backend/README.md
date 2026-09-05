# Sprue Backend

For the complete Windows browser stack and Vercel/Railway packaging, see [deployment.md](../deployment.md). The root Compose/PowerShell entry coordinates frontend, API, worker, PostgreSQL, and explicit one-off migrations. Railway API/worker manifests share this Dockerfile but use different commands; only the API release applies migrations. No platform-specific domain code or live business integration is added by these profiles.

This directory owns the Sprue API, worker, deterministic DAG runtime, persistence, and external-service adapters. Implemented foundations include the [database foundation](database.md), with data-model 1.5, 51 tables, domain-split SQL migrations and Drizzle mappings, the offline [DAG runtime](src/modules/dag/runtime.ts), with schema-driven canonical Swap normalization, Union, Aggregate, Join, and exact arithmetic, and a bounded mock Agent harness. The [backend framework](framework.md) adds runnable API/standby-worker processes, shared security/transport middleware, public app configuration, a verifier-gated identity read service and generated OpenAPI. The explicit evaluator bridge under [demo-runtime.md](../docs/api/demo-runtime.md) lets the frontend request server-generated state and actions without browser fixtures. Durable business commands, compiler/Agent provider calls, queue dispatch, provider adapters, business handlers and live integrations remain unimplemented.

## Deployable Roles

One backend codebase now exposes two process commands:

- `npm run dev:api` / `npm run start:api`: public API framework;
- `npm run dev:worker` / `npm run start:worker`: private standby worker with probes, no task consumption yet.

The evaluator profile runs these roles on Railway with PostgreSQL. The self-hosted profile runs equivalent roles through Docker Compose. Provider configuration must not alter domain behavior.

## Source Layout and Ownership

```text
backend/
├── harness/                # Harness workflow, tools, operator and safety design; scripts planned
├── src/
│   ├── app/                # Bootstrap, validated configuration, and process composition
│   ├── http/
│   │   ├── control/        # Domain route catalogs and implemented identity controller
│   │   ├── demo/           # Explicit evaluator-only state/action transport
│   │   └── products/       # Reserved public/recovery/generated data routes
│   ├── modules/
│   │   ├── identity/       # Privy identity and workspace authorization
│   │   ├── demo/           # Server-generated evaluator state over the harness/runtime
│   │   ├── products/       # Product lifecycle and versioning
│   │   ├── agent/          # Intent planning and structured proposal orchestration
│   │   ├── dag/            # Allowlisted validation, compilation, and execution
│   │   ├── graph/          # Source discovery, API-key access, and Graph x402 access
│   │   ├── wallet/         # Wallet references, signer grants, policies, and budgets
│   │   ├── deployments/    # Active version and materialization management
│   │   ├── payments/       # Upstream expenses and downstream x402 settlement
│   │   └── evidence/       # Trace, receipt, and reconciliation projections
│   ├── jobs/               # Standby lifecycle; durable runner remains planned
│   ├── db/                 # Implemented client, migration runner, seeds, and typed schema
│   ├── integrations/       # Replaceable provider adapters
│   └── shared/             # Narrow cross-cutting primitives only
├── migrations/             # Implemented ordered SQL, authoritative constraints
├── scripts/                # Implemented migration/status/seed/schema-check CLIs
├── tests/                  # Implemented isolated database contract tests
├── compose.db.yml          # Local database
├── compose.backend.yml     # API + standby worker + explicit migration task
├── Dockerfile              # Shared compiled API/worker image
├── openapi.json            # Generated framework contract; reserved routes identified
├── framework.md
├── database.md
└── README.md
```

## Boundary Rules

- Domain modules must not import Railway, Vercel, or Docker APIs.
- Provider SDKs stay behind adapters; domain services depend on explicit ports or interfaces.
- The API and worker share domain logic and persistence contracts but have separate bootstraps and commands.
- The Agent may emit only a structured Data Product Spec and allowlisted DAG. Never execute arbitrary generated JavaScript or Python.
- PostgreSQL is the durable source of truth. Do not make local files or process memory authoritative for jobs, versions, budgets, or payments.
- Every retryable side effect requires a logical intent, provider attempt, idempotency key, and reconciliation path.
- Graph API keys, wallet signer material, database credentials, and facilitator credentials remain server-side and outside repository history.
- Keep upstream Graph expenses, downstream Hedera sales, creator proceeds, and Sprue fees separately auditable by network and asset.
- Add code only after checking the approved `data-model.md` and the corresponding sponsor reference.

The selected runtime baseline is Node.js 24 LTS, Express, and TypeScript, with PostgreSQL, pg/Drizzle, and pg-boss as recorded in the root plan. Database, Express 5 and Zod packages are pinned in package.json/package-lock.json; pg-boss will be installed with its durable runner. Follow database.md for configuration, commands and verification limits.

## Proposed HTTP Contract

See [api-contract.md](../api-contract.md) Draft 0.3 and its domain documents under `docs/api/` for route, request/response, authorization, idempotency, concurrency, trace, and payment boundaries. M1-M3 directions were approved and mapped into data-model 1.5; only the documented framework surfaces are implemented; reserved handlers and all command services remain unavailable. Provider and capped-buyer gates remain prerequisites for live financial behavior.

## Proposed Agent Harness

Start with [harness/README.md](harness/README.md) for the natural-language-to-operator workflow, planning/worker separation, proposed tool scripts, typed operator language, limits, recovery and verification. The first fixture-backed harness/controller slice now lives under `src/modules/agent/harness`; it reuses modules/agent and modules/dag rather than becoming another backend service. Durable Agent sessions, HTTP handlers, queue execution, Graph adapters and H1/H3 live-source/operating-profile decisions remain open.
