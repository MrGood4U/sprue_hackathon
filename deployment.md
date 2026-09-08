# Local Development and Evaluator Deployment

The same Sprue source supports Windows browser testing, Docker self-hosting, and the selected Vercel/Railway evaluator profile. Windows is a development host, not a native desktop-client target. Deployment configuration must not change product semantics, sponsor adapters, or payment authority.

## Current Capability Boundary

Dashboard, Wallet and Access, Model Service, and Agent Planner use owner-authorized live workspace APIs without a fixture fallback. Product creation, renaming, Agent sessions/messages/traces, same-process cooperative planning cancellation, durable encrypted OpenAI-compatible model profiles, Graph credential create/list/validate/select/revoke, configured Privy creator authentication, provider-identity resolution to stable Sprue user IDs, local account/workspace bootstrap, user-owned wallet provisioning/binding, current Base Sepolia USDC balance reads, and explicit Hedera testnet Portal-faucet activation plus Mirror Node HBAR reads are implemented. Agent planning uses the saved workspace model profile and selected Graph credential for bounded live source discovery; immutable source admission and final Graph data execution remain unavailable. Build, API, Monetize, and public evaluator views retain the explicitly identified server-generated demo projection. Account linking, queue consumption, cross-instance cancellation recovery, wallet signing/spending authority, Hedera publication, and outbound payments remain unavailable. Starting all five services is infrastructure readiness, not a completed live product. The public-config transport remains read-only; `DEMO_RUNTIME_ENABLED=true` enables only the temporary evaluator path that still owns those identified views.

## Windows: Complete Local Docker Stack

Prerequisites: Docker Desktop running **Linux containers**, Compose v2, and PowerShell. Host Node.js is not required for this profile. No WSL shell commands or global execution-policy changes are needed. If local script execution is disabled, use the equivalent Compose commands below or a session-scoped policy approved by your administrator.

From the repository root:

```powershell
.\scripts\local.ps1 init
.\scripts\local.ps1 up
.\scripts\local.ps1 check
```

`init` creates an ignored `.env.local` with a random local PostgreSQL password, four host ports, and `GRAPH_SCHEMA_CACHE_ENABLED=true`. It never overwrites an existing file. `up` builds the API/frontend images, starts PostgreSQL and Redis, applies pending migrations and the idempotent public network/asset reference seed through separate one-off containers, then starts and checks API, worker and frontend. Re-running it upgrades images, applies only pending migrations, and safely reconciles the same public reference metadata; it does not seed users, wallets, funds, credentials or products. Initial image downloads require internet access.

| Service | Default local address | Exposure |
|---|---|---|
| Frontend | `http://127.0.0.1:4173` | Loopback only; browser entry |
| API | `http://127.0.0.1:3001` | Loopback only; probes, app config, and `/api/v1/public/demo/*` when enabled |
| PostgreSQL | `127.0.0.1:15432`, database/user `sprue` | Loopback only; password stays in `.env.local` |
| Redis | `127.0.0.1:16379` | Loopback only; shared immutable Graph schema projection cache |
| Worker | Port 3002 inside its container | No host/public port; probes only, currently standby |

Use `127.0.0.1` consistently: `localhost` is a different browser origin. Edit the four distinct port values in `.env.local` if another application occupies one, then run `up` again. Set `GRAPH_SCHEMA_CACHE_ENABLED=false` to make the API bypass Redis and fetch/verify Graph schema evidence on every planning request; Compose still runs the packaged Redis service so the cache can be re-enabled without changing topology. The helper accepts local Docker endpoints only and does not print resolved secrets. The project is explicitly named `sprue-local`; its PostgreSQL and Redis volumes are separate from the older backend-only `sprue-database` profile. Do not run both profiles on the same host ports or assume their databases share data.

```powershell
.\scripts\local.ps1 logs
.\scripts\local.ps1 stop
```

`stop` preserves the PostgreSQL and Redis volumes, credentials, images and containers. Changing a password in the file does not change credentials inside an existing database volume. Resolve credential mismatches deliberately; never delete a volume as an automatic repair. `config` validates Compose without printing secrets. `db` starts PostgreSQL and Redis for native development.

