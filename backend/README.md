# Sprue Backend

This directory is reserved for the Sprue API, worker, deterministic DAG runtime, persistence, and external-service adapters. Backend implementation has not started; this file establishes ownership boundaries before code is added.

## Planned Deployable Roles

One backend codebase will expose at least two process commands:

- `api`: public control-plane endpoints and hosted product API routes;
- `worker`: private builds, validation, materialization, refreshes, and reconciliation jobs.

The evaluator profile runs these roles on Railway with PostgreSQL. The self-hosted profile runs equivalent roles through Docker Compose. Provider configuration must not alter domain behavior.

## Planned Source Layout

```text
backend/
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
│   ├── db/                 # Migrations, transactions, repositories, and read models
│   ├── integrations/       # Replaceable provider adapters
│   └── shared/             # Narrow cross-cutting primitives only
├── migrations/
├── tests/
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

The selected runtime baseline is Node.js 24 LTS, Express, and TypeScript, with PostgreSQL, pg/Drizzle, and pg-boss as recorded in the root plan. Pin concrete package versions before the first implementation scaffold.

## Proposed HTTP Contract

See [api-contract.md](../api-contract.md) Draft 0.1 and its domain documents under `docs/api/` for route, request/response, authorization, idempotency, concurrency, trace, and payment boundaries. The draft is not implemented. Resolve its model gates M1-M3 before creating dependent persistence or endpoints; provider and capped-buyer gates remain prerequisites for live financial behavior.
