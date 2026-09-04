import { useState } from "react";
import {
  CheckCircle,
  CurrencyDollar,
  FileText,
  ListBullets,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { BuildReadiness } from "../features/builder/BuildReadiness.jsx";
import { DagCanvas } from "../features/builder/DagCanvas.jsx";
import { ExecutionTrace } from "../features/builder/ExecutionTrace.jsx";
import { dagNodes, product } from "../data/demoProduct.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

function modalDetail(modal) {
  if (modal === "dag") {
    return JSON.stringify({
      version: 1,
      nodes: dagNodes.map((node, index) => ({ id: `n${index + 1}`, op: node.title })),
    }, null, 2);
  }

  return `source: graph://base-dex@v1.4.2
window: 30d
filters:
  - repeat_wallets_only
group_by: protocol
materialize: hosted_api
access: x402`;
}

export function ProductBuilderPage({ navigate }) {
  const { locale, t } = useI18n();
  const [buildState, setBuildState] = useState("idle");
  const [modal, setModal] = useState(null);

  const startBuild = () => {
    setBuildState("building");
    window.setTimeout(() => setBuildState("complete"), 1500);
  };

  return (
    <div className="product-page">
      <ProductHeader
        active="build"
        navigate={navigate}
        buildStatus={t(buildState === "complete" ? "builder.buildComplete" : "builder.readyToBuild")}
      />

      <div className="builder-layout">
        <aside className="intent-panel">
          <span className="section-label">{t("builder.intent")}</span>
          <p className="intent-copy">{t(product.intentKey)}</p>
          <button className="text-link" onClick={() => setModal("intent")}>
            <FileText size={15} />{t("builder.edit")}
          </button>
          <div className="agent-summary">
            <div className="summary-title"><Sparkle size={19} className="violet-text" /><span>{t("builder.agentSummary")}</span></div>
            <div className="summary-item"><CheckCircle size={18} className="green-text" /><span><strong>{t("builder.planValid")}</strong><small>{t("builder.planValidDetail")}</small></span></div>
            <div className="summary-item"><ListBullets size={18} className="violet-text" /><span><strong>{t("builder.nodes")}</strong><small>{t("builder.nodesDetail")}</small></span></div>
            <div className="summary-item"><ShieldCheck size={18} className="cyan-text" /><span><strong>{t("builder.deterministic")}</strong><small>{t("builder.deterministicDetail")}</small></span></div>
            <div className="summary-item"><CurrencyDollar size={18} className="violet-text" /><span><strong>{t("builder.estimatedCost")}</strong><small>{t("builder.estimatedCostDetail")}</small></span></div>
          </div>
        </aside>

        <DagCanvas onSelectNode={setModal} />
        <BuildReadiness />
      </div>

      <ExecutionTrace
        buildState={buildState}
        onBuild={startBuild}
        onOpenDag={() => setModal("dag")}
        onOpenSpec={() => setModal("spec")}
      />

      {modal === "intent" && (
        <Modal
          title={t("builder.editIntentTitle")}
          eyebrow={t("builder.naturalLanguageInput")}
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>{t("common.cancel")}</Button>
              <Button variant="primary" icon={Sparkle} onClick={() => setModal(null)}>{t("builder.regenerateDraft")}</Button>
            </>
          }
        >
          <Field label={t("builder.intent")}><textarea key={locale} defaultValue={t(product.intentKey)} rows={6} /></Field>
          <div className="inline-notice">
            <Sparkle size={18} />
            <span>{t("builder.regenerateNotice")}</span>
          </div>
        </Modal>
      )}

      {modal && modal !== "intent" && (
        <Modal
          title={modal === "spec" ? t("builder.specTitle") : modal === "dag" ? t("builder.structuredDag") : t(dagNodes.find((node) => node.title === modal)?.titleKey ?? "builder.structuredDag")}
          eyebrow={t("builder.readOnlyDetail")}
          width="640px"
          onClose={() => setModal(null)}
          footer={<Button variant="primary" onClick={() => setModal(null)}>{t("common.done")}</Button>}
        >
          <pre className="code-block">{modalDetail(modal)}</pre>
        </Modal>
      )}
    </div>
  );
}
