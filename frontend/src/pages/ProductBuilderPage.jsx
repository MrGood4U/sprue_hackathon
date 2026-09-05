import { useState } from "react";
import { CheckCircle, ListBullets, Sparkle } from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { BuildReadiness } from "../features/builder/BuildReadiness.jsx";
import { DagCanvas } from "../features/builder/DagCanvas.jsx";
import { ExecutionTrace } from "../features/builder/ExecutionTrace.jsx";
import { TemplateParameters } from "../features/builder/TemplateParameters.jsx";
import { BuilderInspector } from "../features/builder/BuilderInspector.jsx";
import { createDemoDraft } from "../services/demo/fixtures/builder.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useBuildRun } from "../features/builder/useBuildRun.js";

export function ProductBuilderPage({ navigate }) {
  const { t } = useI18n();
  const { buildState, startBuild, resetBuild } = useBuildRun();
  const [draft, setDraft] = useState(() => createDemoDraft());
  const [change, setChange] = useState(null);
  const [modal, setModal] = useState(null);
  function applyParameters(parameters) {
    const next = createDemoDraft(parameters);
    setChange({ oldDays: draft.parameters.windowDays, days: parameters.windowDays, oldThreshold: draft.parameters.minimumActiveDays, threshold: parameters.minimumActiveDays });
    resetBuild();
    setDraft(next);
  }
  return (
    <div className="product-page">
      <ProductHeader active="build" navigate={navigate}
        buildStatus={t(buildState === "failed" ? "common.operationFailed" : buildState === "building" ? "trace.building" : buildState === "complete" ? "builder.buildComplete" : "builder.readyToBuild")} />
      <div className="builder-layout">
        <aside className="intent-panel">
          <span className="section-label">{t("builder.intent")}</span>
          <p className="intent-copy">{t("builder.sampleIntent", { days: draft.parameters.windowDays, threshold: draft.parameters.minimumActiveDays })}</p>
          <div className="agent-summary">
            <div className="summary-title"><Sparkle size={19} className="violet-text" /><span>{t("builder.agentSummary")}</span></div>
            <div className="summary-item"><CheckCircle size={18} className="violet-text" /><span><strong>{t("builder.planValid")}</strong><small>{t("builder.planValidDetail")}</small></span></div>
            <div className="summary-item"><ListBullets size={18} className="violet-text" /><span><strong>{t("builder.nodes")}</strong><small>{t("builder.nodesDetail", { nodes: draft.specification.dag.nodes.length, edges: draft.specification.dag.edges.length })}</small></span></div>
          </div>
          <TemplateParameters parameters={draft.parameters} disabled={buildState === "building"} onApply={applyParameters} />
          <p className="builder-change" role="status">{change ? t("builder.parameterChange", change) : t("builder.noLiveAgent")}</p>
        </aside>
        <DagCanvas draft={draft} onSelectNode={setModal} />
        <BuildReadiness draft={draft} onInspect={setModal} />
      </div>
      <ExecutionTrace buildState={buildState} onBuild={startBuild} onOpenDag={() => setModal("dag")} onOpenSpec={() => setModal("spec")} />
      {buildState === "failed" && <p className="inline-notice" role="alert">{t("common.operationFailed")}</p>}
      {modal && <BuilderInspector selection={modal} draft={draft} onClose={() => setModal(null)} />}
    </div>
  );
}
