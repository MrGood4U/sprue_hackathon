import assert from "node:assert/strict";
import test from "node:test";
import {
  builderDraftCacheKey,
  cacheBuilderDraft,
  projectAgentBuilderDraft,
  readCachedBuilderDraft,
} from "../src/features/builder/liveBuilderProjection.js";
import {createEditorState} from "../src/features/workflow-editor/editorReducer.js";
import {deriveFilterInputFields} from "../src/features/workflow-editor/filterModel.js";
import {productRefFromPath} from "../src/features/products/productRoute.js";
import {createProductCache} from "../src/features/products/productCache.js";
import {createBuilderCompilationInput} from "../src/features/builder/builderCompilation.js";
import {migrateLegacyBuilderDraft} from "../src/features/builder/legacyBuilderMigration.js";

const product = {id: "product-1", slug: "live-product", originalIntent: "Stored intent"};

test("projects the latest durable Agent proposal into an editable non-executable draft", () => {
  const draft = projectAgentBuilderDraft(product, [
    {id: "user-1", role: "user", contentText: "Compare swaps across two networks"},
    {id: "assistant-1", role: "assistant", contentJson: {
      kind: "proposal",
      intentSummary: "Compare swaps",
      builderDraft: {
        schemaVersion: 1,
        status: "requires_source_admission",
        sources: [{
          id: "candidate-eth",
          sourceNeedId: "need-eth",
          candidateRef: "candidate-eth",
          dataNetwork: "eip155:1",
          displayName: "Ethereum swaps",
          logicalSubgraphId: "subgraph-eth",
          manifestIpfsCid: "QmEth",
          queryEntity: "swaps",
          queryPlan: {
            schemaVersion: 1,
            operationName: "SprueLiveSource",
            document: "query SprueLiveSource($first: Int!, $cursor: ID!) { swaps(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id amountUSD } }",
            pagination: {kind: "id_cursor", cursorField: "id", pageSize: 500, maxRequests: 20, maxRows: 10000},
            pushedOperations: [{nodeRole: "normalize", operator: "map", description: "Project amount."}],
          },
          fieldBindings: [{requirementId: "amount", fieldPath: "amountUSD"}],
          outputSchema: {fields: [{name: "amount", type: "decimal", nullable: false, unit: "USD"}]},
          evidenceStatus: "suitable",
        }],
        nodes: [
          {id: "source__need_eth", type: "source", operatorVersion: "1", config: {sourceId: "candidate-eth"}},
          {id: "result", type: "output", operatorVersion: "3", config: {fields: ["amount"]}},
        ],
        edges: [{fromNode: "source__need_eth", fromPort: "rows", toNode: "result", toPort: "rows"}],
        outputSchema: {fields: [{name: "amount", type: "decimal", nullable: false, unit: "USD"}]},
        refreshPolicy: {mode: "manual", timezone: "UTC"},
      },
    }},
  ]);

  assert.equal(draft.origin.kind, "agent");
  assert.equal(draft.origin.originKey, "assistant-1");
  assert.equal(draft.specification.intent.summary, "Compare swaps across two networks");
  assert.equal(draft.specification.sources[0].queryEntity, "swaps");
  assert.match(draft.specification.sources[0].queryPlan.document, /query SprueLiveSource/);
  assert.deepEqual(draft.specification.sources[0].fieldBindings, [{requirementId: "amount", fieldPath: "amountUSD"}]);
  assert.deepEqual(draft.specification.sources[0].outputSchema.fields.map(({name}) => name), ["amountUSD", "data_network"]);
  const boundaryMap = draft.specification.dag.nodes.find((node) => node.type === "map");
  assert.deepEqual(boundaryMap.config, {mode: "project", fields: [{
    name: "amount",
    expression: {op: "field", field: "amountUSD"},
    unit: "USD",
  }]});
  assert.ok(draft.specification.dag.edges.some((edge) => edge.fromNode === "source__need_eth" && edge.toNode === boundaryMap.id));
  assert.ok(draft.specification.dag.edges.some((edge) => edge.fromNode === boundaryMap.id && edge.toNode === "result"));
  assert.deepEqual(draft.specification.outputSchema.fields.map(({name}) => name), ["amount"]);
  assert.deepEqual(draft.referenceResult, []);
});

