import type {DiscoverySourceNeed} from "./types.js";
import type {GraphInspectedField, GraphSchemaEntityInspection} from "../../graph/index.js";

const maxResponseBytes = 2_097_152;
const maxEmbeddingDocumentBytes = 6_000;
const maxEntitiesPerNeed = 80;
const maxFieldsPerSelectedEntity = 1_024;
const requestBatchSize = 10;
const textEncoder = new TextEncoder();

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

export interface EntityEmbeddingProgress {
  phase: "batch_started" | "batch_completed" | "similarity_started" | "completed";
  entityCount: number;
  batchNumber?: number;
  batchCount: number;
}

export interface FieldEmbeddingScore {
  requirementId: string;
  fieldPath: string;
  similarity: number;
}

export interface FieldEmbeddingProgress {
  phase: "batch_started" | "batch_completed" | "similarity_started" | "completed";
  fieldCount: number;
  requirementCount: number;
  batchNumber?: number;
  batchCount: number;
}

export interface EntityEmbeddingRankerPort {
  rank(
    need: DiscoverySourceNeed,
    entities: readonly EntityEmbeddingInput[],
    signal?: AbortSignal,
    onProgress?: (progress: EntityEmbeddingProgress) => void,
  ): Promise<readonly EntityEmbeddingScore[]>;
  rankFields?(
    need: DiscoverySourceNeed,
    input: EntityEmbeddingInput,
    signal?: AbortSignal,
    onProgress?: (progress: FieldEmbeddingProgress) => void,
  ): Promise<readonly FieldEmbeddingScore[]>;
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

function utf8Bytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function truncateUtf8(value: string, maximumBytes: number): string {
  if (utf8Bytes(value) <= maximumBytes) return value;
  const output: string[] = [];
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (bytes + characterBytes > maximumBytes) break;
    output.push(character);
    bytes += characterBytes;
  }
  return output.join("");
}

function boundedEmbeddingDocument(header: string, lines: readonly string[], omittedLabel: string): string {
  const markerReserve = utf8Bytes(`\n${omittedLabel}:${lines.length}`);
  const boundedHeader = truncateUtf8(header, maxEmbeddingDocumentBytes - markerReserve);
  const included: string[] = [];
  let bytes = utf8Bytes(boundedHeader);
  for (const line of lines) {
    const lineBytes = utf8Bytes(`\n${line}`);
    if (bytes + lineBytes + markerReserve > maxEmbeddingDocumentBytes) continue;
    included.push(line);
    bytes += lineBytes;
  }
  const omitted = lines.length - included.length;
  const marker = omitted > 0 ? `\n${omittedLabel}:${omitted}` : "";
  return `${boundedHeader}${included.length > 0 ? `\n${included.join("\n")}` : ""}${marker}`;
}

function requirementQuery(need: DiscoverySourceNeed): string {
  const protocol = need.protocol
    ? `${need.protocol.name}${need.protocol.version ? ` ${need.protocol.version}` : ""}`
    : "unspecified protocol";
  const assets = need.assets.length > 0
    ? need.assets.map((asset) => `${asset.symbol}${asset.networkAssetId ? ` ${asset.networkAssetId}` : ""}`).join(", ")
    : "unspecified assets";
  const fieldLine = (field: DiscoverySourceNeed["fields"][number]) => [
    "Field",
    field.required ? "required" : "optional",
    field.id,
    field.description,
    field.expectedType,
    field.unit ?? "no unit",
    `hints ${field.hints.join(" ")}`,
  ].join(" | ");
  const header = [
    "Find the existing GraphQL query entity whose actual schema best satisfies this data-source requirement.",
    `Network: ${need.dataNetwork}`,
    `Protocol: ${protocol}`,
    `Assets: ${assets}`,
    `Description: ${need.description}`,
    `Required row grain: ${need.grain}`,
  ].join("\n");
  const details = [
    ...need.fields.filter((field) => field.required).map(fieldLine),
    ...need.constraints.map((constraint) => `Constraint | ${constraint}`),
    ...need.fields.filter((field) => !field.required).map(fieldLine),
  ];
  return boundedEmbeddingDocument(header, details, "omitted_requirement_detail_count");
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
    `Entity kind: ${input.entity.entityKind ?? "entity"}`,
    ...(input.entity.aggregation ? [
      `Aggregate source: ${input.entity.aggregation.sourceEntity}`,
      `Aggregate intervals: ${input.entity.aggregation.intervals.join(", ")}`,
      `Aggregate dimensions: ${input.entity.aggregation.dimensions.join(", ") || "none"}`,
      `Aggregate measures: ${input.entity.aggregation.measures.map((measure) => `${measure.fieldPath}:${measure.fn}:${measure.arg ?? "row"}`).join(", ") || "none"}`,
    ] : []),
    `Grain hint: ${input.entity.grainHint ?? "unknown"}`,
    "Actual inspected fields:",
  ].join("\n");
  return boundedEmbeddingDocument(header, orderedFields.map(fieldText), "omitted_field_count");
}

