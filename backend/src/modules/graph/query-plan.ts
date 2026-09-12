import {Kind, parse, print} from "graphql";
import type {
  ArgumentNode,
  FieldNode,
  ObjectFieldNode,
  ObjectValueNode,
  OperationDefinitionNode,
  SelectionSetNode,
  ValueNode,
  VariableDefinitionNode,
} from "graphql";
import type {GraphSourceQueryPlan} from "./types.js";

const graphName = /^[_A-Za-z][_0-9A-Za-z]*$/;

export interface GraphQueryPlanValidationInput {
  queryEntity: string;
  selectedPaths: readonly string[];
}

export interface ValidatedGraphQueryPlan {
  operation: OperationDefinitionNode;
  normalizedDocument: string;
  cursorType: "ID" | "String" | "Bytes" | "Int8" | "BigInt" | "Int";
  runtimeWindowVariableType: "BigInt" | "Int" | "Int8" | "String" | "Timestamp" | null;
  hasAdditionalPredicates: boolean;
}

function fail(message: string): never {
  throw new Error(message);
}

function namedType(definition: VariableDefinitionNode): {name: string; required: boolean} {
  const type = definition.type;
  const required = type.kind === Kind.NON_NULL_TYPE;
  const inner = required ? type.type : type;
  if (inner.kind !== Kind.NAMED_TYPE) fail("Graph query variables cannot use list types");
  return {name: inner.name.value, required};
}

function variableName(value: ValueNode | undefined): string | null {
  return value?.kind === Kind.VARIABLE ? value.name.value : null;
}

function argument(field: FieldNode, name: string): ArgumentNode | undefined {
  return field.arguments?.find((item) => item.name.value === name);
}

function objectField(value: ValueNode | undefined, name: string): ValueNode | undefined {
  if (value?.kind !== Kind.OBJECT) return undefined;
  return value.fields.find((field) => field.name.value === name)?.value;
}

function mergePredicateFields(
  common: readonly ObjectFieldNode[],
  branch: readonly ObjectFieldNode[],
): readonly ObjectFieldNode[] {
  const merged = new Map<string, ObjectFieldNode>();
  for (const field of [...common, ...branch]) {
    const existing = merged.get(field.name.value);
    if (existing && print(existing.value) !== print(field.value)) {
      fail(`Graph Source query OR branch conflicts on predicate ${field.name.value}`);
    }
    merged.set(field.name.value, field);
  }
  return [...merged.values()];
}

/**
 * The Graph rejects column predicates beside a root `or` even though the
 * object is valid GraphQL syntax. Distribute those common predicates into
 * every branch so pagination and runtime-window semantics remain identical.
 */
export function normalizeGraphSourceQueryDocument(source: string): string {
  const document = parse(source, {maxTokens: 5_000});
  const operation = document.definitions.length === 1
    && document.definitions[0]?.kind === Kind.OPERATION_DEFINITION
    ? document.definitions[0]
    : null;
  const root = operation?.selectionSet.selections.length === 1
    && operation.selectionSet.selections[0]?.kind === Kind.FIELD
    ? operation.selectionSet.selections[0]
    : null;
  const whereIndex = root?.arguments?.findIndex((item) => item.name.value === "where") ?? -1;
  const where = whereIndex >= 0 ? root?.arguments?.[whereIndex]?.value : undefined;
  if (!operation || !root || where?.kind !== Kind.OBJECT) return source;
  const disjunctions = where.fields.filter((field) => field.name.value === "or");
  const common = where.fields.filter((field) => field.name.value !== "or");
  if (disjunctions.length !== 1 || common.length === 0) return source;
  if (common.some((field) => field.name.value === "and")) {
    fail("Graph Source query cannot mix root AND and OR predicates");
  }
  const values = disjunctions[0]!.value;
  if (values.kind !== Kind.LIST || values.values.length === 0 || values.values.length > 64) {
    fail("Graph Source query OR predicate must contain one to 64 object branches");
  }
  const branches = values.values.map((value) => {
    if (value.kind !== Kind.OBJECT) fail("Graph Source query OR branches must be objects");
    return {...value, fields: mergePredicateFields(common, value.fields)} as ObjectValueNode;
  });
  const normalizedWhere: ObjectValueNode = {
    ...where,
    fields: [{
      ...disjunctions[0]!,
      value: {...values, values: branches},
    }],
  };
  const args = [...(root.arguments ?? [])];
  args[whereIndex] = {...args[whereIndex]!, value: normalizedWhere};
  const normalizedRoot = {...root, arguments: args};
  const normalizedOperation = {
    ...operation,
    selectionSet: {...operation.selectionSet, selections: [normalizedRoot]},
  };
  return print({...document, definitions: [normalizedOperation]});
}

