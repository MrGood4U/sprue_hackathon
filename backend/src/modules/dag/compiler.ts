import {createHash} from "node:crypto";
import type {GraphSemanticValueType} from "../graph/types.js";
import {validateFilterPredicate} from "./filter.js";
import {applyMapUnitAnnotation, inferMapExpressionField, validateMapConfig} from "./map.js";
import {validateSortConfig} from "./sort.js";

export type StructuredDagNodeType = "source" | "filter" | "map" | "aggregate" | "sort" | "union" | "join" | "output";

export interface StructuredDagField {
  name: string;
  type: GraphSemanticValueType;
  nullable: boolean;
  unit: string | null;
}

export interface StructuredDagNode {
  id: string;
  type: StructuredDagNodeType;
  operatorVersion: "1" | "2" | "3";
  config: Readonly<Record<string, unknown>>;
  outputSchema?: {fields: readonly StructuredDagField[]};
}

export interface StructuredDagEdge {
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface StructuredDagCompileInput {
  schemaVersion: 1;
  dag: {
    nodes: readonly StructuredDagNode[];
    edges: readonly StructuredDagEdge[];
  };
  outputSchema: {fields: readonly StructuredDagField[]};
}

export interface StructuredDagCompilationIssue {
  code: string;
  message: string;
  nodeId: string | null;
  path: string | null;
}

export type StructuredDagCompilation = {
  schemaVersion: 1;
  status: "failed";
  compiledAt: string;
  nodeCount: number;
  edgeCount: number;
  issues: readonly StructuredDagCompilationIssue[];
} | {
  schemaVersion: 1;
  status: "passed";
  compiledAt: string;
  nodeCount: number;
  edgeCount: number;
  compilationHash: string;
  outputSchema: {fields: readonly StructuredDagField[]};
  issues: readonly [];
};

const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;
const nodeIdentifierPattern = /^[a-z][a-z0-9_-]{0,99}$/;
const providerFieldPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const maximumNodes = 64;
const maximumEdges = 128;
const maximumIssues = 32;
const versions: Readonly<Record<StructuredDagNodeType, string>> = {
  source: "1",
  filter: "2",
  map: "2",
  aggregate: "2",
  sort: "1",
  union: "2",
  join: "2",
  output: "3",
};
const inputPorts: Readonly<Record<StructuredDagNodeType, readonly string[]>> = {
  source: [],
  filter: ["rows"],
  map: ["rows"],
  aggregate: ["rows"],
  sort: ["rows"],
  union: ["left", "right"],
  join: ["left", "right"],
  output: ["rows"],
};
const outputPorts: Readonly<Record<StructuredDagNodeType, readonly string[]>> = {
  source: ["rows"],
  filter: ["rows"],
  map: ["rows"],
  aggregate: ["rows"],
  sort: ["rows"],
  union: ["rows"],
  join: ["rows"],
  output: [],
};

class CompilationFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly nodeId: string | null = null,
    readonly path: string | null = null,
  ) {
    super(message);
  }
}

type RowShape = ReadonlyMap<string, StructuredDagField>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function fail(code: string, message: string, nodeId: string | null = null, path: string | null = null): never {
  throw new CompilationFailure(code, message, nodeId, path);
}

function compatible(left: GraphSemanticValueType, right: GraphSemanticValueType): boolean {
  if (left === right || left === "json" || right === "json") return true;
  const textual = new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]);
  const numeric = new Set<GraphSemanticValueType>(["integer", "decimal"]);
  return (textual.has(left) && textual.has(right)) || (numeric.has(left) && numeric.has(right));
}

function fieldsToShape(fields: readonly StructuredDagField[], nodeId: string, path: string, allowProviderPaths = false): RowShape {
  if (fields.length < 1 || fields.length > 1_024) {
    fail("SCHEMA_FIELD_COUNT_INVALID", "A row schema must contain between 1 and 1024 fields.", nodeId, path);
  }
  const shape = new Map<string, StructuredDagField>();
  for (const [index, field] of fields.entries()) {
    if (!(allowProviderPaths ? providerFieldPattern : identifierPattern).test(field.name)) {
      fail("SCHEMA_FIELD_NAME_INVALID", `Field ${field.name} is not valid in this row schema.`, nodeId, `${path}.${index}.name`);
    }
    if (shape.has(field.name)) {
      fail("SCHEMA_FIELD_DUPLICATED", `Field ${field.name} is declared more than once.`, nodeId, `${path}.${index}.name`);
    }
    shape.set(field.name, {...field});
  }
  return shape;
}

