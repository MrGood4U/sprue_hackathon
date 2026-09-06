# Database Foundation

Status: persistence implementation for data-model 1.6, updated 2026-09-07.

The human approved M1, M2, M3, the two H2 persistence directions (planning/run recovery and semantic compilation provenance), and the provider-independent Sprue user identity boundary. This foundation contains 52 domain tables and 705 columns, 16 ordered SQL migrations, typed Drizzle query mappings, a migration journal, public reference seeds and offline tests. Migration 0016 preserves each existing Sprue user UUID while moving provider subjects into the many-to-one `auth_identities` table. It is not an account-linking API, queue relay, Agent, payment system or deployed database.

## Ownership and Schema Authority

| Location | Responsibility |
|---|---|
| `../data-model.md` | Reviewed entities, fields, invariants and change control |
| `migrations/0001_*.sql` through `0009_*.sql` | Identity, networks, wallets, products, deployments, execution, evidence, payments and recovery tables |
| `migrations/0010_foreign_keys.sql` | Foreign keys after all cyclic targets exist; deletion defaults to RESTRICT |
| `migrations/0011_constraints_indexes.sql` | Unique/partial indexes, scalar and JSON-envelope checks |
| `migrations/0012_ownership_immutability.sql` | Workspace link consistency and immutable history |
| `migrations/0013_lifecycle_lineage.sql`, `0014_register_guards.sql` | Lifecycle, lineage, planner reservation and recovery retention guards |
| `migrations/0015_financial_and_evidence_guards.sql` | Network/asset consistency, settlement links and evidence protection |
| `migrations/0016_auth_identities.sql` | Provider-independent users, existing-subject backfill and multi-identity bindings |
| `src/db/schema/` | Nine domain-specific Drizzle query mappings; SQL remains authoritative for relational constraints |
| `src/db/client.ts` | Standard pg connection, environment validation and TLS handling |
| `src/db/migrations.ts` | Dedicated-client lock, checksummed journal and transaction per migration |
| `src/db/seed.ts` | Explicit, idempotent public reference seed |
| `scripts/` | Thin migrate/status/seed/schema-check entry points |
| `tests/` | Isolated SQL/constraint tests and model/Drizzle field comparison |

Use database-first migrations. Drizzle maps columns, primary keys and defaults for queries; it does not duplicate SQL-owned foreign keys, indexes, checks or triggers. Do not run `drizzle-kit push` or generate a replacement migration from these intentionally partial metadata mappings. Add future changes as forward SQL migrations and synchronize the model, mappings and tests. Never edit an already applied migration: the journal rejects checksum or ordering drift. Line endings are normalized for checksums across Windows and Linux.

The migration runner uses one dedicated connection and a session advisory lock. Each migration and its journal entry commit together; a failed migration rolls back itself, leaving earlier committed migrations intact. After failure, inspect status, repair an unapplied migration or add a forward fix, and rerun. No automatic down migration, table drop or data reset is provided. Back up a durable database before upgrades. Restrict the migration role separately from the future runtime role; these are trusted schema controls, not protection against a database administrator disabling triggers.

## Local PostgreSQL 17

For the complete browser stack, prefer the root [Windows/Docker workflow](../deployment.md), which defaults to database port 15432. Its `sprue-local` project and volume are intentionally separate from this older backend-only `sprue-database` profile. Do not configure both on the same ports or reuse one profile's credentials with the other's volume. Later native-container verification is recorded in the current deployment/plan records; the original PGlite-only verification below is historical.

Use Node.js 24 and run commands from `backend/`. Install the locked dependencies with `npm ci`. Copy `.env.example` to an untracked `.env` locally and replace its password placeholder. `POSTGRES_PASSWORD` and the password in `DATABASE_URL` must agree; percent-encode URL credentials. Do not use real provider secrets for schema setup.

```sh
npm ci
npm run db:up
npm run db:status
npm run db:migrate
npm run db:seed
npm run db:check
npm run db:stop
```

`db:up` requires a running Docker engine and starts only PostgreSQL 17, bound to loopback on port 54329 by default. The named volume preserves data when stopped. Changing the password environment variable does not rotate credentials in an existing volume. This is a database development profile, not the complete frontend/API/worker self-hosted deployment promised by the product plan. Do not delete a volume to troubleshoot credentials without explicit authorization and a recovery plan.

For an independently provisioned Railway or Docker PostgreSQL database, supply its own `DATABASE_URL`, then run the same status/migrate/seed/check commands as an explicit release step. Do not migrate from every API/worker startup or from the frontend. No Railway resource or remote connection has been created or used by this change.

Connections outside the known local development hosts default to certificate-verifying TLS. `DATABASE_SSL_MODE=verify-full` enforces verification; provide a trusted CA through `NODE_EXTRA_CA_CERTS` when required. Explicit `disable` is for a trusted local/private transport, not a certificate-error workaround for a public endpoint. Unsupported SSL URL parameters fail closed. Never expose database configuration through a Vite environment variable or print connection strings in error logs.

`db:status` is read-only, including before a journal exists. `db:check` compares public table/column types and nullability against the mappings; it is not a complete index/trigger drift audit. pg-boss must eventually use its own non-public schema. Keep unrelated tables out of the Sprue public schema.

## Seed Boundary

