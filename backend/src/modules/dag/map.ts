import type {GraphSemanticValueType} from "../graph/types.js";
import {compareSemanticValues} from "./filter.js";

export interface MapFieldDefinition {
  name: string;
  type: GraphSemanticValueType;
  nullable: boolean;
  unit?: string | null;
}

export interface MapOutputDefinition {
  name: string;
  expression: unknown;
  unit?: string | null;
}

export interface MapConfig {
  mode: "extend" | "project";
  fields: readonly MapOutputDefinition[];
}

export interface MapValidationIssue {
  fieldIndex: number | null;
  code: string;
  message: string;
}

interface DecimalValue {
  coefficient: bigint;
  scale: number;
}

interface ExpressionBudget {
  nodes: number;
}

const outputNamePattern = /^[a-z][a-z0-9_]{0,99}$/;
const fieldPathPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const integerPattern = /^-?(?:0|[1-9]\d*)$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;
const forbiddenPathSegments = new Set(["__proto__", "prototype", "constructor"]);
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const scalarTypes = new Set<GraphSemanticValueType>([
  "boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json",
]);
const numericTypes = new Set<GraphSemanticValueType>(["integer", "decimal"]);
const textualTypes = new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]);
const unaryOperators = new Set([
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
const binaryOperators = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "add", "subtract", "multiply", "safe_divide"]);
const variadicOperators = new Set(["and", "or", "concat", "coalesce"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function validFieldPath(value: string): boolean {
  return fieldPathPattern.test(value) && value.split(".").every((segment) => !forbiddenPathSegments.has(segment));
}

function validateLiteralValue(type: GraphSemanticValueType, value: unknown): void {
  if (value === null) return;
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error("Boolean literal must contain a Boolean value");
    return;
  }
  if (type === "integer") {
    if (typeof value !== "string" || !integerPattern.test(value)) throw new Error("Integer literal must be a canonical integer string");
    return;
  }
  if (type === "decimal") {
    if (typeof value !== "string" || !decimalPattern.test(value)) throw new Error("Decimal literal must be an exact decimal string");
    return;
  }
  if (type === "timestamp") {
    normalizedTimestamp(value);
    return;
  }
  if (type === "date") {
    if (typeof value !== "string" || !datePattern.test(value)) throw new Error("Date literal must be YYYY-MM-DD");
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Date literal is invalid");
    return;
  }
  if (type !== "json" && typeof value !== "string") throw new Error(`${type} literal must contain a string value`);
  if (type === "json" && !["string", "number", "boolean"].includes(typeof value)) throw new Error("JSON literal must be scalar or null");
}

function compatible(left: GraphSemanticValueType, right: GraphSemanticValueType): boolean {
  return left === right
    || (numericTypes.has(left) && numericTypes.has(right))
    || (textualTypes.has(left) && textualTypes.has(right));
}

function mergedType(fields: readonly MapFieldDefinition[]): GraphSemanticValueType | null {
  const first = fields[0]?.type;
  if (!first || fields.some((field) => !compatible(first, field.type))) return null;
  if (fields.every((field) => numericTypes.has(field.type))) {
    return fields.some((field) => field.type === "decimal") ? "decimal" : "integer";
  }
  if (fields.every((field) => textualTypes.has(field.type))) {
    return fields.some((field) => field.type !== first) ? "string" : first;
  }
  return first;
}

function inferOperation(op: string, inputs: readonly MapFieldDefinition[]): MapFieldDefinition {
  const sharedUnit = inputs.every((field) => field.unit === inputs[0]?.unit) ? inputs[0]?.unit ?? null : null;
  if (op === "not" || op === "and" || op === "or") {
    if (inputs.some((field) => field.type !== "boolean")) throw new Error(`${op} requires Boolean inputs`);
    return {name: "expression", type: "boolean", nullable: inputs.some((field) => field.nullable), unit: null};
  }
  if (["eq", "ne", "lt", "lte", "gt", "gte"].includes(op)) {
    if (!compatible(inputs[0]!.type, inputs[1]!.type)) throw new Error(`${op} inputs have incompatible types`);
    return {name: "expression", type: "boolean", nullable: inputs.some((field) => field.nullable), unit: null};
  }
  if (["add", "subtract", "multiply", "safe_divide"].includes(op)) {
    if (inputs.some((field) => !numericTypes.has(field.type))) throw new Error(`${op} requires numeric inputs`);
    return {
      name: "expression",
      type: op === "safe_divide" || inputs.some((field) => field.type === "decimal") ? "decimal" : "integer",
      nullable: inputs.some((field) => field.nullable) || op === "safe_divide",
      unit: op === "add" || op === "subtract" ? inputs[0]!.unit ?? null : null,
    };
  }
  if (op === "utc_date") {
    if (!["timestamp", "integer", "string"].includes(inputs[0]!.type)) throw new Error("utc_date requires a timestamp-compatible input");
    return {name: "expression", type: "date", nullable: inputs[0]!.nullable, unit: null};
  }
  if (op === "to_integer") {
    if (!["integer", "decimal", "string"].includes(inputs[0]!.type)) throw new Error("to_integer requires an integer, decimal, or string input");
    return {name: "expression", type: "integer", nullable: inputs[0]!.nullable, unit: inputs[0]!.unit ?? null};
  }
  if (op === "to_decimal") {
    if (!["integer", "decimal", "string"].includes(inputs[0]!.type)) throw new Error("to_decimal requires an integer, decimal, or string input");
    return {name: "expression", type: "decimal", nullable: inputs[0]!.nullable, unit: inputs[0]!.unit ?? null};
  }
  if (op === "to_timestamp") {
    if (inputs[0]!.type !== "string") throw new Error("to_timestamp requires an ISO-8601 string input");
    return {name: "expression", type: "timestamp", nullable: inputs[0]!.nullable, unit: null};
  }
  if (op === "epoch_seconds_to_timestamp" || op === "epoch_milliseconds_to_timestamp") {
    if (!["integer", "string"].includes(inputs[0]!.type)) throw new Error(`${op} requires an integer or integer-string input`);
    return {name: "expression", type: "timestamp", nullable: inputs[0]!.nullable, unit: null};
  }
  if (op === "trim" || op === "lower" || op === "upper") {
    if (!textualTypes.has(inputs[0]!.type)) throw new Error(`${op} requires a textual input`);
    return {name: "expression", type: "string", nullable: inputs[0]!.nullable, unit: null};
  }
  if (op === "abs" || op === "round" || op === "floor" || op === "ceil") {
    if (!numericTypes.has(inputs[0]!.type)) throw new Error(`${op} requires a numeric input`);
    return {
      name: "expression",
      type: op === "abs" ? inputs[0]!.type : "integer",
      nullable: inputs[0]!.nullable,
      unit: inputs[0]!.unit ?? null,
    };
  }
  if (op === "concat") {
    if (inputs.some((field) => !textualTypes.has(field.type))) throw new Error("concat requires textual inputs");
    return {name: "expression", type: "string", nullable: inputs.some((field) => field.nullable), unit: null};
  }
  if (op === "coalesce") {
    const type = mergedType(inputs);
    if (!type) throw new Error("coalesce requires compatible inputs");
    return {name: "expression", type, nullable: inputs.every((field) => field.nullable), unit: sharedUnit};
  }
  if (op === "if") {
    if (inputs[0]!.type !== "boolean") throw new Error("if requires a Boolean condition");
    const type = mergedType(inputs.slice(1));
    if (!type) throw new Error("if requires compatible result branches");
    return {
      name: "expression",
      type,
      nullable: inputs.some((field) => field.nullable),
      unit: inputs[1]!.unit === inputs[2]!.unit ? inputs[1]!.unit ?? null : null,
    };
  }
  throw new Error(`Expression operator ${op} is not registered`);
}

function inferExpression(
  value: unknown,
  inputByName: ReadonlyMap<string, MapFieldDefinition>,
  budget: ExpressionBudget,
  depth = 0,
): MapFieldDefinition {
  if (depth > 8 || ++budget.nodes > 128) throw new Error("Expression exceeds the configured depth or node limit");
  if (!isRecord(value) || typeof value.op !== "string") throw new Error("Expression must declare an operator");
  if (value.op === "field") {
    if (!hasExactKeys(value, ["op", "field"]) || typeof value.field !== "string" || !validFieldPath(value.field)) {
      throw new Error("Field expression is invalid");
    }
    const field = inputByName.get(value.field);
    if (!field) throw new Error(`Field ${value.field} is not available from the predecessor node`);
    return field;
  }
  if (value.op === "literal") {
    if (!hasExactKeys(value, ["op", "valueType", "value"]) || typeof value.valueType !== "string" || !scalarTypes.has(value.valueType as GraphSemanticValueType)) {
      throw new Error("Literal expression is invalid");
    }
    validateLiteralValue(value.valueType as GraphSemanticValueType, value.value);
    return {name: "expression", type: value.valueType as GraphSemanticValueType, nullable: value.value === null, unit: null};
  }
  if (!hasExactKeys(value, ["op", "inputs"]) || !Array.isArray(value.inputs)) throw new Error(`${value.op} expression is invalid`);
  if (unaryOperators.has(value.op) && value.inputs.length !== 1) throw new Error(`${value.op} requires one input`);
  if (binaryOperators.has(value.op) && value.inputs.length !== 2) throw new Error(`${value.op} requires two inputs`);
  if (variadicOperators.has(value.op) && (value.inputs.length < 2 || value.inputs.length > 8)) throw new Error(`${value.op} requires two to eight inputs`);
  if (value.op === "if" && value.inputs.length !== 3) throw new Error("if requires three inputs");
  if (!unaryOperators.has(value.op) && !binaryOperators.has(value.op) && !variadicOperators.has(value.op) && value.op !== "if") {
    throw new Error(`Expression operator ${value.op} is not registered`);
  }
  return inferOperation(value.op, value.inputs.map((input) => inferExpression(input, inputByName, budget, depth + 1)));
}

export function inferMapExpressionField(expression: unknown, inputFields: readonly MapFieldDefinition[]): MapFieldDefinition {
  return inferExpression(expression, new Map(inputFields.map((field) => [field.name, field])), {nodes: 0});
}

export function applyMapUnitAnnotation(
  inferred: MapFieldDefinition,
  annotation: unknown,
): MapFieldDefinition {
  if (annotation === undefined || annotation === null) return {...inferred, unit: inferred.unit ?? null};
  if (typeof annotation !== "string") throw new Error("Map output unit must be a string or null");
  const unit = annotation.trim();
  if (unit.length < 1 || unit.length > 40 || controlCharacterPattern.test(unit)) {
    throw new Error("Map output unit must contain 1 to 40 printable characters");
  }
  if (inferred.unit !== undefined && inferred.unit !== null && inferred.unit !== unit) {
    throw new Error(`Map output unit ${unit} conflicts with inferred unit ${inferred.unit}`);
  }
  return {...inferred, unit};
}

export function validateMapConfig(value: unknown, inputFields: readonly MapFieldDefinition[]): readonly MapValidationIssue[] {
  if (!isRecord(value) || !hasExactKeys(value, ["mode", "fields"]) || (value.mode !== "extend" && value.mode !== "project") || !Array.isArray(value.fields)) {
    return [{fieldIndex: null, code: "MAP_CONFIG_INVALID", message: "Map config must contain exactly mode and fields"}];
  }
  if (value.fields.length < 1 || value.fields.length > 32) {
    return [{fieldIndex: null, code: "MAP_FIELD_COUNT_INVALID", message: "Map requires between 1 and 32 output fields"}];
  }
  const issues: MapValidationIssue[] = [];
  const names = new Set<string>();
  for (const [fieldIndex, candidate] of value.fields.entries()) {
    const validKeys = isRecord(candidate)
      && Object.keys(candidate).every((key) => ["name", "expression", "unit"].includes(key))
      && Object.prototype.hasOwnProperty.call(candidate, "name")
      && Object.prototype.hasOwnProperty.call(candidate, "expression");
    if (!isRecord(candidate) || !validKeys || typeof candidate.name !== "string" || !outputNamePattern.test(candidate.name)) {
      issues.push({fieldIndex, code: "MAP_FIELD_NAME_INVALID", message: "Map output field name is invalid"});
      continue;
    }
    if (names.has(candidate.name)) {
      issues.push({fieldIndex, code: "MAP_FIELD_NAME_DUPLICATED", message: `Map output field ${candidate.name} is duplicated`});
      continue;
    }
    names.add(candidate.name);
    try {
      applyMapUnitAnnotation(inferMapExpressionField(candidate.expression, inputFields), candidate.unit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Map expression is invalid";
      issues.push({
        fieldIndex,
        code: message.includes("not available")
          ? "MAP_SOURCE_FIELD_UNKNOWN"
          : message.includes("conflicts with inferred unit")
            ? "MAP_UNIT_CONFLICT"
            : message.startsWith("Map output unit")
              ? "MAP_UNIT_INVALID"
              : "MAP_EXPRESSION_INVALID",
        message,
      });
    }
  }
  return issues;
}

function parseInteger(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Integer value must be safe and integral");
    return BigInt(value);
  }
  if (typeof value !== "string" || !integerPattern.test(value)) throw new Error("Value is not a canonical integer");
  return BigInt(value);
}

function parseDecimal(value: unknown): DecimalValue {
  const text = typeof value === "bigint" || typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !decimalPattern.test(text)) throw new Error("Value is not an exact decimal");
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  return {coefficient: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), scale: fraction.length};
}

