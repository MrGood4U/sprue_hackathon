import {Kind, parse} from "graphql";
import type {ObjectValueNode, ValueNode} from "graphql";
import type {GraphSourceQueryPlan} from "../graph/types.js";

type Literal = string | boolean | {variable: string} | readonly Literal[];
type PredicateField = readonly [string, Literal];
interface ProviderFieldEvidence {
  path: string;
  list: boolean;
  nullable: boolean;
}

const graphName = /^[A-Za-z_][A-Za-z0-9_]*$/;
const graphPath = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const maximumPredicateGroups = 64;
const maximumPredicatesPerGroup = 64;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphLiteral(value: ValueNode): Literal | null {
  if (value.kind === Kind.STRING || value.kind === Kind.ENUM || value.kind === Kind.INT || value.kind === Kind.FLOAT) {
    return value.value;
  }
  if (value.kind === Kind.BOOLEAN) return value.value;
  if (value.kind === Kind.VARIABLE) return {variable: value.name.value};
  if (value.kind === Kind.LIST) {
    const items = value.values.map(graphLiteral);
    return items.some((item) => item === null) ? null : items as Literal[];
  }
  return null;
}

function graphFields(value: ObjectValueNode, prefix = "", depth = 0): PredicateField[] | null {
  const fields: PredicateField[] = [];
  for (const field of value.fields) {
    if (field.value.kind === Kind.OBJECT) {
      // The Graph's store query rejects a relationship filter nested through
      // another relationship (for example pair_ -> token0_). Keep semantic
      // proof aligned with that executable provider subset.
      if (depth >= 1 || !field.name.value.endsWith("_")) return null;
      const segment = field.name.value.slice(0, -1);
      if (!graphName.test(segment)) return null;
      const nested = graphFields(field.value, prefix ? `${prefix}.${segment}` : segment, depth + 1);
      if (nested === null) return null;
      fields.push(...nested);
      continue;
    }
    const literal = graphLiteral(field.value);
    if (literal === null) return null;
    fields.push([prefix ? `${prefix}.${field.name.value}` : field.name.value, literal]);
  }
  return fields;
}

function withoutPaginationCursor(value: ObjectValueNode): ObjectValueNode {
  return {
    ...value,
    fields: value.fields.filter((field) => field.name.value !== "id_gt"),
  };
}

function graphPredicateGroups(document: string): PredicateField[][] | null {
  try {
    const parsed = parse(document, {maxTokens: 5_000});
    const operation = parsed.definitions[0];
    if (parsed.definitions.length !== 1 || operation?.kind !== Kind.OPERATION_DEFINITION) return null;
    const root = operation.selectionSet.selections[0];
    if (operation.selectionSet.selections.length !== 1 || root?.kind !== Kind.FIELD) return null;
    const where = root.arguments?.find((argument) => argument.name.value === "where")?.value;
    if (where?.kind !== Kind.OBJECT) return null;
    const predicates = where.fields.filter((field) => field.name.value !== "id_gt");
    const disjunction = predicates.find((field) => field.name.value === "or");
    if (disjunction) {
      if (predicates.some((field) => field.name.value === "and") || predicates.filter((field) => field.name.value === "or").length !== 1) {
        return null;
      }
      const common = graphFields({
        kind: Kind.OBJECT,
        fields: predicates.filter((field) => field.name.value !== "or"),
      } as ObjectValueNode);
      if (common === null) return null;
      const branches = disjunction.value;
      if (branches.kind !== Kind.LIST) return null;
      const parsedBranches = branches.values.map((branch) =>
        branch.kind === Kind.OBJECT ? graphFields(withoutPaginationCursor(branch)) : null);
      return parsedBranches.every((branch): branch is PredicateField[] => branch !== null)
        ? parsedBranches.map((branch) => [...common, ...branch])
        : null;
    }
    if (predicates.some((field) => field.name.value === "or" || field.name.value === "and")) return null;
    return [graphFields({kind: Kind.OBJECT, fields: predicates} as ObjectValueNode) ?? []];
  } catch {
    return null;
  }
}

function providerFieldFor(
  mapConfig: unknown,
  semanticField: string,
  providerFields: readonly ProviderFieldEvidence[] = [],
): string | null {
  if (!record(mapConfig) || !Array.isArray(mapConfig.fields)) return null;
  const definition = mapConfig.fields.find((candidate) => record(candidate) && candidate.name === semanticField);
  if (!record(definition) || !record(definition.expression) || definition.expression.op !== "field") return null;
  const field = definition.expression.field;
  if (typeof field !== "string") return null;
  if (graphName.test(field)) return field;
  if (!graphPath.test(field)) return null;
  const evidence = providerFields.find((candidate) => candidate.path === field);
  return evidence && !evidence.list && !evidence.nullable ? field : null;
}

