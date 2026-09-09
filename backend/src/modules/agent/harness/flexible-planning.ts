import type {GraphSemanticValueType} from "../../graph/index.js";
import {HarnessCompileError, sourceRole} from "./compiler.js";
import type {
  DiscoverySemanticPlan,
  DiscoverySourceNeed,
  FlexibleCompositionIntent,
  OperatorSignature,
  SourceAuxiliaryFieldPurpose,
  SourceFeasibilitySelection,
} from "./types.js";

const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;

interface FieldShape {
  type: GraphSemanticValueType;
  nullable: boolean;
  unit: string | null;
  cardinality: boolean;
  nonZero: boolean;
  origins: ReadonlySet<string>;
}

type RowShape = ReadonlyMap<string, FieldShape>;
type FieldUsage = Map<string, Set<SourceAuxiliaryFieldPurpose>>;

export interface SourceRoleAuxiliaryFieldShape {
  name: string;
  type: GraphSemanticValueType;
  nullable: boolean;
  unit: string | null;
}

function auxiliaryOrigin(sourceNeedId: string, name: string): string {
  return `${sourceNeedId}:${name}`;
}

function mergedOrigins(fields: readonly FieldShape[]): ReadonlySet<string> {
  return new Set(fields.flatMap((field) => [...field.origins]));
}

export const flexibleOperatorRegistry: readonly OperatorSignature[] = [
  {
    type: "source",
    operatorVersion: "2",
    inputPorts: [],
    outputPorts: ["rows"],
    configContract: "Compiler-owned selected source and inspected field bindings.",
  },
  {
    type: "filter",
    operatorVersion: "2",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{expression:Expression}; the expression must return Boolean.",
  },
  {
    type: "map",
    operatorVersion: "2",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{mode:'extend'|'project',fields:[{name,expression:Expression}]}",
  },
  {
    type: "aggregate",
    operatorVersion: "2",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{groupBy:string[],measures:[{name,op:'count_rows'|'count_distinct'|'sum'|'min'|'max'|'average',field:string|null}]}",
  },
  {
    type: "union",
    operatorVersion: "2",
    inputPorts: ["left", "right"],
    outputPorts: ["rows"],
    configContract: "{mode:'append_compatible_rows',sourceDiscriminator:string|null}",
  },
  {
    type: "join",
    operatorVersion: "2",
    inputPorts: ["left", "right"],
    outputPorts: ["rows"],
    configContract: "{type:'inner'|'left',keys:[{left,right}],cardinality:'one_to_one'|'many_to_one',rightPrefix:string}",
  },
  {
    type: "output",
    operatorVersion: "2",
    inputPorts: ["rows"],
    outputPorts: [],
    configContract: "{fields:string[],orderBy:[{field,direction:'asc'|'desc'}]}",
  },
] as const;

