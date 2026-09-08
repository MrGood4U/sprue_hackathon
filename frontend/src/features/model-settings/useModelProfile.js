import { useCallback, useEffect, useRef, useState } from "react";
import { frontendServices } from "../../services/index.js";
import { useAuth } from "../auth/AuthProvider.jsx";

export function useModelProfile() {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [testStatus, setTestStatus] = useState("idle");
  const [testResult, setTestResult] = useState(null);
  const activeTest = useRef(null);

  const requestScope = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!workspaceId || !accessToken) throw new Error("AUTH_REQUIRED");
    return {scope: "creator", workspaceId, accessToken};
  }, [getAccessToken, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    requestScope()
      .then((scope) => frontendServices.getModelProfile({signal: controller.signal, ...scope}))
      .then((next) => {
        if (!controller.signal.aborted) {
          setProfile(next);
          setStatus("ready");
        }
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError);
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [requestScope]);

  useEffect(() => () => activeTest.current?.abort(), []);

  const resetTest = useCallback(() => {
    activeTest.current?.abort();
    activeTest.current = null;
    setTestStatus("idle");
    setTestResult(null);
  }, []);

  const save = useCallback(async (values) => {
    resetTest();
    setStatus("saving");
    setError(null);
    try {
      const next = await frontendServices.saveModelProfile(values, await requestScope());
      setProfile(next);
      setStatus("saved");
      return next;
    } catch (nextError) {
      setError(nextError);
      setStatus("error");
      throw nextError;
    }
  }, [requestScope, resetTest]);

  const test = useCallback(async (values) => {
    activeTest.current?.abort();
    const controller = new AbortController();
    activeTest.current = controller;
    setTestStatus("testing");
    setTestResult(null);
    try {
      const next = await frontendServices.testModelProfile(values, {signal: controller.signal, ...await requestScope()});
      if (!controller.signal.aborted) {
        setTestResult(next);
        setTestStatus("success");
      }
      return next;
    } catch (nextError) {
      if (!controller.signal.aborted) setTestStatus("error");
      throw nextError;
    } finally {
      if (activeTest.current === controller) activeTest.current = null;
    }
  }, [requestScope]);

  return {profile, status, error, save, test, testStatus, testResult, resetTest};
}
