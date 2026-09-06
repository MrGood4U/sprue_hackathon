import { canConnect, validateWorkflow } from "./connectionRules.js";
import { createOperatorNode, draftFromFlow, flowStateFromDraft, instantiateTemplate, nextNodeId } from "./editorProjection.js";

const clone = (value) => structuredClone(value);

export function createEditorState(draft) {
  const flow = flowStateFromDraft(draft);
  return {
    draft: clone(draft),
    nodes: flow.nodes,
    edges: flow.edges,
    tool: "select",
    selectedNodeId: null,
    selectedEdgeId: null,
    history: [],
    future: [],
    dirty: false,
    dragSnapshot: false,
    validation: validateWorkflow(flow.nodes, flow.edges),
  };
}

function snapshot(state) {
  return { draft: clone(state.draft), nodes: clone(state.nodes), edges: clone(state.edges) };
}

function withDraft(state, nodes, edges) {
  return { ...state, draft: draftFromFlow(state.draft, nodes, edges), nodes, edges, validation: validateWorkflow(nodes, edges) };
}

function commit(state, nodes, edges) {
  return { ...withDraft(state, nodes, edges), history: [...state.history, snapshot(state)], future: [], dirty: true };
}

function applyNodeChanges(nodes, changes) {
  return changes.reduce((current, change) => {
    if (change.type === "position" && change.position) return current.map((node) => node.id === change.id ? { ...node, position: change.position } : node);
    if (change.type === "select") return current.map((node) => ({ ...node, selected: node.id === change.id ? change.selected : false }));
    if (change.type === "remove") return current.filter((node) => node.id !== change.id);
    return current;
  }, nodes);
}

function applyEdgeChanges(edges, changes) {
  return changes.reduce((current, change) => {
    if (change.type === "select") return current.map((edge) => ({ ...edge, selected: edge.id === change.id ? change.selected : false }));
    if (change.type === "remove") return current.filter((edge) => edge.id !== change.id);
    return current;
  }, edges);
}

