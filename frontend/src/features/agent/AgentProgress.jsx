import { CheckCircle, CircleNotch, Sparkle } from "@phosphor-icons/react";
import { Status } from "../../components/ui/Status.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import {traceSummary} from "./tracePresentation.js";

const stageDefinitions = [
  ["admit", "agent.stage.admit", "agent.stage.admitDetail"],
  ["source_discovery_planning", "agent.stage.discoveryPlan", "agent.stage.discoveryPlanDetail"],
  ["source_needs", "agent.stage.sourceNeeds", "agent.stage.sourceNeedsDetail"],
  ["graph_source_discovery", "agent.stage.graphDiscovery", "agent.stage.graphDiscoveryDetail"],
  ["aggregate_schema_retrieval", "agent.stage.aggregateRetrieval", "agent.stage.aggregateRetrievalDetail"],
  ["aggregate_selection", "agent.stage.aggregateSelection", "agent.stage.aggregateSelectionDetail"],
  ["semantic_entity_retrieval", "agent.stage.semanticRetrieval", "agent.stage.semanticRetrievalDetail"],
  ["source_entity_selection", "agent.stage.entitySelection", "agent.stage.entitySelectionDetail"],
  ["semantic_field_retrieval", "agent.stage.semanticFieldRetrieval", "agent.stage.semanticFieldRetrievalDetail"],
  ["source_feasibility", "agent.stage.feasibility", "agent.stage.feasibilityDetail"],
  ["feasibility_validation", "agent.stage.validation", "agent.stage.validationDetail"],
];

function latestByStage(trace) {
  return new Map(trace.map((event) => [event.stage, event]));
}

function itemState(event, planState, index) {
  if (event?.status === "failed") return "failed";
  if (event?.status === "started") return "active";
  if (event?.status === "passed") return "complete";
  return planState === "planning" && index === 0 ? "active" : "pending";
}

export function AgentProgress({ trace = [], planState, result = null }) {
  const { t } = useI18n();
  const events = latestByStage(trace);
  const completed = stageDefinitions.filter(([stage], index) => itemState(events.get(stage), planState, index) === "complete").length;
  const progress = Math.round((completed / stageDefinitions.length) * 100);
  const progressKey = planState === "planning"
    ? "agent.progressRunning"
    : progress < 100
      ? "agent.progressRecorded"
      : result?.kind === "proposal" && result.readyForCompilation
        ? "agent.progressReady"
        : result?.kind === "proposal"
          ? "agent.progressNeedsInput"
          : "agent.progressRecorded";

  return (
    <aside className="agent-progress-panel" aria-label={t("agent.progressTitle")}>
      <div className="agent-progress-heading">
        <div>
          <span className="section-label">{t("agent.progressLabel")}</span>
          <h2>{t("agent.progressTitle")}</h2>
        </div>
        <Sparkle size={21} className="violet-text" />
      </div>
      <div className="agent-progress-summary">
        <div className="agent-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <span role="status" aria-atomic="true">{t(progressKey, { completed, total: stageDefinitions.length })}</span>
      </div>
      <ol className="agent-trace-list">
        {stageDefinitions.map(([stage, titleKey, detailKey], index) => {
          const state = itemState(events.get(stage), planState, index);
          return (
            <li className={`agent-trace-item agent-trace-${state}`} key={stage}>
              <span className="agent-trace-icon">
                {state === "complete" ? <CheckCircle size={20} weight="fill" /> : state === "active" ? <CircleNotch className="agent-trace-spinner" size={19} weight="bold" /> : index + 1}
              </span>
              <div>
                <div className="agent-trace-title"><strong>{t(titleKey)}</strong><Status tone={state === "complete" ? "green" : state === "failed" ? "amber" : state === "active" ? "violet" : "neutral"}>{t(`agent.status.${state}`)}</Status></div>
                <p>{events.has(stage) ? traceSummary(events.get(stage), t) : t(detailKey)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
