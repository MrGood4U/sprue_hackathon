import { MarkerType } from "@xyflow/react";
import { projectGraph } from "../builder/graphView.js";
import { defaultNodeConfig, getTemplate } from "./nodeCatalog.js";

export function flowStateFromDraft(draft) {
  const graph = projectGraph(draft.specification.dag, []);
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: "workflow",
      position: { x: node.x, y: node.y },
      data: { node: structuredClone({
        id: node.id,
        type: node.type,
        operatorVersion: node.operatorVersion,
        config: node.config,
        labelKey: node.labelKey,
      }) },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.fromNode,
      sourceHandle: edge.fromPort,
      target: edge.toNode,
      targetHandle: edge.toPort,
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  };
}

export function draftFromFlow(baseDraft, nodes, edges) {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const nextNodes = nodes.map((item) => {
    const { x: _x, y: _y, ...canonicalNode } = structuredClone(item.data.node);
    return { ...canonicalNode, id: item.id };
  });
  const nextEdges = edges
    .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
    .map((edge) => ({
      fromNode: edge.source,
      fromPort: edge.sourceHandle ?? "rows",
      toNode: edge.target,
      toPort: edge.targetHandle ?? "rows",
    }));
  const nextGroups = (baseDraft.groups ?? [])
    .map((group) => ({
      ...structuredClone(group),
      nodeIds: group.nodeIds.filter((id) => nodeById.has(id)),
    }))
    .filter((group) => group.nodeIds.length > 0);
  const outputNodes = nextNodes.filter((node) => node.type === "output");
  const outputId = outputNodes.length === 1 ? outputNodes[0].id : null;
  const outputConnected = Boolean(outputId && nextEdges.some((edge) => edge.toNode === outputId));
  const outputViews = outputId ? outputNodes[0].config?.views ?? [] : [];
  const hasCrossChainPreview = outputViews.length === 0 || outputViews.includes("crossChain");
  const hasOutputPreview = outputConnected && hasCrossChainPreview;
  return {
    ...baseDraft,
    groups: nextGroups,
    referenceResult: hasOutputPreview ? structuredClone(baseDraft.referenceResult ?? []) : [],
    specification: {
      ...baseDraft.specification,
      dag: { nodes: nextNodes, edges: nextEdges },
      outputSchema: {
        ...baseDraft.specification.outputSchema,
        fields: hasOutputPreview ? [...(baseDraft.specification.outputSchema.fields ?? [])] : [],
      },
    },
  };
}

export function createOperatorNode(type, id, position) {
  return {
    id,
    type: "workflow",
    position,
    data: { node: { id, type, operatorVersion: "1", config: defaultNodeConfig(type) } },
  };
}

export function instantiateTemplate(templateId, instanceId, position) {
  const template = getTemplate(templateId);
  if (!template) throw new Error("UNKNOWN_WORKFLOW_TEMPLATE");
  const nodes = template.nodes.map((node, index) => {
    const id = `${instanceId}-${node.localId}`;
    return {
      id,
      type: "workflow",
      position: { x: position.x + (index % 3) * 210, y: position.y + Math.floor(index / 3) * 150 },
      data: { node: { id, type: node.type, operatorVersion: "1", config: structuredClone(node.config) } },
    };
  });
  const localIdToId = new Map(template.nodes.map((node) => [`${instanceId}-${node.localId}`, `${instanceId}-${node.localId}`]));
  const edges = template.edges.map((edge) => ({
    id: `${instanceId}-${edge.fromNode}-${edge.toNode}`,
    source: localIdToId.get(`${instanceId}-${edge.fromNode}`),
    sourceHandle: edge.fromPort,
    target: localIdToId.get(`${instanceId}-${edge.toNode}`),
    targetHandle: edge.toPort,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return { nodes, edges };
}

export function nextNodeId(nodes, type) {
  const prefix = type.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const used = new Set(nodes.map((node) => node.id));
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
