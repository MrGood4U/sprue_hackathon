# Sprue Backend

For the complete Windows browser stack and Vercel/Railway packaging, see [deployment.md](../deployment.md). The root Compose/PowerShell entry coordinates frontend, API, worker, PostgreSQL, and explicit one-off migrations. Railway API/worker manifests share this Dockerfile but use different commands; only the API release applies migrations. No platform-specific domain code or live business integration is added by these profiles.

This directory owns the Sprue API, worker, deterministic DAG runtime, persistence, and external-service adapters. Implemented foundations include the [database foundation](database.md), with data-model 1.13, 54 tables, domain-split SQL migrations and Drizzle mappings, the offline [DAG runtime](src/modules/dag/runtime.ts), with schema-driven canonical Swap normalization, Union, Aggregate, Join, and exact arithmetic, and a bounded Agent harness with mock and OpenAI-compatible model ports. A restricted Graph MCP planning adapter supports bounded existing-Subgraph discovery, activity checks, and schema inspection without exposing data-query tools to the model. The [backend framework](framework.md) adds runnable API/standby-worker processes, shared security/transport middleware, public app configuration, Privy access-token verification, provider-independent Sprue user IDs, transactional creator/workspace bootstrap, idempotent user-owned Privy wallet provisioning and binding, current Base Sepolia USDC and Hedera testnet HBAR balance reads, explicit idempotent Portal-faucet account activation with Mirror Node reconciliation, complete-account creator-control projection for the demonstrated Privy EVM path, owner-gated identity reads, durable encrypted workspace model profiles, Graph credential create/list/validate/select/revoke, and generated OpenAPI. The explicit evaluator bridge under [demo-runtime.md](../docs/api/demo-runtime.md) lets the frontend request server-generated state/actions and invoke the saved model only for an explicit plan action. Direct creator-confirmed testnet withdrawals are browser-to-Privy actions and therefore add no backend command. Account-linking commands, durable Agent commands, Graph-key rotation, durable source snapshots, queue dispatch, durable withdrawal history/reconciliation, delegated bounded spending authority, live source-specific Graph execution, native Hedera x402 signing/publication, Blocky402 settlement, other business handlers, and paid integrations remain unimplemented.

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
│   │   ├── model-profile/  # Durable redacted Model Service HTTP transport
│   │   └── products/       # Reserved public/recovery/generated data routes
│   ├── modules/
│   │   ├── auth/           # Privy token verification and local account/workspace bootstrap
│   │   ├── identity/       # Identity projection and workspace authorization
│   │   ├── model-profile/  # Encrypted credential service and SQL repository
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
- Set the API-only `AGENT_DEBUG=true` environment variable for bounded Agent diagnostics while investigating source discovery. It logs validated search keywords, candidate metadata and stage outcomes, but never logs model prompts, provider response bodies, API keys, or authorization headers. Keep it disabled outside local debugging.
- Set `GRAPH_GATEWAY_ENVIRONMENT=mainnet`; the current Graph MCP adapter and Agent data-network catalog intentionally reject a testnet value. This does not change the separately pinned Hedera testnet settlement profile.
- The Agent may emit only a structured Data Product Spec and allowlisted DAG. Never execute arbitrary generated JavaScript or Python.
- PostgreSQL is the durable source of truth. Do not make local files or process memory authoritative for jobs, versions, budgets, or payments.
- Every retryable side effect requires a logical intent, provider attempt, idempotency key, and reconciliation path.
- Graph API keys, wallet signer material, database credentials, and facilitator credentials remain server-side and outside repository history.
- Keep upstream Graph expenses, downstream Hedera sales, creator proceeds, and provider/network costs separately auditable by network and asset. The hackathon profile charges no Sprue service fee.
- Add code only after checking the approved `data-model.md` and the corresponding sponsor reference.

The selected runtime baseline is Node.js 24 LTS, Express, and TypeScript, with PostgreSQL, pg/Drizzle, and pg-boss as recorded in the root plan. Database, Express 5 and Zod packages are pinned in package.json/package-lock.json; pg-boss will be installed with its durable runner. Follow database.md for configuration, commands and verification limits.

## Proposed HTTP Contract

See [api-contract.md](../api-contract.md) Draft 0.14 and its domain documents under `docs/api/` for route, request/response, authorization, idempotency, concurrency, trace, model-profile, wallet, credential, and payment boundaries. M1-M4 directions remain mapped into data-model 1.13. Creator authentication, provider-identity resolution, account/workspace bootstrap, owner-authorized demo surfaces, durable encrypted model-profile and Graph-credential lifecycle operations, user-wallet provisioning/binding, current Privy/Hedera balance reads, explicit Hedera testnet activation, complete-account control projection, and frontend direct creator-confirmed testnet withdrawals are implemented; account linking, most reserved handlers, durable withdrawal history/reconciliation, delegated wallet authority, Graph-key rotation, source-specific compatibility validation, and other durable command services remain unavailable. Provider and capped-buyer gates remain prerequisites for delegated or paid financial behavior.

## Proposed Agent Harness

Start with [harness/README.md](harness/README.md) for the natural-language-to-operator workflow, planning/worker separation, proposed tool scripts, typed operator language, limits, recovery and verification. The first fixture-backed harness/controller slice lives under `src/modules/agent/harness`; the restricted Graph MCP discovery adapter lives under `src/modules/graph`. Durable Agent sessions, HTTP handlers, workspace credential/snapshot binding, queue execution, live Graph data execution, and H1/H3 live-source/operating-profile decisions remain open.
