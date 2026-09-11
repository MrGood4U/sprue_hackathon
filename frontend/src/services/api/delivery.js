import {parseApiBaseUrl} from "./public-config.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const apiReadiness = new Set([
  "no_version",
  "version_not_ready",
  "not_deployed",
  "deploying",
  "unavailable",
  "available",
]);
const monetizationReadiness = new Set([
  "api_not_ready",
  "not_configured",
  "draft",
  "invalid",
  "retired",
  "active",
]);

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

function requestSignal(signal, timeoutMs = 15000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function assertScope(workspaceId, productId, accessToken) {
  if (
    !uuidPattern.test(workspaceId ?? "") ||
    !uuidPattern.test(productId ?? "") ||
    typeof accessToken !== "string" ||
    !accessToken ||
    /\s/.test(accessToken)
  ) throw new Error("AUTH_REQUIRED");
}

function assertBlockers(value) {
  return Array.isArray(value) && value.every((item) => (
    typeof item?.code === "string" && typeof item?.message === "string"
  ));
}

function assertCapabilities(value) {
  return value && ["deploy", "privateRequest", "privateExport", "publishX402", "publicRequest"]
    .every((key) => typeof value[key] === "boolean");
}

export async function deployProduct(productId, input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  workspaceId,
  accessToken,
  idempotencyKey = `sprue-deploy-${globalThis.crypto.randomUUID()}`,
  signal,
} = {}) {
  assertScope(workspaceId, productId, accessToken);
  const response = await fetchImpl(
    `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${workspaceId}/products/${productId}/deployments`,
    {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
      signal: requestSignal(signal, 30_000),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.code ?? "DEPLOYMENT_API_UNAVAILABLE");
  }
  return (await response.json()).data;
}

async function postDeploymentCommand(path, body, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  workspaceId,
  accessToken,
  idempotencyKey = `sprue-delivery-${globalThis.crypto.randomUUID()}`,
  ifMatch,
  signal,
} = {}) {
  if (!uuidPattern.test(workspaceId ?? "") || typeof accessToken !== "string" || !accessToken) {
    throw new Error("AUTH_REQUIRED");
  }
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  if (ifMatch) headers["If-Match"] = ifMatch;
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}${path}`, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers,
    body: JSON.stringify(body),
    signal: requestSignal(signal, 30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.code ?? "DELIVERY_COMMAND_FAILED");
  return payload.data;
}

export function suspendDeployment(deploymentId, options = {}) {
  if (!uuidPattern.test(deploymentId ?? "")) throw new Error("DEPLOYMENT_NOT_FOUND");
  return postDeploymentCommand(
    `/api/v1/workspaces/${options.workspaceId}/deployments/${deploymentId}/suspend`,
    {},
    options,
  );
}

export function publishX402(deploymentId, priceHbar, options = {}) {
  if (!uuidPattern.test(deploymentId ?? "")) throw new Error("DEPLOYMENT_NOT_FOUND");
  return postDeploymentCommand(
    `/api/v1/workspaces/${options.workspaceId}/deployments/${deploymentId}/publications`,
    {priceHbar},
    options,
  );
}

export function retireX402(deploymentId, publicationId, options = {}) {
  if (!uuidPattern.test(deploymentId ?? "") || !uuidPattern.test(publicationId ?? "")) {
    throw new Error("PUBLICATION_NOT_FOUND");
  }
  return postDeploymentCommand(
    `/api/v1/workspaces/${options.workspaceId}/deployments/${deploymentId}/publications/${publicationId}/retire`,
    {},
    {...options, ifMatch: "*"},
  );
}

export async function downloadPrivateDeployment(productId, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  workspaceId,
  accessToken,
  signal,
} = {}) {
  assertScope(workspaceId, productId, accessToken);
  const response = await fetchImpl(
    `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${workspaceId}/products/${productId}/private-export`,
    {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`},
      signal: requestSignal(signal, 30_000),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.code ?? "PRIVATE_EXPORT_UNAVAILABLE");
  }
  return response.blob();
}

export async function executeLiveProduct(endpointUrl, apiKey, limit, {fetchImpl = globalThis.fetch, signal} = {}) {
  if (typeof endpointUrl !== "string" || !endpointUrl || !/^sprue_live_[A-Za-z0-9_-]{43}$/.test(apiKey ?? "")) {
    throw new Error("DATA_API_KEY_REQUIRED");
  }
  const url = new URL(endpointUrl);
  url.searchParams.set("limit", String(limit));
  const response = await fetchImpl(url, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: {Accept: "application/json", Authorization: `Bearer ${apiKey}`},
    signal: requestSignal(signal, 120_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.code ?? "LIVE_REQUEST_FAILED");
  if (!Array.isArray(body?.data) || body?.meta?.serveMode !== "live") throw new Error("INVALID_LIVE_RESPONSE");
  return body;
}

function assertDelivery(value, productId) {
  if (
    value?.productId !== productId ||
    !assertCapabilities(value?.capabilities) ||
    !apiReadiness.has(value?.api?.readiness) ||
    !assertBlockers(value?.api?.blockers) ||
    !monetizationReadiness.has(value?.monetization?.readiness) ||
    !assertBlockers(value?.monetization?.blockers) ||
    (value?.monetization?.publication !== null &&
      (typeof value?.monetization?.publication?.endpointUrl !== "string" ||
        !/^https?:\/\//.test(value.monetization.publication.endpointUrl))) ||
    !Array.isArray(value?.monetization?.revenue?.grossSales) ||
    !Array.isArray(value?.monetization?.revenue?.creatorProceeds) ||
    !Array.isArray(value?.monetization?.revenue?.providerFees) ||
    !Array.isArray(value?.monetization?.sales)
  ) throw new Error("INVALID_DELIVERY_API_RESPONSE");
  return value;
}

export async function getProductDelivery(productId, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  workspaceId,
  accessToken,
  signal,
} = {}) {
  assertScope(workspaceId, productId, accessToken);
  const response = await fetchImpl(
    `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${workspaceId}/products/${productId}/delivery`,
    {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: requestSignal(signal),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.code ?? "DELIVERY_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "live") {
    throw new Error("INVALID_DELIVERY_API_RESPONSE");
  }
  return {
    delivery: assertDelivery(body.data, productId),
    observedAt: body.meta.observedAt,
  };
}
