import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEditorState, editorReducer } from "../src/features/workflow-editor/editorReducer.js";
import {
  deriveFilterInputFields,
  deriveDirectInputFields,
  deriveNodeOutputFields,
  filterOperatorsForField,
  validateFilterConfig,
} from "../src/features/workflow-editor/filterModel.js";
import {
  defaultMapFallbackValue,
  editableMapConfig,
  mapExpressionEditor,
  mapExpressionForEditor,
  mapTransformsForField,
  validateMapConfig,
} from "../src/features/workflow-editor/mapModel.js";
import {createSortConfig, validateSortConfig} from "../src/features/workflow-editor/sortModel.js";
import {
  aggregateFieldsForOperation,
  createAggregateMeasure,
  editableAggregateConfig,
  validateAggregateConfig,
} from "../src/features/workflow-editor/aggregateModel.js";
import {isNodeConfigured} from "../src/features/workflow-editor/nodeConfiguration.js";
import {presentWorkflowNodes} from "../src/features/workflow-editor/nodePresentation.js";
import {getInputPorts} from "../src/features/workflow-editor/connectionRules.js";

function draftFixture() {
  return {
    groups: [],
    referenceResult: [{ wallet: "0x1" }],
    specification: {
      outputSchema: { fields: [{ name: "wallet", type: "address" }] },
      dag: {
        nodes: [
          {
            id: "source",
            type: "source",
            operatorVersion: "1",
            outputSchema: {fields: [{name: "wallet", type: "address", nullable: false, unit: null}]},
            config: {sourceKey: "existing-source"},
          },
          {
            id: "map",
            type: "map",
            operatorVersion: "2",
            config: {mode: "project", fields: [{name: "wallet", expression: {op: "field", field: "wallet"}}]},
          },
          { id: "output", type: "output", operatorVersion: "3", config: { fields: ["wallet"] } },
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

test("verified Graph source configuration is added atomically with its exact provider schema", () => {
  const state = createEditorState(draftFixture());
  const source = {
    id: "graph:manual:01234567890123456789",
    provider: "the_graph",
    kind: "subgraph",
    outputSchema: {
      fields: [
        {name: "amountUSD", type: "decimal", nullable: false, unit: null},
        {name: "pair.token0.symbol", type: "string", nullable: true, unit: null},
      ],
    },
  };
  const configured = editorReducer(state, {
    type: "configure_source",
    id: "source",
    config: {sourceId: source.id, queryEntity: "swaps", queryPlan: null},
    source,
  });

  assert.deepEqual(configured.draft.specification.sources, [source]);
  assert.deepEqual(
    configured.draft.specification.dag.nodes.find((node) => node.id === "source").outputSchema.fields,
    source.outputSchema.fields,
  );
  assert.equal(
    configured.draft.specification.dag.nodes.find((node) => node.id === "source").config.sourceId,
    source.id,
  );
  assert.equal(configured.history.length, 1);
});

test("dragging applies React Flow state without rebuilding the canonical DAG on every frame", () => {
  const state = createEditorState(draftFixture());
  const measured = editorReducer(state, {
    type: "nodes_change",
    changes: [{type: "dimensions", id: "source", dimensions: {width: 154, height: 96}, setAttributes: true}],
  });
  assert.deepEqual(measured.nodes.find((node) => node.id === "source").measured, {width: 154, height: 96});

  const stationary = state.nodes.find((node) => node.id === "source");
  const validation = state.validation;
  const draft = state.draft;
  const dragging = editorReducer(state, {
    type: "nodes_change",
    changes: [{type: "position", id: "map", position: {x: 320, y: 180}, dragging: true}],
  });

  assert.equal(dragging.draft, draft);
  assert.equal(dragging.validation, validation);
  assert.equal(dragging.nodes.find((node) => node.id === "source"), stationary);
  assert.equal(dragging.nodes.find((node) => node.id === "map").dragging, true);

  const stopped = editorReducer(dragging, {
    type: "nodes_change",
    changes: [{type: "position", id: "map", position: {x: 340, y: 190}, dragging: false}],
  });
  assert.equal(stopped.nodes.find((node) => node.id === "map").dragging, false);
  assert.notEqual(stopped.draft, draft);
  assert.equal(stopped.dragSnapshot, false);
});

test("node presentation preserves stationary node references during a drag", () => {
  const state = createEditorState(draftFixture());
  const first = presentWorkflowNodes(state.nodes, state.validation);
  const dragging = editorReducer(state, {
    type: "nodes_change",
    changes: [{type: "position", id: "map", position: {x: 320, y: 180}, dragging: true}],
  });
  const second = presentWorkflowNodes(dragging.nodes, dragging.validation, first.cache);

  assert.equal(
    second.nodes.find((node) => node.id === "source"),
    first.nodes.find((node) => node.id === "source"),
  );
  assert.notEqual(
    second.nodes.find((node) => node.id === "map"),
    first.nodes.find((node) => node.id === "map"),
  );
});

test("node status recognizes valid Map v2 configuration and current validation errors", () => {
  const state = createEditorState(draftFixture());
  const map = state.nodes.find((node) => node.id === "map").data.node;
  assert.equal(isNodeConfigured(map, state.validation), true);

  const blankMap = {...map, config: {mode: "project", fields: []}};
  assert.equal(isNodeConfigured(blankMap, []), false);

  const invalidDraft = draftFixture();
  invalidDraft.specification.dag.nodes.find((node) => node.id === "map").config.fields[0].expression.field = "missing_field";
  const invalidState = createEditorState(invalidDraft);
  const invalidMap = invalidState.nodes.find((node) => node.id === "map").data.node;
  assert.ok(invalidState.validation.some((error) => error.nodeId === "map" && error.code === "MAP_SOURCE_FIELD_UNKNOWN"));
  assert.equal(isNodeConfigured(invalidMap, invalidState.validation), false);
});

test("removing the output connection marks the draft invalid and clears derived output", () => {
  const state = createEditorState(draftFixture());
  const edge = state.edges.find((item) => item.target === "output");
  const next = editorReducer(state, { type: "edges_change", changes: [{ type: "remove", id: edge.id }] });
  assert.equal(next.draft.specification.outputSchema.fields.length, 0);
  assert.deepEqual(next.draft.referenceResult, []);
  assert.ok(next.validation.some((error) => error.code === "MISSING_OUTPUT_INPUT"));
});

test("Output exposes one rows input and rejects imported multiple predecessors", () => {
  assert.deepEqual(getInputPorts("output"), ["rows"]);
  const draft = draftFixture();
  draft.specification.dag.edges.push({fromNode: "source", fromPort: "rows", toNode: "output", toPort: "rows"});
  const state = createEditorState(draft);
  assert.ok(state.validation.some((error) => error.nodeId === "output" && error.code === "OUTPUT_INPUT_COUNT"));
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

test("Filter fields and operators are derived from the direct predecessor output schema", () => {
  const draft = draftFixture();
  draft.specification.dag.nodes = [
    {
      id: "source",
      type: "source",
      operatorVersion: "1",
      outputSchema: {fields: [
        {name: "amount", type: "decimal", nullable: false, unit: "USD"},
        {name: "verified", type: "boolean", nullable: true, unit: null},
        {name: "nested", type: "json", nullable: false, unit: null},
      ]},
      config: {sourceKey: "existing-source"},
    },
    {
      id: "filter",
      type: "filter",
      operatorVersion: "2",
      config: {predicate: {combinator: "and", conditions: [{field: "amount", operator: "gte", value: "10"}]}},
    },
    {id: "output", type: "output", operatorVersion: "3", config: {fields: ["amount"]}},
  ];
  draft.specification.dag.edges = [
    {fromNode: "source", fromPort: "rows", toNode: "filter", toPort: "rows"},
    {fromNode: "filter", fromPort: "rows", toNode: "output", toPort: "rows"},
  ];
  const state = createEditorState(draft);
  const fields = deriveFilterInputFields(state, "filter");
  assert.deepEqual(fields.map(({name}) => name), ["amount", "verified"]);
  assert.ok(filterOperatorsForField(fields[0]).includes("between"));
  assert.ok(filterOperatorsForField(fields[1]).includes("is_null"));
  assert.equal(validateFilterConfig(state.nodes.find((node) => node.id === "filter").data.node.config, fields).length, 0);
  assert.equal(state.validation.some((error) => error.nodeId === "filter"), false);
});

test("Filter keeps a missing upstream field invalid instead of silently changing the condition", () => {
  const config = {predicate: {combinator: "and", conditions: [{field: "removed_field", operator: "eq", value: "x"}]}};
  const errors = validateFilterConfig(config, [{name: "current_field", type: "string", nullable: false, unit: null}]);
  assert.equal(config.predicate.conditions[0].field, "removed_field");
  assert.equal(errors[0]?.code, "FILTER_FIELD_UNKNOWN");
});

test("Map reads its direct predecessor schema and preserves Agent-authored field expressions", () => {
  const draft = draftFixture();
  draft.specification.dag.nodes = [
    {
      id: "source",
      type: "source",
      operatorVersion: "1",
      outputSchema: {fields: [
        {name: "trade_timestamp", type: "timestamp", nullable: false, unit: null},
        {name: "token0_symbol", type: "string", nullable: false, unit: null},
        {name: "token1_symbol", type: "string", nullable: false, unit: null},
        {name: "trade_amount_usd", type: "decimal", nullable: false, unit: "USD"},
        {name: "data_network", type: "string", nullable: false, unit: null},
      ]},
      config: {sourceKey: "existing-source"},
    },
    {
      id: "filter",
      type: "filter",
      operatorVersion: "2",
      config: {predicate: {combinator: "and", conditions: [{field: "token0_symbol", operator: "eq", value: "AAA"}]}},
    },
    {
      id: "map",
      type: "map",
      operatorVersion: "2",
      config: {
        mode: "extend",
        fields: [
          {name: "network", expression: {op: "field", field: "data_network"}},
          {name: "trade_date", expression: {op: "utc_date", inputs: [{op: "field", field: "trade_timestamp"}]}},
        ],
      },
    },
    {id: "output", type: "output", operatorVersion: "3", config: {fields: ["network", "trade_date"]}},
  ];
  draft.specification.dag.edges = [
    {fromNode: "source", fromPort: "rows", toNode: "filter", toPort: "rows"},
    {fromNode: "filter", fromPort: "rows", toNode: "map", toPort: "rows"},
    {fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows"},
  ];
  const state = createEditorState(draft);
  const fields = deriveDirectInputFields(state, "map");
  const config = state.nodes.find((node) => node.id === "map").data.node.config;

  assert.deepEqual(fields.map(({name}) => name), [
    "trade_timestamp",
    "token0_symbol",
    "token1_symbol",
    "trade_amount_usd",
    "data_network",
  ]);
  assert.equal(validateMapConfig(config, fields).length, 0);
  assert.deepEqual(mapExpressionEditor(config.fields[1].expression), {
    kind: "utc_date",
    sourceField: "trade_timestamp",
    secondaryField: null,
    fallbackValue: null,
  });
  assert.deepEqual(deriveNodeOutputFields(state, "map").slice(-2).map(({name, type}) => [name, type]), [
    ["network", "string"],
    ["trade_date", "date"],
  ]);
  assert.equal(state.validation.some((error) => error.nodeId === "map"), false);

  const missing = {mode: "project", fields: [{name: "kept", expression: {op: "field", field: "removed_field"}}]};
  assert.equal(validateMapConfig(missing, fields)[0]?.code, "MAP_SOURCE_FIELD_UNKNOWN");
  assert.equal(missing.fields[0].expression.field, "removed_field");
  assert.deepEqual(editableMapConfig({mapping: {kept: "token0_symbol"}}), {
    mode: "project",
    fields: [{name: "kept", expression: {op: "field", field: "token0_symbol"}}],
  });
});

test("Map exposes type-aware conversions and round-trips progressively disclosed editor expressions", () => {
  const fields = [
    {name: "integer_text", type: "string", nullable: false, unit: null},
    {name: "epoch_seconds", type: "integer", nullable: false, unit: "seconds"},
    {name: "label", type: "string", nullable: true, unit: null},
    {name: "suffix", type: "id", nullable: false, unit: null},
    {name: "amount", type: "decimal", nullable: false, unit: "USD"},
    {name: "active", type: "boolean", nullable: true, unit: null},
  ];
  assert.ok(mapTransformsForField(fields[0]).some(({kind}) => kind === "to_integer"));
  assert.ok(mapTransformsForField(fields[1]).some(({kind}) => kind === "epoch_seconds_to_timestamp"));
  assert.ok(mapTransformsForField(fields[2]).some(({kind}) => kind === "concat"));
  assert.ok(mapTransformsForField(fields[4]).some(({kind}) => kind === "round"));
  assert.equal(mapTransformsForField(fields[5]).some(({kind}) => kind === "upper"), false);

  const concat = mapExpressionForEditor("concat", "label", {secondaryField: "suffix"});
  assert.deepEqual(mapExpressionEditor(concat), {
    kind: "concat",
    sourceField: "label",
    secondaryField: "suffix",
    fallbackValue: null,
  });
  const coalesce = mapExpressionForEditor("coalesce", "active", {sourceType: "boolean", fallbackValue: false});
  assert.deepEqual(mapExpressionEditor(coalesce), {
    kind: "coalesce",
    sourceField: "active",
    secondaryField: null,
    fallbackValue: false,
  });
  assert.equal(defaultMapFallbackValue("count"), "0");

  const config = {
    mode: "project",
    fields: [
      {name: "parsed", expression: mapExpressionForEditor("to_integer", "integer_text")},
      {name: "occurred_at", expression: mapExpressionForEditor("epoch_seconds_to_timestamp", "epoch_seconds")},
      {name: "display", expression: concat},
      {name: "score", expression: mapExpressionForEditor("round", "amount")},
      {name: "enabled", expression: coalesce},
    ],
  };
  assert.deepEqual(validateMapConfig(config, fields), []);
});

test("Map exposes exact camel-case and nested Graph field paths from a Source boundary", () => {
  const draft = draftFixture();
  draft.specification.dag.nodes = [
    {
      id: "source",
      type: "source",
      operatorVersion: "1",
      outputSchema: {fields: [
        {name: "amountUSD", type: "decimal", nullable: false, unit: null},
        {name: "pool.token0.symbol", type: "string", nullable: false, unit: null},
        {name: "data_network", type: "string", nullable: false, unit: null},
      ]},
      config: {sourceKey: "existing-source"},
    },
    {
      id: "map",
      type: "map",
      operatorVersion: "2",
      config: {
        mode: "project",
        fields: [
          {name: "volume_usd", expression: {op: "field", field: "amountUSD"}},
          {name: "token0_symbol", expression: {op: "field", field: "pool.token0.symbol"}},
        ],
      },
    },
    {id: "output", type: "output", operatorVersion: "3", config: {fields: ["volume_usd", "token0_symbol"]}},
  ];
  draft.specification.dag.edges = [
    {fromNode: "source", fromPort: "rows", toNode: "map", toPort: "rows"},
    {fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows"},
  ];

  const state = createEditorState(draft);
  const fields = deriveDirectInputFields(state, "map");
  assert.deepEqual(fields.map(({name}) => name), ["amountUSD", "pool.token0.symbol", "data_network"]);
  assert.equal(validateMapConfig(state.nodes.find((node) => node.id === "map").data.node.config, fields).length, 0);
  assert.equal(state.validation.some((error) => error.nodeId === "map"), false);
});

test("Sort / Top K derives predecessor fields, preserves schema, and validates bounded priorities", () => {
  const draft = draftFixture();
  draft.specification.dag.nodes = [
    {
      id: "source",
      type: "source",
      operatorVersion: "1",
      outputSchema: {fields: [
        {name: "score", type: "decimal", nullable: true, unit: "USD"},
        {name: "created_at", type: "timestamp", nullable: false, unit: null},
        {name: "details", type: "json", nullable: false, unit: null},
      ]},
      config: {sourceKey: "existing-source"},
    },
    {
      id: "sort",
      type: "sort",
      operatorVersion: "1",
      config: {
        orderBy: [
          {field: "score", direction: "desc", nulls: "last"},
          {field: "created_at", direction: "asc", nulls: "last"},
        ],
        limit: 25,
      },
    },
    {id: "output", type: "output", operatorVersion: "3", config: {fields: ["score", "created_at"]}},
  ];
  draft.specification.dag.edges = [
    {fromNode: "source", fromPort: "rows", toNode: "sort", toPort: "rows"},
    {fromNode: "sort", fromPort: "rows", toNode: "output", toPort: "rows"},
  ];
  const state = createEditorState(draft);
  const fields = deriveDirectInputFields(state, "sort");
  assert.deepEqual(fields.map(({name}) => name), ["score", "created_at"]);
  assert.deepEqual(deriveNodeOutputFields(state, "sort"), fields);
  assert.equal(validateSortConfig(state.nodes.find((node) => node.id === "sort").data.node.config, fields).length, 0);
  assert.equal(state.validation.some((error) => error.nodeId === "sort"), false);

  const defaultConfig = createSortConfig(fields);
  assert.deepEqual(defaultConfig, {orderBy: [{field: "score", direction: "asc", nulls: "last"}], limit: null});
  assert.equal(validateSortConfig({...defaultConfig, limit: 10_001}, fields)[0]?.code, "SORT_LIMIT_INVALID");
  assert.ok(validateSortConfig({
    orderBy: [
      {field: "score", direction: "asc", nulls: "last"},
      {field: "score", direction: "desc", nulls: "first"},
    ],
    limit: null,
  }, fields).some((error) => error.code === "SORT_FIELD_DUPLICATED"));
});

test("Aggregate derives predecessor fields and validates structured measures", () => {
  const draft = draftFixture();
  draft.specification.dag.nodes = [
    {
      id: "source",
      type: "source",
      operatorVersion: "1",
      outputSchema: {fields: [
        {name: "network", type: "string", nullable: false, unit: null},
        {name: "amount", type: "decimal", nullable: false, unit: "USD"},
        {name: "wallet", type: "address", nullable: false, unit: null},
      ]},
      config: {sourceKey: "existing-source"},
    },
    {
      id: "aggregate",
      type: "aggregate",
      operatorVersion: "2",
      config: {
        groupBy: ["network"],
        measures: [
          {name: "trade_count", op: "count_rows", field: null},
          {name: "volume", op: "sum", field: "amount"},
          {name: "wallet_count", op: "count_distinct", field: "wallet"},
        ],
      },
    },
    {id: "output", type: "output", operatorVersion: "3", config: {fields: ["network", "trade_count", "volume", "wallet_count"]}},
  ];
  draft.specification.dag.edges = [
    {fromNode: "source", fromPort: "rows", toNode: "aggregate", toPort: "rows"},
    {fromNode: "aggregate", fromPort: "rows", toNode: "output", toPort: "rows"},
  ];

  const state = createEditorState(draft);
  const fields = deriveDirectInputFields(state, "aggregate");
  const config = state.nodes.find((node) => node.id === "aggregate").data.node.config;
  assert.deepEqual(fields.map(({name}) => name), ["network", "amount", "wallet"]);
  assert.deepEqual(validateAggregateConfig(config, fields), []);
  assert.deepEqual(deriveNodeOutputFields(state, "aggregate").map(({name, type}) => [name, type]), [
    ["network", "string"],
    ["trade_count", "integer"],
    ["volume", "decimal"],
    ["wallet_count", "integer"],
  ]);
  assert.deepEqual(aggregateFieldsForOperation(fields, "sum").map(({name}) => name), ["amount"]);
  assert.equal(state.validation.some((error) => error.nodeId === "aggregate"), false);

  assert.ok(validateAggregateConfig({...config, measures: [{name: "bad", op: "sum", field: "missing"}]}, fields)
    .some((error) => error.code === "AGGREGATE_FIELD_UNKNOWN"));
  assert.ok(validateAggregateConfig({...config, measures: [{name: "bad", op: "sum", field: "network"}]}, fields)
    .some((error) => error.code === "AGGREGATE_FIELD_TYPE_INVALID"));
  assert.ok(validateAggregateConfig({...config, measures: [{name: "network", op: "count_rows", field: null}]}, fields)
    .some((error) => error.code === "AGGREGATE_OUTPUT_NAME_DUPLICATED"));
});

test("Aggregate migrates legacy measure shapes without stringifying objects", () => {
  assert.deepEqual(editableAggregateConfig({
    groupBy: ["network"],
    measures: {volume: {op: "sum", field: "amount"}},
  }), {
    groupBy: ["network"],
    measures: [{name: "volume", op: "sum", field: "amount"}],
  });
  assert.deepEqual(editableAggregateConfig({
    groupBy: [],
    measures: ["trade_count"],
  }), {
    groupBy: [],
    measures: [{name: "trade_count", op: "count_rows", field: null}],
  });
  assert.equal(createAggregateMeasure(["row_count"]).name, "row_count_2");

  const draft = draftFixture();
  draft.specification.dag.nodes = [
    {
      id: "source",
      type: "source",
      operatorVersion: "1",
      outputSchema: {fields: [{name: "amount", type: "decimal", nullable: false, unit: "USD"}]},
      config: {sourceKey: "existing-source"},
    },
    {
      id: "aggregate",
      type: "aggregate",
      operatorVersion: "1",
      config: {groupBy: [], measures: {volume: {op: "sum", field: "amount"}}},
    },
    {id: "output", type: "output", operatorVersion: "3", config: {fields: ["volume"]}},
  ];
  draft.specification.dag.edges = [
    {fromNode: "source", fromPort: "rows", toNode: "aggregate", toPort: "rows"},
    {fromNode: "aggregate", fromPort: "rows", toNode: "output", toPort: "rows"},
  ];
  const state = createEditorState(draft);
  assert.deepEqual(deriveNodeOutputFields(state, "aggregate").map(({name, type}) => [name, type]), [["volume", "decimal"]]);
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

test("operator inspectors use the shared token-colored scrollbar", async () => {
  const styles = await readFile(new URL("../src/features/workflow-editor/workflow-editor.css", import.meta.url), "utf8");
  assert.match(styles, /\.workflow-node-inspector \{[\s\S]*?scrollbar-width: thin;/);
  assert.match(styles, /\.workflow-node-inspector::\-webkit-scrollbar-thumb \{[\s\S]*?border-radius: 999px;/);
  assert.match(styles, /\.workflow-node-inspector::\-webkit-scrollbar-thumb:hover/);
  assert.match(styles, /\.workflow-node-inspector::\-webkit-scrollbar-button \{[\s\S]*?display: none;/);
});
