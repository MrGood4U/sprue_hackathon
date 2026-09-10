import { useCallback, useEffect, useMemo, useRef } from "react";
import { Background, MarkerType, Panel, ReactFlow, useReactFlow } from "@xyflow/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { canConnect } from "./connectionRules.js";
import { NodePalette } from "./NodePalette.jsx";
import { WorkflowEditorToolbar } from "./WorkflowEditorToolbar.jsx";
import { WorkflowNode } from "./WorkflowNode.jsx";
import { presentWorkflowNodes } from "./nodePresentation.js";

const nodeTypes = { workflow: WorkflowNode };
const defaultEdgeOptions = { markerEnd: { type: MarkerType.ArrowClosed } };
const fitViewOptions = { padding: 0.24 };
const deleteKeyCode = ["Backspace", "Delete"];
const proOptions = { hideAttribution: true };

function allowPaletteDrop(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

export function WorkflowCanvas({ editor, onSelectNode, onEditNode }) {
  const { t } = useI18n();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef(null);
  const graphRef = useRef({ nodes: editor.nodes, edges: editor.edges });
  graphRef.current = { nodes: editor.nodes, edges: editor.edges };
  const presentedNodesRef = useRef(new Map());
  const displayNodes = useMemo(() => {
    const next = presentWorkflowNodes(editor.nodes, editor.validation, presentedNodesRef.current);
    presentedNodesRef.current = next.cache;
    return next.nodes;
  }, [editor.nodes, editor.validation]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    let frame;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitView({ padding: 0.24, duration: 0 }));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitView]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/sprue-node");
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (payload.kind === "template") editor.addTemplate(payload.id, position);
    if (payload.kind === "operator") editor.addOperator(payload.id, position);
  }, [editor.addOperator, editor.addTemplate, screenToFlowPosition]);

  const onNodesChange = useCallback((changes) => {
    const nextChanges = editor.tool === "pan" ? changes.filter((change) => change.type !== "select") : changes;
    if (nextChanges.length > 0) editor.onNodesChange(nextChanges);
  }, [editor.onNodesChange, editor.tool]);

  const onEdgesChange = useCallback((changes) => {
    const nextChanges = editor.tool === "pan" ? changes.filter((change) => change.type !== "select") : changes;
    if (nextChanges.length > 0) editor.onEdgesChange(nextChanges);
  }, [editor.onEdgesChange, editor.tool]);

  const onNodeClick = useCallback((_, node) => {
    if (editor.tool !== "select") return;
    editor.selectNode(node.id);
    onSelectNode?.(node.id);
  }, [editor.selectNode, editor.tool, onSelectNode]);

  const onNodeDoubleClick = useCallback((_, node) => {
    if (editor.tool !== "select") return;
    editor.selectNode(node.id);
    onEditNode?.(node.id);
  }, [editor.selectNode, editor.tool, onEditNode]);

  const onEdgeClick = useCallback((_, edge) => {
    if (editor.tool !== "select") return;
    editor.selectEdge(edge.id);
  }, [editor.selectEdge, editor.tool]);

  const onPaneClick = useCallback(() => {
    if (editor.tool === "select") editor.selectNode(null);
  }, [editor.selectNode, editor.tool]);

  const isValidConnection = useCallback((connection) => {
    const { nodes, edges } = graphRef.current;
    return canConnect(connection, nodes, edges);
  }, []);

  return (
    <div
      ref={canvasRef}
      className={`workflow-canvas workflow-canvas-${editor.tool}`}
      aria-label={t("workflowEditor.canvasLabel")}
      onDrop={onDrop}
      onDragOver={allowPaletteDrop}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={editor.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={editor.onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodesSelectable={editor.tool === "select"}
        nodesDraggable={editor.tool === "select"}
        nodesConnectable={editor.tool === "select"}
        edgesFocusable={editor.tool === "select"}
        elementsSelectable={editor.tool === "select"}
        panOnDrag={editor.tool === "pan"}
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        minZoom={0.25}
        deleteKeyCode={deleteKeyCode}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={proOptions}
        fitView
        fitViewOptions={fitViewOptions}
      >
        <Background gap={28} size={1.4} color="var(--dag-grid)" />
        <Panel position="top-left" className="workflow-canvas-palette-panel nodrag nopan">
          <NodePalette editor={editor} />
        </Panel>
        <Panel position="top-center" className="workflow-canvas-toolbar-panel">
          <WorkflowEditorToolbar editor={editor} />
        </Panel>
      </ReactFlow>
      <p className="workflow-canvas-hint">{t("workflowEditor.canvasHint")}</p>
    </div>
  );
}
