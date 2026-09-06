# Frontend Instructions

The user promoted `frontend/` to the maintained Sprue product frontend on 2026-09-05. Extend this application directly. Keep route, feature, service, localization, and design-token ownership explicit as real integrations are added.

The current workspace uses a server-generated evaluator projection through the backend demo runtime. Application identity and navigation must use product language; demo operations must remain distinguishable from real provider results. Never describe backend fixture output as live external data, confirmed settlement, or persisted build.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, consult the selected Evidence-First Console design and product-design.md. When the user gives durable frontend feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Treat `src/design-tokens.json` as the visual source of truth and `src/tokens.css` as generated output. New component styles must consume semantic or component tokens and must not add raw color literals. After changing tokens, run `npm run tokens`; `npm run test:tokens` validates descriptions, references, layer direction, and generated-file freshness.

Sprue is a browser-based web product for large-screen viewports. Do not create or imply a Windows, macOS, or other native desktop client. Mobile and tablet-specific layouts are outside the current scope.

The user requires Windows local browser testing and Vercel/Railway deployment from the same source. Follow root deployment.md and preserve the Docker/Vercel packaging. VITE_API_BASE_URL is public build-time configuration only; never expose database URLs or signing/provider secrets. getPublicAppConfig is a read-only transport, while VITE_API_BASE_URL selects the backend demo client for the current evaluator slice. It is not authorization to advertise completed durable backend integration. Run the full-checkout build/tests before the isolated build:app deployment command.

Build app UI in `src/`. Preserve the existing optional Sites adapter in `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs`. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`. The selected evaluator deployment remains Vercel plus Railway.

Keep each route-level page in its own file under `src/pages/`. Application files may select routes and compose layouts but must not contain page implementations. Extract feature-owned workflows under `src/features/` and reusable presentation contracts under `src/components/`; do not create catch-all component or utility modules. Run `npm run test:structure` after changing route or page ownership.

Keep user-facing copy in `src/i18n/messages/`, with English as the fallback and `zh-CN` as the initial additional locale. Use stable translation keys through `useI18n()` instead of hardcoding prose in page components. Preserve technical identifiers, hashes, addresses, provider names, API payload fields, and code samples when translation would change their meaning. Run `npm run test:i18n` after changing localized copy or message keys.

Historical demo fixtures belong in `src/services/demo/fixtures/` for isolated tests only. Route-level pages use feature hooks for async workflows; hooks call the selected backend client in `src/services/index.js`. Cancel in-flight view work on unmount. Replace the documented backend demo routes with reviewed durable clients as integration proceeds; do not invent unreviewed API routes or add live payment behavior in page components.

## Product Workflow Navigation

The product header uses four deep-linkable views in this order: `Agent`, `Build`, `API`, and `Monetize`. `AgentPage.jsx` owns the natural-language conversation, backend-driven planning progress, editable intent, and transition to the generated DAG. `ProductBuilderPage.jsx` owns DAG review and bounded refinement. Do not place Agent conversation and the full DAG workspace back into one route-level page. A successful Agent plan may navigate to Build after the backend response completes; preserve an explicit `Review generated DAG` path for users who revisit the Agent page.

## Semantic Builder Boundary

Use the seven-type runtime scope and [semantic template contract](../backend/harness/semantic-templates.md) for future integration. The current UI consumes the backend demo proposal for the cross-chain Union/Join example. Render actual stable node IDs and edges, including explicit multi-source inputs, not labels/array positions as execution identity. Reviewed palette templates insert ordinary editable nodes; template provenance remains explanatory metadata, not an editing lock. Parameter edits must become new backend proposals when the durable proposal APIs are connected. Do not describe backend demo output as live provider data or repeat activity as cohort retention. Keep template display metadata outside canonical execution/layout persistence until H1/H2 review. Preserve semantic tokens, one-line palette labels with hover/focus details, and keyboard-operable disclosure. Palette insertion controls must not add redundant plus icons or native title tooltips. Select mode permits single-click node/edge selection and toolbar/keyboard deletion; hand mode is pan-only and must not select or edit canvas elements. Double-click opens the centered modal inspector boundary documented in `workflow-editor.md`. Keep node edits in the modal temporary buffer until Confirm; Cancel, close, Escape, and backdrop dismissal must discard them. Canvas nodes show only their icon, name, and status; technical version details belong in the inspector.
Mount the compact editor toolbar in the React Flow canvas overlay at the top center. It must float above the canvas with token-based elevation, remain keyboard focus-visible, block canvas gestures inside its bounds, and never consume a separate page-layout row.

Keep all source acquisition inside the Source node modal. The modal must distinguish already discovered product sources from adding another existing Subgraph, and the add branch must distinguish search from direct lookup by Subgraph ID, Deployment ID, or IPFS CID. Do not add a separate source-creation route, accept arbitrary provider URLs, or mark a candidate configured before the Graph adapter has verified its identity, schema, coverage, and access boundary. An unavailable live adapter must remain visible as unavailable rather than falling back to a fixture-backed success.
