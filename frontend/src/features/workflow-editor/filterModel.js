import {inferMapExpressionField} from "./mapModel.js";

const scalarTypes = new Set(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date"]);
const textualTypes = new Set(["string", "id", "address", "bytes"]);
const orderedTypes = new Set(["integer", "decimal", "timestamp", "date"]);
const sourceFieldPathPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const integerPattern = /^-?(?:0|[1-9]\d*)$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampPattern = /^(?:-?(?:0|[1-9]\d*)|\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2}))$/i;

function normalizeField(field) {
  if (!field || typeof field.name !== "string" || !sourceFieldPathPattern.test(field.name)) return null;
  let type = typeof field.type === "string" ? field.type : "";
  let nullable = Boolean(field.nullable);
  if (type.endsWith("|null")) {
    type = type.slice(0, -5);
    nullable = true;
  }
  if (type === "count") type = "integer";
  if (!scalarTypes.has(type)) return null;
  return {name: field.name, type, nullable, unit: field.unit ?? null};
}

function uniqueFields(fields) {
  const byName = new Map();
  for (const candidate of fields ?? []) {
    const field = normalizeField(candidate);
    if (field && !byName.has(field.name)) byName.set(field.name, field);
  }
  return [...byName.values()];
}

export function filterOperatorsForField(field) {
  const nullOperators = field?.nullable ? ["is_null", "is_not_null"] : [];
  if (field?.type === "boolean") return ["eq", "ne", ...nullOperators];
  if (orderedTypes.has(field?.type)) {
    return ["eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "between", ...nullOperators];
  }
  if (textualTypes.has(field?.type)) return ["eq", "ne", "in", "not_in", ...nullOperators];
  return [];
}

export function conditionValueMode(operator) {
  if (operator === "is_null" || operator === "is_not_null") return "none";
  if (operator === "in" || operator === "not_in") return "list";
  if (operator === "between") return "range";
  return "single";
}

export function createFilterCondition(field) {
  return {
    field: field?.name ?? "",
    operator: "eq",
    value: field?.type === "boolean" ? false : "",
  };
}

export function createFilterConfig(fields) {
  return {
    predicate: {
      combinator: "and",
      conditions: fields.length > 0 ? [createFilterCondition(fields[0])] : [],
    },
  };
}

function literalIsValid(field, value) {
  if (field.type === "boolean") return typeof value === "boolean";
  if (typeof value !== "string" || value.length < 1 || value.length > 512) return false;
  if (field.type === "integer") return integerPattern.test(value);
  if (field.type === "decimal") return decimalPattern.test(value);
  if (field.type === "date") {
    if (!datePattern.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  if (field.type === "timestamp") return timestampPattern.test(value);
  return true;
}

export function validateFilterConfig(config, fields) {
  const errors = [];
  const predicate = config?.predicate;
  if (!predicate || (predicate.combinator !== "and" && predicate.combinator !== "or") || !Array.isArray(predicate.conditions)) {
    return [{conditionIndex: null, code: "FILTER_PREDICATE_INVALID"}];
  }
  if (predicate.conditions.length < 1 || predicate.conditions.length > 32) {
    errors.push({conditionIndex: null, code: "FILTER_CONDITION_COUNT_INVALID"});
  }
  const byName = new Map(fields.map((field) => [field.name, field]));
  predicate.conditions.forEach((condition, conditionIndex) => {
    const field = byName.get(condition?.field);
    if (!field) {
      errors.push({conditionIndex, code: "FILTER_FIELD_UNKNOWN"});
      return;
    }
    if (!filterOperatorsForField(field).includes(condition.operator)) {
      errors.push({conditionIndex, code: "FILTER_OPERATOR_INVALID"});
      return;
    }
    const mode = conditionValueMode(condition.operator);
    if (mode === "none") return;
    if (mode === "single" && !literalIsValid(field, condition.value)) {
      errors.push({conditionIndex, code: "FILTER_VALUE_INVALID"});
    }
    if ((mode === "list" || mode === "range")
      && (!Array.isArray(condition.values)
        || (mode === "range" && condition.values.length !== 2)
        || (mode === "list" && (condition.values.length < 1 || condition.values.length > 50))
        || condition.values.some((value) => !literalIsValid(field, value)))) {
      errors.push({conditionIndex, code: mode === "range" ? "FILTER_RANGE_INVALID" : "FILTER_LIST_INVALID"});
    }
  });
  return errors;
}

function predecessorFields(editor, nodeId, port = "rows", seen = new Set()) {
  const edge = editor.edges.find((candidate) => candidate.target === nodeId && (candidate.targetHandle ?? "rows") === port);
  return edge ? deriveNodeOutputFields(editor, edge.source, seen) : [];
}

function sourceFields(editor, node) {
  const explicit = uniqueFields(node.outputSchema?.fields);
  if (explicit.length > 0) return explicit;
  const sourceId = node.config?.sourceId ?? node.config?.sourceKey;
  const source = editor.draft.specification.sources?.find((candidate) => candidate.id === sourceId);
  const sourceSchema = uniqueFields(source?.outputSchema?.fields);
  if (sourceSchema.length > 0) return sourceSchema;
  const finalFields = new Map(uniqueFields(editor.draft.specification.outputSchema?.fields).map((field) => [field.name, field]));
  return uniqueFields((node.config?.fieldBindings ?? []).map((binding) => finalFields.get(binding.requirementId)).filter(Boolean));
}

function aggregateFields(node, inputFields) {
  const byName = new Map(inputFields.map((field) => [field.name, field]));
  const fields = (node.config?.groupBy ?? []).map((name) => byName.get(name)).filter(Boolean);
  for (const measure of node.config?.measures ?? []) {
    if (!measure || typeof measure !== "object" || typeof measure.name !== "string") continue;
    const source = measure.field ? byName.get(measure.field) : null;
    fields.push({
      name: measure.name,
      type: measure.op === "count_rows" || measure.op === "count_distinct" ? "integer" : measure.op === "average" ? "decimal" : source?.type,
      nullable: source?.nullable ?? false,
      unit: source?.unit ?? null,
    });
  }
  return uniqueFields(fields);
}

export function deriveNodeOutputFields(editor, nodeId, seen = new Set()) {
  if (seen.has(nodeId)) return [];
  const nextSeen = new Set(seen);
  nextSeen.add(nodeId);
  const node = editor.nodes.find((candidate) => candidate.id === nodeId)?.data?.node;
  if (!node) return [];
  if (node.type === "source") return sourceFields(editor, node);
  const explicit = uniqueFields(node.outputSchema?.fields);
  if (explicit.length > 0) return explicit;
  if (node.type === "filter") return predecessorFields(editor, nodeId, "rows", nextSeen);
  if (node.type === "sort") return predecessorFields(editor, nodeId, "rows", nextSeen);
  if (node.type === "map") {
    const input = predecessorFields(editor, nodeId, "rows", nextSeen);
    if (Array.isArray(node.config?.fields)) {
      const projected = node.config.mode === "extend" ? [...input] : [];
      for (const definition of node.config.fields) {
        const inferred = inferMapExpressionField(definition.expression, input);
        if (inferred) projected.push({...inferred, name: definition.name});
      }
      return uniqueFields(projected);
    }
    return input;
  }
  if (node.type === "aggregate") return aggregateFields(node, predecessorFields(editor, nodeId, "rows", nextSeen));
  if (node.type === "union") {
    const left = predecessorFields(editor, nodeId, "left", nextSeen);
    const right = new Map(predecessorFields(editor, nodeId, "right", nextSeen).map((field) => [field.name, field]));
    return uniqueFields(left.filter((field) => right.has(field.name)).map((field) => ({
      ...field,
      nullable: field.nullable || right.get(field.name).nullable,
    })));
  }
  if (node.type === "join") {
    const left = predecessorFields(editor, nodeId, "left", nextSeen);
    const right = predecessorFields(editor, nodeId, "right", nextSeen);
    const prefix = typeof node.config?.rightPrefix === "string" ? node.config.rightPrefix : "right_";
    const leftNames = new Set(left.map((field) => field.name));
    return uniqueFields([...left, ...right.map((field) => ({
      ...field,
      name: leftNames.has(field.name) ? `${prefix}${field.name}` : field.name,
      nullable: node.config?.type === "left" || field.nullable,
    }))]);
  }
  if (node.type === "output") {
    const input = predecessorFields(editor, nodeId, "rows", nextSeen);
    const selected = Array.isArray(node.config?.fields) ? new Set(node.config.fields) : null;
    return selected ? input.filter((field) => selected.has(field.name)) : input;
  }
  return [];
}

export function deriveFilterInputFields(editor, nodeId) {
  return predecessorFields(editor, nodeId);
}

export function deriveDirectInputFields(editor, nodeId) {
  return predecessorFields(editor, nodeId);
}

function reverseComparison(operator) {
  return {lt: "gt", lte: "gte", gt: "lt", gte: "lte"}[operator] ?? operator;
}

function conditionFromExpression(expression) {
  if (!expression || typeof expression !== "object") return null;
  if (!["eq", "ne", "lt", "lte", "gt", "gte"].includes(expression.op) || !Array.isArray(expression.inputs)) return null;
  let field = expression.inputs[0];
  let literal = expression.inputs[1];
  let operator = expression.op;
  if (field?.op !== "field" && literal?.op === "field") {
    [field, literal] = [literal, field];
    operator = reverseComparison(operator);
  }
  if (field?.op !== "field" || literal?.op !== "literal") return null;
  if (literal.value === null) {
    if (operator === "eq") return {field: field.field, operator: "is_null"};
    if (operator === "ne") return {field: field.field, operator: "is_not_null"};
    return null;
  }
  return {field: field.field, operator, value: literal.value};
}

export function editableFilterConfig(config) {
  if (config?.predicate) return {config, legacyExpression: false};
  const expression = config?.expression;
  const combinator = expression?.op === "or" ? "or" : "and";
  const expressions = expression?.op === "and" || expression?.op === "or" ? expression.inputs : [expression];
  const conditions = (expressions ?? []).map(conditionFromExpression);
  if (conditions.length > 0 && conditions.every(Boolean)) {
    return {config: {predicate: {combinator, conditions}}, legacyExpression: false};
  }
  return {config, legacyExpression: Boolean(expression)};
}
