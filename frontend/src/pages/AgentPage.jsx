import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowRight, CircleNotch, Database, PencilSimple, Sparkle } from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Status } from "../components/ui/Status.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { AgentProgress } from "../features/agent/AgentProgress.jsx";
import { useAgentPlan } from "../features/agent/useAgentPlan.js";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";
import "../features/agent/agent.css";

export function AgentPage({ navigate }) {
  const { t } = useI18n();
  const { state } = useDemoRuntime();
  const { product, agent } = state;
  const [intent, setIntent] = useState(agent.intent);
  const [confirmation, setConfirmation] = useState(null);
  const { planState, result, run, reset } = useAgentPlan(intent);
  const isPlanning = planState === "planning";
  const hasAgentPlan = planState === "ready" || planState === "failed" || ["ready_for_review", "failed"].includes(agent.status);
  const requestedPlan = useRef(false);

  useEffect(() => {
    if (planState === "planning") requestedPlan.current = true;
    if (requestedPlan.current && planState === "ready") {
      requestedPlan.current = false;
      navigate(`/app/products/${product.slug}/build`);
    }
    if (planState === "failed") requestedPlan.current = false;
  }, [navigate, planState, product.slug]);

  const buildPath = `/app/products/${product.slug}/build`;

  const generatePlan = () => {
    if (!isPlanning) {
      requestedPlan.current = true;
      void run();
    }
  };

  const submitPlan = (event) => {
    event.preventDefault();
    if (!hasAgentPlan) generatePlan();
  };

  const confirmAction = () => {
    const action = confirmation;
    setConfirmation(null);
    if (action === "regenerate") {
      generatePlan();
      return;
    }
    if (action === "manual" || action === "abort") {
      reset();
      navigate(buildPath);
    }
  };

  const trace = isPlanning ? [] : result?.trace ?? agent.trace;

  return (
    <div className="product-page agent-page">
      <ProductHeader product={product} active="agent" navigate={navigate} />
      <main className="agent-layout">
        <section className="agent-conversation">
          <div className="content-heading agent-heading">
            <div>
              <span className="eyebrow">{t("agent.eyebrow")}</span>
              <h1>{t("agent.title")}</h1>
              <p>{t("agent.description")}</p>
            </div>
          </div>

          <div className="agent-chat" role="log" aria-label={t("agent.conversationLabel")}>
            <article className="agent-message agent-message-user">
              <div className="agent-message-meta"><span>{t("agent.you")}</span><span>{t("agent.intentMessage")}</span></div>
              <p>{intent}</p>
            </article>
            {hasAgentPlan ? (
              <article className="agent-message agent-message-assistant">
                <div className="agent-message-meta"><Sparkle size={16} /><span>{t("agent.assistant")}</span><Status tone="violet">{agent.model}</Status></div>
                <p>{t("agent.assistantResponse")}</p>
                <div className="agent-source-list" aria-label={t("agent.sourcesLabel")}>
                  {agent.sources.map((source) => <span className="agent-source-chip" key={source.sourceKey}><Database size={14} />{source.chain} · {source.sourceKey}</span>)}
                </div>
                <div className="agent-plan-facts">
                  <div><span>{t("agent.fact.sources")}</span><strong>{agent.sources.length}</strong></div>
                  <div><span>{t("agent.fact.nodes")}</span><strong>{agent.nodeCount}</strong></div>
                  <div><span>{t("agent.fact.fields")}</span><strong>{agent.outputFieldCount}</strong></div>
                </div>
              </article>
            ) : (
              <article className="agent-message agent-message-assistant agent-message-empty">
                <div className="agent-message-meta"><Sparkle size={16} /><span>{t("agent.assistant")}</span></div>
                <p>{t("agent.awaitingPlan")}</p>
              </article>
            )}
          </div>

          <form className="agent-composer" onSubmit={submitPlan}>
            <label htmlFor="agent-intent">{t("agent.inputLabel")}</label>
            <textarea id="agent-intent" value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={8000} disabled={isPlanning} />
            <div className="agent-composer-footer">
              <span className="agent-composer-note">{t("agent.demoNotice")}</span>
              <div className="agent-composer-actions">
                {isPlanning ? (
                  <Button
                    type="button"
                    variant="primary"
                    icon={CircleNotch}
                    className="agent-planning-button"
                    aria-label={t("agent.abortToManual")}
                    onClick={() => setConfirmation("abort")}
                  >
                    <span className="agent-planning-label">
                      <span className="agent-planning-default">{t("agent.planningAction")}</span>
                      <span className="agent-planning-hover">{t("agent.abortToManual")}</span>
                    </span>
                  </Button>
                ) : hasAgentPlan ? (
                  <>
                    <Button type="button" icon={ArrowClockwise} onClick={() => setConfirmation("regenerate")}>{t("agent.regenerateAction")}</Button>
                    <Button type="button" icon={PencilSimple} onClick={() => setConfirmation("manual")}>{t("agent.manualCreate")}</Button>
                    <Button type="button" variant="primary" icon={ArrowRight} onClick={() => navigate(buildPath)}>{t("agent.next")}</Button>
                  </>
                ) : (
                  <>
                    <Button type="button" icon={PencilSimple} onClick={() => navigate(buildPath)}>{t("agent.manualCreate")}</Button>
                    <Button type="submit" variant="primary" icon={Sparkle}>{t("agent.generateAction")}</Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </section>
        <AgentProgress trace={trace} planState={planState} />
      </main>
      {confirmation && (
        <Modal
          eyebrow={t("agent.confirm.eyebrow")}
          title={t(`agent.confirm.${confirmation}Title`)}
          onClose={() => setConfirmation(null)}
          footer={<><Button onClick={() => setConfirmation(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={confirmAction}>{t(`agent.confirm.${confirmation}Action`)}</Button></>}
        >
          <p className="modal-copy">{t(`agent.confirm.${confirmation}Body`)}</p>
        </Modal>
      )}
    </div>
  );
}
