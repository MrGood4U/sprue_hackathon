import { useEffect, useState } from "react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
import { BuildReadiness } from "../features/builder/BuildReadiness.jsx";
import { ExecutionTrace } from "../features/builder/ExecutionTrace.jsx";
import { BuilderInspector } from "../features/builder/BuilderInspector.jsx";
import { browserSessionStorage, cacheBuilderDraft } from "../features/builder/liveBuilderProjection.js";
import { useProductBuilder } from "../features/builder/useProductBuilder.js";
import { productRefFromPath } from "../features/products/productRoute.js";
import { WorkflowEditor } from "../features/workflow-editor/WorkflowEditor.jsx";
import { useWorkflowEditor } from "../features/workflow-editor/useWorkflowEditor.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

function LoadedBuilder({ builder }) {
  const { t } = useI18n();
  const [modal, setModal] = useState(null);
  const [readinessCollapsed, setReadinessCollapsed] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState("idle");
  const editor = useWorkflowEditor(builder.draft);
  const workingDraft = editor.draft;
  const canSaveDraft = editor.dirty && editor.validation.length === 0;

  useEffect(() => {
    if (!editor.dirty) return;
    cacheBuilderDraft(browserSessionStorage(), builder.workspaceId, builder.product.id, workingDraft);
  }, [builder.product.id, builder.workspaceId, editor.dirty, workingDraft]);

  const saveDraft = () => {
    cacheBuilderDraft(browserSessionStorage(), builder.workspaceId, builder.product.id, workingDraft);
    editor.markClean();
    setDraftSaveState("session");
  };

  return (
    <>
      <div className={`builder-layout ${readinessCollapsed ? "readiness-collapsed" : ""}`}>
        <WorkflowEditor editor={editor} />
        <BuildReadiness draft={workingDraft} validation={editor.validation} onInspect={setModal} collapsed={readinessCollapsed} onToggle={() => setReadinessCollapsed((value) => !value)} />
      </div>
      <ExecutionTrace
        buildState="idle"
        onBuild={() => {}}
        onOpenDag={() => setModal("dag")}
        onSaveDraft={saveDraft}
        canSaveDraft={canSaveDraft}
        saveState={draftSaveState}
        buildDisabled
        buildDisabledReason={t("builder.sourceAdmissionRequired")}
      />
      {modal && <BuilderInspector selection={modal} draft={workingDraft} onClose={() => setModal(null)} />}
    </>
  );
}

export function ProductBuilderPage({ path, navigate }) {
  const { t } = useI18n();
  const productRef = productRefFromPath(path);
  const builder = useProductBuilder(productRef);
  const product = builder.product ?? (builder.status === "error" ? {name: t("builder.unknownProduct"), slug: productRef} : null);

  return (
    <div className="product-page">
      <ProductHeader product={product} productRef={productRef} active="build" navigate={navigate} onRename={builder.status === "ready" ? builder.rename : null} />
      {builder.status === "loading" && (
        <main className="runtime-gate builder-route-state"><div className="panel"><span className="section-label">{t("builder.liveDraftLabel")}</span><h1>{t("builder.loadingDraft")}</h1><p>{t("builder.loadingDraftDetail")}</p></div></main>
      )}
      {builder.status === "error" && (
        <main className="runtime-gate builder-route-state"><div className="panel"><span className="section-label">{t("builder.liveDraftLabel")}</span><h1>{t("builder.loadError")}</h1><p>{t("builder.loadErrorDetail")}</p><Button variant="primary" onClick={() => builder.refresh()}>{t("common.retry")}</Button></div></main>
      )}
      {builder.status === "ready" && <LoadedBuilder builder={builder} />}
    </div>
  );
}
