# Workflow Editor Design

## Status

Draft 0.11, updated 2026-09-11. The workflow editor is an editable mode inside the existing Builder page, not a separate route. This document records the approved interaction direction and the current implementation boundary.

## Product Decisions

- The Builder page is both the workflow preview and the workflow editor.
- A single `workingDraft` is the source of truth for the canvas, node configuration, derived output schema, expected preview, readiness evidence, and Structured DAG inspection.
- The editor has a select tool for node interaction and a hand tool for canvas panning.
- A compact top-left palette floats inside the DAG canvas and provides reviewed, predefined templates and the eight MVP runtime operators: Source, Filter, Map, Aggregate, Sort / Top K, Union, Join, and Output.
- Templates are developer-owned, versioned insertion recipes. The Agent may select and configure them, but it does not invent executable template definitions.
- Clicking a template inserts its complete node and edge subgraph into the working draft. Inserted nodes are ordinary editable nodes; template origin is metadata for explanation and provenance, not an editing lock.
- A new Source node references an existing The Graph Subgraph. It does not create or deploy an upstream Subgraph. Its modal owns both selection from already discovered product sources and acquisition of another existing Subgraph through search or an explicit Graph identifier. The creator configures the source query, schema mapping, pagination, time window, and Graph access mode after the source is verified.
- Saving replaces the current working draft after validation. An active, deployed, or published version remains unchanged until an explicit build or activation flow promotes the valid draft.
- Product version semantics remain separate from visual layout. Moving nodes changes layout only; changing nodes, edges, or configuration changes the execution draft.

## Current Implementation

The first frontend slice is implemented under `frontend/src/features/workflow-editor/`. It includes the select and hand tools, node dragging, typed connections, node deletion, undo/redo, zoom and fit-to-view, operator and template insertion, operator-specific configuration forms, client-side structural validation, and a centered modal node inspector with a dimmed backdrop. Node status badges recognize the current operator configuration contracts and remain coupled to node-scoped validation, so a Map version 2 `{mode, fields[]}` configuration is not mistaken for an unconfigured legacy Map and an invalid field reference is not labeled configured. Filter, Map, Aggregate, and Sort / Top K derive their selectable scalar fields from the direct predecessor output schema; invalid upstream references remain visible and block confirmation. Map exposes the predecessor contract, supports extend or project output modes, and groups type-aware transforms through progressive disclosure: explicit scalar casts, ISO and epoch-unit time conversion, text normalization and two-field concatenation, null fallback, and numeric normalization. Each Map definition also exposes an optional generic unit annotation on its own labeled row. Empty inherits an upstream unit when available; a non-empty value changes metadata only, is limited to 40 printable characters, and cannot conflict with an inferred unit. More complex valid Agent-authored expressions remain preserved until the user explicitly replaces them. Aggregate edits grouping fields and measures as structured values instead of comma-delimited object text. Each measure exposes an output name, one reviewed calculation, and a source field only when that calculation requires one; numeric calculations show only compatible numeric predecessor fields. Sort supports ordered multi-key priorities, direction, null placement, and an optional bounded K while preserving its input schema. Palette entries use one-line labels; their longer descriptions appear in a mouse-following tooltip and on keyboard focus. The Source inspector colocates the existing product-source selector with an `Add existing Subgraph` branch. Search and direct-ID verification use the authenticated workspace-scoped backend Graph adapter; only a successfully inspected source can be confirmed. Builder resolves the live workspace product from the route, reads its newest durable Agent run, and uses the backend-owned `builderDraft` projection when available. That projection preserves validated candidate sources, selected query entities, exact field bindings, operator nodes, and edges while remaining explicitly `requires_source_admission`. Per-source backend output schemas are authoritative. Historical durable proposals that predate those schemas are upgraded during projection from their logical field bindings and existing DAG type constraints, without interpreting provider-specific field paths; the recovered schema is attached to both the source record and its Source node so direct downstream inspectors receive the same contract. Historical unit annotations are restored only from the declared output contract along unambiguous field lineage and stop at Map boundaries; no field-name or provider convention participates. Schema-affecting projection changes use a new browser-session cache version so an older cached draft cannot mask the upgrade. A failed, missing, clarification, unsupported, or older Agent result opens an empty manual draft rather than the historical sample. The current working draft feeds the Builder readiness evidence, Structured DAG modal, and authenticated backend compilation request. The frontend derives an empty schema when the output path is disconnected and never claims a live recomputation or runtime preview for this planning-only data.

