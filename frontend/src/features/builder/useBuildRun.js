import { useServiceTask } from "../../hooks/useServiceTask.js";
import { frontendServices } from "../../services/index.js";

export function useBuildRun() {
  const { status, run, reset } = useServiceTask(frontendServices.buildVersion);
  const buildState = { idle: "idle", loading: "building", success: "complete", error: "failed" }[status];
  return { buildState, startBuild: run, resetBuild: reset };
}