The explicit seed contains only Base and Base Sepolia network identities, Hedera testnet, and native HBAR metadata (`0.0.0`, eight decimals). Existing matching records are reused and incompatible identities cause failure; disabled records are not silently reenabled. Reference metadata does not authorize mainnet access or prove provider capabilities.

There are no users, wallets, signer grants, API keys, balances, payments, products, subscriptions, publication prices, service-fee terms or planner limits in the seed. USDC contract metadata must be verified against the chosen Graph payment requirement before a future seed/configuration update. Test fixtures live only in disposable test databases and are not sponsor evidence.

## What the Database Enforces

| Concern | Implemented structural protection | Still required in services |
|---|---|---|
| Ownership | Foreign keys, stable Sprue user UUIDs, unique provider bindings, one active owner, workspace consistency for scoped links | Account linking/unlinking/recovery, every read/write authorization, polymorphic command subjects; no RLS policy is installed |
| M1 commands | Null-safe actor/workspace/operation/key uniqueness, immutable fingerprints, required transactional outbox, terminal-state guard | Keyed canonical fingerprint generation/comparison, HTTP 409/replay behavior, registered operation dispatch, queue relay, worker leases, serialized proposal acceptance/discard |
| M2 recovery | Unique hashed capability, key version/expiry fields, frozen request identity, unique proof binding, one sale per logical request, retained immutable output | Capability generation/constant-time verification, key retention, cryptographic proof checks, authorized receipts, browser restoration, expiry profile and cleanup |
| M3 lifecycle | Validation/build state guard, source projections, ready version/output pairing; no build trigger moves deployment pointers | Explicit human commands, complete compiler validation, successful build transaction, refresh/activation compare-and-swap race handling |
| H2 planning | Fixed checkpoint limits/deadline, row-locked call reservations, immutable reservations and monotonic observed use; failed/uncertain attempts remain counted | Global/workspace admission, chosen model/pricing, provider cancellation/reconciliation, dispatch deadlines and process-crash tests |
| H2 execution | Immutable queued-time anchor and source context, frozen block before data pages, cross-attempt logical source uniqueness | Exact query/binding schemas and hashes, cursor progression, pinned adapter execution, artifact-input compatibility and safe reuse |
| H2 provenance | Immutable proposal/version-owned records, envelope/hash links, acceptance copy comparison | Exact template schema, deterministic expansion, node mapping, canonical content hashes and frontend DTO projection |
| Money | Nonnegative finite atomic amounts, network/asset links, immutable intent terms, unique consumed purchase, confirmed settlement structural evidence | Canonical integer-string validation before SQL (numeric(78,0) can round fractional input), cumulative Graph budget locking/reconciliation, live transfer verification, recognition/allocation/reversal conservation |

SQL validates JSON envelopes and selected links, not arbitrary JSON semantics. Sanitized JSON columns are not permission to store secrets, signatures, raw model reasoning, arbitrary code or uncontrolled provider responses. Redaction, size limits and exact schemas remain required before writes. Evidence hashes are supplied by trusted services, not computed or cryptographically verified by these migrations. An object URI cannot guarantee immutable remote contents; object storage remains deferred for the initial inline-artifact flow.

`updated_at`, lock-version increments and full state-machine transitions are service responsibilities unless an explicit SQL guard is present. Lifecycle checks do not authorize an action. Archival/supersession is preferred over destructive deletion; append-only records require new corrective evidence. Terminal payment uncertainty cannot be resolved by deleting history or generating another logical purchase.

Planner observations may exceed an earlier reservation: keep the evidence, stop further dispatch, and escalate. Future reservations conservatively count the greater of reserved and observed use. H3 sets the actual limits; test values are not production defaults. Graph budget aggregate enforcement is not implemented by the planner reservation trigger.

## Verification and Remaining Gates

```sh
npm run typecheck
npm test
```

Tests always create isolated, in-memory PGlite databases and ignore `DATABASE_URL`; they never migrate an existing database. They verify empty initialization, repeated migration/seed, checksum drift rejection, failed-migration rollback, all 52 tables/705 fields, provider-binding resolution, multiple identities for one stable user, and representative negative transaction/retry/ownership/money/provenance cases. Fixture DAGs test relational structure only and are deliberately not executable H1 schemas.

The recorded run used Node 24.20.0 and PGlite 0.5.8 (PostgreSQL 18.3 compiled to WASM). Docker was installed but its engine was unavailable. Therefore native PostgreSQL 17, multi-connection races, pg-boss behavior, Docker service startup and Railway compatibility are **not yet verified**. PGlite is a test dependency, not the production database or proof of distributed locking.

Before backend release, run the migration/check flow on a disposable native PostgreSQL 17 database, add two-connection race tests for idempotency/budgets/activation, test backup/forward upgrade, inspect query plans for actual endpoints, and implement least-privilege runtime permissions. Before live actions, resolve H1 executable semantics, H3 source/methodology and operating caps, E1 provider compatibility, E2 buyer authority/recovery, and any enabled fee terms. This implementation approves none of those choices.

Implementation references: [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [database-first schema workflow](https://orm.drizzle.team/docs/drizzle-kit-pull), [node-postgres transactions](https://node-postgres.com/features/transactions), [PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), and [PGlite documentation](https://pglite.dev/docs/).
