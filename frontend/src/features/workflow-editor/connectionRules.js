const inputPorts = {
  source: [],
  filter: ["rows"],
  map: ["rows"],
  aggregate: ["rows"],
  union: ["left", "right"],
  join: ["left", "right"],
  output: ["crossChain", "allActivity", "rows"],
};

const outputPorts = {
  source: ["rows"],
  filter: ["rows"],
  map: ["rows"],
  aggregate: ["rows"],
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
  if (edges.some((edge) => edge.target === target.id && edge.targetHandle === (connection.targetHandle ?? "rows"))) return false;
  if (createsCycle(connection, nodes, edges)) return false;
  return true;
}

export function validateWorkflow(nodes, edges) {
  const errors = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, new Set()]));
  const outputNodes = nodes.filter((node) => node.data.node.type === "output");

  if (outputNodes.length !== 1) errors.push({ code: "OUTPUT_COUNT", nodeId: null });
  for (const edge of edges) {
    const targets = incoming.get(edge.target);
    if (targets) targets.add(edge.targetHandle ?? "rows");
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) errors.push({ code: "MISSING_EDGE_NODE", nodeId: edge.target });
  }
  for (const node of nodes) {
    const definition = node.data.node;
    const inputPorts = getInputPorts(definition.type);
    const connected = incoming.get(node.id) ?? new Set();
    if (definition.type === "source" && !definition.config?.sourceKey) errors.push({ code: "SOURCE_CONFIG", nodeId: node.id });
    if (["filter", "map", "aggregate"].includes(definition.type) && !connected.has("rows")) errors.push({ code: "MISSING_ROWS_INPUT", nodeId: node.id });
    if (["union", "join"].includes(definition.type) && inputPorts.some((port) => !connected.has(port))) errors.push({ code: "MISSING_BRANCH_INPUT", nodeId: node.id });
    if (definition.type === "output" && connected.size === 0) errors.push({ code: "MISSING_OUTPUT_INPUT", nodeId: node.id });
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
