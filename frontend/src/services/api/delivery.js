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
  return value && ["deploy", "privateRequest", "publishX402", "publicRequest"]
    .every((key) => typeof value[key] === "boolean");
}

function assertDelivery(value, productId) {
  if (
    value?.productId !== productId ||
    !assertCapabilities(value?.capabilities) ||
    !apiReadiness.has(value?.api?.readiness) ||
    !assertBlockers(value?.api?.blockers) ||
    !monetizationReadiness.has(value?.monetization?.readiness) ||
    !assertBlockers(value?.monetization?.blockers) ||
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
