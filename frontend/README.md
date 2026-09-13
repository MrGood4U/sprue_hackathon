# Sprue Frontend

For Windows local browser testing, complete Docker hosting, and Vercel/Railway delivery, see [deployment.md](../deployment.md). The frontend has a Dockerfile, static SPA routing, a Vercel manifest and public `VITE_API_BASE_URL` configuration. `npm run build` runs the full repository-aware checks; `npm run build:app` packages an isolated frontend build context. Keep the existing Sites outputs compatible. Authenticated creator pages request live workspace data; only the public evaluator route retains the explicit temporary demo runtime.

This directory is the maintained Sprue product frontend: the Creator Console, public consumer page, localization, design tokens, build, and deployment adapter. The user promoted this source to the product frontend on 2026-09-05. Continue implementation here.

Creator routes are guarded by Privy authentication with Google and GitHub options; after token verification, the backend transactionally bootstraps the local user and default owner workspace, idempotently provisions one user-owned Privy Ethereum wallet, then the Login route enters the Dashboard automatically. Creator reads carry the in-memory provider token and are isolated by the backend-authorized workspace. API and Monetize resolve the route product and read a shared live delivery projection covering stored product versions, deployments, output schemas, materialization samples, x402 publication revisions, recipient capability, confirmed ledger totals, and paid request records. Unimplemented deploy, private-request, publication, and public-request actions remain explicitly disabled by backend capability flags. Public routes alone expose immutable demo state and the simulated consumer request. Wallet and Access reads the authenticated workspace's complete wallet address plus current Base Sepolia USDC and Hedera testnet HBAR balances through the backend, creates/lists encrypted redacted Graph API-key records, and permits creator-confirmed direct testnet withdrawals through Privy's visible transaction UI. Model Service likewise uses a durable owner-authorized workspace resource. A model connection test is a real minimal provider request and may incur provider charges. The browser owns no credential or product fixtures and has no silent fallback when the backend is unavailable. Live Graph execution, delegated wallet authority, durable withdrawal reconciliation, x402 settlement, and publication commands remain pending. See [implementation-status.md](implementation-status.md) for concrete gaps and their implementation order.

## Current Commands

```bash
npm install
npm run dev -- --port 4173
npm run build
npm run test:structure
npm run test:i18n
npm run test:services
npm run test:builder
npm run test:workflow-editor
npm run test:auth
npm run test:tokens
npm run test:sites
```

The development command above selects port `4173`; use the address printed by Vite if that port is already occupied. The minimum supported Creator Console width is 1024 CSS pixels, with 1440 pixels as the primary judge-demo target.

## Source Layout

```text
src/
├── app/                    # Application composition and route resolution
├── pages/                  # One route-level page component per file
├── components/
│   ├── ui/                 # Reusable visual primitives with no product workflow ownership
│   ├── layout/             # Cross-page layout elements
│   ├── navigation/         # Navigation components
│   └── product/            # Components shared by product routes
├── features/
│   ├── auth/               # Privy provider, creator session, and workspace bootstrap state
│   ├── builder/            # Readiness, execution trace, and build-run hook
│   ├── delivery/           # Live product/API/publication delivery projection
│   ├── workflow-editor/    # Editable DAG canvas, palette, inspector, and editor state
│   ├── model-settings/     # Redacted workspace model profile and form lifecycle
│   ├── deployment/         # Reserved API request-test workflow
│   ├── consumer/           # Consumer request-flow hook
│   └── runtime/            # Backend demo projection provider and connection boundary
├── i18n/                   # Locale provider and one message catalog per supported locale
├── hooks/                  # Shared async view lifecycle
├── services/
│   ├── index.js            # Selected frontend service implementation
│   ├── api/                # Backend API clients, including the evaluator runtime
│   └── demo/               # Historical test fixtures only; not imported by product pages
├── design-tokens.json      # Machine-readable token source
├── tokens.css              # Generated token output
├── styles.css              # Application CSS pending feature-level style extraction
└── main.jsx                # Browser entry point only
```

## Integration Boundaries

As durable business handlers replace the evaluator runtime, extend these boundaries by responsibility:

The proposed HTTP mapping is [api-contract.md](../api-contract.md) Draft 0.6. Its page-to-API matrix and domain DTOs guide client implementation after review. The temporary `/api/v1/public/demo/*` contract is documented in [demo-runtime.md](../docs/api/demo-runtime.md) and is not a production resource contract.

```text
src/
├── features/
│   ├── auth/
│   ├── products/
│   ├── builder/
│   ├── wallet-access/
│   ├── deployment/
│   ├── monetization/
│   └── consumer/
├── services/
│   ├── api/                # Typed control-plane and hosted-API clients
│   ├── privy/              # Browser-side Privy adapter only
│   └── telemetry/          # Sanitized frontend diagnostics
├── state/                  # Cross-route client state only when required
├── hooks/                  # Shared browser and request-lifecycle hooks
├── lib/                    # Pure frontend utilities
└── styles/                 # Global reset plus feature or component style modules
```