function fail(code: string, message: string): never {
  throw new HarnessCompileError(code, message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("OPERATOR_CONFIG_INVALID", `${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail("OPERATOR_CONFIG_INVALID", `${label} must be an array with at most ${maximum} items`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !identifierPattern.test(value)) fail("OPERATOR_CONFIG_INVALID", `${label} must be a lowercase identifier`);
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key)) || keys.some((key) => !(key in value))) {
    fail("OPERATOR_CONFIG_INVALID", `${label} must contain exactly ${keys.join(", ")}`);
  }
}

function compatible(left: GraphSemanticValueType, right: GraphSemanticValueType): boolean {
  if (left === right || left === "json" || right === "json") return true;
  const textual = new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]);
  const numeric = new Set<GraphSemanticValueType>(["integer", "decimal"]);
  return (textual.has(left) && textual.has(right)) || (numeric.has(left) && numeric.has(right));
}

function preservesPromisedUnit(
  actual: FieldShape,
  promisedUnit: string | null,
  measurementUnits: ReadonlySet<string>,
): boolean {
  if (promisedUnit === null || actual.unit === promisedUnit) return true;
  return actual.cardinality && actual.type === "integer" && !measurementUnits.has(promisedUnit);
}

function field(
  shape: RowShape,
  name: unknown,
  label: string,
  usage?: {fields: FieldUsage; purpose: SourceAuxiliaryFieldPurpose},
): FieldShape {
  const fieldName = string(name, label);
  const found = shape.get(fieldName);
  if (!found) fail("EXPRESSION_FIELD_UNKNOWN", `${label} references unavailable field ${fieldName}`);
  if (usage) {
    for (const origin of found.origins) {
      const purposes = usage.fields.get(origin) ?? new Set<SourceAuxiliaryFieldPurpose>();
      purposes.add(usage.purpose);
      usage.fields.set(origin, purposes);
    }
  }
  return found;
}

interface ExpressionBudget {
  nodes: number;
}

function expressionType(
  value: unknown,
  shape: RowShape,
  budget: ExpressionBudget,
  usage: {fields: FieldUsage; purpose: SourceAuxiliaryFieldPurpose},
  depth = 0,
): FieldShape {
  if (depth > 8 || ++budget.nodes > 128) fail("EXPRESSION_LIMIT_EXCEEDED", "Expression exceeds the configured depth or node limit");
  const expression = record(value, "expression");
  const op = expression.op;
  if (typeof op !== "string") fail("EXPRESSION_INVALID", "Expression op is required");
  if (op === "field") {
    exactKeys(expression, ["op", "field"], "field expression");
    return field(shape, expression.field, "expression.field", usage);
  }
  if (op === "literal") {
    exactKeys(expression, ["op", "valueType", "value"], "literal expression");
    const valueType = expression.valueType;
    const allowed: readonly GraphSemanticValueType[] = [
      "boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json",
    ];
    if (typeof valueType !== "string" || !allowed.includes(valueType as GraphSemanticValueType)) {
      fail("EXPRESSION_INVALID", "Literal valueType is invalid");
    }
    if (expression.value !== null && !["string", "number", "boolean"].includes(typeof expression.value)) {
      fail("EXPRESSION_INVALID", "Literal value must be a scalar or null");
    }
    return {
      type: valueType as GraphSemanticValueType,
      nullable: expression.value === null,
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: new Set(),
    };
  }

  exactKeys(expression, ["op", "inputs"], `${op} expression`);
  const inputs = array(expression.inputs, `${op}.inputs`, 8);
  const unary = new Set(["not", "utc_date"]);
  const binary = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "add", "subtract", "multiply", "safe_divide"]);
  if (unary.has(op) && inputs.length !== 1) fail("EXPRESSION_INVALID", `${op} requires one input`);
  if (binary.has(op) && inputs.length !== 2) fail("EXPRESSION_INVALID", `${op} requires two inputs`);
  if ((op === "and" || op === "or") && (inputs.length < 2 || inputs.length > 8)) fail("EXPRESSION_INVALID", `${op} requires two to eight inputs`);
  if (op === "if" && inputs.length !== 3) fail("EXPRESSION_INVALID", "if requires three inputs");
  if (!unary.has(op) && !binary.has(op) && op !== "and" && op !== "or" && op !== "if") {
    fail("EXPRESSION_OPERATOR_UNKNOWN", `Expression operator ${op} is not registered`);
  }
  const inferred = inputs.map((input) => expressionType(input, shape, budget, usage, depth + 1));
  if (op === "not" || op === "and" || op === "or") {
    if (inferred.some((item) => item.type !== "boolean")) fail("EXPRESSION_TYPE_INVALID", `${op} requires Boolean inputs`);
    return {
      type: "boolean",
      nullable: inferred.some((item) => item.nullable),
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: mergedOrigins(inferred),
    };
  }
  if (["eq", "ne", "lt", "lte", "gt", "gte"].includes(op)) {
    if (!compatible(inferred[0]!.type, inferred[1]!.type)) fail("EXPRESSION_TYPE_INVALID", `${op} inputs have incompatible types`);
    return {
      type: "boolean",
      nullable: inferred.some((item) => item.nullable),
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: mergedOrigins(inferred),
    };
  }
  if (["add", "subtract", "multiply", "safe_divide"].includes(op)) {
    const numeric = new Set<GraphSemanticValueType>(["integer", "decimal"]);
    if (inferred.some((item) => !numeric.has(item.type))) fail("EXPRESSION_TYPE_INVALID", `${op} requires numeric inputs`);
    const numerator = inferred[0]!;
    const denominator = inferred[1]!;
    const preservesCardinality = (op === "add" || op === "subtract")
      && inferred.every((item) => item.cardinality);
    return {
      type: op === "safe_divide" || inferred.some((item) => item.type === "decimal") ? "decimal" : "integer",
      nullable: inferred.some((item) => item.nullable)
        || (op === "safe_divide" && !denominator.nonZero),
      unit: op === "safe_divide" && denominator.cardinality
        ? numerator.unit
        : op === "add" || op === "subtract"
          ? numerator.unit
          : null,
      cardinality: preservesCardinality,
      nonZero: false,
      origins: mergedOrigins(inferred),
    };
  }
  if (op === "utc_date") {
    if (!new Set<GraphSemanticValueType>(["timestamp", "integer", "string"]).has(inferred[0]!.type)) {
      fail("EXPRESSION_TYPE_INVALID", "utc_date requires a timestamp-compatible input");
    }
    return {
      type: "date",
      nullable: inferred[0]!.nullable,
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: inferred[0]!.origins,
    };
  }
  if (inferred[0]!.type !== "boolean" || !compatible(inferred[1]!.type, inferred[2]!.type)) {
    fail("EXPRESSION_TYPE_INVALID", "if requires a Boolean condition and compatible result branches");
  }
  return {
    type: inferred[1]!.type,
    nullable: inferred[1]!.nullable || inferred[2]!.nullable,
    unit: inferred[1]!.unit === inferred[2]!.unit ? inferred[1]!.unit : null,
    cardinality: inferred[1]!.cardinality && inferred[2]!.cardinality,
    nonZero: inferred[1]!.nonZero && inferred[2]!.nonZero,
    origins: mergedOrigins(inferred),
  };
}

function inputPorts(operator: FlexibleCompositionIntent["nodes"][number]["operator"]): readonly string[] {
  return operator === "union" || operator === "join" ? ["left", "right"] : ["rows"];
}

function outputShape(
  operator: string,
  configValue: Readonly<Record<string, unknown>>,
  inputs: ReadonlyMap<string, RowShape>,
  usage: FieldUsage,
): RowShape {
  const config = record(configValue, `${operator} config`);
  if (operator === "filter") {
    exactKeys(config, ["expression"], "Filter config");
    const source = inputs.get("rows")!;
    const result = expressionType(config.expression, source, {nodes: 0}, {fields: usage, purpose: "filter"});
    if (result.type !== "boolean") fail("FILTER_EXPRESSION_INVALID", "Filter expression must return Boolean");
    return source;
  }
  if (operator === "map") {
    exactKeys(config, ["mode", "fields"], "Map config");
    if (config.mode !== "extend" && config.mode !== "project") fail("OPERATOR_CONFIG_INVALID", "Map mode must be extend or project");
    const source = inputs.get("rows")!;
    const output = config.mode === "extend" ? new Map(source) : new Map<string, FieldShape>();
    const definitions = array(config.fields, "Map fields", 32);
    if (definitions.length === 0) fail("OPERATOR_CONFIG_INVALID", "Map requires at least one field");
    const seen = new Set<string>();
    for (const definitionValue of definitions) {
      const definition = record(definitionValue, "Map field");
      exactKeys(definition, ["name", "expression"], "Map field");
      const name = string(definition.name, "Map field name");
      if (seen.has(name)) fail("OPERATOR_CONFIG_INVALID", `Map field ${name} is duplicated`);
      seen.add(name);
      output.set(name, expressionType(definition.expression, source, {nodes: 0}, {fields: usage, purpose: "derive"}));
    }
    return output;
  }
  if (operator === "aggregate") {
    exactKeys(config, ["groupBy", "measures"], "Aggregate config");
    const source = inputs.get("rows")!;
    const output = new Map<string, FieldShape>();
    const groupBy = array(config.groupBy, "Aggregate groupBy", 16);
    for (const groupValue of groupBy) {
      const name = string(groupValue, "Aggregate groupBy field");
      if (output.has(name)) fail("OPERATOR_CONFIG_INVALID", `Aggregate groupBy field ${name} is duplicated`);
      output.set(name, field(source, name, "Aggregate groupBy", {fields: usage, purpose: "group"}));
    }
    const measures = array(config.measures, "Aggregate measures", 32);
    if (measures.length === 0) fail("OPERATOR_CONFIG_INVALID", "Aggregate requires at least one measure");
    for (const measureValue of measures) {
      const measure = record(measureValue, "Aggregate measure");
      exactKeys(measure, ["name", "op", "field"], "Aggregate measure");
      const name = string(measure.name, "Aggregate measure name");
      if (output.has(name)) fail("OPERATOR_CONFIG_INVALID", `Aggregate output field ${name} is duplicated`);
      const op = measure.op;
      const allowed = ["count_rows", "count_distinct", "sum", "min", "max", "average"];
      if (typeof op !== "string" || !allowed.includes(op)) fail("OPERATOR_CONFIG_INVALID", `Aggregate measure ${name} has an unknown operation`);
      if (op === "count_rows") {
        if (measure.field !== null) fail("OPERATOR_CONFIG_INVALID", "count_rows field must be null");
        output.set(name, {
          type: "integer",
          nullable: false,
          unit: null,
          cardinality: true,
          nonZero: groupBy.length > 0,
          origins: new Set(),
        });
        continue;
      }
      const input = field(source, measure.field, `Aggregate measure ${name}`, {fields: usage, purpose: "derive"});
      if ((op === "sum" || op === "average") && input.type !== "integer" && input.type !== "decimal") {
        fail("AGGREGATE_TYPE_INVALID", `${op} requires a numeric field`);
      }
      output.set(name, op === "count_distinct"
        ? {
            type: "integer",
            nullable: false,
            unit: null,
            cardinality: true,
            nonZero: groupBy.length > 0 && !input.nullable,
            origins: input.origins,
          }
        : {
            type: op === "average" ? "decimal" : input.type,
            nullable: input.nullable,
            unit: input.unit,
            cardinality: false,
            nonZero: false,
            origins: input.origins,
          });
    }
    return output;
  }
  if (operator === "union") {
    exactKeys(config, ["mode", "sourceDiscriminator"], "Union config");
    if (config.mode !== "append_compatible_rows") fail("OPERATOR_CONFIG_INVALID", "Union mode is invalid");
    const left = inputs.get("left")!;
    const right = inputs.get("right")!;
    if (left.size !== right.size || [...left].some(([name, type]) => !right.has(name) || !compatible(type.type, right.get(name)!.type))) {
      fail("UNION_SCHEMA_INCOMPATIBLE", "Union inputs must have compatible field names and types");
    }
    const output = new Map([...left].map(([name, shape]) => {
      const rightShape = right.get(name)!;
      return [name, {
        ...shape,
        nullable: shape.nullable || rightShape.nullable,
        unit: shape.unit === rightShape.unit ? shape.unit : null,
        cardinality: shape.cardinality && rightShape.cardinality,
        nonZero: shape.nonZero && rightShape.nonZero,
        origins: mergedOrigins([shape, rightShape]),
      }] as const;
    }));
    if (config.sourceDiscriminator !== null) {
      const discriminator = string(config.sourceDiscriminator, "Union sourceDiscriminator");
      if (output.has(discriminator)) fail("OPERATOR_CONFIG_INVALID", "Union sourceDiscriminator collides with an existing field");
      output.set(discriminator, {
        type: "string",
        nullable: false,
        unit: null,
        cardinality: false,
        nonZero: false,
        origins: new Set(),
      });
    }
    return output;
  }
  if (operator === "join") {
    exactKeys(config, ["type", "keys", "cardinality", "rightPrefix"], "Join config");
    if (config.type !== "inner" && config.type !== "left") fail("OPERATOR_CONFIG_INVALID", "Join type is invalid");
    if (config.cardinality !== "one_to_one" && config.cardinality !== "many_to_one") fail("OPERATOR_CONFIG_INVALID", "Join cardinality is invalid");
    if (typeof config.rightPrefix !== "string" || !/^[a-z][a-z0-9_]{0,30}_$/.test(config.rightPrefix)) {
      fail("OPERATOR_CONFIG_INVALID", "Join rightPrefix must be a lowercase identifier prefix ending in underscore");
    }
    const left = inputs.get("left")!;
    const right = inputs.get("right")!;
    const keys = array(config.keys, "Join keys", 8);
    if (keys.length === 0) fail("OPERATOR_CONFIG_INVALID", "Join requires at least one key");
    const rightKeyNames = new Set<string>();
    for (const keyValue of keys) {
      const key = record(keyValue, "Join key");
      exactKeys(key, ["left", "right"], "Join key");
      const leftName = string(key.left, "Join left key");
      const rightName = string(key.right, "Join right key");
      const leftType = field(left, leftName, "Join left key", {fields: usage, purpose: "join"});
      const rightType = field(right, rightName, "Join right key", {fields: usage, purpose: "join"});
      if (!compatible(leftType.type, rightType.type)) fail("JOIN_KEY_TYPE_INVALID", "Join keys have incompatible types");
      rightKeyNames.add(rightName);
    }
    const output = new Map(left);
    for (const [name, type] of right) {
      if (rightKeyNames.has(name) && left.has(name)) continue;
      const outputName = `${config.rightPrefix}${name}`;
      if (!identifierPattern.test(outputName) || output.has(outputName)) fail("JOIN_FIELD_COLLISION", `Join output field ${outputName} is invalid or duplicated`);
      output.set(outputName, {...type, nullable: config.type === "left" || type.nullable});
    }
    return output;
  }
  if (operator === "output") {
    exactKeys(config, ["fields", "orderBy"], "Output config");
    const source = inputs.get("rows")!;
    const output = new Map<string, FieldShape>();
    const fields = array(config.fields, "Output fields", 32);
    if (fields.length === 0) fail("OPERATOR_CONFIG_INVALID", "Output requires at least one field");
    for (const fieldValue of fields) {
      const name = string(fieldValue, "Output field");
      if (output.has(name)) fail("OPERATOR_CONFIG_INVALID", `Output field ${name} is duplicated`);
      output.set(name, field(source, name, "Output", {fields: usage, purpose: "output"}));
    }
    for (const orderingValue of array(config.orderBy, "Output orderBy", 8)) {
      const ordering = record(orderingValue, "Output orderBy entry");
      exactKeys(ordering, ["field", "direction"], "Output orderBy entry");
      const name = string(ordering.field, "Output orderBy field");
      if (!output.has(name) || (ordering.direction !== "asc" && ordering.direction !== "desc")) {
        fail("OPERATOR_CONFIG_INVALID", "Output orderBy references an unavailable field or direction");
      }
      field(source, name, "Output orderBy", {fields: usage, purpose: "sort"});
    }
    return output;
  }
  return fail("OPERATOR_UNKNOWN", `Operator ${operator} is not registered`);
}

export function deriveDiscoverySourceNeeds(plan: DiscoverySemanticPlan): readonly DiscoverySourceNeed[] {
  return plan.sourceRequirements.map((requirement) => ({...requirement}));
}

export function validateFlexibleComposition(
  plan: DiscoverySemanticPlan,
  composition: FlexibleCompositionIntent,
  needs: readonly DiscoverySourceNeed[],
  selections: readonly SourceFeasibilitySelection[],
  limits: {maxNodes: number; maxEdges: number},
  auxiliaryFieldsByNeed: ReadonlyMap<string, readonly SourceRoleAuxiliaryFieldShape[]> = new Map(),
): void {
  const sourceNodes = needs.map((need) => ({role: sourceRole(need.id), need}));
  const sourceRoles = new Set(sourceNodes.map((source) => source.role));
  const nodes = new Map(composition.nodes.map((node) => [node.role, node]));
  if (nodes.size !== composition.nodes.length || composition.nodes.some((node) => sourceRoles.has(node.role))) {
    fail("DUPLICATE_NODE_ROLE", "Composition node roles must be unique and cannot replace source roles");
  }
  if (composition.nodes.length + sourceNodes.length > limits.maxNodes || composition.connections.length > limits.maxEdges) {
    fail("DAG_LIMIT_EXCEEDED", "DAG exceeds the configured node or edge limit");
  }
  if (composition.nodes.filter((node) => node.operator === "output").length !== 1) {
    fail("OUTPUT_CARDINALITY_INVALID", "Composition must contain exactly one Output operator");
  }
  if (composition.nodes.some((node) => node.operatorVersion !== "2")) fail("OPERATOR_VERSION_INVALID", "Flexible composition requires operator version 2");

  const incoming = new Map<string, Map<string, string>>([...nodes.keys()].map((role) => [role, new Map()]));
  const outgoing = new Map<string, Set<string>>([...sourceRoles, ...nodes.keys()].map((role) => [role, new Set()]));
  for (const edge of composition.connections) {
    if ((!sourceRoles.has(edge.fromRole) && !nodes.has(edge.fromRole)) || !nodes.has(edge.toRole)) {
      fail("CONNECTION_ROLE_UNKNOWN", `Connection references an unknown role ${edge.fromRole} -> ${edge.toRole}`);
    }
    if (edge.fromRole === edge.toRole) fail("DAG_CYCLE", "A node cannot connect to itself");
    const target = nodes.get(edge.toRole)!;
    if (!inputPorts(target.operator).includes(edge.inputRole)) fail("INPUT_PORT_UNKNOWN", `Operator ${target.role} has no input port ${edge.inputRole}`);
    if (incoming.get(edge.toRole)!.has(edge.inputRole)) fail("INPUT_PORT_MULTIPLE", `Input ${edge.toRole}.${edge.inputRole} is connected more than once`);
    incoming.get(edge.toRole)!.set(edge.inputRole, edge.fromRole);
    outgoing.get(edge.fromRole)!.add(edge.toRole);
  }
  for (const node of composition.nodes) {
    if (inputPorts(node.operator).some((port) => !incoming.get(node.role)!.has(port))) fail("INPUT_PORT_MISSING", `Operator ${node.role} is missing a required input`);
  }

  const shapes = new Map<string, RowShape>();
  const fieldUsage: FieldUsage = new Map();
  for (const {role, need} of sourceNodes) {
    const selection = selections.find((item) => item.sourceNeedId === need.id)!;
    const bound = new Set(selection.fieldBindings.map((binding) => binding.requirementId));
    const fields = new Map<string, FieldShape>();
    for (const requirement of need.fields) {
      if (bound.has(requirement.id)) fields.set(requirement.id, {
        type: requirement.expectedType,
        nullable: requirement.allowNullable,
        unit: requirement.unit,
        cardinality: false,
        nonZero: false,
        origins: new Set(),
      });
    }
    for (const auxiliary of auxiliaryFieldsByNeed.get(need.id) ?? []) {
      fields.set(auxiliary.name, {
        type: auxiliary.type,
        nullable: auxiliary.nullable,
        unit: auxiliary.unit,
        cardinality: false,
        nonZero: false,
        origins: new Set([auxiliaryOrigin(need.id, auxiliary.name)]),
      });
    }
    fields.set("data_network", {
      type: "string",
      nullable: false,
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: new Set(),
    });
    shapes.set(role, fields);
  }

  const indegree = new Map<string, number>([
    ...sourceNodes.map((source) => [source.role, 0] as const),
    ...composition.nodes.map((node) => [node.role, incoming.get(node.role)!.size] as const),
  ]);
  const queue = [...sourceRoles];
  let visited = 0;
  while (queue.length > 0) {
    const role = queue.shift()!;
    visited += 1;
    for (const next of outgoing.get(role)!) {
      const nextDegree = indegree.get(next)! - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        const node = nodes.get(next)!;
        const inputs = new Map<string, RowShape>();
        for (const [port, previous] of incoming.get(next)!) inputs.set(port, shapes.get(previous)!);
        shapes.set(next, outputShape(node.operator, node.config, inputs, fieldUsage));
        queue.push(next);
      }
    }
  }
  if (visited !== sourceNodes.length + composition.nodes.length) fail("DAG_CYCLE", "DAG must be acyclic");

  const outputNode = composition.nodes.find((node) => node.operator === "output")!;
  const finalShape = shapes.get(outputNode.role)!;
  const measurementUnits = new Set([
    ...plan.sourceRequirements.flatMap((requirement) => requirement.fields.map((item) => item.unit)),
    ...[...finalShape.values()].filter((item) => !item.cardinality).map((item) => item.unit),
  ].filter((unit): unit is string => unit !== null));
  for (const promised of plan.result.fields) {
    const actual = finalShape.get(promised.name);
    if (!actual || !compatible(actual.type, promised.type)) {
      fail("OUTPUT_SCHEMA_INVALID", `Output does not provide promised field ${promised.name} with a compatible type`);
    }
    if (!promised.nullable && actual.nullable) fail("OUTPUT_SCHEMA_INVALID", `Output field ${promised.name} may be null but the semantic contract forbids null`);
    if (!preservesPromisedUnit(actual, promised.unit, measurementUnits)) {
      fail("OUTPUT_SCHEMA_INVALID", `Output field ${promised.name} does not preserve promised unit ${promised.unit}`);
    }
  }
  for (const ordering of plan.result.orderBy) {
    if (!finalShape.has(ordering.field)) fail("OUTPUT_SCHEMA_INVALID", `Semantic ordering references unavailable field ${ordering.field}`);
  }

  for (const selection of selections) {
    for (const binding of selection.auxiliaryFieldBindings) {
      const purposes = fieldUsage.get(auxiliaryOrigin(selection.sourceNeedId, binding.name));
      if (!purposes?.has(binding.purpose)) {
        fail(
          "FEASIBILITY_AUXILIARY_FIELD_UNUSED",
          `Auxiliary field ${binding.name} is not consumed for its declared ${binding.purpose} purpose`,
        );
      }
    }
  }

  const reachesOutput = new Set<string>([outputNode.role]);
  const pending = [outputNode.role];
  while (pending.length > 0) {
    const current = pending.shift()!;
    const sources = incoming.get(current);
    if (!sources) continue;
    for (const previous of sources.values()) {
      if (!reachesOutput.has(previous)) {
        reachesOutput.add(previous);
        pending.push(previous);
      }
    }
  }
  if (reachesOutput.size !== sourceNodes.length + composition.nodes.length) fail("DAG_DISCONNECTED", "Every source and operator must contribute to Output");
}
