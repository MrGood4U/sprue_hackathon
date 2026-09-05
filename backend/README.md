# Sprue Backend

This directory owns the Sprue API, worker, deterministic DAG runtime, persistence, and external-service adapters. The first implemented slice is the [database foundation](database.md): data-model 1.4, 51 tables, domain-split SQL migrations and Drizzle mappings, setup scripts and isolated tests. API/worker processes, the compiler/Agent, queue dispatch and live integrations are not implemented yet.

## Planned Deployable Roles

One backend codebase will expose at least two process commands:

- `api`: public control-plane endpoints and hosted product API routes;
- `worker`: private builds, validation, materialization, refreshes, and reconciliation jobs.

The evaluator profile runs these roles on Railway with PostgreSQL. The self-hosted profile runs equivalent roles through Docker Compose. Provider configuration must not alter domain behavior.

## Planned Source Layout

```text
backend/
├── harness/                # Harness workflow, tools, operator and safety design; scripts planned
├── src/
│   ├── app/                # Bootstrap, validated configuration, and process composition
│   ├── http/
│   │   ├── control/        # Authenticated Creator Console API
│   │   └── products/       # Hosted product and x402-gated routes
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
│   ├── jobs/               # Worker dispatch, handlers, retries, and schedules
│   ├── db/                 # Implemented client, migration runner, seeds, and typed schema
│   ├── integrations/       # Replaceable provider adapters
│   └── shared/             # Narrow cross-cutting primitives only
├── migrations/             # Implemented ordered SQL, authoritative constraints
├── scripts/                # Implemented migration/status/seed/schema-check CLIs
├── tests/                  # Implemented isolated database contract tests
├── compose.db.yml          # Local database only; full app Compose remains planned
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

The selected runtime baseline is Node.js 24 LTS, Express, and TypeScript, with PostgreSQL, pg/Drizzle, and pg-boss as recorded in the root plan. Database packages are pinned in package.json/package-lock.json; Express and pg-boss will be installed with their implementation. Follow database.md for configuration, commands and verification limits.

## Proposed HTTP Contract

See [api-contract.md](../api-contract.md) Draft 0.2 and its domain documents under `docs/api/` for route, request/response, authorization, idempotency, concurrency, trace, and payment boundaries. M1-M3 directions were approved and mapped into data-model 1.4; the endpoints and command services are not implemented. Provider and capped-buyer gates remain prerequisites for live financial behavior.

## Proposed Agent Harness

Start with [harness/README.md](harness/README.md) for the natural-language-to-operator workflow, planning/worker separation, proposed tool scripts, typed operator language, limits, recovery and verification. Draft 0.3 maps approved H2 persistence to implemented database tables, but contains no implemented harness scripts or runtime. The harness reuses modules/agent, modules/dag and modules/graph rather than becoming another backend service. H1 executable schemas and H3 live-source/operating-profile decisions remain open.