If Windows reports that binding a port is forbidden, inspect `netsh interface ipv4 show excludedportrange protocol=tcp` and choose an unused, non-excluded port in `.env.local`. Windows/Hyper-V may reserve ports even without a listening process. Do not disable system reservations or delete database volumes to fix this. The root profile uses 15432 after the original 54329 choice conflicted with this host's reserved range.

Equivalent cross-platform Compose workflow, after creating a private `.env.local` from the documented keys:

```sh
docker compose -p sprue-local --env-file .env.local -f compose.yaml build api frontend
docker compose -p sprue-local --env-file .env.local -f compose.yaml up -d --wait postgres redis
docker compose -p sprue-local --env-file .env.local -f compose.yaml --profile tools run --rm --no-deps migrate
docker compose -p sprue-local --env-file .env.local -f compose.yaml --profile tools run --rm --no-deps seed
docker compose -p sprue-local --env-file .env.local -f compose.yaml up -d --wait api worker frontend
docker compose -p sprue-local --env-file .env.local -f compose.yaml stop
```

Migration and public reference seeding are explicit orchestration steps, never API/worker startup side effects. Stop any locally running API/frontend before switching profiles. No command in the helper removes a database or resets Git state.

## Windows: Native Node Development

For source editing with frontend hot reload, use Node.js 24 and either the Compose database (`local.ps1 db`) or an independently installed PostgreSQL 17 instance. Install dependencies with `npm ci` in `backend/` and `frontend/`. Copy each folder's `.env.example` to its ignored `.env` and set the local values explicitly:

- Backend: `DATABASE_URL` points to the intended local database. `GRAPH_SCHEMA_CACHE_ENABLED` defaults to `true`; in that mode `REDIS_URL` is required and points to the shared schema cache. With the switch set to `false`, `REDIS_URL` may be omitted and the API neither reads nor writes Redis. When using `sprue-local`, use the password from the root `.env.local`; do not leave the backend example password. Set API/worker ports and the console URL/CORS origin consistently. Keep `NODE_ENV=development` and `DEPLOYMENT_ENVIRONMENT=local`.
- Frontend: `VITE_API_BASE_URL` is the backend's public origin, initially `http://127.0.0.1:3001`. It is not a database URL or a secret.

To enable creator login, create a Privy application, enable Google and GitHub in its dashboard, and approve the exact local console origin. Set both `PRIVY_APP_ID` and `PRIVY_APP_SECRET` in the ignored root `.env.local` or backend `.env`. The app ID is returned to the browser through `/api/v1/app-config`; the secret is consumed only by the API and is intentionally absent from frontend, worker, and migration environments. Missing or partial configuration leaves creator routes fail-closed while the public product route remains available.

Durable Model Service and Graph API-key credentials require `MODEL_CREDENTIAL_KEYRING` and `MODEL_CREDENTIAL_ACTIVE_KEY_ID` on the API process. `scripts/local.ps1 init` generates a random local keyring for a new `.env.local`; an existing file is never rewritten, so add both values manually when upgrading an existing checkout. Keep old key IDs in the JSON keyring until every credential referencing them has been re-encrypted. These server secrets belong on neither the frontend, worker, migration job, nor PostgreSQL service. `GRAPH_GATEWAY_ENVIRONMENT` is separately pinned to `mainnet`; testnet values fail configuration validation and do not alter the independent Hedera settlement profile.

The initial downstream settlement profile is pinned to Hedera testnet. `HEDERA_NETWORK` must be `hedera:testnet`; `HEDERA_MIRROR_NODE_URL` defaults to `https://testnet.mirrornode.hedera.com`, and `BLOCKY402_FACILITATOR_URL` defaults to `https://api.testnet.blocky402.com`. The application derives chain ID 296 and native HBAR asset ID `0.0.0` from that profile. This configuration does not enable publication or payments before the Hedera/Blocky402 adapter and financial authorization gates are implemented.

Run `npm run db:status`, then explicitly run `npm run db:migrate` and `npm run db:seed` in `backend/`. In three terminals run `npm run dev:api`, `npm run dev:worker` (both from backend), and `npm run dev` (from frontend). Open `http://127.0.0.1:4173`. Vite uses a strict port and loopback binding rather than silently selecting a new port. Stop each foreground process with Ctrl+C; stop the database separately when finished. Do not change the system Node version or install a Windows service as part of application startup.

## Packaging

