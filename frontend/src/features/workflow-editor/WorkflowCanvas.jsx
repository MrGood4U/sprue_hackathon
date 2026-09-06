import { useCallback, useEffect, useRef } from "react";
import { Background, MarkerType, ReactFlow, useReactFlow } from "@xyflow/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { canConnect } from "./connectionRules.js";
import { WorkflowNode } from "./WorkflowNode.jsx";

const nodeTypes = { workflow: WorkflowNode };

export function WorkflowCanvas({ editor, onSelectNode, onEditNode }) {
  const { t } = useI18n();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef(null);

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
  }, [editor, screenToFlowPosition]);

  return (
    <div
      ref={canvasRef}
      className={`workflow-canvas workflow-canvas-${editor.tool}`}
      aria-label={t("workflowEditor.canvasLabel")}
      onDrop={onDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
    >
      <ReactFlow
        nodes={editor.nodes}
        edges={editor.edges}
        nodeTypes={nodeTypes}
        onNodesChange={editor.onNodesChange}
        onEdgesChange={editor.onEdgesChange}
        onConnect={editor.onConnect}
        onNodeClick={(_, node) => {
          editor.selectNode(node.id);
          onSelectNode?.(node.id);
        }}
        onNodeDoubleClick={(_, node) => {
          editor.selectNode(node.id);
          onEditNode?.(node.id);
        }}
        onPaneClick={() => editor.selectNode(null)}
        nodesDraggable={editor.tool === "select"}
        nodesConnectable={editor.tool === "select"}
        panOnDrag={editor.tool === "pan"}
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        minZoom={0.25}
        deleteKeyCode={["Backspace", "Delete"]}
        isValidConnection={(connection) => canConnect(connection, editor.nodes, editor.edges)}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.24 }}
      >
        <Background gap={18} size={1} color="var(--color-border-default)" />
      </ReactFlow>
      <p className="workflow-canvas-hint">{t("workflowEditor.canvasHint")}</p>
    </div>
  );
}
