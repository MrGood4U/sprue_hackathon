// This read-only transport exposes public server configuration; business data
// is requested through the backend demo client during the current evaluator slice.
export function parseApiBaseUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_PUBLIC_API_URL");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new Error("INVALID_PUBLIC_API_URL");
  }
  return url.origin;
}

export async function getPublicAppConfig({
  apiBaseUrl = import.meta.env?.VITE_API_BASE_URL,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  const base = parseApiBaseUrl(apiBaseUrl);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  const response = await fetchImpl(`${base}/api/v1/app-config`, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("PUBLIC_API_UNAVAILABLE");
  const body = await response.json();
  if (body?.data?.apiVersion !== "1" || body?.meta?.dataSource !== "live") {
    throw new Error("INVALID_PUBLIC_API_RESPONSE");
  }
  return body;
}
