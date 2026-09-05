import { useServiceTask } from "../../hooks/useServiceTask.js";
import { frontendServices } from "../../services/index.js";

export function useRequestTest() {
  const { status, result, run } = useServiceTask(frontendServices.testRequest);
  return { response: status === "idle" ? null : status, result, runTest: run };
}
