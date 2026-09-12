import {useState} from "react";
import {CaretDown, CheckCircle, CircleNotch, WarningCircle} from "@phosphor-icons/react";
import {Status} from "../../components/ui/Status.jsx";
import {useI18n} from "../../i18n/I18nProvider.jsx";
import {AgentStepDetails} from "./AgentStepDetails.jsx";
import {stageTitle, traceSummary} from "./tracePresentation.js";

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

export function AgentStepCards({trace = [], running = false, elapsedSeconds = 0}) {
  const {t} = useI18n();
  const [expandedStage, setExpandedStage] = useState(null);
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
        const expandable = Boolean(event.details?.kind);
        const expanded = expandable && expandedStage === event.stage;
        return (
          <article className={`agent-step-card agent-step-card-${state}${expanded ? " is-expanded" : ""}`} key={event.stage}>
            {expandable ? (
              <button
                aria-expanded={expanded}
                className="agent-step-card-toggle"
                onClick={() => setExpandedStage(expanded ? null : event.stage)}
                type="button"
              >
                <span className="agent-step-card-meta">
                  <span className="agent-step-card-icon" aria-hidden="true">
                    {state === "complete" ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}
                  </span>
                  <strong>{stageTitle(event.stage, t)}</strong>
                  <Status tone={state === "complete" ? "green" : state === "failed" ? "amber" : "violet"}>
                    {t(`agent.status.${state}`)}
                  </Status>
                </span>
                <span className="agent-step-toggle-label">
                  {t(expanded ? "agent.details.collapse" : "agent.details.expand")}
                  <CaretDown className="agent-step-caret" size={16} weight="bold" aria-hidden="true" />
                </span>
              </button>
            ) : (
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
            )}
            <p>{traceSummary(event, t)}</p>
            {expanded && <div className="agent-step-details"><AgentStepDetails details={event.details} /></div>}
          </article>
        );
      })}
    </section>
  );
}