function fieldRequirementQuery(
  need: DiscoverySourceNeed,
  requirement: DiscoverySourceNeed["fields"][number],
): string {
  const protocol = need.protocol
    ? `${need.protocol.name}${need.protocol.version ? ` ${need.protocol.version}` : ""}`
    : "unspecified protocol";
  const assets = need.assets.length > 0
    ? need.assets.map((asset) => asset.symbol).join(", ")
    : "unspecified assets";
  const header = [
    "Find inspected GraphQL fields that can satisfy this one semantic field requirement.",
    `Requirement ID: ${requirement.id}`,
    `Meaning: ${requirement.description}`,
    `Expected type: ${requirement.expectedType}`,
    `Unit: ${requirement.unit ?? "no unit"}`,
    `Required: ${requirement.required ? "yes" : "no"}`,
    `Nullability allowed: ${requirement.allowNullable ? "yes" : "no"}`,
    `Hints: ${requirement.hints.join(", ") || "none"}`,
    `Source description: ${need.description}`,
    `Row grain: ${need.grain}`,
    `Network: ${need.dataNetwork}`,
    `Protocol: ${protocol}`,
    `Assets: ${assets}`,
  ].join("\n");
  return boundedEmbeddingDocument(
    header,
    need.constraints.map((constraint) => `Constraint | ${constraint}`),
    "omitted_constraint_count",
  );
}

