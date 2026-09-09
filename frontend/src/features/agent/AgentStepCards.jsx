import {CheckCircle, CircleNotch, WarningCircle} from "@phosphor-icons/react";
import {Status} from "../../components/ui/Status.jsx";
import {useI18n} from "../../i18n/I18nProvider.jsx";

const stageTitleKeys = {
  admit: "agent.stage.admit",
  source_discovery_planning: "agent.stage.discoveryPlan",
  source_needs: "agent.stage.sourceNeeds",
  graph_source_discovery: "agent.stage.graphDiscovery",
  source_entity_selection: "agent.stage.entitySelection",
  source_feasibility: "agent.stage.feasibility",
  feasibility_validation: "agent.stage.validation",
  semantic_interpretation: "agent.stage.model",
  source_selection: "agent.stage.sources",
  query_compilation: "agent.stage.sources",
  dag_composition: "agent.stage.dag",
  spec_assembly: "agent.stage.dag",
  spec_validation: "agent.stage.validation",
  dag_execution: "agent.stage.dag",
  output: "agent.stage.output",
};

function elapsedLabel(elapsedSeconds, t) {
  if (elapsedSeconds < 60) return t("agent.elapsed.seconds", {seconds: elapsedSeconds});
  if (elapsedSeconds >= 3600) return t("agent.elapsed.hoursMinutesSeconds", {
    hours: Math.floor(elapsedSeconds / 3600),
    minutes: Math.floor((elapsedSeconds % 3600) / 60),
    seconds: elapsedSeconds % 60,
  });
  return t("agent.elapsed.minutesSeconds", {
    minutes: Math.floor(elapsedSeconds / 60),
    seconds: elapsedSeconds % 60,
  });
}

function latestStageEvents(trace) {
  const events = new Map();
  for (const event of trace) events.set(event.stage, event);
  return [...events.values()];
}

function eventState(status) {
  if (status === "passed") return "complete";
  if (status === "failed") return "failed";
  return "active";
}

function stageTitle(stage, t) {
  const key = stageTitleKeys[stage];
  return key ? t(key) : stage.replaceAll("_", " ");
}

export function AgentStepCards({trace = [], running = false, elapsedSeconds = 0}) {
  const {t} = useI18n();
  const visibleEvents = latestStageEvents(trace);
  if (running && visibleEvents.length === 0) {
    visibleEvents.push({
      sequenceNo: 0,
      stage: "admit",
      status: "started",
      summary: t("agent.traceConnecting"),
    });
  }
  if (visibleEvents.length === 0) return null;

  return (
    <section className="agent-step-cards" aria-label={t("agent.stepResultsLabel")}>
      {visibleEvents.map((event) => {
        const state = eventState(event.status);
        return (
          <article className={`agent-step-card agent-step-card-${state}`} key={event.stage}>
            <div className="agent-step-card-meta">
              <span className="agent-step-card-icon" aria-hidden="true">
                {state === "complete" ? (
                  <CheckCircle size={18} weight="fill" />
                ) : state === "failed" ? (
                  <WarningCircle size={18} weight="fill" />
                ) : (
                  <CircleNotch className="agent-step-card-spinner" size={17} weight="bold" />
                )}
              </span>
              <strong>{stageTitle(event.stage, t)}</strong>
              <Status tone={state === "complete" ? "green" : state === "failed" ? "amber" : "violet"}>
                {t(`agent.status.${state}`)}
              </Status>
              {state === "active" && running && (
                <span className="agent-elapsed">{elapsedLabel(elapsedSeconds, t)}</span>
              )}
            </div>
            <p>{event.summary}</p>
          </article>
        );
      })}
    </section>
  );
}