The current predefined templates are Filter + Aggregate and Cross-chain Union. Their inserted nodes remain ordinary editable nodes. Edits are cached under workspace, product, and Agent-result identity for the current browser session so product-tab navigation does not discard them; a newer Agent result invalidates the older cached draft. `Save draft` marks this browser-session copy saved and does not claim a durable product version. The backend now performs a read-only structural compilation preflight of the submitted working DAG. Durable save, source admission, executable query compilation, revision conflict handling, execution of changed definitions, and deployment remain backend work.

## Interaction Model

### Builder surface

The existing Builder layout keeps the product header, editable DAG canvas, collapsible readiness inspector, and bottom action bar. The canvas is no longer a read-only SVG projection. It begins directly below the product tabs without a separate workflow-name, node-count, or draft-status summary strip.

The canvas uses a tokenized dot grid with 28-pixel spacing and slightly enlarged points. Its contrast must remain clearly visible on the dark canvas while staying subordinate to node boundaries, handles, and data-lineage edges.

The editor toolbar floats at the top center of the React Flow canvas. It belongs to the canvas overlay layer, does not consume a separate Builder layout row, and blocks canvas pan/drag gestures within its own bounds. It contains:

- Select tool: select, move, and connect nodes.
- Hand tool: pan the canvas without moving nodes. Its grab cursor remains consistent over the canvas, nodes, ports, and edges, and changes to grabbing while the canvas is actively dragged; floating controls retain their own control cursors.
- Undo and redo.
- Zoom controls and fit-to-view.
- Delete selection. In select mode it removes the selected node or edge; in hand mode it does not change the current selection.

The palette floats at the top left of the React Flow canvas, blocks canvas gestures within its own bounds, and has a bounded internal scroll area. It does not consume a permanent Builder layout column. The palette contains two sections:

1. Templates: reviewed recipes such as Filter + Aggregate and Cross-chain Union. Additional semantic recipes can be added without changing the editor contract.
2. Operators: Source, Filter, Map, Aggregate, Sort / Top K, Union, Join, and Output.

Dragging an item from the palette and dropping it on the canvas creates a new working-draft element. A template drop inserts namespaced node IDs and its internal edges, then places the instance near the drop point. Templates that require inputs open a small binding step before insertion rather than creating an invalid hidden connection.

### Nodes and connections

Each node renders its title, operator type, origin/template marker when applicable, and typed input/output ports. Connections are created by dragging from an output port to an input port.

The editor gives immediate feedback for:

- Invalid port direction or type.
- Missing required input.
- Duplicate or incompatible Union inputs.
- Invalid Join key or cardinality.
- Cycles and unreachable nodes.
- Multiple outputs or a missing output.
- Field references that no longer exist after an upstream change.
- Resource limits and unsupported configuration.

Delete and reconnect operations are undoable. Source and Output nodes remain deletable only when the resulting draft stays explainable; invalid intermediate states can be displayed but cannot be saved or built.

### Inspector and derived evidence

In select mode, single-clicking a node selects it without opening another surface, and single-clicking an edge selects the edge. The selected node or edge can be removed through the toolbar Delete selection control or the keyboard Delete/Backspace command. In hand mode, nodes and edges are not selectable or editable; pointer interaction is reserved for panning the canvas. Double-clicking a node in select mode opens its configuration in a centered modal inspector over the canvas. The modal dims the surrounding workspace, keeps form changes in a temporary node-edit buffer, and exposes explicit `Cancel` and `Confirm` actions. Its close control, Escape, or a backdrop click behaves like Cancel and discards the temporary changes; only Confirm writes the node configuration to the working draft. Forms are operator-specific and schema-driven; raw executable code and arbitrary JSON editing are not allowed.