function fieldDocument(input: EntityEmbeddingInput, field: GraphInspectedField): string {
  return boundedEmbeddingDocument([
    "One actual inspected GraphQL field from an already selected Subgraph entity.",
    `Subgraph: ${input.displayName}`,
    `Query entity: ${input.entity.queryEntity}`,
    `Entity type: ${input.entity.entityType}`,
    `Field: ${fieldText(field)}`,
  ].join("\n"), [], "omitted_field_detail_count");
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

  private assertConfigured(): void {
    if (!this.config.enabled || !this.config.apiUrl || !this.config.apiKey || !this.config.model) {
      throw new EntityEmbeddingRequestError("The embedding service is not completely configured", "configuration");
    }
  }

  private async embedDocuments(
    documents: readonly string[],
    signal: AbortSignal | undefined,
    onBatchProgress: (phase: "batch_started" | "batch_completed", batchNumber: number, batchCount: number) => void,
  ): Promise<readonly number[][]> {
    const vectors: number[][] = [];
    const batchCount = Math.ceil(documents.length / requestBatchSize);
    for (let offset = 0; offset < documents.length; offset += requestBatchSize) {
      const batch = documents.slice(offset, offset + requestBatchSize);
      const batchNumber = Math.floor(offset / requestBatchSize) + 1;
      onBatchProgress("batch_started", batchNumber, batchCount);
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)])
        : AbortSignal.timeout(this.config.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(this.config.apiUrl!, {
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
      onBatchProgress("batch_completed", batchNumber, batchCount);
    }
    if (vectors.length !== documents.length) {
      throw new EntityEmbeddingRequestError("The embedding service returned incomplete vectors");
    }
    return vectors;
  }

  async rank(
    need: DiscoverySourceNeed,
    inputs: readonly EntityEmbeddingInput[],
    signal?: AbortSignal,
    onProgress?: (progress: EntityEmbeddingProgress) => void,
  ): Promise<readonly EntityEmbeddingScore[]> {
    this.assertConfigured();
    if (inputs.length === 0) return [];
    if (inputs.length > maxEntitiesPerNeed) {
      throw new EntityEmbeddingRequestError("The embedding entity-retrieval limit was exceeded", "configuration");
    }
    const documents = [requirementQuery(need), ...inputs.map(entityDocument)];
    const batchCount = Math.ceil(documents.length / requestBatchSize);
    const vectors = await this.embedDocuments(documents, signal, (phase, batchNumber) => {
      onProgress?.({phase, entityCount: inputs.length, batchNumber, batchCount});
    });
    const queryVector = vectors[0];
    if (!queryVector || vectors.length !== documents.length) {
      throw new EntityEmbeddingRequestError("The embedding service returned incomplete vectors");
    }
    onProgress?.({phase: "similarity_started", entityCount: inputs.length, batchCount});
    const scores = inputs.map((input, index) => ({
      candidateRef: input.candidateRef,
      queryEntity: input.entity.queryEntity,
      similarity: cosineSimilarity(queryVector, vectors[index + 1]!),
    }));
    onProgress?.({phase: "completed", entityCount: inputs.length, batchCount});
    return scores;
  }

  async rankFields(
    need: DiscoverySourceNeed,
    input: EntityEmbeddingInput,
    signal?: AbortSignal,
    onProgress?: (progress: FieldEmbeddingProgress) => void,
  ): Promise<readonly FieldEmbeddingScore[]> {
    this.assertConfigured();
    const fields = input.entity.fields;
    if (fields.length === 0) return [];
    if (fields.length > maxFieldsPerSelectedEntity) {
      throw new EntityEmbeddingRequestError("The selected entity field limit was exceeded", "configuration");
    }
    const requirements = need.fields;
    if (requirements.length === 0) return [];
    const documents = [
      ...requirements.map((requirement) => fieldRequirementQuery(need, requirement)),
      ...fields.map((field) => fieldDocument(input, field)),
    ];
    const batchCount = Math.ceil(documents.length / requestBatchSize);
    const vectors = await this.embedDocuments(documents, signal, (phase, batchNumber) => {
      onProgress?.({
        phase,
        fieldCount: fields.length,
        requirementCount: requirements.length,
        batchNumber,
        batchCount,
      });
    });
    const requirementVectors = vectors.slice(0, requirements.length);
    const fieldVectors = vectors.slice(requirements.length);
    if (requirementVectors.length !== requirements.length || fieldVectors.length !== fields.length) {
      throw new EntityEmbeddingRequestError("The embedding service returned incomplete field vectors");
    }
    onProgress?.({
      phase: "similarity_started",
      fieldCount: fields.length,
      requirementCount: requirements.length,
      batchCount,
    });
    const scores = requirements.flatMap((requirement, requirementIndex) => fields.map((field, fieldIndex) => ({
      requirementId: requirement.id,
      fieldPath: field.path,
      similarity: cosineSimilarity(requirementVectors[requirementIndex]!, fieldVectors[fieldIndex]!),
    })));
    onProgress?.({
      phase: "completed",
      fieldCount: fields.length,
      requirementCount: requirements.length,
      batchCount,
    });
    return scores;
  }
}

export const entityEmbeddingLimits = {
  maxEntitiesPerNeed,
  maxFieldsPerSelectedEntity,
  requestBatchSize,
  maxEmbeddingDocumentBytes,
} as const;
