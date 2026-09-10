import type {GraphSemanticValueType} from "../graph/types.js";

export type FilterOperator =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "not_in"
  | "between"
  | "is_null"
  | "is_not_null";

export type FilterLiteral = string | boolean;

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: FilterLiteral;
  values?: readonly FilterLiteral[];
}

export interface FilterPredicate {
  combinator: "and" | "or";
  conditions: readonly FilterCondition[];
}

export interface FilterFieldDefinition {
  name: string;
  type: GraphSemanticValueType;
  nullable: boolean;
}

export interface FilterValidationIssue {
  conditionIndex: number | null;
  code: string;
  message: string;
}

const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;
const integerPattern = /^-?(?:0|[1-9]\d*)$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const zonedTimestampPattern = /(?:Z|[+-]\d{2}:\d{2})$/i;

const equalityOperators = ["eq", "ne", "in", "not_in"] as const;
const orderedOperators = ["lt", "lte", "gt", "gte", "between"] as const;
const nullOperators = ["is_null", "is_not_null"] as const;

export function filterOperatorsForField(field: FilterFieldDefinition): readonly FilterOperator[] {
  const nullable = field.nullable ? nullOperators : [];
  if (field.type === "boolean") return ["eq", "ne", ...nullable];
  if (["integer", "decimal", "timestamp", "date"].includes(field.type)) {
    return [...equalityOperators, ...orderedOperators, ...nullable];
  }
  if (["string", "id", "address", "bytes"].includes(field.type)) {
    return [...equalityOperators, ...nullable];
  }
  return [];
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && allowed.every((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDate(value: unknown): string {
  if (typeof value !== "string" || !datePattern.test(value)) throw new Error("must be a YYYY-MM-DD date");
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) throw new Error("must be a valid calendar date");
  return value;
}

function normalizeTimestamp(value: unknown): bigint | number {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("must be a safe integer timestamp or an ISO 8601 instant");
    return BigInt(value);
  }
  if (typeof value !== "string") throw new Error("must be an integer timestamp or an ISO 8601 instant");
  if (integerPattern.test(value)) return BigInt(value);
  if (!zonedTimestampPattern.test(value)) throw new Error("must include a UTC or numeric timezone offset");
  const instant = Date.parse(value);
  if (Number.isNaN(instant)) throw new Error("must be a valid ISO 8601 instant");
  return instant;
}

interface DecimalValue {
  integer: bigint;
  scale: number;
}

function normalizeDecimal(value: unknown): DecimalValue {
  const text = typeof value === "number" || typeof value === "bigint" ? String(value) : value;
  if (typeof text !== "string" || !decimalPattern.test(text)) throw new Error("must be an exact decimal");
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  return {
    integer: BigInt(`${integer}${fraction}`) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}

function compareDecimals(left: DecimalValue, right: DecimalValue): number {
  const scale = Math.max(left.scale, right.scale);
  const leftInteger = left.integer * 10n ** BigInt(scale - left.scale);
  const rightInteger = right.integer * 10n ** BigInt(scale - right.scale);
  return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
}

export function compareSemanticValues(type: GraphSemanticValueType, left: unknown, right: unknown): number {
  if (type === "integer") {
    const leftInteger = typeof left === "bigint" ? left : BigInt(String(left));
    const rightInteger = typeof right === "bigint" ? right : BigInt(String(right));
    return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
  }
  if (type === "decimal") return compareDecimals(normalizeDecimal(left), normalizeDecimal(right));
  if (type === "timestamp") {
    const leftTimestamp = normalizeTimestamp(left);
    const rightTimestamp = normalizeTimestamp(right);
    if (typeof leftTimestamp !== typeof rightTimestamp) {
      throw new Error("cannot compare integer and ISO timestamp representations");
    }
    return leftTimestamp < rightTimestamp ? -1 : leftTimestamp > rightTimestamp ? 1 : 0;
  }
  if (type === "date") {
    const leftDate = normalizeDate(left);
    const rightDate = normalizeDate(right);
    return leftDate.localeCompare(rightDate);
  }
  if (type === "boolean") {
    if (typeof left !== "boolean" || typeof right !== "boolean") throw new Error("must be Boolean");
    return left === right ? 0 : left ? 1 : -1;
  }
  if (["string", "id", "address", "bytes"].includes(type)) {
    if (typeof left !== "string" || typeof right !== "string") throw new Error("must be text");
    const normalizedLeft = type === "address" ? left.toLowerCase() : left;
    const normalizedRight = type === "address" ? right.toLowerCase() : right;
    return normalizedLeft === normalizedRight ? 0 : normalizedLeft < normalizedRight ? -1 : 1;
  }
  throw new Error(`field type ${type} is not filterable`);
}

function validateLiteral(field: FilterFieldDefinition, value: unknown): string | null {
  try {
    if (field.type === "boolean") {
      if (typeof value !== "boolean") throw new Error("must be Boolean");
      return null;
    }
    if (typeof value !== "string" || value.length === 0 || value.length > 512) throw new Error("must be non-empty text with at most 512 characters");
    compareSemanticValues(field.type, value, value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "has an invalid value";
  }
}

export function validateFilterPredicate(
  value: unknown,
  fields: readonly FilterFieldDefinition[],
): readonly FilterValidationIssue[] {
  const issues: FilterValidationIssue[] = [];
  if (!isRecord(value) || !hasExactKeys(value, ["combinator", "conditions"])) {
    return [{conditionIndex: null, code: "FILTER_PREDICATE_INVALID", message: "Filter predicate must contain exactly combinator and conditions"}];
  }
  if (value.combinator !== "and" && value.combinator !== "or") {
    issues.push({conditionIndex: null, code: "FILTER_COMBINATOR_INVALID", message: "Filter combinator must be and or or"});
  }
  if (!Array.isArray(value.conditions) || value.conditions.length < 1 || value.conditions.length > 32) {
    issues.push({conditionIndex: null, code: "FILTER_CONDITION_COUNT_INVALID", message: "Filter must contain between 1 and 32 conditions"});
    return issues;
  }
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  for (const [index, candidate] of value.conditions.entries()) {
    if (!isRecord(candidate) || typeof candidate.field !== "string" || typeof candidate.operator !== "string") {
      issues.push({conditionIndex: index, code: "FILTER_CONDITION_INVALID", message: "Condition must declare a field and operator"});
      continue;
    }
    const field = fieldByName.get(candidate.field);
    if (!identifierPattern.test(candidate.field) || !field) {
      issues.push({conditionIndex: index, code: "FILTER_FIELD_UNKNOWN", message: `Field ${candidate.field} is not available from the predecessor node`});
      continue;
    }
    const operator = candidate.operator as FilterOperator;
    if (!filterOperatorsForField(field).includes(operator)) {
      issues.push({conditionIndex: index, code: "FILTER_OPERATOR_INVALID", message: `Operator ${candidate.operator} is not valid for ${field.type}`});
      continue;
    }
    if (operator === "is_null" || operator === "is_not_null") {
      if (!hasExactKeys(candidate, ["field", "operator"])) {
        issues.push({conditionIndex: index, code: "FILTER_CONDITION_INVALID", message: `${operator} must not include a value`});
      }
      continue;
    }
    if (operator === "in" || operator === "not_in" || operator === "between") {
      if (!hasExactKeys(candidate, ["field", "operator", "values"]) || !Array.isArray(candidate.values)) {
        issues.push({conditionIndex: index, code: "FILTER_VALUES_INVALID", message: `${operator} requires a values array`});
        continue;
      }
      const expectedLength = operator === "between" ? 2 : null;
      if ((expectedLength !== null && candidate.values.length !== expectedLength)
        || (expectedLength === null && (candidate.values.length < 1 || candidate.values.length > 50))) {
        issues.push({conditionIndex: index, code: "FILTER_VALUES_INVALID", message: operator === "between" ? "between requires exactly two values" : `${operator} requires between 1 and 50 values`});
        continue;
      }
      const invalid = candidate.values.map((item) => validateLiteral(field, item)).find(Boolean);
      if (invalid) issues.push({conditionIndex: index, code: "FILTER_VALUE_TYPE_INVALID", message: `Condition value ${invalid}`});
      continue;
    }
    if (!hasExactKeys(candidate, ["field", "operator", "value"])) {
      issues.push({conditionIndex: index, code: "FILTER_VALUE_INVALID", message: `${operator} requires one value`});
      continue;
    }
    const invalid = validateLiteral(field, candidate.value);
    if (invalid) issues.push({conditionIndex: index, code: "FILTER_VALUE_TYPE_INVALID", message: `Condition value ${invalid}`});
  }
  return issues;
}

function readField(row: unknown, name: string): unknown {
  if (!isRecord(row) || !Object.prototype.hasOwnProperty.call(row, name)) {
    throw new Error(`Filter row is missing declared field ${name}`);
  }
  return row[name];
}

function evaluateCondition(row: unknown, condition: FilterCondition, field: FilterFieldDefinition): boolean {
  const actual = readField(row, condition.field);
  if (condition.operator === "is_null") return actual === null || actual === undefined;
  if (condition.operator === "is_not_null") return actual !== null && actual !== undefined;
  if (actual === null || actual === undefined) return false;
  if (condition.operator === "in" || condition.operator === "not_in") {
    const matched = (condition.values ?? []).some((value) => compareSemanticValues(field.type, actual, value) === 0);
    return condition.operator === "in" ? matched : !matched;
  }
  if (condition.operator === "between") {
    const [minimum, maximum] = condition.values ?? [];
    return minimum !== undefined && maximum !== undefined
      && compareSemanticValues(field.type, actual, minimum) >= 0
      && compareSemanticValues(field.type, actual, maximum) <= 0;
  }
  const comparison = compareSemanticValues(field.type, actual, condition.value);
  if (condition.operator === "eq") return comparison === 0;
  if (condition.operator === "ne") return comparison !== 0;
  if (condition.operator === "lt") return comparison < 0;
  if (condition.operator === "lte") return comparison <= 0;
  if (condition.operator === "gt") return comparison > 0;
  return comparison >= 0;
}

export function filterRows<Row extends object>(
  rows: readonly Row[],
  predicate: FilterPredicate,
  fields: readonly FilterFieldDefinition[],
): readonly Row[] {
  const issues = validateFilterPredicate(predicate, fields);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  return rows.filter((row) => {
    const results = predicate.conditions.map((condition) => evaluateCondition(row, condition, fieldByName.get(condition.field)!));
    return predicate.combinator === "and" ? results.every(Boolean) : results.some(Boolean);
  });
}
