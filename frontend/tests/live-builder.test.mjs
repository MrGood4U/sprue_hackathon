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
          fieldBindings: [{requirementId: "amount", fieldPath: "amountUSD"}],
          outputSchema: {fields: [{name: "amount", type: "decimal", nullable: false, unit: "USD"}]},
          evidenceStatus: "suitable",
        }],
        nodes: [
          {id: "source__need_eth", type: "source", operatorVersion: "1", config: {sourceId: "candidate-eth"}},
          {id: "result", type: "output", operatorVersion: "2", config: {fields: ["amount"]}},
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
  assert.deepEqual(draft.specification.sources[0].fieldBindings, [{requirementId: "amount", fieldPath: "amountUSD"}]);
  assert.deepEqual(draft.specification.sources[0].outputSchema.fields.map(({name}) => name), ["amount", "data_network"]);
  assert.deepEqual(draft.specification.dag.nodes.map(({id}) => id), ["source__need_eth", "result"]);
  assert.deepEqual(draft.specification.outputSchema.fields.map(({name}) => name), ["amount"]);
  assert.deepEqual(draft.referenceResult, []);
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
          {id: "map", type: "map", operatorVersion: "2", config: {mode: "extend", fields: []}},
          {id: "aggregate", type: "aggregate", operatorVersion: "2", config: {groupBy: ["category_code"], measures: [{name: "total", op: "sum", field: "metric_value"}]}},
          {id: "output", type: "output", operatorVersion: "2", config: {fields: ["category_code", "total"], orderBy: []}},
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
    ["observed_at", "timestamp"],
    ["category_code", "string"],
    ["metric_value", "decimal"],
    ["data_network", "string"],
  ]);
  assert.deepEqual(draft.specification.dag.nodes[0].outputSchema.fields, sourceFields);

  const editor = createEditorState(draft);
  assert.deepEqual(deriveFilterInputFields(editor, "filter").map(({name}) => name), [
    "observed_at",
    "category_code",
    "metric_value",
    "data_network",
  ]);
  assert.equal(editor.validation.some((issue) => issue.nodeId === "filter" && issue.code === "FILTER_INPUT_SCHEMA"), false);
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
