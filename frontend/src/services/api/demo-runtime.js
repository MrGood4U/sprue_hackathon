import { parseApiBaseUrl } from "./public-config.js";

const creatorActionNames = new Set(["agent_plan", "rename_product", "build", "api_request"]);
const publicActionNames = new Set(["consumer_request"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(15000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

function scopeDetails({scope = "public", workspaceId, accessToken} = {}) {
  if (scope === "public") return {scope, prefix: "/api/v1/public/demo"};
  if (
    scope !== "creator" ||
    !uuidPattern.test(workspaceId ?? "") ||
    typeof accessToken !== "string" ||
    !accessToken ||
    /\s/.test(accessToken)
  ) {
    throw new Error("AUTH_REQUIRED");
  }
  return {
    scope,
    prefix: `/api/v1/workspaces/${workspaceId}/demo`,
    accessToken,
  };
}

function demoHeaders(options, additional = {}) {
  const scope = scopeDetails(options);
  return {
    Accept: "application/json",
    ...(scope.scope === "creator" ? {Authorization: `Bearer ${scope.accessToken}`} : {}),
    ...additional,
  };
}

function demoUrl(configuredBaseUrl, options, suffix) {
  return `${apiBaseUrl(configuredBaseUrl)}${scopeDetails(options).prefix}/${suffix}`;
}

function modelProfileUrl(configuredBaseUrl, options, suffix = "") {
  const scope = scopeDetails(options);
  if (scope.scope !== "creator") throw new Error("AUTH_REQUIRED");
  return `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${options.workspaceId}/model-profile${suffix}`;
}

async function readBackendResponse(response, expectedDataSource) {
  if (!response.ok) {
    const error = new Error("DEMO_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== expectedDataSource) {
    throw new Error("INVALID_DEMO_API_RESPONSE");
  }
  return body.data;
}

export async function getDemoState({ apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal, ...scope } = {}) {
  const response = await fetchImpl(demoUrl(configuredBaseUrl, scope, "state"), {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders(scope),
    signal: requestSignal(signal),
  });
  const data = await readBackendResponse(response, "demo");
  if (data?.dataSource !== "backend_demo" || !data?.product?.draft) {
    throw new Error("INVALID_DEMO_STATE");
  }
  return data;
}

export async function runDemoAction(action, { intent, name, parameters, apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal, ...scope } = {}) {
  const allowedActions = (scope.scope ?? "public") === "creator"
    ? creatorActionNames
    : publicActionNames;
  if (!allowedActions.has(action)) throw new Error("INVALID_DEMO_ACTION");
  const body = { action };
  if (intent) body.intent = intent;
  if (name) body.name = name;
  if (parameters) body.parameters = parameters;
  const response = await fetchImpl(demoUrl(configuredBaseUrl, scope, "actions"), {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders(scope, {"Content-Type": "application/json"}),
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readBackendResponse(response, "demo");
  if (!data?.state?.product?.draft || !data?.result) throw new Error("INVALID_DEMO_ACTION_RESPONSE");
  return data;
}

export async function getDemoModelProfile({ apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal, ...scope } = {}) {
  if ((scope.scope ?? "public") !== "creator") throw new Error("AUTH_REQUIRED");
  const response = await fetchImpl(modelProfileUrl(configuredBaseUrl, scope), {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders(scope),
    signal: requestSignal(signal),
  });
  const data = await readBackendResponse(response, "live");
  if (data?.protocol !== "openai_compatible_chat_completions" || typeof data?.configured !== "boolean") {
    throw new Error("INVALID_DEMO_MODEL_PROFILE");
  }
  return data;
}

export async function saveDemoModelProfile(profile, { apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal, ...scope } = {}) {
  if ((scope.scope ?? "public") !== "creator") throw new Error("AUTH_REQUIRED");
  const body = {apiUrl: profile.apiUrl, model: profile.model};
  if (profile.apiKey) body.apiKey = profile.apiKey;
  const response = await fetchImpl(modelProfileUrl(configuredBaseUrl, scope), {
    method: "PUT",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders(scope, {"Content-Type": "application/json"}),
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readBackendResponse(response, "live");
  if (data?.protocol !== "openai_compatible_chat_completions" || data?.configured !== true || data?.hasApiKey !== true) {
    throw new Error("INVALID_DEMO_MODEL_PROFILE");
  }
  return data;
}

export async function testDemoModelProfile(profile, { apiBaseUrl: configuredBaseUrl, fetchImpl = globalThis.fetch, signal, ...scope } = {}) {
  if ((scope.scope ?? "public") !== "creator") throw new Error("AUTH_REQUIRED");
  const body = {apiUrl: profile.apiUrl, model: profile.model};
  if (profile.apiKey) body.apiKey = profile.apiKey;
  const response = await fetchImpl(modelProfileUrl(configuredBaseUrl, scope, "/test"), {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: demoHeaders(scope, {"Content-Type": "application/json"}),
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  const data = await readBackendResponse(response, "live");
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
  async generatePlan(options = {}) {
    const response = await runDemoAction("agent_plan", options);
    return { ...response.result, state: response.state };
  },
  async renameProduct(options = {}) {
    const response = await runDemoAction("rename_product", options);
    return { ...response.result, state: response.state };
  },
  async buildVersion(options = {}) {
    const response = await runDemoAction("build", options);
    return { ...response.result, state: response.state };
  },
  async testRequest(options = {}) {
    const response = await runDemoAction("api_request", options);
    return response.result;
  },
  async requestPaidData({ onProgress = () => {}, ...options } = {}) {
    onProgress(1);
    const response = await runDemoAction("consumer_request", options);
    onProgress(4);
    return response.result;
  },
};
