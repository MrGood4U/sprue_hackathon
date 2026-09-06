import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { NodeInspector } from "./NodeInspector.jsx";
import { WorkflowCanvas } from "./WorkflowCanvas.jsx";
import "@xyflow/react/dist/style.css";
import "./workflow-editor.css";

export function WorkflowEditor({ editor, onSelectNode }) {
  const { t } = useI18n();
  const [editingNodeId, setEditingNodeId] = useState(null);
  const closeNodeEditor = useCallback(() => setEditingNodeId(null), []);

  return (
    <ReactFlowProvider>
      <section className="workflow-editor" aria-label={t("workflowEditor.canvasLabel")}>
        <div className="workflow-editor-main">
          <div className="workflow-editor-viewport">
            <WorkflowCanvas editor={editor} onSelectNode={onSelectNode} onEditNode={setEditingNodeId} />
          </div>
          <NodeInspector editor={editor} nodeId={editingNodeId} onClose={closeNodeEditor} />
        </div>
      </section>
    </ReactFlowProvider>
  );
}