function providerWindowFieldFor(
  mapConfig: unknown,
  semanticField: string,
  valueEncoding: NonNullable<GraphSourceQueryPlan["runtimeWindow"]>["valueEncoding"],
): string | null {
  const direct = providerFieldFor(mapConfig, semanticField);
  if (direct) return direct;
  if (!record(mapConfig) || !Array.isArray(mapConfig.fields)) return null;
  const definition = mapConfig.fields.find((candidate) => record(candidate) && candidate.name === semanticField);
  if (!record(definition) || !record(definition.expression)) return null;
  const expression = definition.expression;
  if (
    valueEncoding !== "unix_seconds"
    || expression.op !== "epoch_seconds_to_timestamp"
    || !Array.isArray(expression.inputs)
    || expression.inputs.length !== 1
    || !record(expression.inputs[0])
    || expression.inputs[0].op !== "field"
  ) return null;
  const field = expression.inputs[0].field;
  return typeof field === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(field) ? field : null;
}

function conditionFields(
  condition: Record<string, unknown>,
  mapConfig: unknown,
  providerFields: readonly ProviderFieldEvidence[],
): PredicateField[] | null {
  if (typeof condition.field !== "string" || typeof condition.operator !== "string") return null;
  const field = providerFieldFor(mapConfig, condition.field, providerFields);
  if (!field) return null;
  const suffix = new Map([
    ["eq", ""], ["ne", "_not"], ["lt", "_lt"], ["lte", "_lte"],
    ["gt", "_gt"], ["gte", "_gte"], ["in", "_in"], ["not_in", "_not_in"],
  ]).get(condition.operator);
  if (condition.operator === "between") {
    if (!Array.isArray(condition.values) || condition.values.length !== 2) return null;
    return [[`${field}_gte`, condition.values[0] as Literal], [`${field}_lte`, condition.values[1] as Literal]];
  }
  if (suffix === undefined) return null;
  const literal = condition.operator === "in" || condition.operator === "not_in" ? condition.values : condition.value;
  if (!(typeof literal === "string" || typeof literal === "boolean" || Array.isArray(literal))) return null;
  if (Array.isArray(literal) && !literal.every((item) => typeof item === "string" || typeof item === "boolean")) return null;
  return [[`${field}${suffix}`, literal as Literal]];
}

function filterPredicateGroups(
  filterConfig: unknown,
  mapConfig: unknown,
  providerFields: readonly ProviderFieldEvidence[],
): PredicateField[][] | null {
  if (!record(filterConfig) || !record(filterConfig.predicate) || !Array.isArray(filterConfig.predicate.conditions)) return null;
  const groups = filterConfig.predicate.conditions.map((condition) =>
    record(condition) ? conditionFields(condition, mapConfig, providerFields) : null);
  if (!groups.every((group): group is PredicateField[] => group !== null)) return null;
  if (filterConfig.predicate.combinator === "or") return groups;
  if (filterConfig.predicate.combinator === "and") return [groups.flat()];
  return null;
}

function expressionLiteral(value: unknown): Literal | null {
  if (!record(value) || value.op !== "literal") return null;
  return typeof value.value === "string" || typeof value.value === "boolean" ? value.value : null;
}

function expressionComparisonGroups(
  expression: Record<string, unknown>,
  mapConfig: unknown,
  providerFields: readonly ProviderFieldEvidence[],
): PredicateField[][] | null {
  if (!Array.isArray(expression.inputs) || expression.inputs.length !== 2 || typeof expression.op !== "string") return null;
  const suffixes = new Map([
    ["eq", ""], ["ne", "_not"], ["lt", "_lt"], ["lte", "_lte"],
    ["gt", "_gt"], ["gte", "_gte"],
  ]);
  const reversed = new Map([
    ["eq", "eq"], ["ne", "ne"], ["lt", "gt"], ["lte", "gte"],
    ["gt", "lt"], ["gte", "lte"],
  ]);
  const [left, right] = expression.inputs;
  const leftField = record(left) && left.op === "field" && typeof left.field === "string"
    ? providerFieldFor(mapConfig, left.field, providerFields)
    : null;
  const rightLiteral = expressionLiteral(right);
  if (leftField && rightLiteral !== null) {
    const suffix = suffixes.get(expression.op);
    return suffix === undefined ? null : [[[`${leftField}${suffix}`, rightLiteral]]];
  }
  const rightField = record(right) && right.op === "field" && typeof right.field === "string"
    ? providerFieldFor(mapConfig, right.field, providerFields)
    : null;
  const leftLiteral = expressionLiteral(left);
  const reversedOperator = reversed.get(expression.op);
  const suffix = reversedOperator ? suffixes.get(reversedOperator) : undefined;
  return rightField && leftLiteral !== null && suffix !== undefined
    ? [[[`${rightField}${suffix}`, leftLiteral]]]
    : null;
}

