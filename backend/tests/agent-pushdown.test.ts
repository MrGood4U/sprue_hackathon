import assert from "node:assert/strict";
import test from "node:test";
import type {AgentBuilderDraft} from "../src/modules/agent/contracts.js";
import {matchesCompleteFilterPushdown} from "../src/modules/agent/pushdown-equivalence.js";
import {residualizeAgentPushdowns} from "../src/modules/agent/pushdown.js";

function draft(residualField = true): AgentBuilderDraft {
  const queryPlan = {
    schemaVersion: 1 as const,
    operationName: "SprueLiveSource" as const,
    document: "query SprueLiveSource($first: Int!, $cursor: ID!) { rows(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, rawAmount_gt: \"0\" }) { id rawAmount rawKind } }",
    pagination: {kind: "id_cursor" as const, cursorField: "id" as const, pageSize: 100, maxRequests: 5, maxRows: 500},
    pushedOperations: [
      {nodeRole: "normalize", operator: "map" as const, description: "Move direct provider bindings into Source."},
      {nodeRole: "positive", operator: "filter" as const, description: "Apply the complete stable predicate in GraphQL."},
    ],
  };
  return {
    schemaVersion: 1,
    status: "requires_source_admission",
    sources: [{
      id: "graph:rows",
      sourceNeedId: "rows",
      candidateRef: "graph:rows:00000000000000000000",
      dataNetwork: "eip155:1",
      displayName: "Rows",
      logicalSubgraphId: "rows",
      manifestIpfsCid: "QmRows",
      queryEntity: "rows",
      fieldBindings: [
        {requirementId: "amount", fieldPath: "rawAmount"},
        {requirementId: "kind", fieldPath: "rawKind"},
      ],
      auxiliaryFieldBindings: [],
      queryPlan,
      outputSchema: {fields: [
        {name: "rawAmount", type: "decimal", nullable: false, unit: null},
        {name: "rawKind", type: "string", nullable: false, unit: null},
        {name: "data_network", type: "string", nullable: false, unit: null},
      ]},
      evidenceStatus: "suitable",
    }],
    nodes: [
      {id: "source__rows", type: "source", operatorVersion: "1", config: {sourceId: "graph:rows", queryPlan}, outputSchema: {fields: [
        {name: "rawAmount", type: "decimal", nullable: false, unit: null},
        {name: "rawKind", type: "string", nullable: false, unit: null},
        {name: "data_network", type: "string", nullable: false, unit: null},
      ]}},
      {id: "normalize", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
        {name: "amount", expression: {op: "field", field: "rawAmount"}, unit: "USD"},
        {name: "kind", expression: {op: "field", field: "rawKind"}, unit: null},
        ...(residualField ? [{name: "network", expression: {op: "field", field: "data_network"}, unit: null}] : []),
      ]}},
      {id: "positive", type: "filter", operatorVersion: "2", config: {predicate: {combinator: "and", conditions: [
        {field: "amount", operator: "gt", value: "0"},
      ]}}},
      {id: "output", type: "output", operatorVersion: "3", config: {fields: residualField ? ["amount", "network"] : ["amount"]}},
    ],
    edges: [
      {fromNode: "source__rows", fromPort: "rows", toNode: "normalize", toPort: "rows"},
      {fromNode: "normalize", fromPort: "rows", toNode: "positive", toPort: "rows"},
      {fromNode: "positive", fromPort: "rows", toNode: "output", toPort: "rows"},
    ],
    outputSchema: {fields: residualField
      ? [{name: "amount", type: "decimal", nullable: false, unit: "USD"}, {name: "network", type: "string", nullable: false, unit: null}]
      : [{name: "amount", type: "decimal", nullable: false, unit: "USD"}]},
    refreshPolicy: {mode: "manual", timezone: "UTC"},
  };
}

test("Agent pushdown leaves only residual Map work and removes a fully pushed Filter", () => {
  const result = residualizeAgentPushdowns(draft());

  assert.deepEqual(result.sources[0]!.outputSchema.fields.map((field) => [field.name, field.unit]), [
    ["amount", "USD"], ["kind", null], ["data_network", null],
  ]);
  const map = result.nodes.find((node) => node.id === "normalize");
  assert.deepEqual(map?.config, {mode: "extend", fields: [
    {name: "network", expression: {op: "field", field: "data_network"}, unit: null},
  ]});
  assert.equal(result.nodes.some((node) => node.id === "positive"), false);
  assert.equal(result.edges.some((edge) => edge.fromNode === "normalize" && edge.toNode === "output"), true);
});

test("Agent pushdown removes a Map whose complete work moved into Source", () => {
  const result = residualizeAgentPushdowns(draft(false));

  assert.equal(result.nodes.some((node) => node.id === "normalize"), false);
  assert.equal(result.nodes.some((node) => node.id === "positive"), false);
  assert.deepEqual(result.edges, [{fromNode: "source__rows", fromPort: "rows", toNode: "output", toPort: "rows"}]);
});

test("Filter pushdown requires exact predicate equivalence through direct Map bindings", () => {
  const map = {mode: "project", fields: [
    {name: "amount", expression: {op: "field", field: "rawAmount"}, unit: "USD"},
    {name: "kind", expression: {op: "field", field: "rawKind"}, unit: null},
  ]};
  const filter = {predicate: {combinator: "and", conditions: [
    {field: "amount", operator: "between", values: ["10", "20"]},
    {field: "kind", operator: "in", values: ["swap", "mint"]},
  ]}};
  const exact = "query SprueLiveSource($first: Int!, $cursor: ID!) { rows(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, rawKind_in: [\"swap\", \"mint\"], rawAmount_lte: \"20\", rawAmount_gte: \"10\" }) { id rawAmount rawKind } }";
  const partial = "query SprueLiveSource($first: Int!, $cursor: ID!) { rows(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, rawAmount_gte: \"10\" }) { id rawAmount rawKind } }";

  assert.equal(matchesCompleteFilterPushdown(exact, filter, map), true);
  assert.equal(matchesCompleteFilterPushdown(partial, filter, map), false);
});

test("Filter pushdown accepts an equivalent GraphQL or-list and rejects transformed fields", () => {
  const directMap = {mode: "project", fields: [
    {name: "kind", expression: {op: "field", field: "rawKind"}, unit: null},
  ]};
  const derivedMap = {mode: "project", fields: [
    {name: "kind", expression: {op: "lower", inputs: [{op: "field", field: "rawKind"}]}, unit: null},
  ]};
  const filter = {predicate: {combinator: "or", conditions: [
    {field: "kind", operator: "eq", value: "swap"},
    {field: "kind", operator: "eq", value: "mint"},
  ]}};
  const document = "query SprueLiveSource($first: Int!, $cursor: ID!) { rows(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, or: [{ rawKind: \"mint\" }, { rawKind: \"swap\" }] }) { id rawKind } }";

  assert.equal(matchesCompleteFilterPushdown(document, filter, directMap), true);
  assert.equal(matchesCompleteFilterPushdown(document, filter, derivedMap), false);
});
