import {Kind, parse} from "graphql";
import type {ObjectValueNode, ValueNode} from "graphql";

type Literal = string | boolean | readonly Literal[];
type PredicateField = readonly [string, Literal];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphLiteral(value: ValueNode): Literal | null {
  if (value.kind === Kind.STRING || value.kind === Kind.ENUM || value.kind === Kind.INT || value.kind === Kind.FLOAT) {
    return value.value;
  }
  if (value.kind === Kind.BOOLEAN) return value.value;
  if (value.kind === Kind.LIST) {
    const items = value.values.map(graphLiteral);
    return items.some((item) => item === null) ? null : items as Literal[];
  }
  return null;
}

function graphFields(value: ObjectValueNode): PredicateField[] | null {
  const fields: PredicateField[] = [];
  for (const field of value.fields) {
    const literal = graphLiteral(field.value);
    if (literal === null) return null;
    fields.push([field.name.value, literal]);
  }
  return fields;
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
    if (predicates.length === 1 && predicates[0]!.name.value === "or") {
      const branches = predicates[0]!.value;
      if (branches.kind !== Kind.LIST) return null;
      return branches.values.map((branch) => branch.kind === Kind.OBJECT ? graphFields(branch) : null)
        .every((branch): branch is PredicateField[] => branch !== null)
        ? branches.values.map((branch) => graphFields(branch as ObjectValueNode)!)
        : null;
    }
    if (predicates.some((field) => field.name.value === "or" || field.name.value === "and")) return null;
    return [graphFields({kind: Kind.OBJECT, fields: predicates} as ObjectValueNode) ?? []];
  } catch {
    return null;
  }
}

function providerFieldFor(mapConfig: unknown, semanticField: string): string | null {
  if (!record(mapConfig) || !Array.isArray(mapConfig.fields)) return null;
  const definition = mapConfig.fields.find((candidate) => record(candidate) && candidate.name === semanticField);
  if (!record(definition) || !record(definition.expression) || definition.expression.op !== "field") return null;
  const field = definition.expression.field;
  return typeof field === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(field) ? field : null;
}

function conditionFields(condition: Record<string, unknown>, mapConfig: unknown): PredicateField[] | null {
  if (typeof condition.field !== "string" || typeof condition.operator !== "string") return null;
  const field = providerFieldFor(mapConfig, condition.field);
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

function filterPredicateGroups(filterConfig: unknown, mapConfig: unknown): PredicateField[][] | null {
  if (!record(filterConfig) || !record(filterConfig.predicate) || !Array.isArray(filterConfig.predicate.conditions)) return null;
  const groups = filterConfig.predicate.conditions.map((condition) => record(condition) ? conditionFields(condition, mapConfig) : null);
  if (!groups.every((group): group is PredicateField[] => group !== null)) return null;
  if (filterConfig.predicate.combinator === "or") return groups;
  if (filterConfig.predicate.combinator === "and") return [groups.flat()];
  return null;
}

function canonicalGroups(groups: readonly (readonly PredicateField[])[]): string {
  return JSON.stringify(groups
    .map((group) => [...group].sort(([left], [right]) => left.localeCompare(right)))
    .map((group) => JSON.stringify(group))
    .sort());
}

/**
 * Proves equivalence for the bounded pushdown subset Sprue currently supports:
 * flat scalar comparisons joined by AND, or an `or` list with one branch per
 * condition. Nested relationship filters and null predicates remain residual.
 */
export function matchesCompleteFilterPushdown(
  document: string,
  filterConfig: unknown,
  boundaryMapConfig: unknown,
): boolean {
  const query = graphPredicateGroups(document);
  const filter = filterPredicateGroups(filterConfig, boundaryMapConfig);
  return query !== null && filter !== null && canonicalGroups(query) === canonicalGroups(filter);
}
