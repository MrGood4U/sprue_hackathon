import { ArrowRight, ArrowsClockwise, Graph } from "@phosphor-icons/react";
import { Button } from "../../components/ui/Button.jsx";
import { Status } from "../../components/ui/Status.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function traceSteps(buildState, t) {
  const complete = buildState !== "idle";
  const transformed = buildState === "complete";

  return [
    [t("trace.planning"), true, t("trace.planDetail")],
    [
      t("trace.source"),
      complete,
      complete ? t("trace.snapshotPinned") : t("trace.awaitingFetch"),
    ],
    [
      t("trace.transform"),
      transformed,
      transformed ? t("trace.transformsComplete") : t("trace.awaitingSource"),
    ],
    [
      t("trace.materialize"),
      transformed,
      transformed ? t("trace.endpointReady") : t("trace.awaitingTransform"),
    ],
  ];
}

export function ExecutionTrace({ buildState, onBuild, onOpenDag, onOpenSpec }) {
  const { t } = useI18n();
  const buildLabel = buildState === "building"
    ? t("trace.building")
    : buildState === "complete"
      ? t("trace.buildComplete")
      : t("trace.buildVersion");

  return (
    <div className="execution-panel">
      <span className="section-label">{t("trace.title")}</span>
      <div className="trace-row">
        {traceSteps(buildState, t).map(([name, isComplete, note], index) => (
          <div className={`trace-step ${isComplete ? "trace-complete" : ""}`} key={name}>
            <span className="step-index">{index + 1}</span>
            <div>
              <strong>{name}</strong>
              <Status tone={isComplete ? "green" : "amber"}>{t(isComplete ? "trace.complete" : "trace.pending")}</Status>
              <small>{note}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="trace-actions">
        <Button icon={Graph} onClick={onOpenDag}>{t("builder.structuredDag")}</Button>
        <div>
          <Button onClick={onOpenSpec}>{t("trace.reviewSpec")}</Button>
          <Button
            variant="primary"
            icon={buildState === "building" ? ArrowsClockwise : ArrowRight}
            disabled={buildState === "building"}
            onClick={onBuild}
          >
            {buildLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
