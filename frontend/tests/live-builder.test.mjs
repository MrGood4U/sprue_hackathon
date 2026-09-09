import assert from "node:assert/strict";
import test from "node:test";
import {
  builderDraftCacheKey,
  cacheBuilderDraft,
  projectAgentBuilderDraft,
  readCachedBuilderDraft,
} from "../src/features/builder/liveBuilderProjection.js";
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
  assert.deepEqual(draft.specification.dag.nodes.map(({id}) => id), ["source__need_eth", "result"]);
  assert.deepEqual(draft.specification.outputSchema.fields.map(({name}) => name), ["amount"]);
  assert.deepEqual(draft.referenceResult, []);
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
