import { isNodeConfigured } from "./nodeConfiguration.js";

export function presentWorkflowNodes(nodes, validation, previous = new Map()) {
  const cache = new Map();
  const presented = nodes.map((node) => {
    const configured = isNodeConfigured(node.data.node, validation);
    const prior = previous.get(node.id);
    const displayNode = prior?.source === node && prior.configured === configured
      ? prior.display
      : {
          ...node,
          data: {
            ...node.data,
            configured,
          },
        };
    cache.set(node.id, { source: node, configured, display: displayNode });
    return displayNode;
  });
  return { nodes: presented, cache };
}