test("migrates legacy Output ordering into one explicit Sort predecessor", () => {
  const draft = projectAgentBuilderDraft(product, [
    {id: "user-output-order", role: "user", contentText: "Publish ordered records"},
    {id: "assistant-output-order", role: "assistant", contentJson: {
      kind: "proposal",
      builderDraft: {
        schemaVersion: 1,
        status: "requires_source_admission",
        sources: [{
          id: "candidate-order",
          dataNetwork: "eip155:1",
          displayName: "Ordered source",
          logicalSubgraphId: "subgraph-order",
          manifestIpfsCid: "QmOrder",
          queryEntity: "records",
          fieldBindings: [{requirementId: "amount", fieldPath: "amountUSD"}],
          auxiliaryFieldBindings: [],
          outputSchema: {fields: [{name: "amountUSD", type: "decimal", nullable: false, unit: "USD"}]},
          evidenceStatus: "suitable",
        }],
        nodes: [
          {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "candidate-order"}},
          {id: "normalize", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
            {name: "amount", expression: {op: "field", field: "amountUSD"}},
          ]}},
          {id: "result", type: "output", operatorVersion: "2", config: {
            fields: ["amount"],
            orderBy: [{field: "amount", direction: "desc"}],
          }},
        ],
        edges: [
          {fromNode: "source", fromPort: "rows", toNode: "normalize", toPort: "rows"},
          {fromNode: "normalize", fromPort: "rows", toNode: "result", toPort: "crossChain"},
        ],
        outputSchema: {fields: [{name: "amount", type: "decimal", nullable: false, unit: "USD"}]},
        refreshPolicy: {mode: "manual", timezone: "UTC"},
      },
    }},
  ]);

  const output = draft.specification.dag.nodes.find((node) => node.id === "result");
  const sort = draft.specification.dag.nodes.find((node) => node.type === "sort");
  assert.equal(output.operatorVersion, "3");
  assert.deepEqual(output.config, {fields: ["amount"]});
  assert.equal(draft.specification.dag.nodes.find((node) => node.id === "normalize").config.fields[0].unit, "USD");
  assert.deepEqual(sort.config, {orderBy: [{field: "amount", direction: "desc", nulls: "last"}], limit: null});
  assert.ok(draft.specification.dag.edges.some((edge) => edge.fromNode === "normalize" && edge.toNode === sort.id && edge.toPort === "rows"));
  assert.ok(draft.specification.dag.edges.some((edge) => edge.fromNode === sort.id && edge.toNode === "result" && edge.toPort === "rows"));
  assert.deepEqual(
    createEditorState(draft).validation.filter((issue) => issue.nodeId === sort.id || issue.nodeId === "result"),
    [],
  );
});

test("restores legacy Map units through aggregate and union lineage without naming assumptions", () => {
  const branch = (suffix) => [
    {id: `source_${suffix}`, type: "source", operatorVersion: "1", config: {sourceId: suffix}},
    {id: `map_${suffix}`, type: "map", operatorVersion: "2", config: {mode: "project", fields: [
      {name: "reading", expression: {op: "field", field: "provider_value"}},
    ]}},
    {id: `aggregate_${suffix}`, type: "aggregate", operatorVersion: "2", config: {
      groupBy: [],
      measures: [{name: "total_reading", op: "sum", field: "reading"}],
    }},
  ];
  const nodes = [
    ...branch("left"),
    ...branch("right"),
    {id: "combined", type: "union", operatorVersion: "2", config: {mode: "append_compatible_rows", sourceDiscriminator: null}},
    {id: "result", type: "output", operatorVersion: "3", config: {fields: ["total_reading"]}},
  ];
  const edges = [
    {fromNode: "source_left", fromPort: "rows", toNode: "map_left", toPort: "rows"},
    {fromNode: "map_left", fromPort: "rows", toNode: "aggregate_left", toPort: "rows"},
    {fromNode: "aggregate_left", fromPort: "rows", toNode: "combined", toPort: "left"},
    {fromNode: "source_right", fromPort: "rows", toNode: "map_right", toPort: "rows"},
    {fromNode: "map_right", fromPort: "rows", toNode: "aggregate_right", toPort: "rows"},
    {fromNode: "aggregate_right", fromPort: "rows", toNode: "combined", toPort: "right"},
    {fromNode: "combined", fromPort: "rows", toNode: "result", toPort: "rows"},
  ];

  const migrated = migrateLegacyBuilderDraft(nodes, edges, [{name: "total_reading", unit: "kWh"}]);
  assert.deepEqual(
    migrated.nodes.filter((node) => node.type === "map").map((node) => node.config.fields[0].unit),
    ["kWh", "kWh"],
  );
});

