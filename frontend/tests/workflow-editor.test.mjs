import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEditorState, editorReducer } from "../src/features/workflow-editor/editorReducer.js";

function draftFixture() {
  return {
    groups: [],
    referenceResult: [{ wallet: "0x1" }],
    specification: {
      outputSchema: { fields: [{ name: "wallet", type: "address" }] },
      dag: {
        nodes: [
          { id: "source", type: "source", operatorVersion: "1", config: { sourceKey: "existing-source" } },
          { id: "map", type: "map", operatorVersion: "1", config: { mapping: { wallet: "account.id" } } },
          { id: "output", type: "output", operatorVersion: "1", config: { views: ["crossChain"] } },
        ],
        edges: [
          { fromNode: "source", fromPort: "rows", toNode: "map", toPort: "rows" },
          { fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows" },
        ],
      },
    },
  };
}

test("the editor round-trips a canonical DAG without storing canvas coordinates", () => {
  const state = createEditorState(draftFixture());
  assert.equal(state.validation.length, 0);
  assert.equal(state.draft.specification.dag.nodes[0].x, undefined);
  assert.equal(state.draft.specification.outputSchema.fields.length, 1);
});

test("removing the output connection marks the draft invalid and clears derived output", () => {
  const state = createEditorState(draftFixture());
  const edge = state.edges.find((item) => item.target === "output");
  const next = editorReducer(state, { type: "edges_change", changes: [{ type: "remove", id: edge.id }] });
  assert.equal(next.draft.specification.outputSchema.fields.length, 0);
  assert.deepEqual(next.draft.referenceResult, []);
  assert.ok(next.validation.some((error) => error.code === "MISSING_OUTPUT_INPUT"));
});

test("selecting an edge enables selection deletion without deleting its nodes", () => {
  const state = createEditorState(draftFixture());
  const edge = state.edges[0];
  const selected = editorReducer(state, { type: "select_edge", id: edge.id });
  assert.equal(selected.selectedNodeId, null);
  assert.equal(selected.selectedEdgeId, edge.id);
  assert.equal(selected.edges.filter((item) => item.selected).length, 1);

  const next = editorReducer(selected, { type: "delete_selection" });
  assert.equal(next.nodes.length, state.nodes.length);
  assert.equal(next.edges.length, state.edges.length - 1);
  assert.equal(next.selectedEdgeId, null);
});

test("templates insert namespaced nodes and remain undoable", () => {
  const state = createEditorState(draftFixture());
  const inserted = editorReducer(state, { type: "add_template", templateId: "filter-and-aggregate", position: { x: 500, y: 200 } });
  assert.equal(inserted.nodes.length, state.nodes.length + 2);
  assert.ok(inserted.nodes.some((node) => node.id === "template-1-filter"));
  assert.ok(inserted.edges.some((edge) => edge.source === "template-1-filter"));
  const undone = editorReducer(inserted, { type: "undo" });
  assert.equal(undone.nodes.length, state.nodes.length);
});

test("connection rules reject cycles", () => {
  const state = createEditorState(draftFixture());
  const next = editorReducer(state, {
    type: "connect",
    connection: { source: "map", sourceHandle: "rows", target: "source", targetHandle: "rows" },
  });
  assert.equal(next.edges.length, state.edges.length);
});

test("the canvas keeps a larger tokenized dot grid", async () => {
  const source = await readFile(new URL("../src/features/workflow-editor/WorkflowCanvas.jsx", import.meta.url), "utf8");
  assert.match(source, /<Background gap=\{28\} size=\{1\.4\} color="var\(--dag-grid\)" \/>/);
});

test("hand mode keeps the grab cursor over every canvas element", async () => {
  const styles = await readFile(new URL("../src/features/workflow-editor/workflow-editor.css", import.meta.url), "utf8");
  assert.match(styles, /\.workflow-canvas-pan \.react-flow__pane,[\s\S]*?\.workflow-canvas-pan \.react-flow__pane \* \{\s*cursor: grab !important;/);
  assert.match(styles, /\.workflow-canvas-pan \.react-flow__pane:active,[\s\S]*?\.workflow-canvas-pan \.react-flow__pane:active \* \{\s*cursor: grabbing !important;/);
});
