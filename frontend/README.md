# Sprue Frontend

This directory is the maintained Sprue product frontend: the Creator Console, public consumer page, localization, design tokens, build, and deployment adapter. The user promoted this source to the product frontend on 2026-09-05. Continue implementation here.

The currently available workspace uses demo data and local demo services. Authentication, durable product operations, live Graph queries, wallets, and payments remain pending. See [implementation-status.md](implementation-status.md) for concrete gaps and their implementation order.

## Current Commands

```bash
npm install
npm run dev -- --port 4173
npm run build
npm run test:structure
npm run test:i18n
npm run test:services
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
│   ├── builder/            # DAG, readiness, execution trace, and build-run hook
│   ├── deployment/         # API request-test hook
│   └── consumer/           # Consumer request-flow hook
├── i18n/                   # Locale provider and one message catalog per supported locale
├── hooks/                  # Shared async view lifecycle
├── services/
│   ├── index.js            # Selected frontend service implementation
│   └── demo/               # Demo workflows and isolated sample fixtures
├── design-tokens.json      # Machine-readable token source
├── tokens.css              # Generated token output
├── styles.css              # Application CSS pending feature-level style extraction
└── main.jsx                # Browser entry point only
```

## Integration Boundaries

As real services replace the demo adapter, extend these boundaries by responsibility:

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

Do not create frontend adapters for Graph payments, private wallet signing material, Hedera settlement, database access, or secret management. Those capabilities belong to the backend even when the UI initiates them.

## File Ownership Rules

- `app/` decides which page and layout to render. It does not own product workflow markup.
- Every route-level page has one file under `pages/`. A page composes features and coordinates page-local UI state.
- A reusable element moves to `components/` only when at least two page or feature owners need the same contract.
- Product behavior belongs in a named `features/` folder. Avoid catch-all files such as `components/common.jsx` or `utils/helpers.js`.
- Sample records belong in `services/demo/fixtures/`. Demo workspace and financial actions must stay identifiable as sample data.
- Async workflows belong in feature hooks; network/provider operations belong in `services/`. Pages must not implement simulated progress timers, raw `fetch` calls, or provider SDK calls in JSX.
- The selected service interface in `services/index.js` currently points to the demo adapter. It is a frontend seam, not an approved HTTP or payment contract. Add backend clients only after reviewing those contracts.
- Cancel view-owned work on unmount and prevent repeated submission while a task is active.
- User-facing copy belongs in `i18n/messages/`; components reference stable message keys through `useI18n()`.
- English is the fallback locale and Simplified Chinese is available as `zh-CN`. Locale selection is browser-detected, user-overridable, and persisted locally.
- Keep locale catalogs structurally aligned and run `npm run test:i18n` after changing copy or translation keys.
- Keep server state separate from temporary presentation state. Durable build, deployment, and payment status must come from the backend after integration.
- Prefer focused files over multi-page modules. A route file should normally remain below roughly 200 lines; extract named feature components when its main workflow becomes difficult to scan.
- Keep unit tests next to the module they verify. Keep route-spanning and browser tests under `tests/`.
- `npm run test:structure` guards the one-page-per-file rule and keeps page implementations out of application composition files.

## Current Route Ownership

| Route family | Page file | Primary feature owner |
|---|---|---|
| `/` | `pages/EntryPage.jsx` | Entry and navigation |
| `/app` | `pages/DashboardPage.jsx` | Product summaries |
| `/app/wallet` | `pages/WalletAccessPage.jsx` | Wallet and Graph access |
| `/app/products/:id/build` | `pages/ProductBuilderPage.jsx` | Builder DAG and execution evidence |
| `/app/products/:id/api` | `pages/ApiDeploymentPage.jsx` | Deployment and private testing |
| `/app/products/:id/monetize` | `pages/MonetizationRevenuePage.jsx` | x402 publication and revenue |
| `/p/:slug` | `pages/PublicProductPage.jsx` | Public consumer request |

## Design-System Contract

Treat `src/design-tokens.json` as the visual source of truth and `src/tokens.css` as generated output. New styles must consume semantic or component tokens for colors and shared contracts. Run `npm run tokens` after changing the JSON source; the build rejects stale generated tokens.

The evidence files under `evidence/` document the approved visual comparison. They are not runtime assets.
