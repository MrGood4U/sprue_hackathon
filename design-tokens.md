# Sprue Design Tokens

## Status

Draft 0.1, proposed on 2026-09-05 for human review. This document formalizes the selected Evidence-First Console direction. It does not approve the visual system or complete the broader Product and Interface Design stage.

The machine-readable source is [`frontend/src/design-tokens.json`](frontend/src/design-tokens.json). [`frontend/src/tokens.css`](frontend/src/tokens.css) is generated from that source and is consumed by the interactive prototype.

## Objective

The token system must make Sprue feel like a precise, evidence-oriented data-product compiler. It should support dense operational information without looking like a trading terminal, keep financial attention distinct from success, and preserve a consistent implementation across the Creator Console and public consumer page.

The MVP is dark-only. An optional light theme remains P1 and must override semantic tokens rather than component CSS.

## Architecture

Sprue uses three token layers:

| Layer | Responsibility | Change frequency | Example |
|---|---|---|---|
| Primitive | Raw color, type, spacing, radius, duration, opacity, size, and elevation values | Rare | `primitive.color.violet.600` |
| Semantic | Product meaning independent of a component | Theme or brand evolution | `semantic.color.accent.agent-strong` |
| Component | Stable contracts consumed by UI components | Component-specific refinement | `component.button.primary-background` |

Dependency direction is strict:

```text
component -> semantic -> primitive
```

Components must not use raw colors. New component tokens must not bypass the semantic layer. The generator validates layer references, required descriptions, missing references, and generated-file freshness.

## Naming

JSON paths use `{layer}.{category}.{role}.{state}`. Generated CSS omits `semantic` and `component` prefixes for readable component usage while retaining `primitive`:

```text
primitive.color.violet.600          -> --primitive-color-violet-600
semantic.color.accent.agent-strong  -> --color-accent-agent-strong
component.button.primary-background -> --button-primary-background
```

Names describe purpose rather than appearance. `agent`, `data`, `success`, `warning`, and `danger` are durable roles; names such as `purple-button` or `bright-green-text` are not allowed.

## Color Roles

| Role | Core token | MVP meaning | Usage rule |
|---|---|---|---|
| Canvas | `color.background.canvas` | Main application and public-page background | Lowest visual plane |
| Panel | `color.background.panel` | Operational cards and primary content surfaces | Default bounded content plane |
| Data | `color.accent.data` | The Graph sources, data lineage, transformations, and creator allocation | Never used to indicate payment completion |
| Agent | `color.accent.agent` | Agent-authored work, focus, selected state, and product-DAG emphasis | Primary action surfaces use `agent-strong` |
| Success | `color.accent.success` | Ready, validated, confirmed, delivered, or settled | Must include a text label or icon when state is material |
| Warning | `color.accent.warning` | Spend, payment requirement, reconciliation, or bounded-risk attention | Does not mean failure |
| Danger | `color.accent.danger` | Invalid, failed, revoked, destructive, or unrecoverable state | Reserved for actual errors and destructive actions |

The base canvas is `hsl(206 28% 5%)`; the default panel is `hsl(204 26% 7%)`. Primary text is `hsl(210 22% 96%)`. Secondary text is `hsl(204 11% 65%)`, while accessible tertiary text is `hsl(206 9% 52%)`. The previous darker decorative gray remains available only for non-essential decoration.

Measured against the base canvas, primary text is approximately 18.0:1, secondary text 7.9:1, tertiary text 5.3:1, data cyan 11.7:1, Agent violet 6.0:1, success green 10.6:1, and warning amber 10.2:1. Filled primary buttons use a violet surface that keeps light text above 4.5:1 in default, hover, and active states.

## Typography

Inter is the interface family. DM Mono is reserved for code, GraphQL, JSON, identifiers, hashes, wallet/account addresses, atomic amounts, and settlement evidence.

| Semantic role | Size | Typical use |
|---|---:|---|
| Micro | 9px | Dense evidence metadata; avoid for long prose |
| Caption | 10px | Table headers, code labels, compact helper text |
| Label | 11px | Navigation metadata, field labels, secondary controls |
| Body | 12px | Dense console content |
| Body large | 14px | Descriptions and public explanatory text |
| Subheading | 16px | Compact section title |
| Heading | 18px | Modal and prominent section title |
| Product | 22px | Product-shell title |
| Page | 29px | Creator Console page title |
| Display | 43px | Public product title |
| Hero | 48-76px | Entry-page value proposition only |

Weights are limited to 400, 500, 600, and 700. Most operational emphasis uses 500; headings use 600. Uppercase labels use controlled letter spacing and must not be used for body copy.

## Spacing, Shape, and Elevation

The system uses a 4-pixel base rhythm with 2-pixel optical exceptions. The common spacing sequence is 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, and 64 pixels.

