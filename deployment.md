# Local Development and Evaluator Deployment

The same Sprue source supports Windows browser testing, Docker self-hosting, and the selected Vercel/Railway evaluator profile. Windows is a development host, not a native desktop-client target. Deployment configuration must not change product semantics, sponsor adapters, or payment authority.

## Current Capability Boundary

The frontend requests a labeled server-generated projection from the explicit backend demo runtime. API health/readiness, public configuration, evaluator demo routes, and a session-scoped OpenAI-compatible Agent model adapter are implemented; durable business routes, verified Privy authentication, durable model-secret storage, queue consumption, live Graph execution and payments remain unavailable. Starting all four services is infrastructure readiness, not a completed live product. The public-config transport remains read-only; `DEMO_RUNTIME_ENABLED=true` explicitly enables the temporary evaluator path.

## Windows: Complete Local Docker Stack

Prerequisites: Docker Desktop running **Linux containers**, Compose v2, and PowerShell. Host Node.js is not required for this profile. No WSL shell commands or global execution-policy changes are needed. If local script execution is disabled, use the equivalent Compose commands below or a session-scoped policy approved by your administrator.

From the repository root:

```powershell
.\scripts\local.ps1 init
.\scripts\local.ps1 up
.\scripts\local.ps1 check
```

`init` creates an ignored `.env.local` with a random local PostgreSQL password and three host ports. It never overwrites an existing file. `up` builds the API/frontend images, starts PostgreSQL, applies pending migrations through a separate one-off container, then starts and checks API, worker and frontend. Re-running it upgrades images and applies only pending migrations; it does not seed fictitious users, wallets or products. Initial image downloads require internet access.

| Service | Default local address | Exposure |
|---|---|---|
| Frontend | `http://127.0.0.1:4173` | Loopback only; browser entry |
| API | `http://127.0.0.1:3001` | Loopback only; probes, app config, and `/api/v1/public/demo/*` when enabled |
| PostgreSQL | `127.0.0.1:15432`, database/user `sprue` | Loopback only; password stays in `.env.local` |
| Worker | Port 3002 inside its container | No host/public port; probes only, currently standby |

Use `127.0.0.1` consistently: `localhost` is a different browser origin. Edit the three distinct port values in `.env.local` if another application occupies one, then run `up` again. The helper accepts local Docker endpoints only and does not print resolved secrets. The project is explicitly named `sprue-local`; its `sprue-local_postgres-data` volume is separate from the older backend-only `sprue-database` profile. Do not run both profiles on the same host ports or assume their databases share data.

```powershell
.\scripts\local.ps1 logs
.\scripts\local.ps1 stop
```

`stop` preserves the database volume, credentials, images and containers. Changing a password in the file does not change credentials inside an existing database volume. Resolve credential mismatches deliberately; never delete a volume as an automatic repair. `config` validates Compose without printing secrets. `db` starts only the database for native development.

If Windows reports that binding a port is forbidden, inspect `netsh interface ipv4 show excludedportrange protocol=tcp` and choose an unused, non-excluded port in `.env.local`. Windows/Hyper-V may reserve ports even without a listening process. Do not disable system reservations or delete database volumes to fix this. The root profile uses 15432 after the original 54329 choice conflicted with this host's reserved range.

Equivalent cross-platform Compose workflow, after creating a private `.env.local` from the documented keys:

```sh
docker compose -p sprue-local --env-file .env.local -f compose.yaml build api frontend
docker compose -p sprue-local --env-file .env.local -f compose.yaml up -d --wait postgres
docker compose -p sprue-local --env-file .env.local -f compose.yaml --profile tools run --rm --no-deps migrate
docker compose -p sprue-local --env-file .env.local -f compose.yaml up -d --wait api worker frontend
docker compose -p sprue-local --env-file .env.local -f compose.yaml stop
```

Migration is an explicit orchestration step, never an API/worker startup side effect. Stop any locally running API/frontend before switching profiles. No command in the helper removes a database or resets Git state.

## Windows: Native Node Development

For source editing with frontend hot reload, use Node.js 24 and either the Compose database (`local.ps1 db`) or an independently installed PostgreSQL 17 instance. Install dependencies with `npm ci` in `backend/` and `frontend/`. Copy each folder's `.env.example` to its ignored `.env` and set the local values explicitly:

