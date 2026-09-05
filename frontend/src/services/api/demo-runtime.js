import { parseApiBaseUrl } from "./public-config.js";

const actionNames = new Set(["agent_plan", "build", "api_request", "consumer_request"]);

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(15000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

async function readDemoResponse(response) {
  if (!response.ok) {
    const error = new Error("DEMO_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "demo") {
    throw new Error("INVALID_DEMO_API_RESPONSE");
  }
  return body.data;
}

export async function getDemoState({ apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}/api/v1/public/demo/state`, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: requestSignal(signal),
  });
  const data = await readDemoResponse(response);
  if (data?.dataSource !== "backend_demo" || !data?.product?.draft) {
    throw new Error("INVALID_DEMO_STATE");
  }
  return data;
}

export async function runDemoAction(action, { intent, parameters, apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  if (!actionNames.has(action)) throw new Error("INVALID_DEMO_ACTION");
  const body = { action };
  if (intent) body.intent = intent;
  if (parameters) body.parameters = parameters;
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}/api/v1/public/demo/actions`, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readDemoResponse(response);
  if (!data?.state?.product?.draft || !data?.result) throw new Error("INVALID_DEMO_ACTION_RESPONSE");
  return data;
}

export const backendServices = {
  getDemoState,
  async generatePlan({ signal, intent } = {}) {
    const response = await runDemoAction("agent_plan", { signal, intent });
    return { ...response.result, state: response.state };
  },
  async buildVersion({ signal, parameters } = {}) {
    const response = await runDemoAction("build", { signal, parameters });
    return { ...response.result, state: response.state };
  },
  async testRequest({ signal } = {}) {
    const response = await runDemoAction("api_request", { signal });
    return response.result;
  },
  async requestPaidData({ signal, onProgress = () => {} } = {}) {
    onProgress(1);
    const response = await runDemoAction("consumer_request", { signal });
    onProgress(4);
    return response.result;
  },
};
