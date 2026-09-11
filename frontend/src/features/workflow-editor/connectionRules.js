import {deriveDirectInputFields, deriveFilterInputFields, validateFilterConfig} from "./filterModel.js";
import {validateMapConfig} from "./mapModel.js";
import {validateSortConfig} from "./sortModel.js";
import {validateAggregateConfig} from "./aggregateModel.js";

const inputPorts = {
  source: [],
  filter: ["rows"],
  map: ["rows"],
  aggregate: ["rows"],
  sort: ["rows"],
  union: ["left", "right"],
  join: ["left", "right"],
  output: ["rows"],
};

const outputPorts = {
  source: ["rows"],
  filter: ["rows"],
  map: ["rows"],
  aggregate: ["rows"],
  sort: ["rows"],
  union: ["rows"],
  join: ["rows"],
  output: [],
};

export function getInputPorts(type) {
  return inputPorts[type] ?? [];
}

export function getOutputPorts(type) {
  return outputPorts[type] ?? [];
}

export function canConnect(connection, nodes, edges) {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target || source.id === target.id) return false;
  if (!getOutputPorts(source.data.node.type).includes(connection.sourceHandle ?? "rows")) return false;
  if (!getInputPorts(target.data.node.type).includes(connection.targetHandle ?? "rows")) return false;
  if (target.data.node.type === "output" && edges.some((edge) => edge.target === target.id)) return false;
  if (edges.some((edge) => edge.target === target.id && edge.targetHandle === (connection.targetHandle ?? "rows"))) return false;
  if (createsCycle(connection, nodes, edges)) return false;
  return true;
}

export function validateWorkflow(nodes, edges, draft = null) {
  const errors = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, new Set()]));
  const incomingCounts = new Map(nodes.map((node) => [node.id, 0]));
  const outputNodes = nodes.filter((node) => node.data.node.type === "output");

  if (outputNodes.length !== 1) errors.push({ code: "OUTPUT_COUNT", nodeId: null });
  for (const edge of edges) {
    const targets = incoming.get(edge.target);
    if (targets) targets.add(edge.targetHandle ?? "rows");
    if (incomingCounts.has(edge.target)) incomingCounts.set(edge.target, incomingCounts.get(edge.target) + 1);
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) errors.push({ code: "MISSING_EDGE_NODE", nodeId: edge.target });
  }
  for (const node of nodes) {
    const definition = node.data.node;
    const inputPorts = getInputPorts(definition.type);
    const connected = incoming.get(node.id) ?? new Set();
    if (definition.type === "source" && !(definition.config?.sourceId || definition.config?.sourceKey)) errors.push({ code: "SOURCE_CONFIG", nodeId: node.id });
    if (definition.type === "source" && definition.config?.limit !== undefined
      && (!Number.isInteger(definition.config.limit) || definition.config.limit < 1 || definition.config.limit > 10_000)) {
      errors.push({code: "SOURCE_LIMIT", nodeId: node.id});
    }
    if (["filter", "map", "aggregate", "sort"].includes(definition.type) && !connected.has("rows")) errors.push({ code: "MISSING_ROWS_INPUT", nodeId: node.id });
    if (definition.type === "filter" && connected.has("rows") && draft) {
      const fields = deriveFilterInputFields({nodes, edges, draft}, node.id);
      if (fields.length === 0) errors.push({code: "FILTER_INPUT_SCHEMA", nodeId: node.id});
      if (definition.config?.predicate) {
        for (const issue of validateFilterConfig(definition.config, fields)) {
          errors.push({code: issue.code, nodeId: node.id});
        }
      } else if (!definition.config?.expression && !definition.config?.window) {
        errors.push({code: "FILTER_CONFIG", nodeId: node.id});
      }
    }
    if (definition.type === "map" && connected.has("rows") && draft) {
      const fields = deriveDirectInputFields({nodes, edges, draft}, node.id);
      if (fields.length === 0) errors.push({code: "MAP_INPUT_SCHEMA", nodeId: node.id});
      for (const issue of validateMapConfig(definition.config, fields)) {
        errors.push({code: issue.code, nodeId: node.id});
      }
    }
    if (definition.type === "sort" && connected.has("rows") && draft) {
      const fields = deriveDirectInputFields({nodes, edges, draft}, node.id);
      if (fields.length === 0) errors.push({code: "SORT_INPUT_SCHEMA", nodeId: node.id});
      for (const issue of validateSortConfig(definition.config, fields)) {
        errors.push({code: issue.code, nodeId: node.id});
      }
    }
    if (definition.type === "aggregate" && connected.has("rows") && draft) {
      const fields = deriveDirectInputFields({nodes, edges, draft}, node.id);
      for (const issue of validateAggregateConfig(definition.config, fields)) {
        errors.push({code: issue.code, nodeId: node.id});
      }
    }
    if (["union", "join"].includes(definition.type) && inputPorts.some((port) => !connected.has(port))) errors.push({ code: "MISSING_BRANCH_INPUT", nodeId: node.id });
    if (definition.type === "output" && (incomingCounts.get(node.id) ?? 0) === 0) errors.push({ code: "MISSING_OUTPUT_INPUT", nodeId: node.id });
    if (definition.type === "output" && (incomingCounts.get(node.id) ?? 0) > 1) errors.push({ code: "OUTPUT_INPUT_COUNT", nodeId: node.id });
  }
  if (hasCycle(nodes, edges)) errors.push({ code: "CYCLE", nodeId: null });
  return errors;
}

function createsCycle(connection, nodes, edges) {
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  [...edges, connection].forEach((edge) => outgoing.get(edge.source)?.push(edge.target));
  const seen = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    seen.add(id);
    return false;
  }
  return nodes.some((node) => visit(node.id));
}

function hasCycle(nodes, edges) {
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => outgoing.get(edge.source)?.push(edge.target));
  const seen = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    seen.add(id);
    return false;
  }
  return nodes.some((node) => visit(node.id));
}
