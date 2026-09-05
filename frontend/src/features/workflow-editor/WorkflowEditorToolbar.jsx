import {
  ArrowsOut,
  ArrowUUpLeft,
  ArrowUUpRight,
  Cursor,
  Hand,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Trash,
} from "@phosphor-icons/react";
import { useReactFlow } from "@xyflow/react";
import { IconButton } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function WorkflowEditorToolbar({ editor }) {
  const { t } = useI18n();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="workflow-editor-toolbar" role="toolbar" aria-label={t("workflowEditor.canvasLabel")}>
      <div className="workflow-tool-group" aria-label={t("workflowEditor.canvasLabel")}>
        <IconButton
          className={editor.tool === "select" ? "is-active" : ""}
          label={t("workflowEditor.toolbar.select")}
          aria-pressed={editor.tool === "select"}
          onClick={() => editor.setTool("select")}
        >
          <Cursor size={17} weight="bold" aria-hidden="true" />
        </IconButton>
        <IconButton
          className={editor.tool === "pan" ? "is-active" : ""}
          label={t("workflowEditor.toolbar.pan")}
          aria-pressed={editor.tool === "pan"}
          onClick={() => editor.setTool("pan")}
        >
          <Hand size={17} weight="bold" aria-hidden="true" />
        </IconButton>
      </div>
      <span className="workflow-toolbar-divider" aria-hidden="true" />
      <div className="workflow-tool-group">
        <IconButton label={t("workflowEditor.toolbar.undo")} disabled={!editor.canUndo} onClick={editor.undo}>
          <ArrowUUpLeft size={17} weight="bold" aria-hidden="true" />
        </IconButton>
        <IconButton label={t("workflowEditor.toolbar.redo")} disabled={!editor.canRedo} onClick={editor.redo}>
          <ArrowUUpRight size={17} weight="bold" aria-hidden="true" />
        </IconButton>
      </div>
      <span className="workflow-toolbar-divider" aria-hidden="true" />
      <div className="workflow-tool-group">
        <IconButton label={t("workflowEditor.toolbar.zoomIn")} onClick={() => zoomIn({ duration: 180 })}>
          <MagnifyingGlassPlus size={17} weight="bold" aria-hidden="true" />
        </IconButton>
        <IconButton label={t("workflowEditor.toolbar.zoomOut")} onClick={() => zoomOut({ duration: 180 })}>
          <MagnifyingGlassMinus size={17} weight="bold" aria-hidden="true" />
        </IconButton>
        <IconButton label={t("workflowEditor.toolbar.fit")} onClick={() => fitView({ padding: 0.24, duration: 220 })}>
          <ArrowsOut size={17} weight="bold" aria-hidden="true" />
        </IconButton>
        <IconButton label={t("workflowEditor.toolbar.delete")} disabled={!editor.selectedNodeId} onClick={editor.deleteSelection}>
          <Trash size={17} weight="bold" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
