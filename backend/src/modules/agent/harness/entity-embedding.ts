import type {DiscoverySourceNeed} from "./types.js";
import type {GraphInspectedField, GraphSchemaEntityInspection} from "../../graph/index.js";

const maxResponseBytes = 2_097_152;
const maxEntityDocumentCharacters = 28_000;
const maxEntitiesPerNeed = 80;
const requestBatchSize = 10;

export interface EntityEmbeddingConfig {
  enabled: boolean;
  apiUrl: string | null;
  apiKey: string | null;
  model: string | null;
  dimensions: number | null;
  timeoutMs: number;
}

export interface EntityEmbeddingInput {
  candidateRef: string;
  displayName: string;
  entity: GraphSchemaEntityInspection;
}

export interface EntityEmbeddingScore {
  candidateRef: string;
  queryEntity: string;
  similarity: number;
}

export interface EntityEmbeddingRankerPort {
  rank(
    need: DiscoverySourceNeed,
    entities: readonly EntityEmbeddingInput[],
    signal?: AbortSignal,
  ): Promise<readonly EntityEmbeddingScore[]>;
}

export type EntityEmbeddingFailureReason =
  | "configuration"
  | "timeout"
  | "cancelled"
  | "connection"
  | "http_error"
  | "response_too_large"
  | "invalid_response";

export class EntityEmbeddingRequestError extends Error {
  readonly code = "EMBEDDING_REQUEST_FAILED";

  constructor(
    message = "The configured embedding service could not rank inspected schema entities",
    readonly reason: EntityEmbeddingFailureReason = "invalid_response",
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "EntityEmbeddingRequestError";
  }
}

function requirementQuery(need: DiscoverySourceNeed): string {
  const protocol = need.protocol
    ? `${need.protocol.name}${need.protocol.version ? ` ${need.protocol.version}` : ""}`
    : "unspecified protocol";
  const assets = need.assets.length > 0
    ? need.assets.map((asset) => `${asset.symbol}${asset.networkAssetId ? ` ${asset.networkAssetId}` : ""}`).join(", ")
    : "unspecified assets";
  const fields = need.fields.map((field) => [
    field.required ? "required" : "optional",
    field.id,
    field.description,
    field.expectedType,
    field.unit ?? "no unit",
    `hints ${field.hints.join(" ")}`,
  ].join(" | ")).join("\n");
  return [
    "Find the existing GraphQL query entity whose actual schema best satisfies this data-source requirement.",
    `Network: ${need.dataNetwork}`,
    `Protocol: ${protocol}`,
    `Assets: ${assets}`,
    `Description: ${need.description}`,
    `Required row grain: ${need.grain}`,
    `Fields:\n${fields}`,
    `Constraints:\n${need.constraints.join("\n") || "none"}`,
  ].join("\n");
}

function fieldText(field: GraphInspectedField): string {
  return `${field.path}:${field.graphType}:${field.valueType}:${field.nullable ? "nullable" : "required"}:${field.list ? "list" : "scalar"}`;
}

function entityDocument(input: EntityEmbeddingInput): string {
  const suggested = new Set(input.entity.suggestedBindings.flatMap((binding) => binding.fieldPaths));
  const orderedFields = input.entity.fields.slice().sort((left, right) =>
    Number(suggested.has(right.path)) - Number(suggested.has(left.path))
    || Number(!right.path.includes(".")) - Number(!left.path.includes("."))
    || left.path.localeCompare(right.path));
  const header = [
    "Existing The Graph Subgraph schema entity.",
    `Subgraph: ${input.displayName}`,
    `Query entity: ${input.entity.queryEntity}`,
    `Entity type: ${input.entity.entityType}`,
    `Grain hint: ${input.entity.grainHint ?? "unknown"}`,
    "Actual inspected fields:",
  ].join("\n");
  const lines: string[] = [];
  let length = header.length;
  for (const field of orderedFields) {
    const line = fieldText(field);
    if (length + line.length + 1 > maxEntityDocumentCharacters) break;
    lines.push(line);
    length += line.length + 1;
  }
  if (lines.length < orderedFields.length) {
    lines.push(`omitted_field_count:${orderedFields.length - lines.length}`);
  }
  return `${header}\n${lines.join("\n")}`;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new EntityEmbeddingRequestError("The embedding service returned inconsistent vector dimensions");
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      throw new EntityEmbeddingRequestError("The embedding service returned a non-finite vector value");
    }
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    throw new EntityEmbeddingRequestError("The embedding service returned a zero-length vector");
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function boundedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    throw new EntityEmbeddingRequestError("The embedding response exceeded the size limit", "response_too_large");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
    throw new EntityEmbeddingRequestError("The embedding response exceeded the size limit", "response_too_large");
  }
  return body;
}

