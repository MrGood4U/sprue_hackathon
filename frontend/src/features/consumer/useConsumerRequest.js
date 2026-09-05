import { useServiceTask } from "../../hooks/useServiceTask.js";
import { useDemoRuntime } from "../runtime/DemoRuntimeProvider.jsx";

export function useConsumerRequest() {
  const { runAction } = useDemoRuntime();
  const { status, progress, result, run } = useServiceTask((options) => runAction("consumer_request", options));
  const stage = status === "success" ? 4 : Math.min(progress, 3);
  return { stage, result, status, run };
}