function decimalText(value: DecimalValue): string {
  if (value.coefficient === 0n) return "0";
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -value.scale);
  const fraction = digits.slice(-value.scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function alignedCoefficient(value: DecimalValue, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

function roundedQuotient(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Cannot divide by zero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const comparison = remainder * 2n - absoluteDenominator;
  if (comparison > 0n || (comparison === 0n && quotient % 2n !== 0n)) quotient += 1n;
  return negative ? -quotient : quotient;
}

function integerFromDecimal(value: DecimalValue, mode: "exact" | "round" | "floor" | "ceil"): bigint {
  if (value.scale === 0) return value.coefficient;
  const factor = 10n ** BigInt(value.scale);
  const quotient = value.coefficient / factor;
  const remainder = value.coefficient % factor;
  if (mode === "exact") {
    if (remainder !== 0n) throw new Error("Fractional decimal cannot be converted to integer without an explicit rounding operation");
    return quotient;
  }
  if (mode === "floor") return remainder !== 0n && value.coefficient < 0n ? quotient - 1n : quotient;
  if (mode === "ceil") return remainder !== 0n && value.coefficient > 0n ? quotient + 1n : quotient;
  return roundedQuotient(value.coefficient, factor);
}

function normalizedTimestamp(value: unknown): string {
  if (typeof value !== "string" || !zonedTimestampPattern.test(value)) throw new Error("Timestamp must be an ISO-8601 value with a timezone");
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) throw new Error("Timestamp is invalid");
  return new Date(milliseconds).toISOString();
}

function epochTimestamp(value: unknown, multiplier: bigint): string {
  const milliseconds = parseInteger(value) * multiplier;
  if (milliseconds < -8_640_000_000_000_000n || milliseconds > 8_640_000_000_000_000n) throw new Error("Epoch timestamp is outside the supported range");
  return new Date(Number(milliseconds)).toISOString();
}

function readPath(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (forbiddenPathSegments.has(segment) || !isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new Error(`Map row is missing declared field ${path}`);
    }
    return current[segment];
  }, row);
}

