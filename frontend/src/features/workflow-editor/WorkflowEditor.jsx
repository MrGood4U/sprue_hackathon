import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { NodePalette } from "./NodePalette.jsx";
import { NodeInspector } from "./NodeInspector.jsx";
import { WorkflowCanvas } from "./WorkflowCanvas.jsx";
import { WorkflowEditorToolbar } from "./WorkflowEditorToolbar.jsx";
import "@xyflow/react/dist/style.css";
import "./workflow-editor.css";

export function WorkflowEditor({ editor, onSelectNode }) {
  const { t } = useI18n();
  const [editingNodeId, setEditingNodeId] = useState(null);
  const closeNodeEditor = useCallback(() => setEditingNodeId(null), []);
  const draftStatus = editor.validation.length > 0 ? "invalid" : editor.dirty ? "dirty" : "saved";

  return (
    <ReactFlowProvider>
      <section className="workflow-editor" aria-label={t("workflowEditor.canvasLabel")}>
        <NodePalette editor={editor} />
        <div className="workflow-editor-main">
          <div className="workflow-editor-main-header">
            <div>
              <span className="section-label">{t("dag.sampleLabel")}</span>
              <p>{t("workflowEditor.status.nodes", { nodes: editor.nodes.length, edges: editor.edges.length })}</p>
            </div>
            <span className={`workflow-draft-status workflow-draft-status-${draftStatus}`}>
              <span className="status-dot" aria-hidden="true" />
              {draftStatus === "invalid" ? t("workflowEditor.status.invalid") : draftStatus === "dirty" ? t("workflowEditor.status.dirty") : t("workflowEditor.status.saved")}
            </span>
          </div>
          <WorkflowEditorToolbar editor={editor} />
          <div className="workflow-editor-viewport">
            <WorkflowCanvas editor={editor} onSelectNode={onSelectNode} onEditNode={setEditingNodeId} />
          </div>
          <NodeInspector editor={editor} nodeId={editingNodeId} onClose={closeNodeEditor} />
        </div>
      </section>
    </ReactFlowProvider>
  );
}
