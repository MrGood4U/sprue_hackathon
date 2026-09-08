import { parseApiBaseUrl } from "./public-config.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

function requestSignal(signal, timeoutMs = 15000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function scope({ workspaceId, accessToken }) {
  if (
    !uuidPattern.test(workspaceId ?? "") ||
    typeof accessToken !== "string" ||
    !accessToken ||
    /\s/.test(accessToken)
  ) throw new Error("AUTH_REQUIRED");
  return { workspaceId, accessToken };
}

function headers(options, additional = {}) {
  const authorized = scope(options);
  return {
    Accept: "application/json",
    Authorization: `Bearer ${authorized.accessToken}`,
    ...additional,
  };
}

function endpoint(configuredBaseUrl, options, suffix) {
  const authorized = scope(options);
  return `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${authorized.workspaceId}/${suffix}`;
}

async function readLiveResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.code ?? "WALLET_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "live") {
    throw new Error("INVALID_WALLET_API_RESPONSE");
  }
  return body.data;
}

function assertCredential(value) {
  if (
    !uuidPattern.test(value?.id ?? "") ||
    value?.provider !== "the_graph" ||
    value?.credentialType !== "graph_api_key" ||
    typeof value?.label !== "string" ||
    typeof value?.fingerprint !== "string" ||
    typeof value?.status !== "string" ||
    typeof value?.isSelected !== "boolean" ||
    !Number.isSafeInteger(value?.lockVersion) ||
    value.lockVersion < 0 ||
    Object.hasOwn(value ?? {}, "apiKey")
  ) throw new Error("INVALID_GRAPH_CREDENTIAL_RESPONSE");
  return value;
}

function assertWalletAccess(value) {
  if (
    !Array.isArray(value?.wallets) ||
    !Array.isArray(value?.balances) ||
    !Array.isArray(value?.credentials) ||
    !Array.isArray(value?.readiness)
  ) throw new Error("INVALID_WALLET_API_RESPONSE");
  value.credentials.forEach(assertCredential);
  return value;
}

export async function getWalletAccess({
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  const response = await fetchImpl(endpoint(configuredBaseUrl, options, "wallet-access"), {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: headers(options),
    signal: requestSignal(signal),
  });
  return assertWalletAccess(await readLiveResponse(response));
}

export async function createGraphCredential(input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-graph-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  const response = await fetchImpl(endpoint(configuredBaseUrl, options, "graph-credentials"), {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: headers(options, {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    }),
    body: JSON.stringify({label: input.label, apiKey: input.apiKey}),
    signal: requestSignal(signal),
  });
  return assertCredential(await readLiveResponse(response));
}

async function mutateGraphCredential(action, {credentialId, lockVersion}, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-graph-${action}-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(credentialId ?? "") || !Number.isSafeInteger(lockVersion) || lockVersion < 0) {
    throw new Error("INVALID_GRAPH_CREDENTIAL_MUTATION");
  }
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `graph-credentials/${credentialId}/${action}`),
    {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options, {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "If-Match": `"${lockVersion}"`,
      }),
      body: "{}",
      signal: requestSignal(signal, action === "validate" ? 20000 : 15000),
    },
  );
  return assertCredential(await readLiveResponse(response));
}

export function validateGraphCredential(input, options) {
  return mutateGraphCredential("validate", input, options);
}

export function selectGraphCredential(input, options) {
  return mutateGraphCredential("select", input, options);
}

export function deleteGraphCredential(input, options) {
  return mutateGraphCredential("revoke", input, options);
}

export async function createHederaAccount({walletId}, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-hedera-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(walletId ?? "")) throw new Error("INVALID_WALLET_ID");
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `wallets/${walletId}/resolve-hedera`),
    {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options, {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      }),
      body: "{}",
      signal: requestSignal(signal, 40000),
    },
  );
  return assertWalletAccess(await readLiveResponse(response));
}