function evaluate(
  expression: unknown,
  row: unknown,
  inputByName: ReadonlyMap<string, MapFieldDefinition>,
): unknown {
  const record = expression as Record<string, unknown>;
  const op = record.op as string;
  if (op === "field") return readPath(row, record.field as string);
  if (op === "literal") return record.value;
  const expressions = record.inputs as readonly unknown[];
  if (op === "coalesce") {
    const outputType = inferExpression(expression, inputByName, {nodes: 0}).type;
    for (const input of expressions) {
      const result = evaluate(input, row, inputByName);
      if (result === null || result === undefined) continue;
      const inputType = inferExpression(input, inputByName, {nodes: 0}).type;
      if (outputType === "decimal" && inputType === "integer") return decimalText(parseDecimal(result));
      if (outputType === "string" && textualTypes.has(inputType)) return String(result);
      return result;
    }
    return null;
  }
  if (op === "if") {
    const condition = evaluate(expressions[0], row, inputByName);
    if (condition === null || condition === undefined) return null;
    if (typeof condition !== "boolean") throw new Error("if condition is not Boolean");
    return evaluate(condition ? expressions[1] : expressions[2], row, inputByName);
  }
  if (op === "and" || op === "or") {
    let sawNull = false;
    for (const input of expressions) {
      const result = evaluate(input, row, inputByName);
      if (result === null || result === undefined) {
        sawNull = true;
      } else if (typeof result !== "boolean") {
        throw new Error(`${op} input is not Boolean`);
      } else if (op === "and" && !result) {
        return false;
      } else if (op === "or" && result) {
        return true;
      }
    }
    return sawNull ? null : op === "and";
  }
  const values = expressions.map((input) => evaluate(input, row, inputByName));
  if (values.some((value) => value === null || value === undefined)) return null;
  const value = values[0];
  if (op === "not") return !value;
  if (op === "trim") return String(value).trim();
  if (op === "lower") return String(value).toLowerCase();
  if (op === "upper") return String(value).toUpperCase();
  if (op === "to_integer") return integerFromDecimal(parseDecimal(value), "exact").toString();
  if (op === "to_decimal") return decimalText(parseDecimal(value));
  if (op === "to_timestamp") return normalizedTimestamp(value);
  if (op === "epoch_seconds_to_timestamp") return epochTimestamp(value, 1_000n);
  if (op === "epoch_milliseconds_to_timestamp") return epochTimestamp(value, 1n);
  if (op === "utc_date") {
    const timestamp = typeof value === "string" && !integerPattern.test(value)
      ? normalizedTimestamp(value)
      : epochTimestamp(value, 1_000n);
    return timestamp.slice(0, 10);
  }
  if (op === "abs") {
    const parsed = parseDecimal(value);
    return decimalText({...parsed, coefficient: parsed.coefficient < 0n ? -parsed.coefficient : parsed.coefficient});
  }
  if (op === "round" || op === "floor" || op === "ceil") return integerFromDecimal(parseDecimal(value), op).toString();
  if (op === "concat") return values.map(String).join("");
  if (["eq", "ne", "lt", "lte", "gt", "gte"].includes(op)) {
    const inputFields = expressions.map((input) => inferExpression(input, inputByName, {nodes: 0}));
    const comparisonType = mergedType(inputFields) ?? inputFields[0]!.type;
    const comparison = compareSemanticValues(comparisonType, values[0], values[1]);
    if (op === "eq") return comparison === 0;
    if (op === "ne") return comparison !== 0;
    if (op === "lt") return comparison < 0;
    if (op === "lte") return comparison <= 0;
    if (op === "gt") return comparison > 0;
    return comparison >= 0;
  }
  const left = parseDecimal(values[0]);
  const right = parseDecimal(values[1]);
  if (op === "add" || op === "subtract") {
    const scale = Math.max(left.scale, right.scale);
    const rightCoefficient = alignedCoefficient(right, scale);
    return decimalText({
      coefficient: alignedCoefficient(left, scale) + (op === "add" ? rightCoefficient : -rightCoefficient),
      scale,
    });
  }
  if (op === "multiply") return decimalText({coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale});
  if (op === "safe_divide") {
    if (right.coefficient === 0n) return null;
    const scale = 6;
    const numerator = left.coefficient * 10n ** BigInt(right.scale + scale);
    const denominator = right.coefficient * 10n ** BigInt(left.scale);
    return decimalText({coefficient: roundedQuotient(numerator, denominator), scale});
  }
  throw new Error(`Expression operator ${op} is not executable`);
}

export function mapRows<Row extends object>(
  rows: readonly Row[],
  config: MapConfig,
  inputFields: readonly MapFieldDefinition[],
): readonly Record<string, unknown>[] {
  const issues = validateMapConfig(config, inputFields);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  const inputByName = new Map(inputFields.map((field) => [field.name, field]));
  return rows.map((row) => {
    const output: Record<string, unknown> = config.mode === "extend" ? {...row} : {};
    for (const definition of config.fields) output[definition.name] = evaluate(definition.expression, row, inputByName);
    return output;
  });
}
