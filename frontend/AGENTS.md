# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Treat `src/design-tokens.json` as the visual source of truth and `src/tokens.css` as generated output. New component styles must consume semantic or component tokens and must not add raw color literals. After changing tokens, run `npm run tokens`; `npm run test:tokens` validates descriptions, references, layer direction, and generated-file freshness.

Sprue is a browser-based web product for large-screen viewports. Do not create or imply a Windows, macOS, or other native desktop client. Mobile and tablet-specific layouts are outside the current scope.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Keep each route-level page in its own file under `src/pages/`. Application files may select routes and compose layouts but must not contain page implementations. Extract feature-owned workflows under `src/features/` and reusable presentation contracts under `src/components/`; do not create catch-all component or utility modules. Run `npm run test:structure` after changing route or page ownership.

Keep user-facing copy in `src/i18n/messages/`, with English as the fallback and `zh-CN` as the initial additional locale. Use stable translation keys through `useI18n()` instead of hardcoding prose in page components. Preserve technical identifiers, hashes, addresses, provider names, API payload fields, and code samples when translation would change their meaning. Run `npm run test:i18n` after changing localized copy or message keys.
