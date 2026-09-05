import { CheckCircle, Circle, Sparkle } from "@phosphor-icons/react";
import { Status } from "../../components/ui/Status.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

const stageDefinitions = [
  ["admit", "agent.stage.admit", "agent.stage.admitDetail"],
  ["model", "agent.stage.model", "agent.stage.modelDetail"],
  ["proposal_validation", "agent.stage.validation", "agent.stage.validationDetail"],
  ["source_mapping", "agent.stage.sources", "agent.stage.sourcesDetail"],
  ["dag_execution", "agent.stage.dag", "agent.stage.dagDetail"],
  ["output", "agent.stage.output", "agent.stage.outputDetail"],
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

export function AgentProgress({ trace = [], planState }) {
  const { t } = useI18n();
  const events = latestByStage(trace);
  const completed = stageDefinitions.filter(([stage], index) => itemState(events.get(stage), planState, index) === "complete").length;
  const progress = Math.round((completed / stageDefinitions.length) * 100);

  return (
    <aside className="agent-progress-panel">
      <div className="agent-progress-heading">
        <div>
          <span className="section-label">{t("agent.progressLabel")}</span>
          <h2>{t("agent.progressTitle")}</h2>
        </div>
        <Sparkle size={21} className="violet-text" />
      </div>
      <div className="agent-progress-summary">
        <div className="agent-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <span>{t(planState === "planning" ? "agent.progressRunning" : progress === 100 ? "agent.progressComplete" : "agent.progressWaiting", { completed, total: stageDefinitions.length })}</span>
      </div>
      <ol className="agent-trace-list">
        {stageDefinitions.map(([stage, titleKey, detailKey], index) => {
          const state = itemState(events.get(stage), planState, index);
          return (
            <li className={`agent-trace-item agent-trace-${state}`} key={stage}>
              <span className="agent-trace-icon">
                {state === "complete" ? <CheckCircle size={20} weight="fill" /> : state === "active" ? <Circle size={20} weight="fill" /> : index + 1}
              </span>
              <div>
                <div className="agent-trace-title"><strong>{t(titleKey)}</strong><Status tone={state === "complete" ? "green" : state === "failed" ? "amber" : state === "active" ? "violet" : "neutral"}>{t(`agent.status.${state}`)}</Status></div>
                <p>{t(detailKey)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
