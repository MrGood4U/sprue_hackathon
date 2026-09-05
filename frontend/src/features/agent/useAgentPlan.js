import { useCallback, useRef } from "react";
import { useServiceTask } from "../../hooks/useServiceTask.js";
import { useDemoRuntime } from "../runtime/DemoRuntimeProvider.jsx";

export function useAgentPlan(intent) {
  const { runAction } = useDemoRuntime();
  const intentRef = useRef(intent);
  intentRef.current = intent;

  const task = useCallback(({ signal }) => runAction("agent_plan", {
    signal,
    intent: intentRef.current,
  }), [runAction]);
  const state = useServiceTask(task);

  return {
    ...state,
    planState: { idle: "idle", loading: "planning", success: "ready", error: "failed" }[state.status],
  };
}
