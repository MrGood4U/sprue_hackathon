import type {GraphSemanticValueType} from "../../graph/index.js";
import {validateFilterPredicate} from "../../dag/filter.js";
import {validateSortConfig} from "../../dag/sort.js";
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
const fieldReferencePattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const integerLiteralPattern = /^-?(?:0|[1-9]\d*)$/;
const decimalLiteralPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const dateLiteralPattern = /^\d{4}-\d{2}-\d{2}$/;
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

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

export interface SourceRoleFieldShape {
  name: string;
  type: GraphSemanticValueType;
  nullable: boolean;
  unit: string | null;
  origin: string | null;
}

export function sourceAuxiliaryOrigin(sourceNeedId: string, name: string): string {
  return `${sourceNeedId}:${name}`;
}

export function sourceRequirementOrigin(sourceNeedId: string, requirementId: string): string {
  return `${sourceNeedId}:requirement:${requirementId}`;
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
    configContract: "{predicate:{combinator:'and'|'or',conditions:[{field,operator:'eq'|'ne'|'lt'|'lte'|'gt'|'gte',value:string|boolean}|{field,operator:'in'|'not_in',values:(string|boolean)[]}|{field,operator:'between',values:[string|boolean,string|boolean]}|{field,operator:'is_null'|'is_not_null'}]}}; use only operators valid for the referenced field type. Legacy {expression:Expression} remains accepted.",
  },
  {
    type: "map",
    operatorVersion: "2",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{mode:'extend'|'project',fields:[{name,expression:Expression,unit:string|null}]}; unit is semantic metadata, not a numeric conversion. Use null to inherit the expression unit.",
  },
  {
    type: "aggregate",
    operatorVersion: "2",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{groupBy:string[],measures:[{name,op:'count_rows'|'count_distinct'|'sum'|'min'|'max'|'average',field:string|null}]}",
  },
  {
    type: "sort",
    operatorVersion: "1",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{orderBy:[{field,direction:'asc'|'desc',nulls:'first'|'last'}],limit:integer|null}; orderBy priority follows array order, limit null means full stable sort, and limit K means stable top K.",
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
    operatorVersion: "3",
    inputPorts: ["rows"],
    outputPorts: [],
    configContract: "{fields:string[]}; preserves predecessor row order and cannot sort. Use a preceding Sort operator for every requested ordering.",
  },
] as const;

function fail(code: string, message: string): never {
  throw new HarnessCompileError(code, message);
}

function validateLiteralValue(type: GraphSemanticValueType, value: unknown): void {
  if (value === null) return;
  if (type === "boolean") {
    if (typeof value !== "boolean") fail("EXPRESSION_INVALID", "Boolean literal must contain a Boolean value");
    return;
  }
  if (type === "integer") {
    if (typeof value !== "string" || !integerLiteralPattern.test(value)) fail("EXPRESSION_INVALID", "Integer literal must be a canonical integer string");
    return;
  }
  if (type === "decimal") {
    if (typeof value !== "string" || !decimalLiteralPattern.test(value)) fail("EXPRESSION_INVALID", "Decimal literal must be an exact decimal string");
    return;
  }
  if (type === "timestamp") {
    if (typeof value !== "string" || !zonedTimestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
      fail("EXPRESSION_INVALID", "Timestamp literal must be an ISO-8601 value with a timezone");
    }
    return;
  }
  if (type === "date") {
    if (typeof value !== "string" || !dateLiteralPattern.test(value)) fail("EXPRESSION_INVALID", "Date literal must be YYYY-MM-DD");
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail("EXPRESSION_INVALID", "Date literal is invalid");
    return;
  }
  if (type !== "json" && typeof value !== "string") fail("EXPRESSION_INVALID", `${type} literal must contain a string value`);
  if (type === "json" && !["string", "number", "boolean"].includes(typeof value)) fail("EXPRESSION_INVALID", "JSON literal must be scalar or null");
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

function fieldReference(value: unknown, label: string): string {
  if (typeof value !== "string" || !fieldReferencePattern.test(value)) {
    fail("OPERATOR_CONFIG_INVALID", `${label} must be an inspected field path or lowercase identifier`);
  }
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key)) || keys.some((key) => !(key in value))) {
    fail("OPERATOR_CONFIG_INVALID", `${label} must contain exactly ${keys.join(", ")}`);
  }
}