function predicateBranches(where: ObjectValueNode): readonly ObjectValueNode[] {
  const disjunctions = where.fields.filter((field) => field.name.value === "or");
  if (disjunctions.length === 0) {
    if (where.fields.some((field) => field.name.value === "and")) {
      fail("Graph Source query AND predicates are outside the bounded filter subset");
    }
    return [where];
  }
  if (disjunctions.length !== 1 || where.fields.length !== 1) {
    fail("Graph Source query must not mix column predicates with a root OR operator");
  }
  const values = disjunctions[0]!.value;
  if (values.kind !== Kind.LIST || values.values.length === 0 || values.values.length > 64) {
    fail("Graph Source query OR predicate must contain one to 64 object branches");
  }
  return values.values.map((value) => {
    if (value.kind !== Kind.OBJECT) fail("Graph Source query OR branches must be objects");
    if (value.fields.some((field) => field.name.value === "and" || field.name.value === "or")) {
      fail("Nested Graph Source boolean predicates are outside the bounded filter subset");
    }
    if (new Set(value.fields.map((field) => field.name.value)).size !== value.fields.length) {
      fail("Graph Source query contains duplicate predicates in an OR branch");
    }
    return value;
  });
}

function validatePredicateRelationshipDepth(value: ObjectValueNode, relationshipDepth = 0): void {
  for (const field of value.fields) {
    if (field.value.kind !== Kind.OBJECT) continue;
    if (!field.name.value.endsWith("_")) {
      fail(`Graph Source query predicate ${field.name.value} uses an unsupported object filter`);
    }
    if (relationshipDepth >= 1) {
      fail(
        `Graph Source query predicate ${field.name.value} exceeds The Graph's supported one-level child-filter nesting`,
      );
    }
    validatePredicateRelationshipDepth(field.value, relationshipDepth + 1);
  }
}

function collectLeafPaths(selection: SelectionSetNode, prefix = ""): string[] {
  const paths: string[] = [];
  for (const item of selection.selections) {
    if (item.kind !== Kind.FIELD) fail("Graph query fragments are not supported in a Source query plan");
    if (item.alias || item.directives?.length) fail("Graph query aliases and directives are not supported in a Source query plan");
    if (item.arguments?.length) fail("Nested Graph query fields cannot contain arguments");
    const path = prefix ? `${prefix}.${item.name.value}` : item.name.value;
    if (item.selectionSet) paths.push(...collectLeafPaths(item.selectionSet, path));
    else paths.push(path);
  }
  return paths;
}

/**
 * Validate the Agent-authored query as a bounded, immutable Source acquisition
 * plan. The complete semantic DAG is validated before pushed work is removed
 * from the residual runtime DAG.
 */