test("recovers predecessor fields for historical Agent drafts that predate source output schemas", () => {
  const fieldBindings = [
    {requirementId: "observed_at", fieldPath: "record.when"},
    {requirementId: "category_code", fieldPath: "record.kind"},
    {requirementId: "metric_value", fieldPath: "record.measure"},
  ];
  const draft = projectAgentBuilderDraft(product, [
    {id: "user-legacy", role: "user", contentText: "Summarize historical records"},
    {id: "assistant-legacy", role: "assistant", contentJson: {
      kind: "proposal",
      builderDraft: {
        schemaVersion: 1,
        status: "requires_source_admission",
        sources: [{
          id: "candidate-legacy",
          dataNetwork: "eip155:1",
          displayName: "Historical source",
          logicalSubgraphId: "subgraph-legacy",
          manifestIpfsCid: "QmLegacy",
          queryEntity: "records",
          fieldBindings,
          auxiliaryFieldBindings: [],
          evidenceStatus: "suitable",
        }],
        nodes: [
          {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "candidate-legacy", fieldBindings}},
          {id: "filter", type: "filter", operatorVersion: "2", config: {expression: {op: "and", inputs: [
            {op: "eq", inputs: [{op: "field", field: "category_code"}, {op: "literal", value: "included", valueType: "string"}]},
            {op: "gte", inputs: [{op: "utc_date", inputs: [{op: "field", field: "observed_at"}]}, {op: "literal", value: "2026-01-01", valueType: "date"}]},
          ]}}},
          {id: "map", type: "map", operatorVersion: "2", config: {mode: "extend", fields: [{
            name: "observed_date",
            expression: {op: "utc_date", inputs: [{op: "field", field: "observed_at"}]},
          }]}},
          {id: "aggregate", type: "aggregate", operatorVersion: "2", config: {groupBy: ["category_code"], measures: [{name: "total", op: "sum", field: "metric_value"}]}},
          {id: "output", type: "output", operatorVersion: "3", config: {fields: ["category_code", "total"]}},
        ],
        edges: [
          {fromNode: "source", fromPort: "rows", toNode: "filter", toPort: "rows"},
          {fromNode: "filter", fromPort: "rows", toNode: "map", toPort: "rows"},
          {fromNode: "map", fromPort: "rows", toNode: "aggregate", toPort: "rows"},
          {fromNode: "aggregate", fromPort: "rows", toNode: "output", toPort: "rows"},
        ],
        outputSchema: {fields: [{name: "category_code", type: "string", nullable: false, unit: null}, {name: "total", type: "decimal", nullable: false, unit: null}]},
        refreshPolicy: {mode: "manual", timezone: "UTC"},
      },
    }},
  ]);

  const sourceFields = draft.specification.sources[0].outputSchema.fields;
  assert.deepEqual(sourceFields.map(({name, type}) => [name, type]), [
    ["record.when", "timestamp"],
    ["record.kind", "string"],
    ["record.measure", "decimal"],
    ["data_network", "string"],
  ]);
  assert.deepEqual(draft.specification.dag.nodes[0].outputSchema.fields, sourceFields);

  const editor = createEditorState(draft);
  assert.equal(editor.nodes.find((node) => node.id === "map").data.node.config.mode, "project");
  assert.deepEqual(
    editor.nodes.find((node) => node.id === "map").data.node.config.fields.map((field) => field.name),
    ["observed_at", "category_code", "metric_value", "observed_date"],
  );
  assert.deepEqual(
    editor.nodes.find((node) => node.id === "map").data.node.config.fields.slice(0, 3).map((field) => field.expression.field),
    ["record.when", "record.kind", "record.measure"],
  );
  assert.deepEqual(deriveFilterInputFields(editor, "filter").map(({name}) => name), [
    "observed_at",
    "category_code",
    "metric_value",
    "observed_date",
  ]);
  assert.deepEqual(editor.nodes.find((node) => node.id === "filter").data.node.config, {
    predicate: {
      combinator: "and",
      conditions: [
        {field: "category_code", operator: "eq", value: "included"},
        {field: "observed_date", operator: "gte", value: "2026-01-01"},
      ],
    },
  });
  assert.equal(editor.edges.some((edge) => edge.source === "source" && edge.target === "map"), true);
  assert.equal(editor.edges.some((edge) => edge.source === "map" && edge.target === "filter"), true);
  assert.equal(editor.edges.some((edge) => edge.source === "filter" && edge.target === "aggregate"), true);
  assert.equal(editor.validation.some((issue) => issue.nodeId === "filter" && issue.code === "FILTER_INPUT_SCHEMA"), false);
});

