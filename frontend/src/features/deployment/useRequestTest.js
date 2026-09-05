import { useServiceTask } from "../../hooks/useServiceTask.js";
import { useDemoRuntime } from "../runtime/DemoRuntimeProvider.jsx";

export function useRequestTest() {
  const { runAction } = useDemoRuntime();
  const { status, result, run } = useServiceTask((options) => runAction("api_request", options));
  return { response: status === "idle" ? null : status, result, runTest: run };
}
