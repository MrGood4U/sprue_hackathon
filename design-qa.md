# Sprue Historical Prototype Design QA

This report records the original visual and interaction checks on 2026-09-05. The user subsequently promoted the source to the maintained product frontend. These captures remain historical design evidence; current integration status is tracked in [frontend/implementation-status.md](frontend/implementation-status.md).

## Comparison Target

- Source visual truth: `frontend/evidence/source-evidence-first-console.png`
- Final implementation screenshot: `frontend/evidence/implementation-builder-v5.png`
- Full comparison: `frontend/evidence/comparison-full-final.png`
- Focused Builder comparison: `frontend/evidence/comparison-builder-detail-final.png`
- Minimum-width evidence: `frontend/evidence/implementation-builder-1024.png`
- All-page review sheet: `frontend/evidence/all-pages-contact-sheet.png`
- Route and state: `/app/products/base-dex-stickiness/build`, proposed version, ready-to-build state, dark Evidence-First Console theme

## Viewport and Normalization

- Source pixels: 1488 by 1058.
- Source normalization: Lanczos resize to 1440 by 1024. The source and target share the same 1.40625 aspect ratio, so no crop or frame substitution was required.
- Implementation pixels and CSS viewport: 1440 by 1024 at device scale factor 1.
- Minimum supported check: 1024 by 768 at device scale factor 1. The build-readiness panel collapses, persistent product controls remain visible, and the DAG canvas scrolls horizontally without clipping the page-level actions.
- Browser-rendered implementation: local Vite URL rendered by installed Chromium. Core interactions and browser logs were also checked in the Codex in-app browser; its 835-pixel panel correctly activated the below-minimum-width notice.

## Full-View Comparison Evidence

`frontend/evidence/comparison-full-final.png` places the normalized source on the left and the final implementation on the right in one image. The comparison confirms the same primary regions and proportions: 210-pixel account sidebar, 106-pixel product header, 190-pixel intent panel, central DAG canvas, 270-pixel evidence panel, and bottom execution trace. Node placement, product tabs, readiness hierarchy, semantic colors, and primary action placement preserve the selected source.

## Focused Region Evidence

`frontend/evidence/comparison-builder-detail-final.png` compares the Builder region after excluding only the outer account sidebar and bottom trace. It verifies the intent hierarchy, six-node graph, cyan lineage, violet API output, evidence-panel order, monospaced metadata, border treatment, and canvas density at equal dimensions.

## Required Fidelity Surfaces

- Fonts and typography: Inter is used for interface hierarchy and DM Mono for code, identifiers, timestamps, schema, and amounts. Weights, wrapping, and line height preserve the compact developer-console intent. The implementation uses slightly smaller evidence metadata than the source to prevent collision at the 1024-pixel minimum; this is an acceptable P3 difference.
- Spacing and layout rhythm: Major tracks, boundaries, node positions, tab underline, evidence groups, and trace placement align with the normalized source. Compact 4/8-pixel rhythm and 5-8 pixel radii are consistent across all seven screens.
- Colors and visual tokens: Charcoal surfaces, gray dividers, white text, cyan data lineage, violet Agent and primary actions, green confirmed state, and amber payment attention match the source semantics. The implementation intentionally uses flatter surfaces and less ambient glow for operational contrast; this is an acceptable P3 difference.
- Image quality and asset fidelity: The source contains interface chrome rather than separate raster product imagery. All visible interface icons use the Phosphor library; no emoji, custom inline SVG, placeholder raster, or handcrafted replacement asset is used.
- Copy and content: Product-specific copy remains English, describes the Graph/Privy/Hedera flow coherently, and clearly labels mock or simulated actions. No screen claims a real wallet action, Graph query, payment, deployment, or settlement.
- Accessibility and behavior: Native buttons and fields, visible focus styling, labeled icon buttons, reduced-motion support, a 1024-pixel minimum guard, and keyboard-closeable dialogs are present. The primary Builder, API tester, publication, consumer request, access-mode, and policy-dialog interactions were exercised.

## Comparison History

### Iteration 1

- Initial implementation evidence: `frontend/evidence/implementation-builder-v1.png`.
- P2: DAG nodes were too wide, the API Output node overflowed beneath the evidence panel, and the graph sat too high in the canvas.
- P2: The execution trace began too high and its actions were materially shorter than the source.
- P2: Node metadata and evidence typography were too small, while an extra canvas status row consumed source whitespace.

Fixes: reduced node width, rebalanced gaps and right-panel width, centered the graph against the full canvas, aligned the trace boundary and action height, increased operational typography, and removed the extra canvas row.

Post-fix evidence: `frontend/evidence/implementation-builder-v5.png`, `frontend/evidence/comparison-full-final.png`, and `frontend/evidence/comparison-builder-detail-final.png` show all six nodes, matching region boundaries, aligned vertical placement, and legible evidence without overlap.

### Final Pass

No actionable P0, P1, or P2 differences remain. Residual P3 differences are the flatter background treatment and slightly smaller right-panel metadata retained for browser readability. These do not change hierarchy, meaning, or task completion.

## Interaction and Runtime Verification

- Build version: simulated run progresses from Planning through Source, Transform, and Materialize to complete.
- API: product tab navigation works and the request tester returns a labeled mock `200 OK` response.
- Monetize: publication updates to `Published on x402` and exposes the public-page action.
- Public consumer: the safe simulation progresses through HTTP 402 terms, Hedera settlement, and a labeled mock response.
- Dashboard: entry navigation, product navigation, and the natural-language creation dialog work.
- Wallet and Access: API-key/x402 selection and the spend-policy dialog work.
- Browser console: no runtime errors were observed; only Vite connection messages and the React development-tools suggestion were present.
- Build checks: `npm run build` passed and `npm run test:sites` passed all four tests after the build artifact was produced.

## Follow-up Polish

- P3: Revisit evidence metadata size after testing the production font-loading strategy across target browsers.
- P3: Consider a restrained, non-essential surface-lighting treatment only if it does not reduce operational contrast.

## Implementation Checklist

- Preserve the selected token roles and screen hierarchy while extending the maintained frontend.
- Identify the current demo workspace and sample financial operations until the corresponding services are live.
- Re-run browser and design QA after production data, loading, and error states replace fixtures.

final result: passed
