# Workflow Editor Design

## Status

Draft 0.5, 2026-09-06. The workflow editor is an editable mode inside the existing Builder page, not a separate route. This document records the approved interaction direction and the current implementation boundary.

## Product Decisions

- The Builder page is both the workflow preview and the workflow editor.
- A single `workingDraft` is the source of truth for the canvas, node configuration, derived output schema, expected preview, readiness evidence, and Structured DAG inspection.
- The editor has a select tool for node interaction and a hand tool for canvas panning.
- A left palette provides reviewed, predefined templates and the seven MVP runtime operators: Source, Filter, Map, Aggregate, Union, Join, and Output.
- Templates are developer-owned, versioned insertion recipes. The Agent may select and configure them, but it does not invent executable template definitions.
- Clicking a template inserts its complete node and edge subgraph into the working draft. Inserted nodes are ordinary editable nodes; template origin is metadata for explanation and provenance, not an editing lock.
- A new Source node references an existing The Graph Subgraph. It does not create or deploy an upstream Subgraph. The creator configures the source query, schema mapping, pagination, time window, and Graph access mode.
- Saving replaces the current working draft after validation. An active, deployed, or published version remains unchanged until an explicit build or activation flow promotes the valid draft.
- Product version semantics remain separate from visual layout. Moving nodes changes layout only; changing nodes, edges, or configuration changes the execution draft.

## Current Implementation

The first frontend slice is implemented under `frontend/src/features/workflow-editor/`. It includes the select and hand tools, node dragging, typed connections, node deletion, undo/redo, zoom and fit-to-view, operator and template insertion, operator-specific configuration forms, client-side structural validation, and a centered modal node inspector with a dimmed backdrop. Palette entries use one-line labels; their longer descriptions appear in a mouse-following tooltip and on keyboard focus. The current working draft feeds the Builder readiness evidence and Structured DAG modal. The frontend derives an empty schema and preview when the output path is disconnected or no cross-chain output view is selected; it does not claim a live recomputation for provider-backed data.

The current predefined templates are Filter + Aggregate and Cross-chain Union. Their inserted nodes remain ordinary editable nodes. A durable save command, server-side validation, revision conflict handling, live source discovery, and execution of changed definitions remain backend work.

## Interaction Model

### Builder surface

The existing Builder layout keeps the product header, editable DAG canvas, collapsible readiness inspector, and bottom action bar. The canvas is no longer a read-only SVG projection.

The top editor toolbar contains:

- Select tool: select, move, and connect nodes.
- Hand tool: pan the canvas without moving nodes.
- Undo and redo.
- Zoom controls and fit-to-view.
- Delete selection. In select mode it removes the selected node or edge; in hand mode it does not change the current selection.

The left palette contains two sections:

1. Templates: reviewed recipes such as Filter + Aggregate and Cross-chain Union. Additional semantic recipes can be added without changing the editor contract.
2. Operators: Source, Filter, Map, Aggregate, Union, Join, and Output.

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

The bottom action bar exposes `Save draft`, `Structured DAG`, and `Run backend build`. `Save draft` is currently an explicit demo-mode boundary: it is enabled only for a valid dirty draft and reports that durable persistence is not connected. It must be replaced by the reviewed durable version command before it can claim a save.

The Structured DAG action reads the current canonical working draft. Layout coordinates are excluded from the execution JSON unless the user is explicitly viewing layout details.

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

`ProductBuilderPage` coordinates the feature and passes the derived draft to `BuildReadiness`, `BuilderInspector`, and the build action. The feature owns editing state; route composition does not contain graph algorithms.

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

## Verification

- Pure graph tests cover insertion, namespaced template IDs, move-only changes, add/remove/reconnect, cycle detection, port compatibility, Join and Union rules, and undo/redo.
- Schema tests cover Filter, Map, Aggregate, Union, Join, and Output changes against changing upstream fields.
- Browser tests cover select versus hand mode, blocked node/edge selection while panning, single-click node/edge selection, double-click editing, palette insertion and hover/focus descriptions without native duplicate tooltips, distinctive operator icons, node dragging, port connections, node/edge delete and undo, modal Confirm commit and Cancel/X/Escape/backdrop rollback, current Structured DAG output, draft-save boundary feedback, readiness updates, keyboard alternatives, localization, and the 1024/1440-pixel layouts.
- Backend tests must repeat all structural checks and verify that invalid or stale working-draft saves cannot replace the active version.
