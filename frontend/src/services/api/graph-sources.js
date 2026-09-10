import {parseApiBaseUrl} from "./public-config.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const referenceTypes = new Set(["subgraph_id", "deployment_id", "ipfs_hash"]);
const valueTypes = new Set(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json"]);
const requestTimeoutMs = 620_000;

function apiBaseUrl(value = import.meta.env?.VITE_API_BASE_URL) {
  const base = parseApiBaseUrl(value);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  return base;
}

function authorized({workspaceId, accessToken}) {
  if (
    !uuidPattern.test(workspaceId ?? "") ||
    typeof accessToken !== "string" ||
    !accessToken ||
    /\s/.test(accessToken)
  ) throw new Error("AUTH_REQUIRED");
  return {workspaceId, accessToken};
}

function endpoint(configuredBaseUrl, options, action) {
  const scope = authorized(options);
  return `${apiBaseUrl(configuredBaseUrl)}/api/v1/workspaces/${scope.workspaceId}/graph-sources/${action}`;
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readLiveResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.code ?? "GRAPH_SOURCE_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  if (body?.meta?.apiVersion !== "1" || body?.meta?.dataSource !== "live") {
    throw new Error("INVALID_GRAPH_SOURCE_API_RESPONSE");
  }
  return body.data;
}

function isReference(value) {
  return referenceTypes.has(value?.type) && typeof value?.id === "string" && value.id.length > 0;
}

function assertSearchResult(value) {
  if (
    typeof value?.query !== "string" ||
    !Number.isInteger(value?.total) || value.total < 0 ||
    !Array.isArray(value?.candidates) || value.candidates.length > 10 ||
    !(value.network === null || (
      typeof value.network?.dataNetwork === "string" &&
      typeof value.network?.graphNetworkId === "string" &&
      typeof value.network?.label === "string"
    )) ||
    value.candidates.some((candidate) =>
      typeof candidate?.displayName !== "string" ||
      !(candidate.logicalSubgraphId === null || typeof candidate.logicalSubgraphId === "string") ||
      typeof candidate.manifestIpfsCid !== "string" ||
      !(candidate.reportedNetwork === null || typeof candidate.reportedNetwork === "string") ||
      !["matched", "unknown"].includes(candidate.networkEvidence) ||
      !(candidate.totalQueryCount30d === null || (Number.isInteger(candidate.totalQueryCount30d) && candidate.totalQueryCount30d >= 0)) ||
      candidate.reference?.type !== "ipfs_hash" || !isReference(candidate.reference)
    )
  ) throw new Error("INVALID_GRAPH_SOURCE_API_RESPONSE");
  return value;
}

function assertValidation(value) {
  if (
    typeof value?.sourceId !== "string" ||
    value?.provider !== "the_graph" ||
    typeof value?.displayName !== "string" ||
    !isReference(value?.reference) ||
    !(value?.dataNetwork === null || typeof value.dataNetwork === "string") ||
    !(value?.networkLabel === null || typeof value.networkLabel === "string") ||
    !/^sha256:[a-f0-9]{64}$/.test(value?.schemaHash ?? "") ||
    !Number.isInteger(value?.schemaBytes) || value.schemaBytes < 1 ||
    !["source_sdl", "runtime_introspection"].includes(value?.queryEntitySource) ||
    !Array.isArray(value?.entities) || value.entities.length < 1 ||
    value.entities.some((entity) =>
      typeof entity?.queryEntity !== "string" ||
      typeof entity?.entityType !== "string" ||
      !Array.isArray(entity?.fields) ||
      entity.fields.some((field) =>
        typeof field?.path !== "string" ||
        typeof field?.graphType !== "string" ||
        !valueTypes.has(field?.valueType) ||
        typeof field?.nullable !== "boolean" ||
        typeof field?.list !== "boolean"
      )
    ) ||
    !(value?.activity === null || (
      Number.isInteger(value.activity?.totalQueryCount30d) && value.activity.totalQueryCount30d >= 0 &&
      Number.isInteger(value.activity?.dataPointsCount) && value.activity.dataPointsCount >= 0
    )) ||
    value?.access?.mode !== "api_key" ||
    !uuidPattern.test(value?.access?.credentialId ?? "") ||
    value?.access?.verified !== true ||
    typeof value?.observedAt !== "string" ||
    value?.admissionStatus !== "planning_verified"
  ) throw new Error("INVALID_GRAPH_SOURCE_API_RESPONSE");
  return value;
}

async function postGraphSource(action, input, {
  apiBaseUrl: configuredBaseUrl,
  fetchImpl = globalThis.fetch,
  signal,
  ...options
} = {}) {
  const response = await fetchImpl(endpoint(configuredBaseUrl, options, action), {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authorized(options).accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: requestSignal(signal),
  });
  return readLiveResponse(response);
}

export async function searchGraphSources(input, options = {}) {
  return assertSearchResult(await postGraphSource("search", input, options));
}

export async function validateGraphSource(input, options = {}) {
  return assertValidation(await postGraphSource("validate", input, options));
}
