import { ArrowRight, ArrowsClockwise, Graph } from "@phosphor-icons/react";
import { Button } from "../../components/ui/Button.jsx";
import { Status } from "../../components/ui/Status.jsx";

function traceSteps(buildState) {
  return [
    ["Planning", "Complete", "Plan generated and validated"],
    [
      "Source",
      buildState === "idle" ? "Pending" : "Complete",
      buildState === "idle" ? "Awaiting build to fetch data" : "Snapshot pinned",
    ],
    [
      "Transform",
      buildState === "complete" ? "Complete" : "Pending",
      buildState === "complete" ? "4 transforms complete" : "Awaiting source data",
    ],
    [
      "Materialize",
      buildState === "complete" ? "Complete" : "Pending",
      buildState === "complete" ? "Endpoint is ready" : "Awaiting transform",
    ],
  ];
}

export function ExecutionTrace({ buildState, onBuild, onOpenDag, onOpenSpec }) {
  const buildLabel = buildState === "building"
    ? "Building…"
    : buildState === "complete"
      ? "Build complete"
      : "Build version";

  return (
    <div className="execution-panel">
      <span className="section-label">Execution trace (preview)</span>
      <div className="trace-row">
        {traceSteps(buildState).map(([name, state, note], index) => (
          <div className={`trace-step ${state === "Complete" ? "trace-complete" : ""}`} key={name}>
            <span className="step-index">{index + 1}</span>
            <div>
              <strong>{name}</strong>
              <Status tone={state === "Complete" ? "green" : "amber"}>{state}</Status>
              <small>{note}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="trace-actions">
        <Button icon={Graph} onClick={onOpenDag}>Structured DAG</Button>
        <div>
          <Button onClick={onOpenSpec}>Review spec</Button>
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