function combineAnd(
  left: readonly (readonly PredicateField[])[],
  right: readonly (readonly PredicateField[])[],
): PredicateField[][] | null {
  if (left.length * right.length > maximumPredicateGroups) return null;
  const groups = left.flatMap((leftGroup) => right.map((rightGroup) => [...leftGroup, ...rightGroup]));
  return groups.some((group) => group.length > maximumPredicatesPerGroup) ? null : groups;
}

function filterExpressionGroups(
  expression: unknown,
  mapConfig: unknown,
  providerFields: readonly ProviderFieldEvidence[],
): PredicateField[][] | null {
  if (!record(expression) || typeof expression.op !== "string") return null;
  if (expression.op !== "and" && expression.op !== "or") {
    return expressionComparisonGroups(expression, mapConfig, providerFields);
  }
  if (!Array.isArray(expression.inputs) || expression.inputs.length < 2 || expression.inputs.length > 8) return null;
  let result: PredicateField[][] = expression.op === "and" ? [[]] : [];
  for (const input of expression.inputs) {
    const groups = filterExpressionGroups(input, mapConfig, providerFields);
    if (groups === null) return null;
    if (expression.op === "and") {
      const combined = combineAnd(result, groups);
      if (combined === null) return null;
      result = combined;
    } else {
      result = [...result, ...groups];
      if (result.length > maximumPredicateGroups) return null;
    }
  }
  return result;
}

function relativeWindowGroups(
  filterConfig: unknown,
  mapConfig: unknown,
  runtimeWindow: NonNullable<GraphSourceQueryPlan["runtimeWindow"]> | null,
): PredicateField[][] | null {
  if (!record(filterConfig) || !record(filterConfig.relativeWindow) || !runtimeWindow) return null;
  const window = filterConfig.relativeWindow;
  if (
    window.kind !== runtimeWindow.kind
    || window.days !== runtimeWindow.days
    || window.timezone !== runtimeWindow.timezone
    || typeof window.field !== "string"
    || providerWindowFieldFor(mapConfig, window.field, runtimeWindow.valueEncoding) !== runtimeWindow.field
  ) return null;
  return [[
    [`${runtimeWindow.field}_gte`, {variable: runtimeWindow.startVariable}],
    [`${runtimeWindow.field}_lt`, {variable: runtimeWindow.endVariable}],
  ]];
}

function canonicalGroups(groups: readonly (readonly PredicateField[])[]): string {
  return JSON.stringify(groups
    .map((group) => [...group].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))))
    .map((group) => JSON.stringify(group))
    .sort());
}

/**
 * Proves equivalence for the bounded pushdown subset Sprue currently supports:
 * scalar comparisons joined by bounded AND/OR expressions. A nested provider
 * path is eligible only when inspected schema evidence proves that every path
 * segment is non-list and non-null. Null predicates remain residual.
 */
export function matchesCompleteFilterPushdown(
  planOrDocument: GraphSourceQueryPlan | string,
  filterConfigOrConfigs: unknown | readonly unknown[],
  boundaryMapConfig: unknown,
  providerFields: readonly ProviderFieldEvidence[] = [],
): boolean {
  const plan = typeof planOrDocument === "string"
    ? {document: planOrDocument, runtimeWindow: null}
    : planOrDocument;
  const filterConfigs = Array.isArray(filterConfigOrConfigs) ? filterConfigOrConfigs : [filterConfigOrConfigs];
  const query = graphPredicateGroups(plan.document);
  if (query === null || filterConfigs.length === 0) return false;
  let filters: PredicateField[][] = [[]];
  for (const config of filterConfigs) {
    const groups = filterPredicateGroups(config, boundaryMapConfig, providerFields)
      ?? (record(config) ? filterExpressionGroups(config.expression, boundaryMapConfig, providerFields) : null)
      ?? relativeWindowGroups(config, boundaryMapConfig, plan.runtimeWindow ?? null);
    if (groups === null) return false;
    const combined = combineAnd(filters, groups);
    if (combined === null) return false;
    filters = combined;
  }
  return canonicalGroups(query) === canonicalGroups(filters);
}
