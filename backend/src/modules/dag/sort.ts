import type {GraphSemanticValueType} from "../graph/types.js";
import {compareSemanticValues} from "./filter.js";

export type SortDirection = "asc" | "desc";
export type NullPlacement = "first" | "last";

export interface SortKey {
  field: string;
  direction: SortDirection;
  nulls: NullPlacement;
}

export interface SortConfig {
  orderBy: readonly SortKey[];
  limit: number | null;
}

export interface SortFieldDefinition {
  name: string;
  type: GraphSemanticValueType;
  nullable: boolean;
}

export interface SortValidationIssue {
  orderIndex: number | null;
  code: string;
  message: string;
}

interface DecoratedRow<Row> {
  row: Row;
  inputIndex: number;
}

const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;
const sortableTypes = new Set<GraphSemanticValueType>([
  "boolean",
  "string",
  "id",
  "address",
  "bytes",
  "integer",
  "decimal",
  "timestamp",
  "date",
]);
const maximumOrderKeys = 8;
const maximumTopK = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

export function validateSortConfig(
  value: unknown,
  fields: readonly SortFieldDefinition[],
): readonly SortValidationIssue[] {
  if (!isRecord(value) || !hasExactKeys(value, ["orderBy", "limit"])) {
    return [{orderIndex: null, code: "SORT_CONFIG_INVALID", message: "Sort config must contain exactly orderBy and limit"}];
  }

  const issues: SortValidationIssue[] = [];
  if (!Array.isArray(value.orderBy) || value.orderBy.length < 1 || value.orderBy.length > maximumOrderKeys) {
    issues.push({orderIndex: null, code: "SORT_KEY_COUNT_INVALID", message: `Sort requires between 1 and ${maximumOrderKeys} keys`});
    return issues;
  }
  if (value.limit !== null && (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > maximumTopK)) {
    issues.push({orderIndex: null, code: "SORT_LIMIT_INVALID", message: `Top K must be null or an integer between 1 and ${maximumTopK}`});
  }

  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  const seen = new Set<string>();
  for (const [index, candidate] of value.orderBy.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ["field", "direction", "nulls"])) {
      issues.push({orderIndex: index, code: "SORT_KEY_INVALID", message: "Sort key must contain exactly field, direction, and nulls"});
      continue;
    }
    if (typeof candidate.field !== "string" || !identifierPattern.test(candidate.field) || !fieldByName.has(candidate.field)) {
      issues.push({orderIndex: index, code: "SORT_FIELD_UNKNOWN", message: `Field ${String(candidate.field)} is not available from the predecessor node`});
      continue;
    }
    if (seen.has(candidate.field)) {
      issues.push({orderIndex: index, code: "SORT_FIELD_DUPLICATED", message: `Field ${candidate.field} is used more than once`});
    }
    seen.add(candidate.field);
    if (!sortableTypes.has(fieldByName.get(candidate.field)!.type)) {
      issues.push({orderIndex: index, code: "SORT_FIELD_TYPE_INVALID", message: `Field ${candidate.field} is not sortable`});
    }
    if (candidate.direction !== "asc" && candidate.direction !== "desc") {
      issues.push({orderIndex: index, code: "SORT_DIRECTION_INVALID", message: "Sort direction must be asc or desc"});
    }
    if (candidate.nulls !== "first" && candidate.nulls !== "last") {
      issues.push({orderIndex: index, code: "SORT_NULLS_INVALID", message: "Null placement must be first or last"});
    }
  }
  return issues;
}

function rowValue(row: unknown, field: SortFieldDefinition): unknown {
  if (!isRecord(row) || !Object.prototype.hasOwnProperty.call(row, field.name)) {
    throw new Error(`Sort row is missing declared field ${field.name}`);
  }
  const value = row[field.name];
  if ((value === null || value === undefined) && !field.nullable) {
    throw new Error(`Sort row field ${field.name} is unexpectedly null`);
  }
  return value;
}

function compareRows<Row>(
  left: DecoratedRow<Row>,
  right: DecoratedRow<Row>,
  orderBy: readonly SortKey[],
  fieldByName: ReadonlyMap<string, SortFieldDefinition>,
): number {
  for (const ordering of orderBy) {
    const field = fieldByName.get(ordering.field)!;
    const leftValue = rowValue(left.row, field);
    const rightValue = rowValue(right.row, field);
    const leftNull = leftValue === null || leftValue === undefined;
    const rightNull = rightValue === null || rightValue === undefined;
    if (leftNull || rightNull) {
      if (leftNull && rightNull) continue;
      return leftNull === (ordering.nulls === "first") ? -1 : 1;
    }
    const comparison = compareSemanticValues(field.type, leftValue, rightValue);
    if (comparison !== 0) return ordering.direction === "asc" ? comparison : -comparison;
  }
  return left.inputIndex - right.inputIndex;
}

function siftDown<Row>(
  heap: DecoratedRow<Row>[],
  start: number,
  compare: (left: DecoratedRow<Row>, right: DecoratedRow<Row>) => number,
): void {
  let index = start;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let worst = index;
    if (left < heap.length && compare(heap[left]!, heap[worst]!) > 0) worst = left;
    if (right < heap.length && compare(heap[right]!, heap[worst]!) > 0) worst = right;
    if (worst === index) return;
    [heap[index], heap[worst]] = [heap[worst]!, heap[index]!];
    index = worst;
  }
}

function pushHeap<Row>(
  heap: DecoratedRow<Row>[],
  value: DecoratedRow<Row>,
  compare: (left: DecoratedRow<Row>, right: DecoratedRow<Row>) => number,
): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compare(heap[index]!, heap[parent]!) <= 0) return;
    [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
    index = parent;
  }
}

export function sortRows<Row extends object>(
  rows: readonly Row[],
  config: SortConfig,
  fields: readonly SortFieldDefinition[],
): readonly Row[] {
  const issues = validateSortConfig(config, fields);
  if (issues.length > 0) throw new Error(issues[0]!.message);
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  const compare = (left: DecoratedRow<Row>, right: DecoratedRow<Row>) => compareRows(left, right, config.orderBy, fieldByName);
  const decorated = rows.map((row, inputIndex) => ({row, inputIndex}));

  if (config.limit === null || config.limit >= decorated.length) {
    return decorated.sort(compare).map(({row}) => row);
  }

  const heap: DecoratedRow<Row>[] = [];
  for (const item of decorated) {
    if (heap.length < config.limit) {
      pushHeap(heap, item, compare);
    } else if (compare(item, heap[0]!) < 0) {
      heap[0] = item;
      siftDown(heap, 0, compare);
    }
  }
  return heap.sort(compare).map(({row}) => row);
}