function parseVectors(envelope: unknown, expectedCount: number): readonly number[][] {
  const rows = (envelope as {data?: unknown})?.data;
  if (!Array.isArray(rows) || rows.length !== expectedCount) {
    throw new EntityEmbeddingRequestError("The embedding service returned an unexpected result count");
  }
  const byIndex = new Map<number, number[]>();
  for (const row of rows) {
    const index = (row as {index?: unknown})?.index;
    const embedding = (row as {embedding?: unknown})?.embedding;
    if (
      !Number.isInteger(index) ||
      (index as number) < 0 ||
      (index as number) >= expectedCount ||
      byIndex.has(index as number) ||
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      embedding.length > 8192 ||
      !embedding.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new EntityEmbeddingRequestError("The embedding service returned an invalid vector envelope");
    }
    byIndex.set(index as number, embedding as number[]);
  }
  return Array.from({length: expectedCount}, (_, index) => byIndex.get(index)!).filter(Boolean);
}

export class RemoteEntityEmbeddingRanker implements EntityEmbeddingRankerPort {
  constructor(
    private readonly config: EntityEmbeddingConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async rank(
    need: DiscoverySourceNeed,
    inputs: readonly EntityEmbeddingInput[],
    signal?: AbortSignal,
  ): Promise<readonly EntityEmbeddingScore[]> {
    if (!this.config.enabled || !this.config.apiUrl || !this.config.apiKey || !this.config.model) {
      throw new EntityEmbeddingRequestError("The embedding service is not completely configured", "configuration");
    }
    if (inputs.length === 0) return [];
    if (inputs.length > maxEntitiesPerNeed) {
      throw new EntityEmbeddingRequestError("The embedding entity-retrieval limit was exceeded", "configuration");
    }
    const documents = [requirementQuery(need), ...inputs.map(entityDocument)];
    const vectors: number[][] = [];
    for (let offset = 0; offset < documents.length; offset += requestBatchSize) {
      const batch = documents.slice(offset, offset + requestBatchSize);
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)])
        : AbortSignal.timeout(this.config.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(this.config.apiUrl, {
          method: "POST",
          redirect: "error",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            input: batch,
            encoding_format: "float",
            ...(this.config.dimensions ? {dimensions: this.config.dimensions} : {}),
          }),
          signal: requestSignal,
        });
      } catch {
        const cancelledByCaller = Boolean(signal?.aborted);
        const timedOut = requestSignal.aborted && !cancelledByCaller;
        throw new EntityEmbeddingRequestError(
          timedOut
            ? `The embedding request timed out after ${this.config.timeoutMs} ms`
            : "The configured embedding service request failed",
          timedOut ? "timeout" : cancelledByCaller ? "cancelled" : "connection",
        );
      }
      if (!response.ok) {
        try { await boundedBody(response); } catch {}
        throw new EntityEmbeddingRequestError(
          `The embedding service returned HTTP ${response.status}`,
          "http_error",
          response.status,
        );
      }
      let envelope: unknown;
      try {
        envelope = JSON.parse(await boundedBody(response));
      } catch (error) {
        if (error instanceof EntityEmbeddingRequestError) throw error;
        throw new EntityEmbeddingRequestError("The embedding service returned invalid JSON");
      }
      vectors.push(...parseVectors(envelope, batch.length));
    }
    const queryVector = vectors[0];
    if (!queryVector || vectors.length !== documents.length) {
      throw new EntityEmbeddingRequestError("The embedding service returned incomplete vectors");
    }
    return inputs.map((input, index) => ({
      candidateRef: input.candidateRef,
      queryEntity: input.entity.queryEntity,
      similarity: cosineSimilarity(queryVector, vectors[index + 1]!),
    }));
  }
}

export const entityEmbeddingLimits = {
  maxEntitiesPerNeed,
  requestBatchSize,
  maxEntityDocumentCharacters,
} as const;
