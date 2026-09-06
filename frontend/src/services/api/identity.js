import { parseApiBaseUrl } from "./public-config.js";

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(10000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function assertBootstrap(data) {
  if (
    !data?.user?.id ||
    !Array.isArray(data?.workspaces) ||
    !data.workspaces.length ||
    !data?.defaultWorkspaceId
  )
    throw new Error("INVALID_IDENTITY_RESPONSE");
  return data;
}

async function readIdentityResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.code ?? "IDENTITY_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "live")
    throw new Error("INVALID_IDENTITY_RESPONSE");
  return assertBootstrap(body.data);
}

export async function bootstrapIdentity({
  accessToken,
  idempotencyKey = `sprue-bootstrap-${globalThis.crypto.randomUUID()}`,
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  if (!accessToken) throw new Error("AUTH_REQUIRED");
  const response = await fetchImpl(
    `${apiBaseUrl(configuredBaseUrl)}/api/v1/bootstrap`,
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
      body: "{}",
      signal: requestSignal(signal),
    },
  );
  return readIdentityResponse(response);
}

export async function getIdentity({
  accessToken,
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  if (!accessToken) throw new Error("AUTH_REQUIRED");
  const response = await fetchImpl(`${apiBaseUrl(configuredBaseUrl)}/api/v1/me`, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: requestSignal(signal),
  });
  return readIdentityResponse(response);
}
