import assert from "node:assert/strict";
import test from "node:test";
import {builderCompileInputSchema} from "../src/http/control/builder-compile.controller.js";

const source = {
  id: "graph:source",
  displayName: "Graph source",
  logicalSubgraphId: null,
  manifestIpfsCid: "QmSource",
  dataNetwork: "ethereum",
  queryEntity: "swaps",
  fieldBindings: [],
  auxiliaryFieldBindings: [],
};

function inputWithAggregation(aggregation: null | {sourceEntity: string; interval: "hour" | "day"}) {
  return {
    schemaVersion: 1,
    sources: [{
      ...source,
      queryPlan: {
        schemaVersion: 1,
        operationName: "SprueLiveSource",
        document: "query SprueLiveSource($first:Int!,$cursor:ID!){swaps(first:$first,orderBy:id,orderDirection:asc,where:{id_gt:$cursor}){id}}",
        pagination: {kind: "id_cursor", cursorField: "id", pageSize: 1_000, maxRequests: 10, maxRows: 10_000},
        runtimeWindow: null,
        aggregation,
        pushedOperations: [],
      },
    }],
    dag: {nodes: [], edges: []},
    outputSchema: {fields: []},
  };
}

test("Builder transport accepts raw and formal-aggregate Graph query plans", () => {
  assert.equal(builderCompileInputSchema.safeParse(inputWithAggregation(null)).success, true);
  assert.equal(builderCompileInputSchema.safeParse(inputWithAggregation({sourceEntity: "SwapData", interval: "day"})).success, true);
});

test("Builder transport rejects an unsupported aggregate interval", () => {
  const input = inputWithAggregation(null);
  input.sources[0]!.queryPlan.aggregation = {sourceEntity: "SwapData", interval: "week" as "day"};
  assert.equal(builderCompileInputSchema.safeParse(input).success, false);
});
