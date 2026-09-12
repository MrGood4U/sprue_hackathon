import { useEffect, useRef, useState } from "react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
import { BuildReadiness } from "../features/builder/BuildReadiness.jsx";
import { BuildFailureDialog } from "../features/builder/BuildFailureDialog.jsx";
import { ExecutionTrace } from "../features/builder/ExecutionTrace.jsx";
import { BuilderInspector } from "../features/builder/BuilderInspector.jsx";
import { browserSessionStorage, cacheBuilderDraft, clearCachedBuilderDraft, draftWithBuilderLayout } from "../features/builder/liveBuilderProjection.js";
import { useProductBuilder } from "../features/builder/useProductBuilder.js";
import { productRefFromPath } from "../features/products/productRoute.js";
import { WorkflowEditor } from "../features/workflow-editor/WorkflowEditor.jsx";
import { useWorkflowEditor } from "../features/workflow-editor/useWorkflowEditor.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import {useUnsavedNavigationGuard} from "../app/NavigationGuardProvider.jsx";
import {buildRequestIssue} from "../features/builder/buildRequestIssue.js";

function LoadedBuilder({ builder, navigate, productRef }) {
  const { t } = useI18n();
  const [modal, setModal] = useState(null);
  const [readinessCollapsed, setReadinessCollapsed] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState("idle");
  const [buildState, setBuildState] = useState("idle");
  const [buildFailure, setBuildFailure] = useState(null);
  const activeCompilation = useRef(null);
  const editor = useWorkflowEditor(builder.draft);
  const workingDraft = editor.draft;
  const canSaveDraft = editor.dirty && editor.validation.length === 0;
  useUnsavedNavigationGuard(editor.dirty, () => {
    clearCachedBuilderDraft(browserSessionStorage(), builder.workspaceId, builder.product.id);
  });

  useEffect(() => {
    if (!editor.dirty) return;
    cacheBuilderDraft(browserSessionStorage(), builder.workspaceId, builder.product.id, draftWithBuilderLayout(workingDraft, editor.nodes));
  }, [builder.product.id, builder.workspaceId, editor.dirty, editor.nodes, workingDraft]);

  useEffect(() => {
    if (editor.dirty && draftSaveState === "saved") setDraftSaveState("idle");
  }, [draftSaveState, editor.dirty]);

  useEffect(() => () => activeCompilation.current?.abort(), []);

  const saveDraft = async () => {
    if (!canSaveDraft || draftSaveState === "saving") return;
    setDraftSaveState("saving");
    try {
      await builder.persistDraft(workingDraft, editor.nodes);
      cacheBuilderDraft(browserSessionStorage(), builder.workspaceId, builder.product.id, draftWithBuilderLayout(workingDraft, editor.nodes));
      editor.markClean();
      setDraftSaveState("saved");
    } catch {
      setDraftSaveState("error");
    }
  };

  const runBuild = async () => {
    if (buildState === "building") return;
    const controller = new AbortController();
    activeCompilation.current?.abort();
    activeCompilation.current = controller;
    setBuildFailure(null);
    setBuildState("building");
    let requestPhase = "save";
    try {
      await builder.persistDraft(workingDraft, editor.nodes, controller.signal);
      if (controller.signal.aborted) return;
      cacheBuilderDraft(browserSessionStorage(), builder.workspaceId, builder.product.id, draftWithBuilderLayout(workingDraft, editor.nodes));
      editor.markClean();
      setDraftSaveState("saved");
      requestPhase = "compile";
      const compilation = await builder.compileDraft(workingDraft, controller.signal);
      if (controller.signal.aborted) return;
      if (compilation.status === "failed") {
        setBuildFailure(compilation.issues);
        setBuildState("failed");
        return;
      }
      setBuildState("complete");
      navigate(`/app/products/${encodeURIComponent(productRef)}/api`);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setBuildFailure([buildRequestIssue(error, requestPhase, t)]);
      setBuildState("failed");
    } finally {
      if (activeCompilation.current === controller) activeCompilation.current = null;
    }
  };

  return (
    <>
      <div className={`builder-layout ${readinessCollapsed ? "readiness-collapsed" : ""}`}>
        <WorkflowEditor
          editor={editor}
          sourceDiscovery={{search: builder.searchSources, validate: builder.validateSource}}
        />
        <BuildReadiness draft={workingDraft} validation={editor.validation} onInspect={setModal} collapsed={readinessCollapsed} onToggle={() => setReadinessCollapsed((value) => !value)} />
      </div>
      <ExecutionTrace
        buildState={buildState}
        onBuild={runBuild}
        onOpenDag={() => setModal("dag")}
        onSaveDraft={saveDraft}
        canSaveDraft={canSaveDraft && draftSaveState !== "saving" && buildState !== "building"}
        saveState={draftSaveState}
        buildDisabled={draftSaveState === "saving"}
      />
      {modal && <BuilderInspector selection={modal} draft={workingDraft} onClose={() => setModal(null)} />}
      {buildFailure && <BuildFailureDialog issues={buildFailure} onClose={() => setBuildFailure(null)} />}
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
      {builder.status === "ready" && <LoadedBuilder builder={builder} navigate={navigate} productRef={productRef} />}
    </div>
  );
}
