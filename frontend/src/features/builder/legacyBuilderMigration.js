import {validateFilterConfig} from "../workflow-editor/filterModel.js";
import {inferMapExpressionField, validateMapConfig} from "../workflow-editor/mapModel.js";

const comparisonOperators = new Set(["eq", "ne", "lt", "lte", "gt", "gte"]);
const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;

function sameExpression(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => sameExpression(item, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameExpression(left[key], right[key]));
}

function reverseComparison(operator) {
  return {lt: "gt", lte: "gte", gt: "lt", gte: "lte"}[operator] ?? operator;
}

function projectedFieldForExpression(expression, definitions, outputNames) {
  if (expression?.op === "field" && outputNames.has(expression.field)) return expression.field;
  return definitions.find((definition) => sameExpression(definition.expression, expression))?.name ?? null;
}

function conditionFromExpression(expression, definitions, outputNames) {
  if (!comparisonOperators.has(expression?.op) || !Array.isArray(expression.inputs) || expression.inputs.length !== 2) return null;
  let fieldExpression = expression.inputs[0];
  let literalExpression = expression.inputs[1];
  let operator = expression.op;
  let field = projectedFieldForExpression(fieldExpression, definitions, outputNames);
  if (!field && literalExpression?.op !== "literal") {
    field = projectedFieldForExpression(literalExpression, definitions, outputNames);
    if (field) {
      [fieldExpression, literalExpression] = [literalExpression, fieldExpression];
      operator = reverseComparison(operator);
    }
  }
  if (!field || literalExpression?.op !== "literal") return null;
  if (literalExpression.value === null) {
    if (operator === "eq") return {field, operator: "is_null"};
    if (operator === "ne") return {field, operator: "is_not_null"};
    return null;
  }
  return {field, operator, value: literalExpression.value};
}

function uniqueFieldName(nodeId, usedNames, index) {
  const normalized = `${nodeId}_match`.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "filter_");
  const base = normalized.slice(0, 92) || "filter_match";
  let name = index === 0 ? base : `${base}_${index + 1}`;
  let suffix = index + 2;
  while (usedNames.has(name)) {
    name = `${base.slice(0, 94)}_${suffix}`;
    suffix += 1;
  }
  return name;
}

function inlineProjectedFields(expression, definitions, sourceNames) {
  if (!expression || typeof expression !== "object") return null;
  if (expression.op === "field") {
    const definition = definitions.find((candidate) => candidate.name === expression.field);
    if (definition) return structuredClone(definition.expression);
    return sourceNames.has(expression.field) ? structuredClone(expression) : null;
  }
  if (expression.op === "literal") return structuredClone(expression);
  if (!Array.isArray(expression.inputs)) return null;
  const inputs = expression.inputs.map((input) => inlineProjectedFields(input, definitions, sourceNames));
  return inputs.every(Boolean) ? {...structuredClone(expression), inputs} : null;
}

function projectModeConfig(config, inputFields) {
  if (!config || !Array.isArray(config.fields) || !["extend", "project"].includes(config.mode)) return null;
  const definitions = structuredClone(config.fields);
  if (config.mode === "project") return {mode: "project", fields: definitions};
  const overwritten = new Set(definitions.map((definition) => definition?.name));
  if (inputFields.some((field) => !identifierPattern.test(field.name))) return null;
  return {
    mode: "project",
    fields: [
      ...inputFields
        .filter((field) => !overwritten.has(field.name))
        .map((field) => ({name: field.name, expression: {op: "field", field: field.name}})),
      ...definitions,
    ],
  };
}

function outputFields(config, inputFields) {
  return config.fields.flatMap((definition) => {
    const field = inferMapExpressionField(definition.expression, inputFields);
    return field ? [{...field, name: definition.name}] : [];
  });
}