export function editorReducer(state, action) {
  switch (action.type) {
    case "reset": return createEditorState(action.draft);
    case "set_tool": return { ...state, tool: action.tool };
    case "select_node": return {
      ...state,
      selectedNodeId: action.id,
      selectedEdgeId: null,
      nodes: state.nodes.map((node) => ({ ...node, selected: node.id === action.id })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
    };
    case "select_edge": return {
      ...state,
      selectedNodeId: null,
      selectedEdgeId: action.id,
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      edges: state.edges.map((edge) => ({ ...edge, selected: edge.id === action.id })),
    };
    case "nodes_change": {
      const nextNodes = applyNodeChanges(state.nodes, action.changes);
      const nextEdges = state.edges.filter((edge) => nextNodes.some((node) => node.id === edge.source) && nextNodes.some((node) => node.id === edge.target));
      const selectedNodeChange = action.changes.find((change) => change.type === "select" && change.selected);
      const deselectedNode = action.changes.some((change) => change.type === "select" && !change.selected && change.id === state.selectedNodeId);
      const hasNodeSelectionChange = action.changes.some((change) => change.type === "select");
      const positions = action.changes.filter((change) => change.type === "position");
      const hasRemove = action.changes.some((change) => change.type === "remove");
      const isDragging = positions.some((change) => change.dragging === true);
      const finishedDragging = positions.some((change) => change.dragging === false);
      if (hasRemove) return {
        ...commit(state, nextNodes, nextEdges),
        selectedNodeId: state.selectedNodeId && nextNodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
        selectedEdgeId: state.selectedEdgeId && nextEdges.some((edge) => edge.id === state.selectedEdgeId) ? state.selectedEdgeId : null,
      };
      if (positions.length && (isDragging || finishedDragging || !action.changes.some((change) => change.dragging !== undefined))) {
        const next = withDraft(state, nextNodes, nextEdges);
        if (isDragging && !state.dragSnapshot) return { ...next, history: [...state.history, snapshot(state)], future: [], dirty: true, dragSnapshot: true };
        return { ...next, dirty: true, dragSnapshot: isDragging ? true : false };
      }
      if (hasNodeSelectionChange) return {
        ...state,
        nodes: nextNodes,
        edges: nextEdges.map((edge) => ({ ...edge, selected: false })),
        selectedNodeId: selectedNodeChange?.id ?? (deselectedNode ? null : state.selectedNodeId),
        selectedEdgeId: null,
      };
      return { ...state, nodes: nextNodes };
    }
    case "edges_change": {
      const nextEdges = applyEdgeChanges(state.edges, action.changes);
      const removed = action.changes.some((change) => change.type === "remove");
      const selectedEdgeChange = action.changes.find((change) => change.type === "select" && change.selected);
      const deselectedEdge = action.changes.some((change) => change.type === "select" && !change.selected && change.id === state.selectedEdgeId);
      const hasEdgeSelectionChange = action.changes.some((change) => change.type === "select");
      if (removed) return {
        ...commit(state, state.nodes, nextEdges),
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: state.selectedEdgeId && nextEdges.some((edge) => edge.id === state.selectedEdgeId) ? state.selectedEdgeId : null,
      };
      if (hasEdgeSelectionChange) return {
        ...state,
        nodes: state.nodes.map((node) => ({ ...node, selected: false })),
        edges: nextEdges,
        selectedNodeId: null,
        selectedEdgeId: selectedEdgeChange?.id ?? (deselectedEdge ? null : state.selectedEdgeId),
      };
      return { ...state, edges: nextEdges };
    }
    case "connect": {
      const connection = { ...action.connection, sourceHandle: action.connection.sourceHandle ?? "rows", targetHandle: action.connection.targetHandle ?? "rows" };
      if (!canConnect(connection, state.nodes, state.edges)) return state;
      const edge = { ...connection, id: `${connection.source}:${connection.sourceHandle}->${connection.target}:${connection.targetHandle}` };
      return commit(state, state.nodes, [...state.edges, edge]);
    }
    case "add_operator": {
      const id = nextNodeId(state.nodes, action.operatorType);
      const position = action.position ?? { x: 160 + state.nodes.length * 24, y: 120 + (state.nodes.length % 3) * 150 };
      return commit(state, [...state.nodes, createOperatorNode(action.operatorType, id, position)], state.edges);
    }
    case "add_template": {
      const instanceId = `template-${state.history.length + 1}`;
      const inserted = instantiateTemplate(action.templateId, instanceId, action.position ?? { x: 120, y: 100 });
      return commit(state, [...state.nodes, ...inserted.nodes], [...state.edges, ...inserted.edges]);
    }
    case "delete_selection": {
      if (state.selectedNodeId) {
        const nodes = state.nodes.filter((node) => node.id !== state.selectedNodeId);
        const edges = state.edges.filter((edge) => edge.source !== state.selectedNodeId && edge.target !== state.selectedNodeId);
        return { ...commit(state, nodes, edges), selectedNodeId: null, selectedEdgeId: null };
      }
      if (state.selectedEdgeId) {
        const edges = state.edges.filter((edge) => edge.id !== state.selectedEdgeId);
        return { ...commit(state, state.nodes, edges), selectedNodeId: null, selectedEdgeId: null };
      }
      return state;
    }
    case "update_config": {
      const nodes = state.nodes.map((item) => item.id === action.id
        ? { ...item, data: { ...item.data, node: { ...item.data.node, config: clone(action.config) } } }
        : item);
      return commit(state, nodes, state.edges);
    }
    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { ...clone(previous), history: state.history.slice(0, -1), future: [snapshot(state), ...state.future], dirty: true, tool: state.tool, selectedNodeId: state.selectedNodeId, selectedEdgeId: state.selectedEdgeId, validation: validateWorkflow(previous.nodes, previous.edges) };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...clone(next), history: [...state.history, snapshot(state)], future: state.future.slice(1), dirty: true, tool: state.tool, selectedNodeId: state.selectedNodeId, selectedEdgeId: state.selectedEdgeId, validation: validateWorkflow(next.nodes, next.edges) };
    }
    default: return state;
  }
}
