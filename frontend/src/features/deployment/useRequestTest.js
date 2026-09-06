import { useCallback } from "react";
import { useServiceTask } from "../../hooks/useServiceTask.js";
import { useDemoRuntime } from "../runtime/DemoRuntimeProvider.jsx";

export function useRequestTest(limit) {
  const { runAction } = useDemoRuntime();
  const request = useCallback(
    (options) => runAction("api_request", {...options, parameters: {limit}}),
    [limit, runAction],
  );
  const { status, result, run } = useServiceTask(request);
  return { response: status === "idle" ? null : status, result, runTest: run };
}
