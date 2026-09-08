import {Fragment, useEffect, useRef, useState} from "react";
import {
  ArrowClockwise,
  ArrowRight,
  CircleNotch,
  Database,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import {ProductHeader} from "../components/product/ProductHeader.jsx";
import {Button} from "../components/ui/Button.jsx";
import {Modal} from "../components/ui/Modal.jsx";
import {Status} from "../components/ui/Status.jsx";
import {useI18n} from "../i18n/I18nProvider.jsx";
import {AgentProgress} from "../features/agent/AgentProgress.jsx";
import {AgentStepCards} from "../features/agent/AgentStepCards.jsx";
import {useAgentPlan} from "../features/agent/useAgentPlan.js";
import {useElapsedSeconds} from "../features/agent/useElapsedSeconds.js";
import "../features/agent/agent.css";

function productRefFromPath(path) {
  const match = path.match(/^\/app\/products\/([^/]+)\/agent$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function errorTranslationKey(code) {
  const keys = {
    MODEL_PROFILE_REQUIRED: "agent.error.modelProfile",
    GRAPH_CREDENTIAL_REQUIRED: "agent.error.graphCredential",
    AGENT_MODEL_REQUEST_FAILED: "agent.error.modelRequest",
    AGENT_HARNESS_SCHEMA_ERROR: "agent.error.schema",
    GRAPH_MCP_CONNECTION_FAILED: "agent.error.graphConnection",
    GRAPH_MCP_TOOL_CALL_FAILED: "agent.error.graphRequest",
    GRAPH_MCP_TOOL_UNAVAILABLE: "agent.error.graphUnavailable",
    AGENT_RUN_TIMEOUT: "agent.error.runTimeout",
  };
  return keys[code] ?? "agent.error.generic";
}

function completedElapsedLabel(durationMs, t) {
  if (durationMs < 1000) return t("agent.elapsed.completedUnderSecond");
  const elapsedSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (elapsedSeconds < 60) return t("agent.elapsed.completedSeconds", {seconds: elapsedSeconds});
  if (elapsedSeconds >= 3600) return t("agent.elapsed.completedHoursMinutesSeconds", {
    hours: Math.floor(elapsedSeconds / 3600),
    minutes: Math.floor((elapsedSeconds % 3600) / 60),
    seconds: elapsedSeconds % 60,
  });
  return t("agent.elapsed.completedMinutesSeconds", {
    minutes: Math.floor(elapsedSeconds / 60),
    seconds: elapsedSeconds % 60,
  });
}

function AssistantMessage({message, navigate, t}) {
  const content = message.contentJson;
  const proposal = content?.kind === "proposal" ? content : null;
  const clarification = content?.kind === "clarification" ? content : null;
  const error = content?.kind === "error" ? content : null;
  const tone = error || proposal?.status === "unsupported" ? "amber" : proposal?.readyForCompilation ? "green" : "violet";
  const stateKey = error
    ? "agent.result.failed"
    : clarification
      ? "agent.result.clarification"
      : proposal?.status === "unsupported"
        ? "agent.result.unsupported"
        : proposal?.readyForCompilation
          ? "agent.result.ready"
          : "agent.result.needsInput";

  return (
    <article className={`agent-message agent-message-assistant${error ? " agent-message-error" : ""}`}>
      <div className="agent-message-meta">
        <Sparkle size={16} />
        <span>{t("agent.assistant")}</span>
        {message.modelName && <Status tone="violet">{message.modelName}</Status>}
        {content && <Status tone={tone}>{t(stateKey)}</Status>}
        {Number.isFinite(content?.durationMs) && (
          <span className="agent-elapsed">{completedElapsedLabel(content.durationMs, t)}</span>
        )}
      </div>
      <p>{error ? t(errorTranslationKey(error.code)) : message.contentText}</p>

      {proposal?.sourceEvidence?.length > 0 && (
        <>
          <div className="agent-source-list" aria-label={t("agent.sourcesLabel")}>
            {proposal.sourceEvidence.map((source) => (
              <span className="agent-source-chip" key={`${source.sourceNeedId}-${source.candidateRef}`}>
                <Database size={14} />
                {source.networkLabel} · {source.displayName}
              </span>
            ))}
          </div>
          <div className="agent-plan-facts">
            <div><span>{t("agent.fact.sources")}</span><strong>{proposal.composition?.sourceCount ?? proposal.sourceEvidence.length}</strong></div>
            <div><span>{t("agent.fact.operators")}</span><strong>{proposal.composition?.operatorCount ?? 0}</strong></div>
            <div><span>{t("agent.fact.issues")}</span><strong>{proposal.issues?.length ?? 0}</strong></div>
          </div>
          <div className="agent-evidence-list">
            {proposal.sourceEvidence.map((source) => (
              <section className="agent-evidence" key={source.candidateRef}>
                <div className="agent-evidence-heading">
                  <strong>{source.displayName}</strong>
                  <Status tone={source.status === "suitable" ? "green" : "amber"}>{t(`agent.sourceStatus.${source.status}`)}</Status>
                </div>
                <dl>
                  <div><dt>{t("agent.evidence.network")}</dt><dd>{source.networkLabel}</dd></div>
                  <div><dt>{t("agent.evidence.entity")}</dt><dd><code>{source.queryEntity}</code></dd></div>
                  <div><dt>{t("agent.evidence.manifest")}</dt><dd><code>{source.manifestIpfsCid}</code></dd></div>
                  <div><dt>{t("agent.evidence.queryCount")}</dt><dd>{source.totalQueryCount30d ?? t("agent.unknown")}</dd></div>
                </dl>
                <p>{source.rationale}</p>
                {source.limitations?.length > 0 && (
                  <ul>{source.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {proposal?.issues?.length > 0 && (
        <div className="agent-issues" role="note">
          <strong><WarningCircle size={17} />{t("agent.issuesTitle")}</strong>
          <ul>{proposal.issues.map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}</ul>
        </div>
      )}

      {clarification?.questions?.length > 0 && (
        <ol className="agent-questions">
          {clarification.questions.map((question) => <li key={question.code}>{question.question}</li>)}
        </ol>
      )}

      {error && (
        <div className="agent-recovery-actions">
          {error.code === "MODEL_PROFILE_REQUIRED" && <Button onClick={() => navigate("/app/model")}>{t("agent.configureModel")}</Button>}
          {error.code === "GRAPH_CREDENTIAL_REQUIRED" && <Button onClick={() => navigate("/app/wallet")}>{t("agent.configureGraph")}</Button>}
        </div>
      )}
    </article>
  );
}

export function AgentPage({path, navigate}) {
  const {t, locale} = useI18n();
  const productRef = productRefFromPath(path);
  const agent = useAgentPlan(productRef);
  const [intent, setIntent] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const initializedProduct = useRef(null);
  const isPlanning = agent.status === "planning";
  const elapsedSeconds = useElapsedSeconds(isPlanning);

  useEffect(() => {
    if (agent.product && initializedProduct.current !== agent.product.id) {
      initializedProduct.current = agent.product.id;
      const latestIntent = [...agent.messages].reverse().find((message) => message.role === "user")?.contentText;
      setIntent(latestIntent || agent.product.originalIntent);
    }
  }, [agent.messages, agent.product]);

  if (agent.status === "loading" && !agent.product) {
    return <main className="runtime-gate"><div className="panel"><span className="section-label">{t("agent.loadingLabel")}</span><h1>{t("agent.loadingTitle")}</h1><p>{t("agent.loadingDetail")}</p></div></main>;
  }

  if (agent.status === "error" && !agent.product) {
    return <main className="runtime-gate"><div className="panel"><span className="section-label">{t("agent.loadErrorLabel")}</span><h1>{t("agent.loadErrorTitle")}</h1><p>{t("agent.loadErrorDetail")}</p><Button variant="primary" onClick={() => agent.refresh()}>{t("agent.retry")}</Button></div></main>;
  }

  if (!agent.product) return null;
  const persistedMessages = agent.messages.length > 0
    ? agent.messages
    : agent.product.originalIntent
      ? [{id: `product-intent-${agent.product.id}`, role: "user", contentText: agent.product.originalIntent, contentJson: null}]
      : [];
  const canReviewDag = agent.latestAssistant?.contentJson?.readyForCompilation === true;
  const buildPath = `/app/products/${agent.product.slug}/build`;

  const submitPlan = (event) => {
    event.preventDefault();
    if (!isPlanning && intent.trim()) void agent.generate(intent, locale).catch(() => {});
  };

  const regenerate = () => {
    setConfirmation(false);
    if (intent.trim()) void agent.generate(intent, locale).catch(() => {});
  };

  return (
    <div className="product-page agent-page">
      <ProductHeader product={agent.product} active="agent" navigate={navigate} onRename={agent.rename} />
      <main className="agent-layout">
        <section className="agent-conversation">
          <div className="content-heading agent-heading">
            <div>
              <span className="eyebrow">{t("agent.eyebrow")}</span>
              <h1>{t("agent.title")}</h1>
              <p>{t("agent.description")}</p>
            </div>
          </div>

          <div className="agent-chat" role="log" aria-live="polite" aria-atomic="false" aria-relevant="additions text" aria-label={t("agent.conversationLabel")}>
            {persistedMessages.map((message) => message.role === "assistant" ? (
              <Fragment key={message.id}>
                <AgentStepCards trace={message.contentJson?.trace} />
                <AssistantMessage message={message} navigate={navigate} t={t} />
              </Fragment>
            ) : message.role === "user" ? (
              <article className="agent-message agent-message-user" key={message.id}>
                <div className="agent-message-meta"><span>{t("agent.you")}</span><span>{t("agent.intentMessage")}</span></div>
                <p>{message.contentText}</p>
              </article>
            ) : null)}
            {isPlanning && <AgentStepCards trace={agent.liveTrace} running elapsedSeconds={elapsedSeconds} />}
            {!isPlanning && !agent.latestAssistant && (
              <article className="agent-message agent-message-assistant agent-message-empty">
                <div className="agent-message-meta"><Sparkle size={16} /><span>{t("agent.assistant")}</span></div>
                <p>{t("agent.awaitingPlan")}</p>
              </article>
            )}
          </div>

          <form className="agent-composer" onSubmit={submitPlan}>
            <label htmlFor="agent-intent">{t("agent.inputLabel")}</label>
            <textarea
              id="agent-intent"
              value={intent}
              placeholder={t("agent.intentPlaceholder")}
              onChange={(event) => setIntent(event.target.value)}
              maxLength={8000}
              disabled={isPlanning}
              required
            />
            <div className="agent-composer-footer">
              <span className="agent-composer-note">{t("agent.liveNotice")}</span>
              <div className="agent-composer-actions">
                {isPlanning ? (
                  <Button type="button" variant="primary" icon={CircleNotch} className="agent-planning-button" disabled>{t("agent.planningAction")}</Button>
                ) : agent.latestAssistant ? (
                  <>
                    <Button type="button" icon={ArrowClockwise} onClick={() => setConfirmation(true)}>{t("agent.regenerateAction")}</Button>
                    {canReviewDag && <Button type="button" variant="primary" icon={ArrowRight} onClick={() => navigate(buildPath)}>{t("agent.reviewDag")}</Button>}
                  </>
                ) : (
                  <Button type="submit" variant="primary" icon={Sparkle} disabled={!intent.trim()}>{t("agent.generateAction")}</Button>
                )}
              </div>
            </div>
            {agent.status === "error" && agent.product && <p className="agent-request-error" role="alert">{t("agent.requestError")}</p>}
          </form>
        </section>
        <AgentProgress
          // Keep the conversation history visible while starting a new run, but
          // never let the progress rail describe the previous run as current.
          trace={isPlanning ? agent.liveTrace : agent.trace}
          planState={isPlanning ? "planning" : agent.planState}
        />
      </main>
      {confirmation && (
        <Modal
          eyebrow={t("agent.confirm.eyebrow")}
          title={t("agent.confirm.regenerateTitle")}
          onClose={() => setConfirmation(false)}
          footer={<><Button onClick={() => setConfirmation(false)}>{t("common.cancel")}</Button><Button variant="primary" onClick={regenerate}>{t("agent.confirm.regenerateAction")}</Button></>}
        >
          <p className="modal-copy">{t("agent.confirm.regenerateBody")}</p>
        </Modal>
      )}
    </div>
  );
}