Do not create frontend adapters for Graph payments, private wallet signing material, delegated signing, Hedera x402 settlement, database access, or secret management. Creator-owned interactive transfers may be prepared in a wallet feature only for reviewed fixed chain/asset profiles and must always use Privy's visible confirmation UI; the frontend never receives signing material or records a settlement fact.

## File Ownership Rules

- `app/` decides which page and layout to render. It does not own product workflow markup.
- `features/auth/` is the sole browser Privy composition boundary. It may open provider login UI and retrieve a short-lived access token, but it sends only that token to the backend and never accepts or persists a local user/workspace identifier. It also owns the shared authenticated account menu rendered by application and product headers.
- Every route-level page has one file under `pages/`. A page composes features and coordinates page-local UI state.
- A reusable element moves to `components/` only when at least two page or feature owners need the same contract.
- Product behavior belongs in a named `features/` folder. Avoid catch-all files such as `components/common.jsx` or `utils/helpers.js`.
- Browser product records must come from a backend client. Historical fixture files may remain for isolated display/runtime tests, but route-level product pages must not import them.
- Async workflows belong in feature hooks; network/provider operations belong in `services/`. Pages must not implement simulated progress timers, raw `fetch` calls, or provider SDK calls in JSX.
- `services/index.js` retains the public evaluator's demo client. Authenticated creator features import their reviewed owner-authorized API clients directly; neither boundary authorizes browser-side payment or signing logic.
- Cancel view-owned work on unmount and prevent repeated submission while a task is active.
- User-facing copy belongs in `i18n/messages/`; components reference stable message keys through `useI18n()`.
- English is the fallback locale. Simplified Chinese (`zh-CN`), Spanish (`es`), French (`fr`), German (`de`), Korean (`ko`), and Japanese (`ja`) are available after explicit selection, and the preference is persisted locally without browser-locale detection.
- Keep locale catalogs structurally aligned and run `npm run test:i18n` after changing copy or translation keys.
- Keep server state separate from temporary presentation state. Durable build, deployment, and payment status must come from the backend after integration.
- Prefer focused files over multi-page modules. A route file should normally remain below roughly 200 lines; extract named feature components when its main workflow becomes difficult to scan.
- Keep unit tests next to the module they verify. Keep route-spanning and browser tests under `tests/`.
- `npm run test:structure` guards the one-page-per-file rule and keeps page implementations out of application composition files.

## Current Route Ownership

| Route family | Page file | Primary feature owner |
|---|---|---|
| `/` | `pages/EntryPage.jsx` | Entry and navigation |
| `/login` | `pages/LoginPage.jsx` | Creator authentication choices and session entry |
| `/app` | `pages/DashboardPage.jsx` | Product summaries |
| `/app/wallet` | `pages/WalletAccessPage.jsx` | Wallet and Graph access |
| `/app/model` | `pages/ModelServicePage.jsx` | Agent model service configuration |
| `/app/products/:id/agent` | `pages/AgentPage.jsx` | Agent conversation and planning progress |
| `/app/products/:id/build` | `pages/ProductBuilderPage.jsx` | Builder DAG and execution evidence |
| `/app/products/:id/api` | `pages/ApiDeploymentPage.jsx` | API contract and private testing |
| `/app/products/:id/monetize` | `pages/MonetizationRevenuePage.jsx` | x402 publication and revenue |
| `/p/:slug` | `pages/PublicProductPage.jsx` | Public consumer request |

## Design-System Contract

Treat `src/design-tokens.json` as the visual source of truth and `src/tokens.css` as generated output. New styles must consume semantic or component tokens for colors and shared contracts. Run `npm run tokens` after changing the JSON source; the build rejects stale generated tokens.

The evidence files under `evidence/` document the approved visual comparison. They are not runtime assets.

## Semantic Builder Sample

The maintained Agent Planner consumes workspace-scoped durable sessions, real source-discovery evidence, persisted proposal traces, and a cursor-polled active trace while synchronous planning runs. Each observed harness stage appears as a conversation result card; no browser timer invents stage progress. The planning submission may remain open beyond the backend's maximum two-hour run bound, trace polling uses bounded adaptive backoff for long quiet steps, and both requests are cancelled when the view unmounts. A compilation-ready completed plan links to the maintained Builder, which reads the newest durable Agent result and projects only its validated source, entity, field, and operator facts into an explicitly non-executable browser-session draft. `features/builder/graphView.js` remains a display projection and is not the backend validator. The editable workflow surface belongs to `features/workflow-editor/`; it owns canvas tools, palette insertion, typed connections, working-draft state, and schema-driven configuration. `features/builder/TemplateParameters.jsx` owns constrained legacy sample inputs and `BuilderInspector.jsx` displays exact JSON for inspection. Route state remains in `AgentPage.jsx` and `ProductBuilderPage.jsx`.

Only the public evaluator request uses the backend demo runtime. Authenticated API and Monetize reads use the live product-delivery client, while unavailable deployment, private-request, publication, and public-request capabilities stay disabled. Run `npm run test:builder`, `npm run test:delivery`, `npm run test:services` and the full build for changes here.
