import {Kind, parse} from "graphql";
import type {
  ArgumentNode,
  FieldNode,
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
  const document = parse(plan.document, {maxTokens: 5_000});
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
  if (variableName(objectField(where, "id_gt")) !== "cursor") {
    fail("Graph Source query must advance the id_gt cursor with $cursor");
  }
  if (where?.kind !== Kind.OBJECT) fail("Graph Source query where argument must be an object");
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
    if (
      variableName(objectField(where, `${runtimeWindow.field}_gte`)) !== runtimeWindow.startVariable
      || variableName(objectField(where, `${runtimeWindow.field}_lt`)) !== runtimeWindow.endVariable
    ) {
      fail("Graph Source query must bind its complete UTC-day window to the declared runtime variables");
    }
  }
  const hasAdditionalPredicates = where.fields.some((field) => field.name.value !== "id_gt");

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
    cursorType: cursorType.name as ValidatedGraphQueryPlan["cursorType"],
    runtimeWindowVariableType,
    hasAdditionalPredicates,
  };
}