| Semantic role | Value |
|---|---:|
| Tight inline gap | 4px |
| Default inline gap | 8px |
| Dense component inset | 12px |
| Default component inset | 16px |
| Comfortable component inset | 20px |
| Section separation | 24px |
| Page vertical inset | 28px |
| Page horizontal inset | 32px |

Controls use a 5-pixel radius, compact panels use 6 pixels, default panels use 7 pixels, and prominent containers or modals use 8 pixels. Pills and circular indicators use the full radius token. Borders are normally one pixel; two pixels are reserved for focus, active navigation, and semantic emphasis.

Operational surfaces are flat by default. The only prominent drop shadow is reserved for modal elevation. Filled controls may use a subtle one-pixel inner highlight.

## Layout Contracts

These tokens protect the selected 1440-pixel builder composition and the approved 1024-pixel minimum:

| Contract | Value | Reason |
|---|---:|---|
| Creator sidebar | 210px | Keeps navigation persistent without competing with the workspace |
| Product shell header | 106px | Combines a 66-pixel title row and 40-pixel tab strip |
| Builder intent rail | 190px | Keeps intent and Agent summary visible |
| Builder evidence rail | 270px | Fits readiness, schema, source, and budget evidence |
| Builder execution trace | 189px | Keeps causal execution visible below the DAG |
| DAG node | 94 by 128px | Supports four-node judge-demo flow at target width |
| Public console maximum | 1164px | Preserves readable request/response columns |
| Creator Console minimum | 1024px | Approved minimum large-screen browser width |

These are product-layout contracts, not a promise of mobile or native desktop support. Mobile and tablet-specific layouts remain deferred.

## Component Contracts

### Buttons

- Default height is 39 pixels; high-consequence Build actions use 50 pixels.
- Neutral buttons use a transparent surface, strong neutral border, and 15-pixel horizontal optical padding in the current prototype.
- Primary buttons use `button.primary-background`, darken on hover and active states, and retain at least 4.5:1 text contrast.
- Disabled controls use 65 percent opacity, preserve their label, and cannot rely on opacity alone to explain the reason.

### Inputs

- Inputs use the dedicated recessed input surface, strong neutral border, 5-pixel radius, and the global focus contract.
- Error state uses the danger role and a visible message associated through `aria-describedby`.
- Placeholder text uses secondary foreground; essential instructions must not be placed only in placeholders.

### Panels and Modals

- Panels use a one-pixel default border, 7-pixel radius, and no shadow.
- Modals use an 8-pixel radius, strong border, deep backdrop, and the only prominent elevation shadow.
- Every modal retains visible title, close/cancel path, Escape behavior, focus trap, and focus return.

### DAG

- Cyan borders identify data-source and deterministic transformation nodes.
- Violet borders identify Agent-authored or Agent-emphasized nodes.
- Selection and validation cannot rely on border color alone; the node inspector and structured DAG view carry the same state.
- The dot grid is decorative and must remain lower contrast than node content.

## Interaction States

State priority is `disabled -> loading -> active -> focus -> hover -> default`.

- State color changes use 150 milliseconds.
- Press feedback may use 80 milliseconds.
- Short structural transitions use 250 milliseconds.
- Standard easing is `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Motion must be interruptible, explain cause and effect, and respect `prefers-reduced-motion`.
- Keyboard focus uses a two-pixel violet outline with a two-pixel offset.
- Normal text targets WCAG 2.2 AA 4.5:1; large text and meaningful non-text UI target at least 3:1.

## Source and Build Contract

Edit only `frontend/src/design-tokens.json`, then generate and validate the CSS:

```bash
cd frontend
npm run tokens
npm run test:tokens
```

`npm run build` also checks that the generated CSS is current. Raw colors may appear only in the token source and generated primitive declarations. Application CSS should consume semantic or component variables for colors and shared contracts. The design prototype may retain one-off optical dimensions while it is still a visual reference; production components must replace repeated dimensions with reviewed component or semantic tokens. Temporary compatibility aliases in `styles.css` exist only to migrate the current prototype and must not be used in new production components.

## Proposed Decisions

The following decisions await human approval:

1. **DT1 — Dark-only MVP:** Ship one dark Evidence-First Console theme; keep light theme as P1.
2. **DT2 — Meaningful accents:** Cyan means data lineage, violet means Agent/primary work, green means confirmed state, amber means financial attention, and red means failure/destruction.
3. **DT3 — Dense geometry:** Retain the 4-pixel rhythm, 5-8 pixel radii, thin borders, minimal elevation, and large-screen browser layout contracts.
4. **DT4 — Token governance:** Treat the documented JSON as the source of truth, generate CSS, and reject stale or invalid layer references during builds.

## Change Log

| Date | Change | Status |
|---|---|---|
| 2026-09-05 | Created Draft 0.1 with three-layer tokens, accessibility checks, component contracts, layout constants, and prototype generation workflow | Awaiting human review |