test("migrates nested legacy Filter expressions without protocol or asset assumptions", () => {
  const pairMatch = {op: "or", inputs: [
    {op: "and", inputs: [
      {op: "eq", inputs: [{op: "field", field: "left_symbol"}, {op: "literal", value: "AAA", valueType: "string"}]},
      {op: "eq", inputs: [{op: "field", field: "right_symbol"}, {op: "literal", value: "BBB", valueType: "string"}]},
    ]},
    {op: "and", inputs: [
      {op: "eq", inputs: [{op: "field", field: "left_symbol"}, {op: "literal", value: "BBB", valueType: "string"}]},
      {op: "eq", inputs: [{op: "field", field: "right_symbol"}, {op: "literal", value: "AAA", valueType: "string"}]},
    ]},
  ]};
  const draft = projectAgentBuilderDraft(product, [
    {id: "user-pair", role: "user", contentText: "Compare a pair"},
    {id: "assistant-pair", role: "assistant", contentJson: {
      kind: "proposal",
      builderDraft: {
        schemaVersion: 1,
        status: "requires_source_admission",
        sources: [{
          id: "candidate-pair",
          dataNetwork: "eip155:1",
          displayName: "Pair source",
          logicalSubgraphId: "subgraph-pair",
          manifestIpfsCid: "QmPair",
          queryEntity: "events",
          fieldBindings: [
            {requirementId: "left_symbol", fieldPath: "asset0.symbol"},
            {requirementId: "right_symbol", fieldPath: "asset1.symbol"},
            {requirementId: "observed_at", fieldPath: "timestamp"},
          ],
          auxiliaryFieldBindings: [],
          evidenceStatus: "suitable",
        }],
        nodes: [
          {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "candidate-pair"}},
          {id: "pair_filter", type: "filter", operatorVersion: "2", config: {expression: {op: "and", inputs: [
            pairMatch,
            {op: "gte", inputs: [
              {op: "utc_date", inputs: [{op: "field", field: "observed_at"}]},
              {op: "literal", value: "2026-01-01", valueType: "date"},
            ]},
          ]}}},
          {id: "normalize", type: "map", operatorVersion: "2", config: {mode: "extend", fields: [{
            name: "observed_date",
            expression: {op: "utc_date", inputs: [{op: "field", field: "observed_at"}]},
          }]}},
          {id: "output", type: "output", operatorVersion: "3", config: {fields: ["observed_date"]}},
        ],
        edges: [
          {fromNode: "source", fromPort: "rows", toNode: "pair_filter", toPort: "rows"},
          {fromNode: "pair_filter", fromPort: "rows", toNode: "normalize", toPort: "rows"},
          {fromNode: "normalize", fromPort: "rows", toNode: "output", toPort: "rows"},
        ],
        outputSchema: {fields: [{name: "observed_date", type: "date", nullable: false, unit: null}]},
        refreshPolicy: {mode: "manual", timezone: "UTC"},
      },
    }},
  ]);

  const filter = draft.specification.dag.nodes.find((node) => node.id === "pair_filter");
  const map = draft.specification.dag.nodes.find((node) => node.id === "normalize");
  assert.equal("expression" in filter.config, false);
  assert.deepEqual(filter.config.predicate.conditions, [
    {field: "pair_filter_match", operator: "eq", value: true},
    {field: "observed_date", operator: "gte", value: "2026-01-01"},
  ]);
  assert.deepEqual(map.config.fields.find((field) => field.name === "pair_filter_match").expression, {
    ...pairMatch,
    inputs: pairMatch.inputs.map((branch) => ({
      ...branch,
      inputs: branch.inputs.map((comparison) => ({
        ...comparison,
        inputs: [
          {...comparison.inputs[0], field: comparison.inputs[0].field === "left_symbol" ? "asset0.symbol" : "asset1.symbol"},
          comparison.inputs[1],
        ],
      })),
    })),
  });
  assert.equal(JSON.stringify(draft).includes("WETH"), false);
  assert.equal(JSON.stringify(draft).includes("USDC"), false);
  assert.equal(createEditorState(draft).validation.length, 0);
});

