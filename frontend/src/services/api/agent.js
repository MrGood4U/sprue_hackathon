import { parseApiBaseUrl } from "./public-config.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionStatuses = new Set(["active", "completed", "abandoned"]);
const commandStatuses = new Set(["queued", "running", "blocked", "succeeded", "failed", "cancelled"]);

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
    const error = new Error(body?.error?.code ?? "AGENT_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "live") {
    throw new Error("INVALID_AGENT_API_RESPONSE");
  }
  return body;
}

function assertSession(value) {
  if (
    !uuidPattern.test(value?.id ?? "") ||
    !(value?.productId === null || uuidPattern.test(value.productId)) ||
    !(value?.title === null || typeof value.title === "string") ||
    !sessionStatuses.has(value?.status) ||
    typeof value?.createdAt !== "string" ||
    !(value?.closedAt === null || typeof value.closedAt === "string") ||
    !(value?.activeCommandId === null || uuidPattern.test(value.activeCommandId)) ||
    !(value?.traceStreamId === null || uuidPattern.test(value.traceStreamId))
  ) throw new Error("INVALID_AGENT_API_RESPONSE");
  return value;
}

function assertMessage(value) {
  if (
    !uuidPattern.test(value?.id ?? "") ||
    !/^\d+$/.test(value?.sequenceNo ?? "") ||
    !["user", "assistant", "tool"].includes(value?.role) ||
    !(value?.contentText === null || typeof value.contentText === "string") ||
    !(value?.contentJson === null || (typeof value.contentJson === "object" && !Array.isArray(value.contentJson))) ||
    typeof value?.createdAt !== "string"
  ) throw new Error("INVALID_AGENT_API_RESPONSE");
  return value;
}

function assertCommand(value) {
  if (
    !uuidPattern.test(value?.commandId ?? "") ||
    !commandStatuses.has(value?.status) ||
    value?.subject?.type !== "agent_session" ||
    !uuidPattern.test(value?.subject?.id ?? "") ||
    !uuidPattern.test(value?.traceStreamId ?? "") ||
    !Number.isInteger(value?.pollAfterMs) || value.pollAfterMs < 0
  ) throw new Error("INVALID_AGENT_API_RESPONSE");
  return value;
}

export async function createAgentSession(input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-agent-session-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  const response = await fetchImpl(endpoint(configuredBaseUrl, options, "agent-sessions"), {
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
  return assertSession((await readLiveResponse(response)).data);
}

export async function listAgentSessions({
  productId,
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(productId ?? "")) throw new Error("INVALID_PRODUCT_ID");
  const query = new URLSearchParams({productId});
  const response = await fetchImpl(
    `${endpoint(configuredBaseUrl, options, "agent-sessions")}?${query}`,
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
  if (!Array.isArray(body.data)) throw new Error("INVALID_AGENT_API_RESPONSE");
  return body.data.map(assertSession);
}

export async function listAgentMessages(sessionId, {
  afterSequence = 0,
  limit = 100,
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  if (
    !uuidPattern.test(sessionId ?? "") ||
    !Number.isInteger(afterSequence) || afterSequence < 0 ||
    !Number.isInteger(limit) || limit < 1 || limit > 100
  ) throw new Error("INVALID_AGENT_SESSION_ID");
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `agent-sessions/${sessionId}/messages?afterSequence=${afterSequence}&limit=${limit}`),
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
  if (!Array.isArray(body?.data?.items) || typeof body?.data?.hasMore !== "boolean") {
    throw new Error("INVALID_AGENT_API_RESPONSE");
  }
  if (!/^\d+$/.test(body?.data?.nextAfterSequence ?? "")) throw new Error("INVALID_AGENT_API_RESPONSE");
  return {
    messages: body.data.items.map(assertMessage),
    nextAfterSequence: body.data.nextAfterSequence,
    hasMore: body.data.hasMore,
  };
}

export async function submitAgentMessage(sessionId, input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  idempotencyKey = `sprue-agent-message-${globalThis.crypto.randomUUID()}`,
  signal,
  ...options
} = {}) {
  if (!uuidPattern.test(sessionId ?? "")) throw new Error("INVALID_AGENT_SESSION_ID");
  const response = await fetchImpl(
    endpoint(configuredBaseUrl, options, `agent-sessions/${sessionId}/messages`),
    {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: headers(options, {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      }),
      body: JSON.stringify(input),
      signal: requestSignal(signal, 125000),
    },
  );
  return assertCommand((await readLiveResponse(response)).data);
}
