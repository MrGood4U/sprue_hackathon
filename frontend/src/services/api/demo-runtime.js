import { parseApiBaseUrl } from "./public-config.js";

const actionNames = new Set(["agent_plan", "build", "api_request", "consumer_request"]);
const demoSessionStorageKey = "sprue.demo.session";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let volatileDemoSessionId;

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(15000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

export function getDemoSessionId(storage = globalThis.sessionStorage) {
  if (volatileDemoSessionId) return volatileDemoSessionId;
  try {
    const existing = storage?.getItem(demoSessionStorageKey);
    if (existing && uuidPattern.test(existing)) {
      volatileDemoSessionId = existing;
      return existing;
    }
  } catch {
    // A volatile identifier still keeps the API key out of browser storage.
  }
  volatileDemoSessionId = globalThis.crypto.randomUUID();
  try {
    storage?.setItem(demoSessionStorageKey, volatileDemoSessionId);
  } catch {
    // The session remains usable until this page is reloaded.
  }
  return volatileDemoSessionId;
}

function demoHeaders(additional = {}) {
  return {
    Accept: "application/json",
    "X-Sprue-Demo-Session": getDemoSessionId(),
    ...additional,
  };
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
    headers: demoHeaders(),
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
    headers: demoHeaders({"Content-Type": "application/json"}),
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readDemoResponse(response);
  if (!data?.state?.product?.draft || !data?.result) throw new Error("INVALID_DEMO_ACTION_RESPONSE");
  return data;
}

export async function getDemoModelProfile({ apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}/api/v1/public/demo/model-profile`, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders(),
    signal: requestSignal(signal),
  });
  const data = await readDemoResponse(response);
  if (data?.protocol !== "openai_compatible_chat_completions" || typeof data?.configured !== "boolean") {
    throw new Error("INVALID_DEMO_MODEL_PROFILE");
  }
  return data;
}

export async function saveDemoModelProfile(profile, { apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  const body = {apiUrl: profile.apiUrl, model: profile.model};
  if (profile.apiKey) body.apiKey = profile.apiKey;
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}/api/v1/public/demo/model-profile`, {
    method: "PUT",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders({"Content-Type": "application/json"}),
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readDemoResponse(response);
  if (data?.protocol !== "openai_compatible_chat_completions" || data?.configured !== true || data?.hasApiKey !== true) {
    throw new Error("INVALID_DEMO_MODEL_PROFILE");
  }
  return data;
}

export async function testDemoModelProfile(profile, { apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal } = {}) {
  const body = {apiUrl: profile.apiUrl, model: profile.model};
  if (profile.apiKey) body.apiKey = profile.apiKey;
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}/api/v1/public/demo/model-profile/test`, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders({"Content-Type": "application/json"}),
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readDemoResponse(response);
  if (
    data?.available !== true ||
    data?.protocol !== "openai_compatible_chat_completions" ||
    typeof data?.model !== "string" ||
    !Number.isFinite(data?.latencyMs) ||
    data.latencyMs < 0
  ) {
    throw new Error("INVALID_DEMO_MODEL_TEST");
  }
  return data;
}

export const backendServices = {
  getDemoState,
  getModelProfile: getDemoModelProfile,
  saveModelProfile: saveDemoModelProfile,
  testModelProfile: testDemoModelProfile,
  async generatePlan({ signal, intent } = {}) {
    const response = await runDemoAction("agent_plan", { signal, intent });
    return { ...response.result, state: response.state };
  },
  async buildVersion({ signal, parameters } = {}) {
    const response = await runDemoAction("build", { signal, parameters });
    return { ...response.result, state: response.state };
  },
  async testRequest({ signal, parameters } = {}) {
    const response = await runDemoAction("api_request", { signal, parameters });
    return response.result;
  },
  async requestPaidData({ signal, onProgress = () => {} } = {}) {
    onProgress(1);
    const response = await runDemoAction("consumer_request", { signal });
    onProgress(4);
    return response.result;
  },
};
