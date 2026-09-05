# Backend Instructions

All repository text, code comments, test names, migration notes, and commit messages must be written in English. Communication with the user may be in Chinese.

Use the approved root `data-model.md` as the persistence baseline. Do not invent durable fields in endpoint code; update the reviewed model first when a missing concept is discovered.

The current persistence baseline is version 1.4. Read `database.md` before database work. SQL migrations are the authoritative schema; split Drizzle files are query mappings, not a complete migration-generation source. Do not use schema push or edit already applied migration history. Database tests use isolated PGlite only; native PostgreSQL and concurrency verification remain separate gates. Do not infer live-wallet authority from seeded public network metadata or structural test fixtures.

Keep API and worker entry points separate while sharing domain modules. Keep provider SDKs behind adapters, secrets out of the frontend and database, and all paid or retryable operations idempotent and reconcilable.

Before changing The Graph, Privy, or Hedera behavior, read the matching active file under `sponsor/`. Do not claim a provider capability without implementation evidence.
