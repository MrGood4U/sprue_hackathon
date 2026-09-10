import assert from "node:assert/strict";
import test from "node:test";
import {compileStructuredDag, type StructuredDagCompileInput} from "../src/modules/dag/compiler.js";

function validDag(): StructuredDagCompileInput {
  const amount = {name: "amount_usd", type: "decimal" as const, nullable: false, unit: "USD"};
  return {
    schemaVersion: 1,
    dag: {
      nodes: [
        {id: "source_rows", type: "source", operatorVersion: "1", config: {sourceId: "graph:source"}, outputSchema: {fields: [amount]}},
        {id: "normalize_rows", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
          {name: "amount_usd", expression: {op: "field", field: "amount_usd"}},
        ]}},
        {id: "final_output", type: "output", operatorVersion: "3", config: {fields: ["amount_usd"]}},
      ],
      edges: [
        {fromNode: "source_rows", fromPort: "rows", toNode: "normalize_rows", toPort: "rows"},
        {fromNode: "normalize_rows", fromPort: "rows", toNode: "final_output", toPort: "rows"},
      ],
    },
    outputSchema: {fields: [amount]},
  };
}

test("structured DAG compiler accepts a normalized acyclic graph and produces a stable hash", () => {
  const now = new Date("2026-09-11T00:00:00.000Z");
  const first = compileStructuredDag(validDag(), now);
  const second = compileStructuredDag(validDag(), now);
  assert.equal(first.status, "passed");
  assert.equal(second.status, "passed");
  if (first.status !== "passed" || second.status !== "passed") return;
  assert.equal(first.compilationHash, second.compilationHash);
  assert.deepEqual(first.outputSchema.fields, [{name: "amount_usd", type: "decimal", nullable: false, unit: "USD"}]);
});

test("structured DAG compiler rejects cycles and multiply connected inputs", () => {
  const base = validDag();
  const input = {...base, dag: {...base.dag, edges: [...base.dag.edges,
    {fromNode: "final_output", fromPort: "rows", toNode: "normalize_rows", toPort: "rows"},
  ]}} satisfies StructuredDagCompileInput;
  const result = compileStructuredDag(input);
  assert.equal(result.status, "failed");
  assert.equal(result.issues.some((issue) => issue.code === "DAG_CYCLE"), true);
  assert.equal(result.issues.some((issue) => issue.code === "OUTPUT_PORT_UNKNOWN"), true);
  assert.equal(result.issues.some((issue) => issue.code === "INPUT_PORT_MULTIPLE"), true);
});

test("structured DAG compiler enforces the source boundary Map and declared output schema", () => {
  const base = validDag();
  const missingBoundary = {...base, dag: {
    nodes: base.dag.nodes.filter((node) => node.id !== "normalize_rows"),
    edges: [{fromNode: "source_rows", fromPort: "rows", toNode: "final_output", toPort: "rows"}],
  }} satisfies StructuredDagCompileInput;
  const boundaryResult = compileStructuredDag(missingBoundary);
  assert.equal(boundaryResult.status, "failed");
  assert.equal(boundaryResult.issues.some((issue) => issue.code === "SOURCE_NORMALIZATION_MAP_REQUIRED"), true);

  const mismatchedBase = validDag();
  const mismatchedOutput = {...mismatchedBase, outputSchema: {fields: [
    {...mismatchedBase.outputSchema.fields[0]!, unit: "HBAR"},
  ]}} satisfies StructuredDagCompileInput;
  const outputResult = compileStructuredDag(mismatchedOutput);
  assert.equal(outputResult.status, "failed");
  assert.equal(outputResult.issues[0]?.code, "OUTPUT_SCHEMA_INVALID");
});

test("structured DAG compiler accepts generic Map unit annotations and rejects relabeling known units", () => {
  const annotated = validDag();
  const source = annotated.dag.nodes.find((node) => node.id === "source_rows")!;
  const map = annotated.dag.nodes.find((node) => node.id === "normalize_rows")!;
  source.outputSchema = {fields: [{name: "amount_usd", type: "decimal", nullable: false, unit: null}]};
  map.config = {mode: "project", fields: [
    {name: "amount_usd", expression: {op: "field", field: "amount_usd"}, unit: "kWh"},
  ]};
  annotated.outputSchema = {fields: [{name: "amount_usd", type: "decimal", nullable: false, unit: "kWh"}]};

  const result = compileStructuredDag(annotated);
  assert.equal(result.status, "passed");
  if (result.status === "passed") assert.equal(result.outputSchema.fields[0]?.unit, "kWh");

  const conflicting = validDag();
  const conflictingMap = conflicting.dag.nodes.find((node) => node.id === "normalize_rows")!;
  conflictingMap.config = {mode: "project", fields: [
    {name: "amount_usd", expression: {op: "field", field: "amount_usd"}, unit: "HBAR"},
  ]};
  const conflict = compileStructuredDag(conflicting);
  assert.equal(conflict.status, "failed");
  if (conflict.status === "failed") assert.equal(conflict.issues[0]?.code, "MAP_UNIT_CONFLICT");
});

test("structured DAG compiler requires exact declared output types", () => {
  const base = validDag();
  const mismatchedOutput = {...base, outputSchema: {fields: [
    {...base.outputSchema.fields[0]!, type: "integer" as const},
  ]}} satisfies StructuredDagCompileInput;

  const result = compileStructuredDag(mismatchedOutput);

  assert.equal(result.status, "failed");
  assert.equal(result.issues[0]?.code, "OUTPUT_SCHEMA_INVALID");
});

test("structured DAG compiler counts separate input-port edges from the same predecessor", () => {
  const base = validDag();
  const output = base.dag.nodes.find((node) => node.type === "output")!;
  const input = {...base, dag: {
    nodes: [
      ...base.dag.nodes.filter((node) => node.type !== "output"),
      {id: "combine_rows", type: "union", operatorVersion: "2", config: {mode: "append_compatible_rows", sourceDiscriminator: null}},
      output,
    ],
    edges: [
      base.dag.edges[0]!,
      {fromNode: "normalize_rows", fromPort: "rows", toNode: "combine_rows", toPort: "left"},
      {fromNode: "normalize_rows", fromPort: "rows", toNode: "combine_rows", toPort: "right"},
      {fromNode: "combine_rows", fromPort: "rows", toNode: "final_output", toPort: "rows"},
    ],
  }} satisfies StructuredDagCompileInput;

  assert.equal(compileStructuredDag(input).status, "passed");
});