test("uses an empty manual draft after a failed Agent run instead of demo data", () => {
  const draft = projectAgentBuilderDraft(product, [
    {id: "user-2", role: "user", contentText: "Latest intent"},
    {id: "assistant-2", role: "assistant", contentJson: {kind: "error", code: "AGENT_MODEL_REQUEST_FAILED"}},
  ]);
  assert.equal(draft.origin.kind, "manual");
  assert.equal(draft.origin.resultKind, "error");
  assert.equal(draft.specification.intent.summary, "Latest intent");
  assert.deepEqual(draft.specification.sources, []);
  assert.deepEqual(draft.specification.dag, {nodes: [], edges: []});
});

test("keeps browser-session edits only for the same Agent result", () => {
  const records = new Map();
  const storage = {getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value)};
  const draft = projectAgentBuilderDraft(product, []);
  cacheBuilderDraft(storage, "workspace-1", product.id, draft);
  assert.equal(records.has(builderDraftCacheKey("workspace-1", product.id)), true);
  assert.deepEqual(readCachedBuilderDraft(storage, "workspace-1", product.id, draft.origin.originKey), draft);
  assert.equal(readCachedBuilderDraft(storage, "workspace-1", product.id, "new-agent-result"), null);
});

test("adds the default Source limit when loading a legacy browser-session draft", () => {
  const records = new Map();
  const storage = {getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value)};
  const draft = {
    origin: {kind: "agent", originKey: "agent-result"},
    specification: {
      sources: [],
      dag: {nodes: [
        {id: "defaulted", type: "source", operatorVersion: "1", config: {sourceId: "graph-defaulted"}},
        {id: "custom", type: "source", operatorVersion: "1", config: {sourceId: "graph-custom", limit: 250}},
      ], edges: []},
      outputSchema: {fields: []},
    },
  };
  cacheBuilderDraft(storage, "workspace-1", product.id, draft);

  const restored = readCachedBuilderDraft(storage, "workspace-1", product.id, draft.origin.originKey);
  assert.equal(restored.specification.dag.nodes[0].config.limit, 1_000);
  assert.equal(restored.specification.dag.nodes[1].config.limit, 250);
});

test("preserves the same product reference across all four product tabs", () => {
  for (const section of ["agent", "build", "api", "monetize"]) {
    assert.equal(productRefFromPath(`/app/products/live-product/${section}`), "live-product");
  }
});