export function validateGraphSourceQueryPlan(
  plan: GraphSourceQueryPlan,
  input: GraphQueryPlanValidationInput,
): ValidatedGraphQueryPlan {
  if (!graphName.test(input.queryEntity)) fail("Graph query entity is invalid");
  if (plan.document.length > 20_000) fail("Graph query document exceeds the bounded size limit");
  const normalizedDocument = normalizeGraphSourceQueryDocument(plan.document);
  if (normalizedDocument.length > 20_000) fail("Normalized Graph query document exceeds the bounded size limit");
  const document = parse(normalizedDocument, {maxTokens: 5_000});
  if (document.definitions.length !== 1 || document.definitions[0]?.kind !== Kind.OPERATION_DEFINITION) {
    fail("Graph Source query must contain exactly one operation and no fragments");
  }
  const operation = document.definitions[0];
  if (operation.operation !== "query" || operation.name?.value !== plan.operationName || plan.operationName !== "SprueLiveSource") {
    fail("Graph Source query must be the named SprueLiveSource query operation");
  }
  if (operation.directives?.length) fail("Graph Source query directives are not supported");

  const variables = new Map((operation.variableDefinitions ?? []).map((definition) => [definition.variable.name.value, definition]));
  const runtimeWindow = plan.runtimeWindow ?? null;
  const expectedVariables = runtimeWindow
    ? new Set(["first", "cursor", runtimeWindow.startVariable, runtimeWindow.endVariable])
    : new Set(["first", "cursor"]);
  if (variables.size !== expectedVariables.size || [...expectedVariables].some((name) => !variables.has(name))) {
    fail(runtimeWindow
      ? "Graph Source query must declare only first, cursor, windowStart, and windowEnd"
      : "Graph Source query must declare only the bounded first and cursor variables");
  }
  const firstType = namedType(variables.get("first")!);
  const cursorType = namedType(variables.get("cursor")!);
  if (firstType.name !== "Int" || !firstType.required) fail("Graph Source query variable first must have type Int!");
  if (!new Set(["ID", "String", "Bytes", "Int8", "BigInt", "Int"]).has(cursorType.name) || !cursorType.required) {
    fail("Graph Source query cursor must have a supported non-null scalar type");
  }
  let runtimeWindowVariableType: ValidatedGraphQueryPlan["runtimeWindowVariableType"] = null;
  if (runtimeWindow) {
    if (
      runtimeWindow.kind !== "complete_utc_days"
      || !Number.isInteger(runtimeWindow.days)
      || runtimeWindow.days < 1
      || runtimeWindow.days > 365
      || runtimeWindow.timezone !== "UTC"
      || !graphName.test(runtimeWindow.field)
      || runtimeWindow.startVariable !== "windowStart"
      || runtimeWindow.endVariable !== "windowEnd"
      || runtimeWindow.valueEncoding !== "unix_seconds"
    ) {
      fail("Graph Source runtime window is invalid");
    }
    const startType = namedType(variables.get(runtimeWindow.startVariable)!);
    const endType = namedType(variables.get(runtimeWindow.endVariable)!);
    if (
      startType.name !== endType.name
      || !startType.required
      || !endType.required
      || !new Set(["BigInt", "Int", "Int8", "String", "Timestamp"]).has(startType.name)
    ) {
      fail("Graph Source runtime window variables must use the same supported non-null scalar type");
    }
    runtimeWindowVariableType = startType.name as "BigInt" | "Int" | "Int8" | "String" | "Timestamp";
  }

  if (operation.selectionSet.selections.length !== 1 || operation.selectionSet.selections[0]?.kind !== Kind.FIELD) {
    fail("Graph Source query must select exactly one query root");
  }
  const root = operation.selectionSet.selections[0];
  if (root.name.value !== input.queryEntity || root.alias || root.directives?.length || !root.selectionSet) {
    fail("Graph Source query root must match the selected query entity without aliases or directives");
  }
  const permittedArguments = new Set(["first", "orderBy", "orderDirection", "where", "interval"]);
  if ((root.arguments ?? []).some((item) => !permittedArguments.has(item.name.value))) {
    fail("Graph Source query contains an unsupported query-root argument");
  }
  if (variableName(argument(root, "first")?.value) !== "first") {
    fail("Graph Source query must bind the root first argument to $first");
  }
  const orderBy = argument(root, "orderBy")?.value;
  if (orderBy?.kind !== Kind.ENUM || orderBy.value !== "id") {
    fail("Graph Source query must use id cursor ordering");
  }
  const orderDirection = argument(root, "orderDirection")?.value;
  if (orderDirection?.kind !== Kind.ENUM || orderDirection.value !== "asc") {
    fail("Graph Source query must use ascending cursor ordering");
  }
  const where = argument(root, "where")?.value;
  if (where?.kind !== Kind.OBJECT) fail("Graph Source query where argument must be an object");
  const branches = predicateBranches(where);
  for (const branch of branches) validatePredicateRelationshipDepth(branch);
  if (branches.some((branch) => variableName(objectField(branch, "id_gt")) !== "cursor")) {
    fail("Every Graph Source query predicate branch must advance the id_gt cursor with $cursor");
  }
  const aggregation = plan.aggregation ?? null;
  const interval = argument(root, "interval")?.value;
  if (aggregation) {
    if (aggregation.sourceEntity.trim().length === 0) fail("Graph Source aggregation source entity is invalid");
    if (interval?.kind !== Kind.STRING || interval.value !== aggregation.interval) {
      fail("Graph Source aggregate query must use its declared interval");
    }
  } else if (interval) {
    fail("Graph Source raw entity query cannot declare an aggregate interval");
  }
  if (runtimeWindow) {
    if (branches.some((branch) => (
      variableName(objectField(branch, `${runtimeWindow.field}_gte`)) !== runtimeWindow.startVariable
      || variableName(objectField(branch, `${runtimeWindow.field}_lt`)) !== runtimeWindow.endVariable
    ))) {
      fail("Every Graph Source query predicate branch must bind its complete UTC-day window to the declared runtime variables");
    }
  }
  const hasAdditionalPredicates = branches.some((branch) =>
    branch.fields.some((field) => field.name.value !== "id_gt"));

  const selected = [...new Set(input.selectedPaths)];
  const permitted = new Set(["id", ...selected]);
  const leaves = collectLeafPaths(root.selectionSet);
  if (leaves.length > 128 || new Set(leaves).size !== leaves.length) fail("Graph Source query has duplicate or excessive field selections");
  for (const path of leaves) {
    if (!permitted.has(path)) fail(`Graph Source query selects undeclared provider field ${path}`);
  }
  for (const path of permitted) {
    if (!leaves.includes(path)) fail(`Graph Source query omits required provider field ${path}`);
  }

  if (plan.pagination.kind !== "id_cursor" || plan.pagination.cursorField !== "id") {
    fail("Graph Source query must use the bounded id_cursor pagination contract");
  }
  return {
    operation,
    normalizedDocument,
    cursorType: cursorType.name as ValidatedGraphQueryPlan["cursorType"],
    runtimeWindowVariableType,
    hasAdditionalPredicates,
  };
}
