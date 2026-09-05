import { useCallback, useRef } from "react";
import { useServiceTask } from "../../hooks/useServiceTask.js";
import { useDemoRuntime } from "../runtime/DemoRuntimeProvider.jsx";

export function useBuildRun() {
  const { runAction } = useDemoRuntime();
  const parameters = useRef(undefined);
  const task = useCallback(({ signal }) => runAction("build", { signal, parameters: parameters.current }), [runAction]);
  const { status, result, run, reset } = useServiceTask(task);
  const startBuild = useCallback((nextParameters) => {
    parameters.current = nextParameters;
    return run();
  }, [run]);
  const buildState = { idle: "idle", loading: "building", success: "complete", error: "failed" }[status];
  return { buildState, buildTrace: result?.trace ?? [], startBuild, resetBuild: reset };
}
