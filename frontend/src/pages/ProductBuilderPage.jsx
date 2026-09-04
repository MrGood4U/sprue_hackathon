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
  const [buildState, setBuildState] = useState("idle");
  const [modal, setModal] = useState(null);

  const startBuild = () => {
    setBuildState("building");
    window.setTimeout(() => setBuildState("complete"), 1500);
  };

  return (
    <div className="product-page">
      <ProductHeader
        active="Build"
        navigate={navigate}
        buildStatus={buildState === "complete" ? "Build complete" : "Ready to build"}
      />

      <div className="builder-layout">
        <aside className="intent-panel">
          <span className="section-label">Intent</span>
          <p className="intent-copy">{product.intent}</p>
          <button className="text-link" onClick={() => setModal("intent")}>
            <FileText size={15} />Edit
          </button>
          <div className="agent-summary">
            <div className="summary-title"><Sparkle size={19} className="violet-text" /><span>Agent summary</span></div>
            <div className="summary-item"><CheckCircle size={18} className="green-text" /><span><strong>Plan is valid</strong><small>DAG is executable and all checks passed.</small></span></div>
            <div className="summary-item"><ListBullets size={18} className="violet-text" /><span><strong>Nodes</strong><small>6 nodes, 5 edges</small></span></div>
            <div className="summary-item"><ShieldCheck size={18} className="cyan-text" /><span><strong>Deterministic</strong><small>Pinned sources, fixed window, stable ordering.</small></span></div>
            <div className="summary-item"><CurrencyDollar size={18} className="violet-text" /><span><strong>Estimated cost</strong><small>≤ 0.05 USDC per request (bounded)</small></span></div>
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
          title="Edit product intent"
          eyebrow="Natural-language input"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>Cancel</Button>
              <Button variant="primary" icon={Sparkle} onClick={() => setModal(null)}>Regenerate draft</Button>
            </>
          }
        >
          <Field label="Intent"><textarea defaultValue={product.intent} rows={6} /></Field>
          <div className="inline-notice">
            <Sparkle size={18} />
            <span>The agent will propose a new DAG; changes are never executed automatically.</span>
          </div>
        </Modal>
      )}

      {modal && modal !== "intent" && (
        <Modal
          title={modal === "spec" ? "Version v1 specification" : modal === "dag" ? "Structured DAG" : modal}
          eyebrow="Read-only prototype detail"
          width="640px"
          onClose={() => setModal(null)}
          footer={<Button variant="primary" onClick={() => setModal(null)}>Done</Button>}
        >
          <pre className="code-block">{modalDetail(modal)}</pre>
        </Modal>
      )}
    </div>
  );
}
