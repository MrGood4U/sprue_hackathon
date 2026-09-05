import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDemoDraft, activityFixture, outputSchema } from "../src/services/demo/fixtures/builder.js";
import { apiResponse, consumerResponse } from "../src/services/demo/fixtures/responses.js";
import { projectGraph } from "../src/features/builder/graphView.js";

const edge = (fromNode, toNode) => ({ fromNode, fromPort: "rows", toNode, toPort: "rows" });

// Test-only evaluator for this finite fixture, independent of its expected-output oracle.
// This is not a production registry, generic interpreter or evidence of backend execution.
function evaluate(expression, row) {
  const args = () => expression.args.map((arg) => evaluate(arg, row));
  switch (expression.op) {
    case "field": return row[expression.path[0]];
    case "literal": return expression.value;
    case "utc_date": return args()[0].slice(0, 10);
    case "gte": { const [a, b] = args(); return BigInt(a) >= BigInt(b); }
    case "if": { const [condition, yes, no] = args(); return condition ? yes : no; }
    case "safe_divide": {
      const [a, b] = args().map(BigInt);
      if (b === 0n) return null;
      assert.equal(expression.scale, 6);
      assert.equal(expression.rounding, "half_even");
      const scaled = a * 1000000n;
      let quotient = scaled / b;
      const remainder = scaled % b;
      if (remainder * 2n > b || (remainder * 2n === b && quotient % 2n !== 0n)) quotient += 1n;
      return `${quotient / 1000000n}.${String(quotient % 1000000n).padStart(6, "0")}`;
    }
    default: throw new Error(`Unsupported test expression: ${expression.op}`);
  }
}
function evaluateFixture(dag, input) {
  const nodes = projectGraph(dag).nodes.sort((a, b) => a.x - b.x);
  const values = new Map();
  for (const node of nodes) {
    const inputs = dag.edges.filter((item) => item.toNode === node.id);
    const rows = node.type === "source" ? input : values.get(inputs[0].fromNode);
    assert.equal(inputs.length, node.type === "source" ? 0 : 1);
    if (node.type === "source" || node.type === "output") values.set(node.id, rows);
    else if (node.type === "map") values.set(node.id, rows.map((row) => Object.fromEntries(Object.entries(node.config.fields).map(([key, expr]) => [key, evaluate(expr, row)]))));
    else if (node.type === "aggregate") {
      const groups = new Map();
      for (const row of rows) {
        const key = JSON.stringify(node.config.groupBy.map((field) => row[field]));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      values.set(node.id, [...groups.values()].map((group) => {
        const result = Object.fromEntries(node.config.groupBy.map((field) => [field, group[0][field]]));
        for (const [name, measure] of Object.entries(node.config.measures)) {
          if (measure.op === "count_rows") result[name] = String(group.length);
          else if (measure.op === "count_distinct") result[name] = String(new Set(group.map((row) => row[measure.field])).size);
          else if (measure.op === "sum") result[name] = String(group.reduce((sum, row) => sum + BigInt(row[measure.field]), 0n));
          else throw new Error("Unsupported test measure");
        }
        return result;
      }));
    } else throw new Error("Unsupported test operator");
  }
  return values.get("result");
}

test("sample expansion has seven stable nodes, six real edges and only scoped operator types", () => {
  const draft = createDemoDraft();
  assert.equal(draft.specification.dag.nodes.length, 7);
  assert.equal(draft.specification.dag.edges.length, 6);
  for (const node of draft.specification.dag.nodes) assert.ok(["source", "filter", "map", "aggregate", "output"].includes(node.type));
  assert.equal(draft.specification.groups, undefined);
});
test("fixture composition keeps one-day wallets in the denominator and counts distinct days", () => {
  const draft = createDemoDraft();
  assert.deepEqual(evaluateFixture(draft.specification.dag, activityFixture), draft.referenceResult);
  assert.equal(draft.referenceResult[0].activeWallets, "2");
  assert.equal(draft.referenceResult[0].repeatShare, "0.500000");
});
test("threshold changes recompile config and output without mutating the previous draft", () => {
  const first = createDemoDraft();
  const before = JSON.stringify(first);
  const next = createDemoDraft({ windowDays: 7, minimumActiveDays: 3 });
  assert.deepEqual(next.specification.dag.nodes.map((node) => node.id), first.specification.dag.nodes.map((node) => node.id));
  assert.equal(next.specification.dag.nodes[0].config.window.days, 7);
  assert.deepEqual(evaluateFixture(next.specification.dag, activityFixture), next.referenceResult);
  assert.equal(next.referenceResult[0].repeatWallets, "0");
  assert.equal(JSON.stringify(first), before);
});
test("empty fixture does not invent a protocol population", () => {
  assert.deepEqual(evaluateFixture(createDemoDraft().specification.dag, []), []);
});
test("demo parameters reject unsupported windows, thresholds and extra keys", () => {
  for (const parameters of [{ windowDays: 1, minimumActiveDays: 2 }, { windowDays: 7, minimumActiveDays: 8 }, { windowDays: 7, minimumActiveDays: 1 }, { windowDays: 7, minimumActiveDays: 2.5 }, { windowDays: 7, minimumActiveDays: 2, code: "unsafe" }]) {
    assert.throws(() => createDemoDraft(parameters), /INVALID_DEMO_PARAMETERS/);
  }
});
test("overview derives four nodes and three boundary edges from semantic membership", () => {
  const draft = createDemoDraft();
  const overview = projectGraph(draft.specification.dag, draft.groups);
  assert.equal(overview.nodes.length, 4);
  assert.deepEqual(overview.edges.map(({ fromNode, toNode }) => [fromNode, toNode]), [["activity", "template_wallet"], ["template_wallet", "template_repeat"], ["template_repeat", "result"]]);
});
test("topological layout follows actual dependencies after array reordering", () => {
  const graph = { nodes: ["output", "right", "source", "left"].map((id) => ({ id })), edges: [edge("source", "left"), edge("source", "right"), edge("left", "output"), edge("right", "output")] };
  const view = projectGraph(graph);
  const positions = Object.fromEntries(view.nodes.map((node) => [node.id, node]));
  assert.equal(positions.left.x, positions.right.x);
  assert.notEqual(positions.left.y, positions.right.y);
  assert.ok(positions.source.x < positions.left.x && positions.left.x < positions.output.x);
  assert.equal(view.edges.length, 4);
});
test("graph display rejects invalid edges, duplicate IDs, cycles and hidden internal cycles", () => {
  const draft = createDemoDraft();
  for (const graph of [
    { nodes: [{ id: "a" }, { id: "a" }], edges: [] },
    { nodes: [{ id: "a" }], edges: [edge("a", "missing")] },
    { nodes: [{ id: "a" }], edges: [edge("a", "a")] },
  ]) assert.throws(() => projectGraph(graph));
  draft.specification.dag.edges.push(edge("wallet_activity", "normalize_day"));
  assert.throws(() => projectGraph(draft.specification.dag, draft.groups), /CYCLIC_GRAPH_VIEW/);
});
test("group projection rejects overlapping, absent and disconnected members", () => {
  const draft = createDemoDraft();
  for (const groups of [
    [{ id: "g", nodeIds: ["missing"] }],
    [{ id: "g", nodeIds: ["activity", "result"] }],
    [{ id: "g", nodeIds: ["activity"] }, { id: "h", nodeIds: ["activity"] }],
  ]) assert.throws(() => projectGraph(draft.specification.dag, groups));
});
test("Builder, API and consumer fixtures share the exact four-field string-safe schema", () => {
  const draft = createDemoDraft();
  assert.deepEqual(apiResponse.data, draft.referenceResult);
  assert.deepEqual(consumerResponse.data, draft.referenceResult);
  assert.deepEqual(draft.specification.outputSchema, outputSchema);
  for (const row of apiResponse.data) {
    assert.deepEqual(Object.keys(row).sort(), outputSchema.items.required.toSorted());
    for (const value of Object.values(row)) assert.equal(typeof value, "string");
  }
});
test("data-model canonical illustration stays aligned with the default frontend spec", async () => {
  const model = await readFile(new URL("../../data-model.md", import.meta.url), "utf8");
  const section = model.slice(model.indexOf("## Canonical Data Product Specification"));
  const json = section.match(/```json\r?\n([\s\S]*?)\r?\n```/)[1];
  assert.deepEqual(JSON.parse(json), createDemoDraft().specification);
});
test("Builder feature CSS consumes existing tokens", async () => {
  const css = await readFile(new URL("../src/features/builder/builder.css", import.meta.url), "utf8");
  const tokens = await readFile(new URL("../src/tokens.css", import.meta.url), "utf8");
  for (const [, name] of css.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(tokens.includes(`${name}:`), `Undefined token ${name}`);
});
