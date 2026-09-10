import { parseApiBaseUrl } from "./public-config.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const productStatuses = new Set(["draft", "active", "suspended", "archived"]);

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

function requestSignal(signal, timeoutMs = 15000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function authorized({ workspaceId, accessToken }) {
  if (
    !uuidPattern.test(workspaceId ?? "") ||
    typeof accessToken !== "string" ||
    !accessToken ||
    /\s/.test(accessToken)
  ) throw new Error("AUTH_REQUIRED");
  return {workspaceId, accessToken};
}

function endpoint(configuredBaseUrl, options, suffix) {
  const scope = authorized(options);
  return `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${scope.workspaceId}/${suffix}`;
}

function headers(options, additional = {}) {
  const scope = authorized(options);
  return {
    Accept: "application/json",
    Authorization: `Bearer ${scope.accessToken}`,
    ...additional,
  };
}

async function readLiveResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.code ?? "PRODUCT_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "live") {
    throw new Error("INVALID_PRODUCT_API_RESPONSE");
  }
  return body;
}

function assertProduct(value, detail = false) {
  if (
    !uuidPattern.test(value?.id ?? "") ||
    typeof value?.slug !== "string" ||
    typeof value?.name !== "string" ||
    !productStatuses.has(value?.status) ||
    typeof value?.updatedAt !== "string" ||
    !(value?.description === null || typeof value?.description === "string") ||
    !(value?.latestVersion === null || (
      uuidPattern.test(value?.latestVersion?.id ?? "") &&
      /^\d+$/.test(value.latestVersion?.sourceCount ?? "")
    )) ||
    !(value?.activeDeployment === null || uuidPattern.test(value?.activeDeployment?.id ?? "")) ||
    !(value?.latestRun === null || uuidPattern.test(value?.latestRun?.id ?? ""))
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  if (
    detail &&
    (!uuidPattern.test(value?.workspaceId ?? "") ||
      !uuidPattern.test(value?.accountWalletId ?? "") ||
      typeof value?.originalIntent !== "string" ||
      !Number.isSafeInteger(value?.lockVersion) ||
      value.lockVersion < 0)
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  return value;
}

function assertOverview(value) {
  if (
    !value?.period ||
    !/^\d+$/.test(value?.activeProductCount ?? "") ||
    !/^\d+$/.test(value?.draftVersionCount ?? "") ||
    !/^\d+$/.test(value?.apiRequestCount ?? "") ||
    !Array.isArray(value?.graphExpenses) ||
    !Array.isArray(value?.grossSales) ||
    !Array.isArray(value?.readiness) ||
    !Array.isArray(value?.recentActivity)
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  return value;
}

function assertDeletion(value, productId) {
  if (
    value?.productId !== productId ||
    !uuidPattern.test(value?.productId ?? "") ||
    typeof value?.deletedAt !== "string" ||
    !Number.isFinite(Date.parse(value.deletedAt))
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  return value;
}

function assertCompilationIssue(value) {
  if (
    typeof value?.code !== "string" ||
    typeof value?.message !== "string" ||
    !(value?.nodeId === null || typeof value?.nodeId === "string") ||
    !(value?.path === null || typeof value?.path === "string")
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  return value;
}

function assertCompilation(value) {
  if (
    value?.schemaVersion !== 1 ||
    !["passed", "failed"].includes(value?.status) ||
    typeof value?.compiledAt !== "string" ||
    !Number.isSafeInteger(value?.nodeCount) ||
    !Number.isSafeInteger(value?.edgeCount) ||
    !Array.isArray(value?.issues)
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  value.issues.forEach(assertCompilationIssue);
  if (value.status === "failed") {
    if (value.issues.length < 1) throw new Error("INVALID_PRODUCT_API_RESPONSE");
    return value;
  }
  if (
    value.issues.length !== 0 ||
    !/^[0-9a-f]{64}$/.test(value?.compilationHash ?? "") ||
    !Array.isArray(value?.outputSchema?.fields)
  ) throw new Error("INVALID_PRODUCT_API_RESPONSE");
  return value;
}

export async function listProducts({
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  limit = 100,
  query,
  status,
  cursor,
  signal,
  ...options
} = {}) {
  const search = new URLSearchParams({limit: String(limit)});
  if (query) search.set("q", query);
  if (status) search.set("status", status);
  if (cursor) search.set("cursor", cursor);
  const response = await fetchImpl(
    `${endpoint(configuredBaseUrl, options, "products")}?${search}`,
    {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options),
      signal: requestSignal(signal),
    },
  );
  const body = await readLiveResponse(response);
  if (!Array.isArray(body.data) || typeof body?.page?.hasMore !== "boolean") {
    throw new Error("INVALID_PRODUCT_API_RESPONSE");
  }
  return {
    products: body.data.map((item) => assertProduct(item)),
    page: body.page,
    observedAt: body.meta.observedAt,
  };
}

export async function getWorkspaceOverview({
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  const response = await fetchImpl(
    `${endpoint(configuredBaseUrl, options, "overview")}?period=24h`,
    {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options),
      signal: requestSignal(signal),
    },
  );
  const body = await readLiveResponse(response);
  return {overview: assertOverview(body.data), observedAt: body.meta.observedAt};
}

export async function getProduct(productId, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(productId ?? "")) throw new Error("INVALID_PRODUCT_ID");
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `products/${productId}`),
    {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options),
      signal: requestSignal(signal),
    },
  );
  const body = await readLiveResponse(response);
  return assertProduct(body.data, true);
}

export async function compileProductDag(productId, input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(productId ?? "")) throw new Error("INVALID_PRODUCT_ID");
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `products/${productId}/build-preflight`),
    {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options, {"Content-Type": "application/json"}),
      body: JSON.stringify(input),
      signal: requestSignal(signal, 30_000),
    },
  );
  const body = await readLiveResponse(response);
  return assertCompilation(body.data);
}

export async function createProduct(input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-product-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  const response = await fetchImpl(endpoint(configuredBaseUrl, options, "products"), {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: headers(options, {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    }),
    body: JSON.stringify(input),
    signal: requestSignal(signal),
  });
  const body = await readLiveResponse(response);
  return assertProduct(body.data, true);
}

export async function updateProduct(productId, input, {
  lockVersion,
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-product-update-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(productId ?? "") || !Number.isSafeInteger(lockVersion) || lockVersion < 0) {
    throw new Error("INVALID_PRODUCT_UPDATE");
  }
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `products/${productId}`),
    {
      method: "PATCH",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options, {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "If-Match": `"${lockVersion}"`,
      }),
      body: JSON.stringify(input),
      signal: requestSignal(signal),
    },
  );
  const body = await readLiveResponse(response);
  return assertProduct(body.data, true);
}

export async function deleteProduct(productId, {
  lockVersion,
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-product-delete-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(productId ?? "") || !Number.isSafeInteger(lockVersion) || lockVersion < 0) {
    throw new Error("INVALID_PRODUCT_DELETE");
  }
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `products/${productId}`),
    {
      method: "DELETE",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options, {
        "Idempotency-Key": idempotencyKey,
        "If-Match": `"${lockVersion}"`,
      }),
      signal: requestSignal(signal),
    },
  );
  const body = await readLiveResponse(response);
  return assertDeletion(body.data, productId);
}