function migrateFilter(nodes, edges, filterId) {
  const filter = nodes.find((node) => node.id === filterId);
  if (!filter?.config?.expression || filter.config.predicate) return null;
  const incoming = edges.filter((edge) => edge.toNode === filterId && (edge.toPort ?? "rows") === "rows");
  if (incoming.length !== 1) return null;

  const directPredecessor = nodes.find((node) => node.id === incoming[0].fromNode);
  let map = directPredecessor?.type === "map" ? directPredecessor : null;
  let source = null;
  let reorder = false;
  let filterToMap = null;
  if (!map && directPredecessor?.type === "source") {
    const outgoing = edges.filter((edge) => edge.fromNode === filterId);
    if (outgoing.length !== 1) return null;
    map = nodes.find((node) => node.id === outgoing[0].toNode && node.type === "map") ?? null;
    if (!map || edges.filter((edge) => edge.toNode === map.id).length !== 1) return null;
    source = directPredecessor;
    filterToMap = outgoing[0];
    reorder = true;
  } else if (map) {
    const mapIncoming = edges.filter((edge) => edge.toNode === map.id && (edge.toPort ?? "rows") === "rows");
    if (mapIncoming.length !== 1) return null;
    source = nodes.find((node) => node.id === mapIncoming[0].fromNode && node.type === "source") ?? null;
  }
  const inputFields = source?.outputSchema?.fields ?? [];
  if (!map || !source || inputFields.length === 0) return null;

  const mapConfig = projectModeConfig(map.config, inputFields);
  if (!mapConfig) return null;
  const definitions = mapConfig.fields;
  const outputNames = new Set(definitions.map((definition) => definition.name));
  const sourceNames = new Set(inputFields.map((field) => field.name));
  const combinator = ["and", "or"].includes(filter.config.expression.op) ? filter.config.expression.op : "and";
  const terms = ["and", "or"].includes(filter.config.expression.op)
    ? filter.config.expression.inputs ?? []
    : [filter.config.expression];
  if (terms.length < 1 || terms.length > 32) return null;

  const conditions = [];
  for (const [index, term] of terms.entries()) {
    const direct = conditionFromExpression(term, definitions, outputNames);
    if (direct) {
      conditions.push(direct);
      continue;
    }
    const expression = reorder ? structuredClone(term) : inlineProjectedFields(term, definitions, sourceNames);
    if (!expression) return null;
    const name = uniqueFieldName(filter.id, outputNames, index);
    outputNames.add(name);
    definitions.push({name, expression});
    conditions.push({field: name, operator: "eq", value: true});
  }

  const nextMapConfig = {mode: "project", fields: definitions};
  if (validateMapConfig(nextMapConfig, inputFields).length > 0) return null;
  const nextFilterConfig = {predicate: {combinator, conditions}};
  if (validateFilterConfig(nextFilterConfig, outputFields(nextMapConfig, inputFields)).length > 0) return null;

  const nextNodes = nodes.map((node) => {
    if (node.id === map.id) return {...node, operatorVersion: "2", config: nextMapConfig};
    if (node.id === filter.id) return {...node, operatorVersion: "2", config: nextFilterConfig};
    return node;
  });
  if (!reorder) return {nodes: nextNodes, edges};

  const mapOutgoing = edges.filter((edge) => edge.fromNode === map.id);
  const retained = edges.filter((edge) => edge !== incoming[0] && edge !== filterToMap && !mapOutgoing.includes(edge));
  return {
    nodes: nextNodes,
    edges: [
      ...retained,
      {...incoming[0], toNode: map.id, toPort: "rows"},
      {...filterToMap, fromNode: map.id, fromPort: "rows", toNode: filter.id, toPort: "rows"},
      ...mapOutgoing.map((edge) => ({...edge, fromNode: filter.id, fromPort: "rows"})),
    ],
  };
}

function normalizedOrdering(orderBy) {
  if (!Array.isArray(orderBy)) return [];
  return orderBy.flatMap((ordering) => {
    if (!ordering || typeof ordering.field !== "string" || !["asc", "desc"].includes(ordering.direction)) return [];
    return [{field: ordering.field, direction: ordering.direction, nulls: ordering.nulls === "first" ? "first" : "last"}];
  });
}

function sameOrdering(left, right) {
  return left.length === right.length
    && left.every((ordering, index) => ordering.field === right[index]?.field && ordering.direction === right[index]?.direction);
}

function uniqueSortId(nodes, outputId) {
  const used = new Set(nodes.map((node) => node.id));
  const base = `sort_before_${outputId}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  return id;
}

function migrateOutputs(nodes, edges) {
  let nextNodes = structuredClone(nodes);
  let nextEdges = structuredClone(edges).map((edge) => {
    const target = nextNodes.find((node) => node.id === edge.toNode);
    return target?.type === "output" ? {...edge, toPort: "rows"} : edge;
  });
  for (const output of nextNodes.filter((node) => node.type === "output")) {
    const ordering = normalizedOrdering(output.config?.orderBy);
    nextNodes = nextNodes.map((node) => node.id === output.id
      ? {...node, operatorVersion: "3", config: {fields: Array.isArray(node.config?.fields) ? structuredClone(node.config.fields) : []}}
      : node);
    if (ordering.length === 0) continue;

    const incoming = nextEdges.filter((edge) => edge.toNode === output.id);
    if (incoming.length !== 1) continue;
    const predecessor = nextNodes.find((node) => node.id === incoming[0].fromNode);
    if (predecessor?.type === "sort" && sameOrdering(normalizedOrdering(predecessor.config?.orderBy), ordering)) continue;

    const sortId = uniqueSortId(nextNodes, output.id);
    const outputIndex = nextNodes.findIndex((node) => node.id === output.id);
    nextNodes.splice(outputIndex, 0, {
      id: sortId,
      type: "sort",
      operatorVersion: "1",
      config: {orderBy: ordering, limit: null},
    });
    nextEdges = nextEdges.map((edge) => edge === incoming[0] ? {...edge, toNode: sortId, toPort: "rows"} : edge);
    nextEdges.push({fromNode: sortId, fromPort: "rows", toNode: output.id, toPort: "rows"});
  }
  return {nodes: nextNodes, edges: nextEdges};
}

export function migrateLegacyBuilderDraft(nodes, edges) {
  let current = {nodes: structuredClone(nodes), edges: structuredClone(edges)};
  const filterIds = current.nodes.filter((node) => node.type === "filter" && node.config?.expression).map((node) => node.id);
  for (const filterId of filterIds) {
    current = migrateFilter(current.nodes, current.edges, filterId) ?? current;
  }
  return migrateOutputs(current.nodes, current.edges);
}
