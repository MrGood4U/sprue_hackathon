import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { backendServices } from "../../services/api/demo-runtime.js";
import { useAuth } from "../auth/AuthProvider.jsx";

const DemoRuntimeContext = createContext(null);

export function DemoRuntimeProvider({ children, scope = "public" }) {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const requestScope = useCallback(async () => {
    if (scope === "public") return {scope};
    const accessToken = await getAccessToken();
    if (!workspaceId || !accessToken) throw new Error("AUTH_REQUIRED");
    return {scope: "creator", workspaceId, accessToken};
  }, [getAccessToken, scope, workspaceId]);

  const refresh = useCallback(async (signal) => {
    setStatus("loading");
    setError(null);
    try {
      const next = await backendServices.getDemoState({signal, ...await requestScope()});
      setState(next);
      setStatus("ready");
      return next;
    } catch (nextError) {
      if (nextError?.name !== "AbortError") {
        setError(nextError);
        setStatus("error");
      }
      throw nextError;
    }
  }, [requestScope]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  const runAction = useCallback(async (action, options = {}) => {
    const serviceByAction = {
      agent_plan: backendServices.generatePlan,
      rename_product: backendServices.renameProduct,
      build: backendServices.buildVersion,
      api_request: backendServices.testRequest,
      consumer_request: backendServices.requestPaidData,
    };
    const service = serviceByAction[action];
    if (!service) throw new Error("INVALID_DEMO_ACTION");
    const response = await service({...options, ...await requestScope()});
    if (response.state) setState(response.state);
    return response;
  }, [requestScope]);

  const value = useMemo(() => ({ state, status, error, refresh, runAction }), [state, status, error, refresh, runAction]);
  return <DemoRuntimeContext.Provider value={value}>{children}</DemoRuntimeContext.Provider>;
}

export function useDemoRuntime() {
  const context = useContext(DemoRuntimeContext);
  if (!context) throw new Error("useDemoRuntime must be used inside DemoRuntimeProvider");
  return context;
}