- Backend: `DATABASE_URL` points to the intended local database. When using `sprue-local`, use the password from the root `.env.local`; do not leave the backend example password. Set API/worker ports and the console URL/CORS origin consistently. Keep `NODE_ENV=development` and `DEPLOYMENT_ENVIRONMENT=local`.
- Frontend: `VITE_API_BASE_URL` is the backend's public origin, initially `http://127.0.0.1:3001`. It is not a database URL or a secret.

Run `npm run db:status`, then explicitly `npm run db:migrate` in `backend/`. In three terminals run `npm run dev:api`, `npm run dev:worker` (both from backend), and `npm run dev` (from frontend). Open `http://127.0.0.1:4173`. Vite uses a strict port and loopback binding rather than silently selecting a new port. Stop each foreground process with Ctrl+C; stop the database separately when finished. Do not change the system Node version or install a Windows service as part of application startup.

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

### Railway API, Worker and PostgreSQL

Create a PostgreSQL service and two backend services from the same commit/image source. Both backend services use Root Directory `/backend`. Set their config-file paths explicitly, relative to the repository root:

| Service | Config file | Start command | Release behavior |
|---|---|---|---|
| API | `/backend/railway.api.json` | `node dist/src/app/api.js` | Pre-deploy runs `node dist/scripts/migrate.js` against the configured DB |
| Worker | `/backend/railway.worker.json` | `node dist/src/app/worker.js` | No migration; deploy after API migration succeeds |

The Dockerfile path is `Dockerfile` within the backend build root. Set these runtime variables on both services:

| Variable | Evaluator value |
|---|---|
| `NODE_ENV` | `production` |
| `DEPLOYMENT_ENVIRONMENT` | `demo` |
| `HOST` | `0.0.0.0` |
| `PORT` | `8080` (configure Railway target/health-check port consistently) |
| `WORKER_PORT` | `8080` on the worker; this worker-specific setting is required |
| `DATABASE_URL` | A Railway secret reference to the intended PostgreSQL service connection string |
| `DATABASE_SSL_MODE` | `disable` only for the explicitly trusted Railway private transport; use `verify-full` with a trusted CA for public TLS connections |
| `API_BASE_URL` | Actual HTTPS API origin |
| `CONSOLE_PUBLIC_URL` | Actual HTTPS Vercel console origin |
| `DATA_PUBLIC_BASE_URL` | API origin plus `/data/v1` |
| `CORS_ALLOWED_ORIGINS` | Exact console origin(s), comma-separated |
| `DEMO_RUNTIME_ENABLED` | `true` for the temporary evaluator-facing backend projection; otherwise `false` |
| `AGENT_MODE` | `mock` for the default evaluator projection; `remote` enables the configured OpenAI-compatible Chat Completions endpoint after all Agent variables are supplied |

Only the API needs a public Railway domain. The worker and database remain private. Both services use `/readyz` as a deployment check; worker readiness currently means compatible database access, not implemented job execution. Privy/provider secrets and approved capability configuration must be added separately as those integrations are implemented. A public Privy app ID alone does not enable login.

Pre-deploy migration targets whatever `DATABASE_URL` is configured: inspect the target, use backups for persistent upgrades, and control the migration role before deployment. Running tests never authorizes a production migration. Deploy API/migrations first, then the worker. Keep Vercel/Railway on the same reviewed commit and run the full test gate before enabling automatic releases.

### Evaluator Acceptance

Check frontend deep links, exact-origin CORS/public configuration, API/worker readiness, database persistence across restart, and private worker/database networking. Then separately validate the real creator/consumer workflow and sponsor evidence. A deployed demo frontend and healthy backend framework alone do not satisfy the live-data/payment MVP.

Official configuration references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Railway config as code](https://docs.railway.com/config-as-code/reference), [Railway monorepo roots](https://docs.railway.com/deployments/monorepo), [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command), and [Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/).

## Verification Record

Verification results for this implementation are recorded in [plan.md](plan.md). Local container checks do not prove cloud deployment or the unfinished sponsor/business integrations. No wallet, payment, or Graph query is required for these infrastructure checks.

On the development host, Docker startup and restart passed for all four services; the PostgreSQL 17 migration journal remained unchanged after stop/start. Native Windows Node API/worker probes verified 15 migrations, 51 tables and 699 columns. HTTP deep links, missing resource 404s and exact-origin CORS passed. The checked local environment uses frontend port 4174 because an existing Vite preview already occupied the default 4173; the earlier preview was left untouched. This is HTTP/infrastructure verification, not browser interaction QA or cloud deployment evidence.