- Frontend full verification: `npm run build` followed by `npm run test:sites` from the full checkout. The Builder's model-alignment test intentionally reads the repository-root `data-model.md`.
- Frontend isolated deployment build: `npm run build:app`. This validates public configuration and tokens and emits `dist/client/` plus the retained optional Sites adapter. It does not replace the full-checkout test gate. Vercel and Docker use this command because their frontend build context can exclude repository-root records.
- Backend: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:build`. The Docker image contains production dependencies, compiled API/worker commands and unchanged migration assets.
- Root deployment checks: `node --test scripts/deployment.test.mjs` validates Compose configuration and manifest/packaging boundaries without starting services. It requires the Docker CLI, not a running engine.
- Opt-in native database smoke: after the root stack has initialized PostgreSQL, run `npm run test:local-db` from backend under Node.js 24. It reads only the root local configuration, ignores ambient `DATABASE_URL`, checks the schema/journal and starts ephemeral native API/worker probes. It performs no migration, seed or provider action.
- `VITE_API_BASE_URL` is public, build-time configuration. Changing it requires rebuilding frontend assets, not editing application source. All other server configuration and credentials stay in backend runtime environment variables. Do not prefix any secret with `VITE_`.
- Backend local/evaluator demo: set `DEMO_RUNTIME_ENABLED=true` with `AGENT_MODE=mock` to expose the server-backed cross-chain preview. This path is fixture-backed, non-durable and must not be confused with live sponsor evidence.

The frontend Docker image serves only `dist/client/` through Nginx. Browser routes under `/app` and `/p/` support direct navigation/reload; missing `/api/`, `/data/` and asset URLs return 404 instead of a fake HTML success. Self-hosted internet exposure additionally requires operator-managed HTTPS, access controls, backups and an explicit non-local backend environment; the root Compose profile is intentionally loopback-only for local testing.

Windows development uses Vite 6.4.3, the same-series fix for the [Windows path-deny bypass](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff). Related compatible build dependencies were updated in the lockfile. Keep development servers on loopback and serve compiled assets, not Vite, to evaluators. Recheck dependency advisories before deployment; a clean audit does not prove application security.

## Vercel + Railway Evaluator Profile

No cloud account, service, paid resource or deployment is created by these files. Deploy only after configuring the selected environment and reviewing which capabilities are genuinely ready for evaluators.

### Vercel Frontend

Import this repository with Root Directory `frontend`. The checked-in `frontend/vercel.json` selects Vite, `npm ci`, `npm run build:app`, output `dist/client`, and SPA rewrites for product routes. Select Node.js 24 in project settings. Set `VITE_API_BASE_URL` to the actual HTTPS Railway API origin before building. Never upload `.env.local` or backend secrets. Configure each preview environment explicitly; backend CORS does not wildcard-allow arbitrary preview domains.

### Railway API, Worker, PostgreSQL and Redis

Create PostgreSQL and Redis services plus two backend services from the same commit/image source. Both backend services use Root Directory `/backend`. Set their config-file paths explicitly, relative to the repository root:

| Service | Config file | Start command | Release behavior |
|---|---|---|---|
| API | `/backend/railway.api.json` | `node dist/src/app/api.js` | Pre-deploy runs migration followed by the idempotent public reference seed against the configured DB |
| Worker | `/backend/railway.worker.json` | `node dist/src/app/worker.js` | No migration; deploy after API migration succeeds |

The Dockerfile path is `Dockerfile` within the backend build root. Set the shared runtime variables below on both services; set the final two Privy variables on the API service only:

| Variable | Evaluator value |
|---|---|
| `NODE_ENV` | `production` |
| `DEPLOYMENT_ENVIRONMENT` | `demo` |
| `HOST` | `0.0.0.0` |
| `PORT` | `8080` (configure Railway target/health-check port consistently) |
| `WORKER_PORT` | `8080` on the worker; this worker-specific setting is required |
| `DATABASE_URL` | A Railway secret reference to the intended PostgreSQL service connection string |
| `GRAPH_SCHEMA_CACHE_ENABLED` | `true` to use the cross-account Redis cache; `false` to bypass all Graph schema cache reads/writes |
| `REDIS_URL` | A Railway secret reference to the shared Redis connection string; required only when `GRAPH_SCHEMA_CACHE_ENABLED=true` |
| `DATABASE_SSL_MODE` | `disable` only for the explicitly trusted Railway private transport; use `verify-full` with a trusted CA for public TLS connections |
| `API_BASE_URL` | Actual HTTPS API origin |
| `CONSOLE_PUBLIC_URL` | Actual HTTPS Vercel console origin |
| `DATA_PUBLIC_BASE_URL` | API origin plus `/data/v1` |
| `CORS_ALLOWED_ORIGINS` | Exact console origin(s), comma-separated |
| `DEMO_RUNTIME_ENABLED` | `true` for the temporary evaluator-facing backend projection; otherwise `false` |
| `AGENT_MODE` | `mock` for the default evaluator projection; `remote` enables the configured OpenAI-compatible Chat Completions endpoint after all Agent variables are supplied |
| `AGENT_DEBUG` | `true` enables additional server-side planning metadata diagnostics (search keywords, candidate evidence and stage outcomes); keep `false` outside local debugging |
| `GRAPH_GATEWAY_ENVIRONMENT` | `mainnet`; the current Graph MCP discovery and data-network catalog reject testnet configuration |
| `PRIVY_APP_ID` | Privy application's public identifier; API reads it and exposes it through public app config only when the matching secret is configured |
| `PRIVY_APP_SECRET` | API-only Railway secret used by the Privy server SDK to verify access tokens; never configure it on Vercel or the worker |
| `MODEL_CREDENTIAL_KEYRING` | API-only JSON keyring of 32-byte base64url keys used to encrypt durable model and Graph API-key credentials; configure as a Railway secret |
| `MODEL_CREDENTIAL_ACTIVE_KEY_ID` | API-only identifier naming the keyring entry used for new model and Graph credential writes |
| `HEDERA_NETWORK` | `hedera:testnet`; mainnet is intentionally rejected by the current build |
| `HEDERA_MIRROR_NODE_URL` | `https://testnet.mirrornode.hedera.com` |
| `BLOCKY402_FACILITATOR_URL` | `https://api.testnet.blocky402.com` |

