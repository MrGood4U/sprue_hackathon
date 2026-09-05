import { useState } from "react";
import { CheckCircle, ListBullets, Sparkle } from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { BuildReadiness } from "../features/builder/BuildReadiness.jsx";
import { DagCanvas } from "../features/builder/DagCanvas.jsx";
import { ExecutionTrace } from "../features/builder/ExecutionTrace.jsx";
import { TemplateParameters } from "../features/builder/TemplateParameters.jsx";
import { BuilderInspector } from "../features/builder/BuilderInspector.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useBuildRun } from "../features/builder/useBuildRun.js";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

export function ProductBuilderPage({ navigate }) {
  const { t } = useI18n();
  const { state } = useDemoRuntime();
  const { buildState, buildTrace, startBuild, resetBuild } = useBuildRun();
  const [refreshed, setRefreshed] = useState(false);
  const [modal, setModal] = useState(null);
  const { product } = state;
  const { draft } = product;
  async function applyParameters(parameters) {
    setRefreshed(true);
    resetBuild();
    await startBuild(parameters);
  }
  return (
    <div className="product-page">
      <ProductHeader product={product} active="build" navigate={navigate}
        buildStatus={t(buildState === "failed" ? "common.operationFailed" : buildState === "building" ? "trace.building" : buildState === "complete" ? "builder.buildComplete" : "builder.readyToBuild")} />
      <div className="builder-layout">
        <aside className="intent-panel">
          <span className="section-label">{t("builder.intent")}</span>
          <p className="intent-copy">{product.intent}</p>
          <div className="agent-summary">
            <div className="summary-title"><Sparkle size={19} className="violet-text" /><span>{t("builder.agentSummary")}</span></div>
            <div className="summary-item"><CheckCircle size={18} className="violet-text" /><span><strong>{t("builder.planValid")}</strong><small>{t("builder.planValidDetail")}</small></span></div>
            <div className="summary-item"><ListBullets size={18} className="violet-text" /><span><strong>{t("builder.nodes")}</strong><small>{t("builder.nodesDetail", { nodes: draft.specification.dag.nodes.length, edges: draft.specification.dag.edges.length })}</small></span></div>
          </div>
          <TemplateParameters parameters={draft.parameters} disabled={buildState === "building"} onApply={applyParameters} />
          <p className="builder-change" role="status">{refreshed ? t("builder.proposalRefreshed") : t("builder.noLiveAgent")}</p>
        </aside>
        <DagCanvas draft={draft} onSelectNode={setModal} />
        <BuildReadiness draft={draft} onInspect={setModal} />
      </div>
      <ExecutionTrace buildState={buildState} trace={buildTrace} onBuild={startBuild} onOpenDag={() => setModal("dag")} onOpenSpec={() => setModal("spec")} />
      {buildState === "failed" && <p className="inline-notice" role="alert">{t("common.operationFailed")}</p>}
      {modal && <BuilderInspector selection={modal} draft={draft} onClose={() => setModal(null)} />}
    </div>
  );
}