The Source form uses progressive disclosure inside that same modal. `Discovered sources` selects a source already attached to the product. `Add existing Subgraph` contains `Search` and `Add by ID` modes. Search accepts a name or contract address plus an optional network slug. Direct lookup distinguishes a logical Subgraph ID, immutable Deployment ID, and manifest IPFS CID. A candidate must pass provider lookup, schema inspection, network/coverage checks, and source authorization before it can enter the product source list or make the Source node configured. Until that backend path exists, the controls expose an honest unavailable state and the modal cannot confirm the add branch.

Every semantic edit runs the same frontend derivation pipeline:

```text
workingDraft
  -> graph validation
  -> topological schema inference
  -> output schema
  -> deterministic preview or stale-preview state
  -> readiness evidence
  -> Structured DAG representation
```

The output schema is recalculated from the final reachable Output node. A preview is recalculated for supported deterministic demo operators. If a source or query changes and a local preview cannot be trusted, the UI shows an explicit stale or unavailable state and requests a backend preview; it never presents the previous output as current.

The bottom action bar exposes `Save draft`, `Structured DAG`, and `Run backend build`. `Save draft` is currently an explicit browser-session boundary: it is enabled only for a valid dirty draft and reports that durable persistence is not connected. It must be replaced by the reviewed durable version command before it can claim a durable save. `Run backend build` submits the current canonical Structured DAG, excluding canvas layout, to the creator-authenticated product-scoped preflight compiler. The button disables and rotates while the request is active. A passed compilation caches the current browser draft and navigates to the same product's API tab. A failed compilation leaves the canvas unchanged and opens a localized modal containing the backend issue codes, node locations, and safe explanations. The preflight is structural and read-only: success does not admit a source, persist a product version, compile GraphQL, execute data, deploy an API, or authorize payment.

The Structured DAG action reads the current canonical working draft. Layout coordinates are excluded from the execution JSON unless the user is explicitly viewing layout details. Its modal keeps the heading, explanation, and footer fixed while the long JSON document scrolls in a bounded, keyboard-focusable code viewer with a token-colored scrollbar. A top-right copy action copies the complete structured document and exposes accessible success or failure feedback.

## State Contract

The editor hook owns temporary presentation state and the current working draft:

```text
clean
  -> dirty
  -> validating
  -> valid | invalid
  -> saving
  -> clean | conflict | failed
```

Undo and redo operate on immutable snapshots of the semantic draft and layout. A layout-only snapshot must not change the execution specification hash. Saving uses the current version/revision and must reject stale writes rather than silently overwriting another editor.

The server remains authoritative for schema validation, operator compatibility, resource limits, source authorization, and version persistence. Frontend validation is an immediate explanation layer, not a security boundary.

## Feature Ownership

The feature should be implemented under:

```text
frontend/src/features/workflow-editor/
├── WorkflowEditor.jsx
├── WorkflowEditorToolbar.jsx
├── NodePalette.jsx
├── WorkflowCanvas.jsx
├── WorkflowNode.jsx
├── NodeInspector.jsx
├── nodeConfigs/
│   ├── SourceConfig.jsx
│   ├── FilterConfig.jsx
│   ├── MapConfig.jsx
│   ├── AggregateConfig.jsx
│   ├── UnionConfig.jsx
│   ├── JoinConfig.jsx
│   └── OutputConfig.jsx
├── state/
│   ├── editorReducer.js
│   ├── editorCommands.js
│   └── useWorkflowEditor.js
├── model/
│   ├── editorProjection.js
│   ├── connectionRules.js
│   ├── nodeCatalog.js
│   └── draftCodec.js
├── workflow-editor.css
└── workflow-editor.test.js
```