function requireInput(inputs: ReadonlyMap<string, RowShape>, port: string, node: StructuredDagNode): RowShape {
  return inputs.get(port) ?? fail("INPUT_SCHEMA_UNAVAILABLE", `Input schema ${node.id}.${port} could not be derived.`, node.id, `dag.nodes.${node.id}`);
}

function requireField(shape: RowShape, value: unknown, label: string, node: StructuredDagNode): StructuredDagField {
  if (typeof value !== "string" || !identifierPattern.test(value) || !shape.has(value)) {
    fail("FIELD_UNKNOWN", `${label} ${String(value)} is not available from the predecessor node.`, node.id, `dag.nodes.${node.id}.config`);
  }
  return shape.get(value)!;
}

function aggregateShape(node: StructuredDagNode, source: RowShape): RowShape {
  const config = node.config;
  if (!exactKeys(config, ["groupBy", "measures"]) || !Array.isArray(config.groupBy) || !Array.isArray(config.measures)) {
    fail("AGGREGATE_CONFIG_INVALID", "Aggregate config must contain exactly groupBy and measures arrays.", node.id, `dag.nodes.${node.id}.config`);
  }
  if (config.groupBy.length > 16) fail("AGGREGATE_GROUP_COUNT_INVALID", "Aggregate supports at most 16 grouping fields.", node.id);
  if (config.measures.length < 1 || config.measures.length > 32) {
    fail("AGGREGATE_MEASURE_COUNT_INVALID", "Aggregate requires between 1 and 32 measures.", node.id);
  }
  const output = new Map<string, StructuredDagField>();
  for (const group of config.groupBy) {
    const field = requireField(source, group, "Aggregate grouping field", node);
    if (output.has(field.name)) fail("AGGREGATE_GROUP_FIELD_DUPLICATED", `Grouping field ${field.name} is duplicated.`, node.id);
    output.set(field.name, {...field});
  }
  for (const [index, candidate] of config.measures.entries()) {
    if (!isRecord(candidate) || !exactKeys(candidate, ["name", "op", "field"])) {
      fail("AGGREGATE_MEASURE_INVALID", "Each Aggregate measure must contain exactly name, op, and field.", node.id, `dag.nodes.${node.id}.config.measures.${index}`);
    }
    const name = candidate.name;
    if (typeof name !== "string" || !identifierPattern.test(name)) {
      fail("AGGREGATE_OUTPUT_NAME_INVALID", "Aggregate measure names must be lowercase identifiers.", node.id, `dag.nodes.${node.id}.config.measures.${index}.name`);
    }
    if (output.has(name)) fail("AGGREGATE_OUTPUT_NAME_DUPLICATED", `Aggregate output field ${name} is duplicated.`, node.id);
    const op = candidate.op;
    if (typeof op !== "string" || !["count_rows", "count_distinct", "sum", "min", "max", "average"].includes(op)) {
      fail("AGGREGATE_OPERATION_INVALID", `Aggregate measure ${name} uses an unknown operation.`, node.id);
    }
    if (op === "count_rows") {
      if (candidate.field !== null) fail("AGGREGATE_FIELD_UNEXPECTED", "count_rows must not reference a field.", node.id);
      output.set(name, {name, type: "integer", nullable: false, unit: null});
      continue;
    }
    const input = requireField(source, candidate.field, `Aggregate measure ${name} field`, node);
    if ((op === "sum" || op === "average") && input.type !== "integer" && input.type !== "decimal") {
      fail("AGGREGATE_FIELD_TYPE_INVALID", `${op} requires an integer or decimal field.`, node.id);
    }
    output.set(name, op === "count_distinct"
      ? {name, type: "integer", nullable: false, unit: null}
      : {name, type: op === "average" ? "decimal" : input.type, nullable: input.nullable, unit: input.unit});
  }
  return output;
}