test("preserves the resolved product name across tabs without exposing another workspace", () => {
  const cache = createProductCache();
  const workspaceId = "workspace-1";
  const product = {id: "product-1", slug: "live-product", name: "Live product"};

  cache.remember(workspaceId, product);
  assert.equal(cache.read(workspaceId, product.id)?.name, "Live product");
  assert.equal(cache.read(workspaceId, product.slug)?.name, "Live product");
  assert.equal(cache.read("workspace-2", product.slug), null);

  const renamed = {...product, name: "Renamed product"};
  cache.remember(workspaceId, renamed);
  assert.equal(cache.read(workspaceId, product.slug)?.name, "Renamed product");

  cache.forget(workspaceId, renamed);
  assert.equal(cache.read(workspaceId, product.slug), null);
});

test("serializes only the layout-free structured DAG for backend compilation", () => {
  const input = createBuilderCompilationInput({specification: {
    sources: [{
      id: "graph:source",
      displayName: "Verified source",
      target: {logicalSubgraphId: "source-id", manifestIpfsCid: "QmSource"},
      dataNetwork: "eip155:1",
      queryEntity: "swaps",
      fieldBindings: [],
      auxiliaryFieldBindings: [],
    }],
    dag: {
      nodes: [{
        id: "source_rows",
        type: "source",
        operatorVersion: "1",
        position: {x: 120, y: 40},
        config: {sourceId: "graph:source"},
        outputSchema: {fields: [{
          name: "amountUSD",
          type: "decimal",
          nullable: false,
          unit: "USD",
          origin: {provider: "graph"},
        }]},
      }],
      edges: [{
        id: "visible-edge",
        fromNode: "source_rows",
        fromPort: "rows",
        toNode: "normalize_rows",
        toPort: "rows",
        animated: true,
      }],
    },
    outputSchema: {fields: [{name: "amount_usd", type: "decimal", nullable: false, unit: "USD", label: "Volume"}]},
  }});

  assert.deepEqual(input, {
    schemaVersion: 1,
    sources: [{
      id: "graph:source",
      displayName: "Verified source",
      logicalSubgraphId: "source-id",
      manifestIpfsCid: "QmSource",
      dataNetwork: "eip155:1",
      queryEntity: "swaps",
      fieldBindings: [],
      auxiliaryFieldBindings: [],
    }],
    dag: {
      nodes: [{
        id: "source_rows",
        type: "source",
        operatorVersion: "1",
        config: {sourceId: "graph:source"},
        outputSchema: {fields: [{name: "amountUSD", type: "decimal", nullable: false, unit: "USD"}]},
      }],
      edges: [{fromNode: "source_rows", fromPort: "rows", toNode: "normalize_rows", toPort: "rows"}],
    },
    outputSchema: {fields: [{name: "amount_usd", type: "decimal", nullable: false, unit: "USD"}]},
  });
});

test("preserves an Agent-authored source query plan in backend compilation input", () => {
  const queryPlan = {
    schemaVersion: 1,
    operationName: "SprueLiveSource",
    document: "query SprueLiveSource($first: Int!, $cursor: ID!) { swaps(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id amountUSD } }",
    pagination: {kind: "id_cursor", cursorField: "id", pageSize: 500, maxRequests: 20, maxRows: 10_000},
    pushedOperations: [{nodeRole: "normalize", operator: "map", description: "Project amount."}],
  };
  const input = createBuilderCompilationInput({specification: {
    sources: [{
      id: "graph:source",
      displayName: "Verified source",
      target: {logicalSubgraphId: "source-id", manifestIpfsCid: "QmSource"},
      dataNetwork: "eip155:1",
      queryEntity: "swaps",
      queryPlan,
      fieldBindings: [],
      auxiliaryFieldBindings: [],
    }],
    dag: {nodes: [], edges: []},
    outputSchema: {fields: []},
  }});

  assert.deepEqual(input.sources[0].queryPlan, queryPlan);
  assert.notEqual(input.sources[0].queryPlan, queryPlan);
});
