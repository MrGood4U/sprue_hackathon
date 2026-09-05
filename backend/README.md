# Sprue Backend

For the complete Windows browser stack and Vercel/Railway packaging, see [deployment.md](../deployment.md). The root Compose/PowerShell entry coordinates frontend, API, worker, PostgreSQL, and explicit one-off migrations. Railway API/worker manifests share this Dockerfile but use different commands; only the API release applies migrations. No platform-specific domain code or live business integration is added by these profiles.

This directory owns the Sprue API, worker, deterministic DAG runtime, persistence, and external-service adapters. The first implemented slice is the [database foundation](database.md): data-model 1.4, 51 tables, domain-split SQL migrations and Drizzle mappings, setup scripts and isolated tests. The [backend framework](framework.md) now adds runnable API/standby-worker processes, shared security/transport middleware, 100 domain-owned route registrations, public app configuration, a verifier-gated identity read service and generated OpenAPI. Business commands, compiler/Agent, queue dispatch and live integrations remain unimplemented.

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
│   │   └── products/       # Reserved public/recovery/generated data routes
│   ├── modules/
│   │   ├── identity/       # Privy identity and workspace authorization
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

See [api-contract.md](../api-contract.md) Draft 0.3 and its domain documents under `docs/api/` for route, request/response, authorization, idempotency, concurrency, trace, and payment boundaries. M1-M3 directions were approved and mapped into data-model 1.4; only the documented framework surfaces are implemented; reserved handlers and all command services remain unavailable. Provider and capped-buyer gates remain prerequisites for live financial behavior.

## Proposed Agent Harness

Start with [harness/README.md](harness/README.md) for the natural-language-to-operator workflow, planning/worker separation, proposed tool scripts, typed operator language, limits, recovery and verification. Draft 0.3 maps approved H2 persistence to implemented database tables, but contains no implemented harness scripts or runtime. The harness reuses modules/agent, modules/dag and modules/graph rather than becoming another backend service. H1 executable schemas and H3 live-source/operating-profile decisions remain open.
