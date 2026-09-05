import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { backendServices } from "../../services/api/demo-runtime.js";

const DemoRuntimeContext = createContext(null);

export function DemoRuntimeProvider({ children }) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const refresh = useCallback(async (signal) => {
    setStatus("loading");
    setError(null);
    try {
      const next = await backendServices.getDemoState({ signal });
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  const runAction = useCallback(async (action, options = {}) => {
    const serviceByAction = {
      build: backendServices.buildVersion,
      api_request: backendServices.testRequest,
      consumer_request: backendServices.requestPaidData,
    };
    const service = serviceByAction[action];
    if (!service) throw new Error("INVALID_DEMO_ACTION");
    const response = await service(options);
    if (response.state) setState(response.state);
    return response;
  }, []);

  const value = useMemo(() => ({ state, status, error, refresh, runAction }), [state, status, error, refresh, runAction]);
  return <DemoRuntimeContext.Provider value={value}>{children}</DemoRuntimeContext.Provider>;
}

export function useDemoRuntime() {
  const context = useContext(DemoRuntimeContext);
  if (!context) throw new Error("useDemoRuntime must be used inside DemoRuntimeProvider");
  return context;
}