`ProductBuilderPage` coordinates the feature and passes the derived draft to `BuildReadiness`, `BuilderInspector`, and the build action. The feature owns editing state and async presentation state; route composition does not contain graph algorithms. The backend compiler is authoritative for node identity and version, typed ports, required and exclusive inputs, one Output, acyclicity, reachability, Source-to-project-Map normalization, operator configuration, predecessor-schema propagation, Union/Join compatibility, and the declared output contract.

## Implementation Stages

1. Add the editor shell and replace the read-only canvas while keeping existing Builder layout and readiness collapse.
2. Add the select/hand toolbar, zoom, fit-to-view, node dragging, layout persistence in local state, and undo/redo.
3. Add the reviewed operator palette and predefined template catalog. Inserted templates become editable namespaced node subgraphs.
4. Add typed handles, connection creation, edge removal, and client-side graph rules.
5. Add schema-driven node inspectors and live output-schema derivation.
6. Add deterministic preview derivation for supported operations and explicit stale/unavailable preview states.
7. Make Structured DAG and BuildReadiness consume the current working draft.
8. Add backend validation and working-draft save with revision conflict handling; then replace the demo-only `Save draft` feedback with the durable command.

## Non-Goals

- Creating or deploying a new upstream Subgraph.
- Arbitrary JavaScript, Python, SQL, or custom-code nodes.
- Browser-side Graph payment, wallet signing, or Hedera settlement.
- Mobile or native desktop editor layouts.
- Unbounded graphs, loops, implicit joins, or hidden schema coercion.

## Historical Projection Migration

Durable Agent proposals are immutable audit records, so compatibility upgrades occur only in their editable Builder projection. When an older Filter expression can be represented without changing its meaning, direct comparisons reuse existing Map-derived fields, remaining Boolean terms become explicit Map outputs, and the Filter receives the current structured predicate shape. Historical Source-to-Filter-to-Map chains move to Source-to-Map-to-Filter only after both migrated configurations validate. Unsupported expressions remain unchanged, and a versioned browser-session cache prevents stale projected drafts from hiding a successful upgrade.

Agent-authored GraphQL pushdown is projected as a residual workflow. Exact provider paths and selected fields remain inspectable on Source, while its adapter exposes the bound semantic field names to downstream operators. Direct binding rows therefore do not reappear as identity Map definitions. A partially residual Map keeps only transformations not performed by Source; a fully pushed unary operator is omitted and its predecessor is reconnected to its successors. This prevents the Builder and hosted runtime from executing the same operation twice.

Output is a terminal publisher with one `rows` input and no sorting controls. Ordering belongs exclusively to Sort / Top K. The projection normalizes a historical Output port to `rows`, upgrades Output to version 3, strips its legacy `orderBy`, and inserts an equivalent Sort predecessor when the old draft has exactly one incoming edge. A historical Output with multiple predecessors remains visibly invalid; the migration never chooses or discards a branch on the user's behalf.

## Verification

- Pure graph tests cover insertion, namespaced template IDs, move-only changes, add/remove/reconnect, cycle detection, port compatibility, Join and Union rules, and undo/redo.
- Schema tests cover Filter, Map, Aggregate, Union, Join, and Output changes against changing upstream fields.
- Browser tests cover select versus hand mode, blocked node/edge selection while panning, single-click node/edge selection, double-click editing, palette insertion and hover/focus descriptions without native duplicate tooltips, distinctive operator icons, node dragging, port connections, node/edge delete and undo, modal Confirm commit and Cancel/X/Escape/backdrop rollback, current Structured DAG output, draft-save boundary feedback, readiness updates, keyboard alternatives, localization, and the 1024/1440-pixel layouts.
- Backend tests must repeat all structural checks and verify that invalid or stale working-draft saves cannot replace the active version.
