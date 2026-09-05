import { useState } from "react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { BuildReadiness } from "../features/builder/BuildReadiness.jsx";
import { ExecutionTrace } from "../features/builder/ExecutionTrace.jsx";
import { BuilderInspector } from "../features/builder/BuilderInspector.jsx";
import { WorkflowEditor } from "../features/workflow-editor/WorkflowEditor.jsx";
import { useWorkflowEditor } from "../features/workflow-editor/useWorkflowEditor.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useBuildRun } from "../features/builder/useBuildRun.js";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

export function ProductBuilderPage({ navigate }) {
  const { t } = useI18n();
  const { state } = useDemoRuntime();
  const { buildState, startBuild } = useBuildRun();
  const [modal, setModal] = useState(null);
  const [readinessCollapsed, setReadinessCollapsed] = useState(false);
  const { product } = state;
  const { draft } = product;
  const editor = useWorkflowEditor(draft);
  const workingDraft = editor.draft;
  return (
    <div className="product-page">
      <ProductHeader product={product} active="build" navigate={navigate} />
      <div className={`builder-layout ${readinessCollapsed ? "readiness-collapsed" : ""}`}>
        <WorkflowEditor editor={editor} />
        <BuildReadiness draft={workingDraft} validation={editor.validation} onInspect={setModal} collapsed={readinessCollapsed} onToggle={() => setReadinessCollapsed((value) => !value)} />
      </div>
      <ExecutionTrace buildState={buildState} onBuild={startBuild} onOpenDag={() => setModal("dag")} />
      {buildState === "failed" && <p className="inline-notice" role="alert">{t("common.operationFailed")}</p>}
      {modal && <BuilderInspector selection={modal} draft={workingDraft} onClose={() => setModal(null)} />}
    </div>
  );
}