Only the API needs a public Railway domain. The worker, PostgreSQL, and Redis remain private. Both backend services use `/readyz` as a deployment check; worker readiness currently means compatible database access, not implemented job execution. Configure the Vercel production origin and any intentionally retained preview origins in both Privy's dashboard and backend CORS. A public Privy app ID alone does not enable login; the API also requires the app secret. Wallet signing keys and payment-provider configuration remain separate and are not enabled by authentication.

Pre-deploy migration targets whatever `DATABASE_URL` is configured: inspect the target, use backups for persistent upgrades, and control the migration role before deployment. Running tests never authorizes a production migration. Deploy API/migrations first, then the worker. Keep Vercel/Railway on the same reviewed commit and run the full test gate before enabling automatic releases.

### Evaluator Acceptance

Check frontend deep links, exact-origin CORS/public configuration, Google/GitHub redirects, session restoration/sign-out, account bootstrap reuse, encrypted Model Service persistence across an API restart, API/worker readiness, database persistence, and private worker/database networking. Then separately validate the real creator/consumer workflow and sponsor evidence. A deployed demo frontend, working login, and healthy backend framework alone do not satisfy the live-data/payment MVP.

Official configuration references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Railway config as code](https://docs.railway.com/config-as-code/reference), [Railway monorepo roots](https://docs.railway.com/deployments/monorepo), [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command), and [Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/).

## Verification Record

Verification results for this implementation are recorded in [plan.md](plan.md). Local container checks do not prove cloud deployment or the unfinished sponsor/business integrations. No wallet, payment, or Graph query is required for these infrastructure checks.

Earlier development-host checks passed Docker startup/restart for all four services, PostgreSQL 17 migrations, HTTP deep links, missing-resource 404s, and exact-origin CORS. On 2026-09-08, the version 1.14 model was rerun against the native Docker/PostgreSQL stack: all 21 migrations were applied with none pending; the API, worker, PostgreSQL, and frontend containers were healthy; and the API readiness and frontend root probes returned HTTP 200. The current model uses 54 domain tables and 731 columns; migration 0021 adds the product-deletion tombstone without physically deleting historical product versions, runs, or evidence. The checked frontend uses port 4174 because another Vite preview occupied 4173. This is infrastructure verification, not cloud deployment or paid-provider evidence.
