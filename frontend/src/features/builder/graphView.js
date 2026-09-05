// Pure display projection, not the backend type/permission/resource validator.
export function projectGraph(dag, groups = []) {
  const original = new Map(dag.nodes.map((node) => [node.id, node]));
  if (original.size !== dag.nodes.length) throw new Error("DUPLICATE_NODE_ID");
  // Validate original topology before hiding internal edges in a collapsed view.
  if (groups.length) projectGraph(dag);
  const memberships = new Map();
  const groupIds = new Set();
  for (const group of groups) {
    if (original.has(group.id) || groupIds.has(group.id) || !group.nodeIds.length) throw new Error("INVALID_GROUP");
    groupIds.add(group.id);
    for (const id of group.nodeIds) {
      if (!original.has(id) || memberships.has(id)) throw new Error("INVALID_GROUP_MEMBER");
      memberships.set(id, group.id);
    }
    const reachable = new Set([group.nodeIds[0]]);
    for (let pass = 0; pass < group.nodeIds.length; pass += 1) {
      for (const edge of dag.edges) {
        if (group.nodeIds.includes(edge.fromNode) && group.nodeIds.includes(edge.toNode) && (reachable.has(edge.fromNode) || reachable.has(edge.toNode))) {
          reachable.add(edge.fromNode); reachable.add(edge.toNode);
        }
      }
    }
    if (reachable.size !== group.nodeIds.length) throw new Error("DISCONNECTED_GROUP");
  }
  const nodes = [...dag.nodes.filter((node) => !memberships.has(node.id)), ...groups.map((group) => ({ ...group, type: "template" }))];
  const projected = new Map();
  for (const edge of dag.edges) {
    if (!original.has(edge.fromNode) || !original.has(edge.toNode) || edge.fromPort !== "rows" || edge.toPort !== "rows") throw new Error("INVALID_EDGE");
    const fromNode = memberships.get(edge.fromNode) ?? edge.fromNode;
    const toNode = memberships.get(edge.toNode) ?? edge.toNode;
    if (fromNode === toNode && memberships.has(edge.fromNode)) continue;
    const id = `${fromNode}:${edge.fromPort}->${toNode}:${edge.toPort}`;
    projected.set(id, { ...edge, id, fromNode, toNode });
  }
  const edges = [...projected.values()];
  const incoming = new Map(nodes.map((node) => [node.id, edges.filter((edge) => edge.toNode === node.id).length]));
  const positions = new Map();
  let ready = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id).sort();
  let column = 0;
  while (ready.length) {
    const next = [];
    ready.forEach((id, row) => {
      positions.set(id, { x: 24 + column * 172, y: 24 + row * 164 });
      for (const edge of edges.filter((item) => item.fromNode === id)) {
        incoming.set(edge.toNode, incoming.get(edge.toNode) - 1);
        if (incoming.get(edge.toNode) === 0) next.push(edge.toNode);
      }
    });
    ready = next.sort(); column += 1;
  }
  if (positions.size !== nodes.length) throw new Error("CYCLIC_GRAPH_VIEW");
  return { nodes: nodes.map((node) => ({ ...node, ...positions.get(node.id) })), edges,
    width: Math.max(320, column * 172 + 4), height: Math.max(210, ...[...positions.values()].map((position) => position.y + 152)) };
}
