import {
  GraphCredentialValidationError,
  type GraphCredentialValidationObservation,
  type GraphCredentialValidator,
} from "./contracts.js";

export const graphCredentialValidationSubgraphId =
  "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6";

const validationQuery =
  "query SprueCredentialValidation { _meta { deployment block { number } hasIndexingErrors } }";
const maximumResponseBytes = 64 * 1024;

function rejected(observedAt: Date): GraphCredentialValidationObservation {
  return {
    status: "rejected",
    observedAt,
    targetSubgraphId: graphCredentialValidationSubgraphId,
    deploymentId: null,
    blockNumber: null,
    hasIndexingErrors: null,
  };
}

export function graphCredentialValidator(
  fetchImpl: typeof fetch = globalThis.fetch,
): GraphCredentialValidator {
  return {
    async validate(apiKey) {
      const observedAt = new Date();
      let response: Response;
      try {
        response = await fetchImpl(
          `https://gateway.thegraph.com/api/subgraphs/id/${graphCredentialValidationSubgraphId}`,
          {
            method: "POST",
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({query: validationQuery, variables: {}}),
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch {
        throw new GraphCredentialValidationError("unavailable");
      }

      if (response.status === 429) {
        throw new GraphCredentialValidationError("rate_limited");
      }
      if (response.status === 401 || response.status === 403) {
        return rejected(observedAt);
      }
      if (!response.ok) {
        throw new GraphCredentialValidationError("unavailable");
      }

      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
        throw new GraphCredentialValidationError("unavailable");
      }
      let body: unknown;
      try {
        const text = await response.text();
        if (Buffer.byteLength(text, "utf8") > maximumResponseBytes) {
          throw new Error("GRAPH_RESPONSE_TOO_LARGE");
        }
        body = JSON.parse(text);
      } catch {
        throw new GraphCredentialValidationError("unavailable");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new GraphCredentialValidationError("unavailable");
      }
      const result = body as {
        data?: { _meta?: {
          deployment?: unknown;
          block?: {number?: unknown};
          hasIndexingErrors?: unknown;
        }};
        errors?: unknown;
      };
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        return rejected(observedAt);
      }
      const metadata = result.data?._meta;
      if (!metadata || typeof metadata.deployment !== "string") {
        return rejected(observedAt);
      }
      return {
        status: "valid",
        observedAt,
        targetSubgraphId: graphCredentialValidationSubgraphId,
        deploymentId: metadata.deployment,
        blockNumber:
          typeof metadata.block?.number === "number"
            ? metadata.block.number
            : null,
        hasIndexingErrors:
          typeof metadata.hasIndexingErrors === "boolean"
            ? metadata.hasIndexingErrors
            : null,
      };
    },
  };
}