function mapUnit(
  value: unknown,
  inferred: FieldShape,
  expectedUnitsByOrigin: ReadonlyMap<string, string | null>,
): FieldShape {
  if (value === null) return inferred;
  if (typeof value !== "string") fail("MAP_UNIT_INVALID", "Map output unit must be a string or null");
  const unit = value.trim();
  if (unit.length < 1 || unit.length > 40 || controlCharacterPattern.test(unit)) {
    fail("MAP_UNIT_INVALID", "Map output unit must contain 1 to 40 printable characters");
  }
  if (inferred.unit !== null && inferred.unit !== unit) {
    fail("MAP_UNIT_CONFLICT", `Map output unit ${unit} conflicts with inferred unit ${inferred.unit}`);
  }
  if (inferred.unit === null) {
    const originUnits = [...inferred.origins].map((origin) => expectedUnitsByOrigin.get(origin));
    if (originUnits.length === 0 || originUnits.some((originUnit) => originUnit !== unit)) {
      fail("MAP_UNIT_UNSUPPORTED", `Map output unit ${unit} is not supported by the mapped source requirements`);
    }
  }
  return {...inferred, unit};
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
  const fieldName = fieldReference(name, label);
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
    validateLiteralValue(valueType as GraphSemanticValueType, expression.value);
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
  const unary = new Set([
    "not",
    "utc_date",
    "to_integer",
    "to_decimal",
    "to_timestamp",
    "epoch_seconds_to_timestamp",
    "epoch_milliseconds_to_timestamp",
    "trim",
    "lower",
    "upper",
    "abs",
    "round",
    "floor",
    "ceil",
  ]);
  const binary = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "add", "subtract", "multiply", "safe_divide"]);
  if (unary.has(op) && inputs.length !== 1) fail("EXPRESSION_INVALID", `${op} requires one input`);
  if (binary.has(op) && inputs.length !== 2) fail("EXPRESSION_INVALID", `${op} requires two inputs`);
  if (["and", "or", "concat", "coalesce"].includes(op) && (inputs.length < 2 || inputs.length > 8)) {
    fail("EXPRESSION_INVALID", `${op} requires two to eight inputs`);
  }
  if (op === "if" && inputs.length !== 3) fail("EXPRESSION_INVALID", "if requires three inputs");
  if (!unary.has(op) && !binary.has(op) && !["and", "or", "concat", "coalesce", "if"].includes(op)) {
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
  if (op === "to_integer") {
    if (!new Set<GraphSemanticValueType>(["integer", "decimal", "string"]).has(inferred[0]!.type)) {
      fail("EXPRESSION_TYPE_INVALID", "to_integer requires an integer, decimal, or string input");
    }
    return {
      type: "integer",
      nullable: inferred[0]!.nullable,
      unit: inferred[0]!.unit,
      cardinality: inferred[0]!.cardinality,
      nonZero: inferred[0]!.nonZero,
      origins: inferred[0]!.origins,
    };
  }
  if (op === "to_decimal") {
    if (!new Set<GraphSemanticValueType>(["integer", "decimal", "string"]).has(inferred[0]!.type)) {
      fail("EXPRESSION_TYPE_INVALID", "to_decimal requires an integer, decimal, or string input");
    }
    return {
      type: "decimal",
      nullable: inferred[0]!.nullable,
      unit: inferred[0]!.unit,
      cardinality: false,
      nonZero: inferred[0]!.nonZero,
      origins: inferred[0]!.origins,
    };
  }
  if (op === "to_timestamp") {
    if (inferred[0]!.type !== "string") {
      fail("EXPRESSION_TYPE_INVALID", "to_timestamp requires an ISO-8601 string input");
    }
    return {
      type: "timestamp",
      nullable: inferred[0]!.nullable,
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: inferred[0]!.origins,
    };
  }
  if (op === "epoch_seconds_to_timestamp" || op === "epoch_milliseconds_to_timestamp") {
    if (inferred[0]!.type !== "integer" && inferred[0]!.type !== "string") {
      fail("EXPRESSION_TYPE_INVALID", `${op} requires an integer or integer-string input`);
    }
    return {
      type: "timestamp",
      nullable: inferred[0]!.nullable,
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: inferred[0]!.origins,
    };
  }
  if (op === "trim" || op === "lower" || op === "upper") {
    if (!new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]).has(inferred[0]!.type)) {
      fail("EXPRESSION_TYPE_INVALID", `${op} requires a textual input`);
    }
    return {
      type: "string",
      nullable: inferred[0]!.nullable,
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: inferred[0]!.origins,
    };
  }
  if (op === "abs" || op === "round" || op === "floor" || op === "ceil") {
    if (inferred[0]!.type !== "integer" && inferred[0]!.type !== "decimal") {
      fail("EXPRESSION_TYPE_INVALID", `${op} requires a numeric input`);
    }
    return {
      type: op === "abs" ? inferred[0]!.type : "integer",
      nullable: inferred[0]!.nullable,
      unit: inferred[0]!.unit,
      cardinality: op === "abs" && inferred[0]!.cardinality,
      nonZero: op === "abs" && inferred[0]!.nonZero,
      origins: inferred[0]!.origins,
    };
  }
  if (op === "concat") {
    const textual = new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]);
    if (inferred.some((item) => !textual.has(item.type))) fail("EXPRESSION_TYPE_INVALID", "concat requires textual inputs");
    return {
      type: "string",
      nullable: inferred.some((item) => item.nullable),
      unit: null,
      cardinality: false,
      nonZero: false,
      origins: mergedOrigins(inferred),
    };
  }
  if (op === "coalesce") {
    const firstType = inferred[0]!.type;
    if (inferred.some((item) => !compatible(firstType, item.type))) {
      fail("EXPRESSION_TYPE_INVALID", "coalesce requires compatible inputs");
    }
    const numeric = inferred.every((item) => item.type === "integer" || item.type === "decimal");
    const textual = inferred.every((item) => new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]).has(item.type));
    return {
      type: numeric && inferred.some((item) => item.type === "decimal")
        ? "decimal"
        : textual && inferred.some((item) => item.type !== firstType)
          ? "string"
          : firstType,
      nullable: inferred.every((item) => item.nullable),
      unit: inferred.every((item) => item.unit === inferred[0]!.unit) ? inferred[0]!.unit : null,
      cardinality: inferred.every((item) => item.cardinality),
      nonZero: inferred.every((item) => item.nonZero),
      origins: mergedOrigins(inferred),
    };
  }
  if (inferred[0]!.type !== "boolean" || !compatible(inferred[1]!.type, inferred[2]!.type)) {
    fail("EXPRESSION_TYPE_INVALID", "if requires a Boolean condition and compatible result branches");
  }
  const branchType = inferred[1]!.type === inferred[2]!.type
    ? inferred[1]!.type
    : (inferred[1]!.type === "integer" || inferred[1]!.type === "decimal")
        && (inferred[2]!.type === "integer" || inferred[2]!.type === "decimal")
      ? "decimal"
      : "string";
  return {
    type: branchType,
    nullable: inferred.some((item) => item.nullable),
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
  expectedUnitsByOrigin: ReadonlyMap<string, string | null>,
): RowShape {
  const config = record(configValue, `${operator} config`);
  if (operator === "filter") {
    const source = inputs.get("rows")!;
    if ("predicate" in config) {
      exactKeys(config, ["predicate"], "Filter config");
      const issues = validateFilterPredicate(config.predicate, [...source].map(([name, shape]) => ({
        name,
        type: shape.type,
        nullable: shape.nullable,
      })));
      if (issues.length > 0) fail(issues[0]!.code, issues[0]!.message);
      const predicate = config.predicate as {conditions: readonly {field: string}[]};
      for (const condition of predicate.conditions) {
        field(source, condition.field, "Filter condition", {fields: usage, purpose: "filter"});
      }
    } else {
      exactKeys(config, ["expression"], "Filter config");
      const result = expressionType(config.expression, source, {nodes: 0}, {fields: usage, purpose: "filter"});
      if (result.type !== "boolean") fail("FILTER_EXPRESSION_INVALID", "Filter expression must return Boolean");
    }
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
      exactKeys(definition, ["name", "expression", "unit"], "Map field");
      const name = string(definition.name, "Map field name");
      if (seen.has(name)) fail("OPERATOR_CONFIG_INVALID", `Map field ${name} is duplicated`);
      seen.add(name);
      const inferred = expressionType(definition.expression, source, {nodes: 0}, {fields: usage, purpose: "derive"});
      output.set(name, mapUnit(definition.unit, inferred, expectedUnitsByOrigin));
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
  if (operator === "sort") {
    exactKeys(config, ["orderBy", "limit"], "Sort config");
    const source = inputs.get("rows")!;
    const issues = validateSortConfig(config, [...source].map(([name, shape]) => ({
      name,
      type: shape.type,
      nullable: shape.nullable,
    })));
    if (issues.length > 0) fail(issues[0]!.code, issues[0]!.message);
    for (const ordering of config.orderBy as readonly {field: string}[]) {
      field(source, ordering.field, "Sort orderBy", {fields: usage, purpose: "sort"});
    }
    return source;
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
    exactKeys(config, ["fields"], "Output config");
    const source = inputs.get("rows")!;
    const output = new Map<string, FieldShape>();
    const fields = array(config.fields, "Output fields", 32);
    if (fields.length === 0) fail("OPERATOR_CONFIG_INVALID", "Output requires at least one field");
    for (const fieldValue of fields) {
      const name = string(fieldValue, "Output field");
      if (output.has(name)) fail("OPERATOR_CONFIG_INVALID", `Output field ${name} is duplicated`);
      output.set(name, field(source, name, "Output", {fields: usage, purpose: "output"}));
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
  sourceFieldsByNeed: ReadonlyMap<string, readonly SourceRoleFieldShape[]> = new Map(),
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
  for (const node of composition.nodes) {
    const signature = flexibleOperatorRegistry.find((candidate) => candidate.type === node.operator);
    if (!signature || signature.operatorVersion !== node.operatorVersion) {
      fail("OPERATOR_VERSION_INVALID", `Operator ${node.operator} requires version ${signature?.operatorVersion ?? "unavailable"}`);
    }
  }

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
  for (const source of sourceNodes) {
    const targets = [...outgoing.get(source.role)!];
    const boundary = targets.length === 1 ? nodes.get(targets[0]!) : null;
    if (
      !boundary
      || boundary.operator !== "map"
      || incoming.get(boundary.role)?.get("rows") !== source.role
      || boundary.config.mode !== "project"
    ) {
      fail(
        "SOURCE_NORMALIZATION_MAP_REQUIRED",
        `Source role ${source.role} must connect exclusively to one project-mode Map boundary`,
      );
    }
  }

  const shapes = new Map<string, RowShape>();
  const fieldUsage: FieldUsage = new Map();
  const expectedUnitsByOrigin = new Map<string, string | null>();
  for (const need of needs) {
    for (const requirement of need.fields) {
      expectedUnitsByOrigin.set(sourceRequirementOrigin(need.id, requirement.id), requirement.unit);
    }
  }
  for (const {role, need} of sourceNodes) {
    const fields = new Map<string, FieldShape>();
    for (const sourceField of sourceFieldsByNeed.get(need.id) ?? []) {
      if (fields.has(sourceField.name)) {
        fail("SOURCE_FIELD_DUPLICATED", `Source role ${role} exposes duplicate inspected field ${sourceField.name}`);
      }
      fields.set(sourceField.name, {
        type: sourceField.type,
        nullable: sourceField.nullable,
        unit: sourceField.unit,
        cardinality: false,
        nonZero: false,
        origins: sourceField.origin === null ? new Set() : new Set([sourceField.origin]),
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
        shapes.set(next, outputShape(node.operator, node.config, inputs, fieldUsage, expectedUnitsByOrigin));
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
  if (plan.result.orderBy.length > 0) {
    const predecessorRole = incoming.get(outputNode.role)?.get("rows");
    const predecessor = predecessorRole ? nodes.get(predecessorRole) : null;
    const configuredOrder = predecessor?.operator === "sort"
      ? (predecessor.config.orderBy as readonly {field: string; direction: "asc" | "desc"}[])
      : [];
    const preservesSemanticOrder = predecessor?.operator === "sort"
      && configuredOrder.length === plan.result.orderBy.length
      && configuredOrder.every((item, index) => item.field === plan.result.orderBy[index]?.field
        && item.direction === plan.result.orderBy[index]?.direction);
    if (!preservesSemanticOrder) {
      fail("OUTPUT_ORDER_INVALID", "Semantic result ordering must be implemented by the Sort operator immediately before Output");
    }
  }

  for (const selection of selections) {
    for (const binding of selection.fieldBindings) {
      const purposes = fieldUsage.get(sourceRequirementOrigin(selection.sourceNeedId, binding.requirementId));
      if (!purposes?.has("derive")) {
        fail(
          "SOURCE_FIELD_NORMALIZATION_MISSING",
          `Selected source field ${binding.fieldPath} is not consumed by its boundary Map`,
        );
      }
    }
    for (const binding of selection.auxiliaryFieldBindings) {
      const purposes = fieldUsage.get(sourceAuxiliaryOrigin(selection.sourceNeedId, binding.name));
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
