import { useServiceTask } from "../../hooks/useServiceTask.js";
import { frontendServices } from "../../services/index.js";

export function useConsumerRequest() {
  const { status, progress, result, run } = useServiceTask(frontendServices.requestPaidData);
  const stage = status === "success" ? 4 : Math.min(progress, 3);
  return { stage, result, status, run };
}