function deriveNodeShape(node: StructuredDagNode, inputs: ReadonlyMap<string, RowShape>): RowShape {
  if (node.type === "filter") {
    const source = requireInput(inputs, "rows", node);
    if (exactKeys(node.config, ["predicate"])) {
      const issues = validateFilterPredicate(node.config.predicate, [...source.values()]);
      if (issues[0]) fail(issues[0].code, issues[0].message, node.id, `dag.nodes.${node.id}.config.predicate`);
    } else if (exactKeys(node.config, ["expression"])) {
      let inferred: StructuredDagField;
      try {
        const field = inferMapExpressionField(node.config.expression, [...source.values()]);
        inferred = {name: field.name, type: field.type, nullable: field.nullable, unit: field.unit ?? null};
      } catch (error) {
        fail("FILTER_EXPRESSION_INVALID", error instanceof Error ? error.message : "Filter expression is invalid.", node.id);
      }
      if (inferred.type !== "boolean") fail("FILTER_EXPRESSION_INVALID", "Filter expression must return Boolean.", node.id);
    } else {
      fail("FILTER_CONFIG_INVALID", "Filter config must contain exactly predicate or expression.", node.id, `dag.nodes.${node.id}.config`);
    }
    return source;
  }
  if (node.type === "map") {
    const source = requireInput(inputs, "rows", node);
    const issues = validateMapConfig(node.config, [...source.values()]);
    if (issues[0]) fail(issues[0].code, issues[0].message, node.id, `dag.nodes.${node.id}.config.fields`);
    const config = node.config as unknown as {mode: "extend" | "project"; fields: readonly {name: string; expression: unknown; unit?: string | null}[]};
    const output = config.mode === "extend" ? new Map(source) : new Map<string, StructuredDagField>();
    for (const definition of config.fields) {
      const inferred = applyMapUnitAnnotation(
        inferMapExpressionField(definition.expression, [...source.values()]),
        definition.unit,
      );
      output.set(definition.name, {name: definition.name, type: inferred.type, nullable: inferred.nullable, unit: inferred.unit ?? null});
    }
    return output;
  }
  if (node.type === "aggregate") return aggregateShape(node, requireInput(inputs, "rows", node));
  if (node.type === "sort") {
    const source = requireInput(inputs, "rows", node);
    const issues = validateSortConfig(node.config, [...source.values()]);
    if (issues[0]) fail(issues[0].code, issues[0].message, node.id, `dag.nodes.${node.id}.config`);
    return source;
  }
  if (node.type === "union") {
    if (!exactKeys(node.config, ["mode", "sourceDiscriminator"]) || node.config.mode !== "append_compatible_rows") {
      fail("UNION_CONFIG_INVALID", "Union config must use append_compatible_rows and declare sourceDiscriminator.", node.id);
    }
    const left = requireInput(inputs, "left", node);
    const right = requireInput(inputs, "right", node);
    if (left.size !== right.size || [...left].some(([name, field]) => !right.has(name) || !compatible(field.type, right.get(name)!.type))) {
      fail("UNION_SCHEMA_INCOMPATIBLE", "Union inputs must have compatible field names and types.", node.id);
    }
    const output = new Map<string, StructuredDagField>();
    for (const [name, leftField] of left) {
      const rightField = right.get(name)!;
      output.set(name, {...leftField, nullable: leftField.nullable || rightField.nullable, unit: leftField.unit === rightField.unit ? leftField.unit : null});
    }
    if (node.config.sourceDiscriminator !== null) {
      const name = node.config.sourceDiscriminator;
      if (typeof name !== "string" || !identifierPattern.test(name) || output.has(name)) {
        fail("UNION_DISCRIMINATOR_INVALID", "Union sourceDiscriminator must be a new lowercase field name or null.", node.id);
      }
      output.set(name, {name, type: "string", nullable: false, unit: null});
    }
    return output;
  }
  if (node.type === "join") {
    const config = node.config;
    if (!exactKeys(config, ["type", "keys", "cardinality", "rightPrefix"]) || !Array.isArray(config.keys)) {
      fail("JOIN_CONFIG_INVALID", "Join config must contain exactly type, keys, cardinality, and rightPrefix.", node.id);
    }
    if (config.type !== "inner" && config.type !== "left") fail("JOIN_TYPE_INVALID", "Join type must be inner or left.", node.id);
    if (config.cardinality !== "one_to_one" && config.cardinality !== "many_to_one") fail("JOIN_CARDINALITY_INVALID", "Join cardinality is invalid.", node.id);
    if (typeof config.rightPrefix !== "string" || !/^[a-z][a-z0-9_]{0,30}_$/.test(config.rightPrefix)) {
      fail("JOIN_PREFIX_INVALID", "Join rightPrefix must be a lowercase prefix ending in an underscore.", node.id);
    }
    if (config.keys.length < 1 || config.keys.length > 8) fail("JOIN_KEY_COUNT_INVALID", "Join requires between 1 and 8 keys.", node.id);
    const left = requireInput(inputs, "left", node);
    const right = requireInput(inputs, "right", node);
    const rightKeys = new Set<string>();
    for (const [index, candidate] of config.keys.entries()) {
      if (!isRecord(candidate) || !exactKeys(candidate, ["left", "right"])) {
        fail("JOIN_KEY_INVALID", "Each Join key must contain exactly left and right.", node.id, `dag.nodes.${node.id}.config.keys.${index}`);
      }
      const leftField = requireField(left, candidate.left, "Join left key", node);
      const rightField = requireField(right, candidate.right, "Join right key", node);
      if (!compatible(leftField.type, rightField.type)) fail("JOIN_KEY_TYPE_INVALID", "Join keys have incompatible types.", node.id);
      rightKeys.add(rightField.name);
    }
    const output = new Map(left);
    for (const [name, field] of right) {
      if (rightKeys.has(name) && left.has(name)) continue;
      const outputName = `${config.rightPrefix}${name}`;
      if (!identifierPattern.test(outputName) || output.has(outputName)) fail("JOIN_FIELD_COLLISION", `Join output field ${outputName} is invalid or duplicated.`, node.id);
      output.set(outputName, {...field, name: outputName, nullable: config.type === "left" || field.nullable});
    }
    return output;
  }
  if (node.type === "output") {
    const source = requireInput(inputs, "rows", node);
    if (!exactKeys(node.config, ["fields"]) || !Array.isArray(node.config.fields) || node.config.fields.length < 1 || node.config.fields.length > 32) {
      fail("OUTPUT_CONFIG_INVALID", "Output config must contain between 1 and 32 fields and cannot sort.", node.id);
    }
    const output = new Map<string, StructuredDagField>();
    for (const value of node.config.fields) {
      const field = requireField(source, value, "Output field", node);
      if (output.has(field.name)) fail("OUTPUT_FIELD_DUPLICATED", `Output field ${field.name} is duplicated.`, node.id);
      output.set(field.name, {...field});
    }
    return output;
  }
  return fail("OPERATOR_UNKNOWN", `Operator ${node.type} cannot be compiled.`, node.id);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function failed(input: StructuredDagCompileInput, compiledAt: string, issues: readonly StructuredDagCompilationIssue[]): StructuredDagCompilation {
  return {
    schemaVersion: 1,
    status: "failed",
    compiledAt,
    nodeCount: input.dag.nodes.length,
    edgeCount: input.dag.edges.length,
    issues: issues.slice(0, maximumIssues),
  };
}

export function compileStructuredDag(input: StructuredDagCompileInput, now = new Date()): StructuredDagCompilation {
  const compiledAt = now.toISOString();
  const issues: StructuredDagCompilationIssue[] = [];
  const add = (code: string, message: string, nodeId: string | null = null, path: string | null = null) => {
    if (issues.length < maximumIssues) issues.push({code, message, nodeId, path});
  };
  const {nodes, edges} = input.dag;
  if (nodes.length < 1 || nodes.length > maximumNodes) add("DAG_NODE_COUNT_INVALID", `DAG must contain between 1 and ${maximumNodes} nodes.`);
  if (edges.length > maximumEdges) add("DAG_EDGE_COUNT_INVALID", `DAG supports at most ${maximumEdges} edges.`);
  const nodeById = new Map<string, StructuredDagNode>();
  for (const [index, node] of nodes.entries()) {
    if (!nodeIdentifierPattern.test(node.id)) add("NODE_ID_INVALID", `Node ${node.id} does not use a valid lowercase identifier.`, node.id, `dag.nodes.${index}.id`);
    if (nodeById.has(node.id)) add("NODE_ID_DUPLICATED", `Node ${node.id} is declared more than once.`, node.id, `dag.nodes.${index}.id`);
    else nodeById.set(node.id, node);
    if (versions[node.type] !== node.operatorVersion) {
      add("OPERATOR_VERSION_INVALID", `Operator ${node.type} requires version ${versions[node.type]}.`, node.id, `dag.nodes.${index}.operatorVersion`);
    }
  }
  const outputs = nodes.filter((node) => node.type === "output");
  if (outputs.length !== 1) add("OUTPUT_CARDINALITY_INVALID", "DAG must contain exactly one Output node.");
  const incoming = new Map(nodes.map((node) => [node.id, new Map<string, string>()]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const edgeKeys = new Set<string>();
  for (const [index, edge] of edges.entries()) {
    const source = nodeById.get(edge.fromNode);
    const target = nodeById.get(edge.toNode);
    if (!source || !target) {
      add("CONNECTION_NODE_UNKNOWN", `Connection ${edge.fromNode} -> ${edge.toNode} references an unknown node.`, target?.id ?? source?.id ?? null, `dag.edges.${index}`);
      continue;
    }
    if (edge.fromNode === edge.toNode) add("DAG_CYCLE", `Node ${edge.fromNode} cannot connect to itself.`, edge.fromNode, `dag.edges.${index}`);
    if (!outputPorts[source.type].includes(edge.fromPort)) add("OUTPUT_PORT_UNKNOWN", `Operator ${source.id} has no output port ${edge.fromPort}.`, source.id, `dag.edges.${index}.fromPort`);
    if (!inputPorts[target.type].includes(edge.toPort)) add("INPUT_PORT_UNKNOWN", `Operator ${target.id} has no input port ${edge.toPort}.`, target.id, `dag.edges.${index}.toPort`);
    const edgeKey = `${edge.fromNode}\0${edge.fromPort}\0${edge.toNode}\0${edge.toPort}`;
    if (edgeKeys.has(edgeKey)) add("CONNECTION_DUPLICATED", `Connection ${edge.fromNode} -> ${edge.toNode} is duplicated.`, target.id, `dag.edges.${index}`);
    edgeKeys.add(edgeKey);
    if (incoming.get(target.id)!.has(edge.toPort)) add("INPUT_PORT_MULTIPLE", `Input ${target.id}.${edge.toPort} is connected more than once.`, target.id, `dag.edges.${index}.toPort`);
    else incoming.get(target.id)!.set(edge.toPort, source.id);
    outgoing.get(source.id)!.push(target.id);
  }
  for (const node of nodes) {
    for (const port of inputPorts[node.type]) {
      if (!incoming.get(node.id)?.has(port)) add("INPUT_PORT_MISSING", `Operator ${node.id} is missing required input ${port}.`, node.id);
    }
  }
  for (const source of nodes.filter((node) => node.type === "source")) {
    if (!(typeof source.config.sourceId === "string" && source.config.sourceId.trim()) && !(typeof source.config.sourceKey === "string" && source.config.sourceKey.trim())) {
      add("SOURCE_CONFIG_INVALID", `Source ${source.id} must reference a verified source identity.`, source.id, `dag.nodes.${source.id}.config`);
    }
    const targets = [...(outgoing.get(source.id) ?? [])];
    if (targets.length !== 1) {
      add("SOURCE_OUTPUT_CONNECTION_INVALID", `Source ${source.id} must connect to exactly one downstream operator.`, source.id);
    }
  }
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) if (visit(target)) return true;
    visiting.delete(id);
    seen.add(id);
    return false;
  };
  if (nodes.some((node) => visit(node.id))) add("DAG_CYCLE", "DAG must be acyclic.");
  if (outputs.length === 1) {
    const reachesOutput = new Set<string>([outputs[0]!.id]);
    const pending = [outputs[0]!.id];
    while (pending.length > 0) {
      const current = pending.shift()!;
      for (const previous of incoming.get(current)?.values() ?? []) {
        if (!reachesOutput.has(previous)) {
          reachesOutput.add(previous);
          pending.push(previous);
        }
      }
    }
    if (reachesOutput.size !== nodes.length) add("DAG_DISCONNECTED", "Every node must contribute to the single Output node.");
  }
  if (issues.length > 0) return failed(input, compiledAt, issues);

  try {
    const shapes = new Map<string, RowShape>();
    for (const source of nodes.filter((node) => node.type === "source")) {
      if (!source.outputSchema) fail("SOURCE_SCHEMA_MISSING", `Source ${source.id} does not expose an output schema.`, source.id, `dag.nodes.${source.id}.outputSchema`);
      shapes.set(source.id, fieldsToShape(source.outputSchema.fields, source.id, `dag.nodes.${source.id}.outputSchema.fields`, true));
    }
    const runtimeIndegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)!.size]));
    const queue = nodes.filter((node) => runtimeIndegree.get(node.id) === 0).map((node) => node.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodeById.get(id)!;
      if (node.type !== "source") {
        const inputs = new Map<string, RowShape>();
        for (const [port, previous] of incoming.get(id)!) inputs.set(port, shapes.get(previous) ?? fail("INPUT_SCHEMA_UNAVAILABLE", `Schema from ${previous} could not be derived.`, id));
        shapes.set(id, deriveNodeShape(node, inputs));
      }
      for (const target of outgoing.get(id)!) {
        const next = runtimeIndegree.get(target)! - 1;
        runtimeIndegree.set(target, next);
        if (next === 0) queue.push(target);
      }
    }
    const outputNode = outputs[0]!;
    const compiledFields = [...(shapes.get(outputNode.id) ?? fail("OUTPUT_SCHEMA_UNAVAILABLE", "Output schema could not be derived.", outputNode.id)).values()];
    const declared = fieldsToShape(input.outputSchema.fields, outputNode.id, "outputSchema.fields");
    if (declared.size !== compiledFields.length) fail("OUTPUT_SCHEMA_INVALID", "Declared output schema does not match the compiled Output fields.", outputNode.id, "outputSchema.fields");
    for (const actual of compiledFields) {
      const promised = declared.get(actual.name);
      if (!promised || actual.type !== promised.type || (!promised.nullable && actual.nullable) || promised.unit !== actual.unit) {
        fail("OUTPUT_SCHEMA_INVALID", `Declared output field ${actual.name} does not match its compiled type, nullability, or unit.`, outputNode.id, "outputSchema.fields");
      }
    }
    const normalized = {
      schemaVersion: input.schemaVersion,
      dag: {
        nodes: [...nodes].sort((left, right) => left.id.localeCompare(right.id)),
        edges: [...edges].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
      },
      outputSchema: {fields: compiledFields},
    };
    return {
      schemaVersion: 1,
      status: "passed",
      compiledAt,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      compilationHash: createHash("sha256").update(canonicalJson(normalized)).digest("hex"),
      outputSchema: {fields: compiledFields},
      issues: [],
    };
  } catch (error) {
    if (error instanceof CompilationFailure) {
      return failed(input, compiledAt, [{code: error.code, message: error.message, nodeId: error.nodeId, path: error.path}]);
    }
    return failed(input, compiledAt, [{code: "COMPILATION_INTERNAL_ERROR", message: "The structured DAG could not be compiled safely.", nodeId: null, path: null}]);
  }
}
