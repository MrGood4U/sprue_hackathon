import assert from "node:assert/strict";
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
