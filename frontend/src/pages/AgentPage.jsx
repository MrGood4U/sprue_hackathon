import { useEffect, useRef, useState } from "react";
import { ArrowRight, Database, Sparkle } from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
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
  const { planState, result, run } = useAgentPlan(intent);
  const isPlanning = planState === "planning";
  const requestedPlan = useRef(false);

  useEffect(() => {
    if (planState === "planning") requestedPlan.current = true;
    if (requestedPlan.current && planState === "ready") {
      requestedPlan.current = false;
      navigate(`/app/products/${product.slug}/build`);
    }
    if (planState === "failed") requestedPlan.current = false;
  }, [navigate, planState, product.slug]);

  const submitPlan = (event) => {
    event.preventDefault();
    if (!isPlanning) {
      requestedPlan.current = true;
      void run();
    }
  };

  const trace = result?.trace ?? agent.trace;
  const statusKey = planState === "planning" ? "agent.status.planning" : planState === "failed" ? "agent.status.failed" : "agent.status.ready";

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
            <Status tone={planState === "failed" ? "amber" : planState === "planning" ? "violet" : "green"}>{t(statusKey)}</Status>
          </div>

          <div className="agent-chat" role="log" aria-label={t("agent.conversationLabel")}>
            <article className="agent-message agent-message-user">
              <div className="agent-message-meta"><span>{t("agent.you")}</span><span>{t("agent.intentMessage")}</span></div>
              <p>{intent}</p>
            </article>
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
          </div>

          <form className="agent-composer" onSubmit={submitPlan}>
            <label htmlFor="agent-intent">{t("agent.inputLabel")}</label>
            <textarea id="agent-intent" value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={8000} />
            <div className="agent-composer-footer">
              <span className="agent-composer-note">{t("agent.demoNotice")}</span>
              <div className="agent-composer-actions">
                {!isPlanning && <Button type="button" icon={ArrowRight} onClick={() => navigate(`/app/products/${product.slug}/build`)}>{t("agent.reviewDag")}</Button>}
                <Button type="submit" variant={isPlanning || planState === "failed" ? "primary" : "secondary"} icon={isPlanning ? Sparkle : ArrowRight} disabled={isPlanning}>{t(isPlanning ? "agent.planningAction" : "agent.generateAction")}</Button>
              </div>
            </div>
          </form>
        </section>
        <AgentProgress trace={trace} planState={planState} />
      </main>
    </div>
  );
}
