import {z} from "zod";
import type {
  CompositionIntent,
  PlannerStage,
  SemanticPassOutput,
  SourceDiscoveryPlanningOutput,
  SourceFeasibilityOutput,
  SourceSelectionOutput,
} from "./types.js";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const role = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/);
const dataNetwork = z.string().regex(/^[a-z0-9]+:[A-Za-z0-9._-]+$/).max(100);
const fieldPath = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/).max(200);
const searchKeyword = z.string().trim().min(2).max(80).regex(/^[^\u0000-\u001f\u007f]+$/);
const semanticValueType = z.enum([
  "boolean",
  "string",
  "id",
  "address",
  "bytes",
  "integer",
  "decimal",
  "timestamp",
  "date",
  "json",
]);

const semanticPlanSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("semantic_plan"),
  summary: boundedText(8000),
  population: z.object({
    entity: z.literal("wallet"),
    inclusion: boundedText(1000),
    exclusion: z.array(boundedText(500)).max(16),
  }).strict(),
  facts: z.array(z.discriminatedUnion("id", [
    z.object({id: z.literal("wallet"), type: z.literal("address"), required: z.literal(true)}).strict(),
    z.object({id: z.literal("trade_id"), type: z.literal("string"), required: z.literal(true)}).strict(),
    z.object({id: z.literal("timestamp"), type: z.literal("timestamp"), required: z.literal(true)}).strict(),
    z.object({id: z.literal("volume_usd"), type: z.literal("decimal"), unit: z.literal("USD"), required: z.literal(true)}).strict(),
  ])).length(4),
  networks: z.array(dataNetwork).min(1).max(4),
  grain: z.literal("swap_event"),
  window: z.object({kind: z.literal("complete_utc_days"), days: z.number().int().min(1).max(365)}).strict(),
  metrics: z.array(z.enum(["trade_count", "volume_usd", "first_seen_at", "last_seen_at"])).min(1).max(4),
  combination: z.object({
    kind: z.enum(["intersection", "append"]),
    keys: z.tuple([z.literal("wallet")]),
  }).strict(),
  output: z.object({shape: z.literal("wallet_rows"), orderBy: z.tuple([z.literal("wallet")])}).strict(),
  refresh: z.object({mode: z.enum(["manual", "scheduled"]), timezone: z.literal("UTC")}).strict(),
  assumptions: z.array(boundedText(1000)).max(16),
  unresolved: z.array(boundedText(1000)).max(16),
}).strict();

const clarificationSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("clarification"),
  questions: z.array(z.object({code: role, question: boundedText(1000)}).strict()).min(1).max(3),
}).strict();

const unsupportedSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("unsupported"),
  code: role,
  reason: boundedText(2000),
  missingFacts: z.array(boundedText(100)).max(16),
}).strict();

const mappingSchema = z.object({
  wallet: fieldPath,
  tradeId: fieldPath,
  pool: fieldPath,
  timestamp: fieldPath,
  amountInUsd: fieldPath,
  amountOutUsd: fieldPath,
  tokenIn: fieldPath,
  tokenOut: fieldPath,
}).strict();

const sourceSelectionSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("source_selection"),
  selections: z.array(z.object({
    sourceNeedId: role,
    candidateRef: z.string().regex(/^candidate:[a-z0-9][a-z0-9._:-]{0,199}$/),
    mapping: mappingSchema,
    rationale: boundedText(1000),
  }).strict()).min(1).max(4),
  assumptions: z.array(boundedText(1000)).max(16),
}).strict();

const compositionIntentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("composition_intent"),
  nodes: z.array(z.object({
    role,
    operator: z.enum(["filter", "map", "aggregate", "union", "join", "output"]),
    operatorVersion: z.literal("1"),
    config: z.record(z.string(), z.unknown()),
  }).strict()).min(1).max(12),
  connections: z.array(z.object({
    fromRole: z.string().regex(/^(?:source__)?[a-z][a-z0-9_]{0,99}$/),
    toRole: role,
    inputRole: z.enum(["rows", "left", "right"]),
  }).strict()).max(24),
  templateInstances: z.tuple([]),
}).strict();

const discoveryFieldRequirementSchema = z.object({
  id: role,
  description: boundedText(1000),
  expectedType: semanticValueType,
  unit: z.string().trim().max(40).nullable(),
  required: z.boolean(),
  allowNullable: z.boolean(),
  hints: z.array(z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/)).min(1).max(8),
}).strict();

const discoverySemanticPlanSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal("semantic_plan"),
  summary: boundedText(8000),
  sourceRequirements: z.array(z.object({
    id: role,
    dataNetwork,
    description: boundedText(1000),
    grain: boundedText(200),
    fields: z.array(discoveryFieldRequirementSchema).min(1).max(32),
    constraints: z.array(boundedText(1000)).max(16),
  }).strict()).min(1).max(4),
  result: z.object({
    description: boundedText(1000),
    grain: boundedText(200),
    fields: z.array(z.object({
      name: role,
      description: boundedText(1000),
      type: semanticValueType,
      unit: z.string().trim().max(40).nullable(),
      nullable: z.boolean(),
    }).strict()).min(1).max(32),
    orderBy: z.array(z.object({field: role, direction: z.enum(["asc", "desc"])}).strict()).max(8),
  }).strict(),
  refresh: z.object({mode: z.enum(["manual", "scheduled"]), timezone: z.literal("UTC")}).strict(),
  assumptions: z.array(boundedText(1000)).max(16),
  unresolved: z.array(boundedText(1000)).max(16),
}).strict();

const expressionSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.object({op: z.literal("field"), field: role}).strict(),
  z.object({
    op: z.literal("literal"),
    valueType: semanticValueType,
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }).strict(),
  z.object({
    op: z.enum(["not", "utc_date"]),
    inputs: z.tuple([expressionSchema]),
  }).strict(),
  z.object({
    op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "add", "subtract", "multiply", "safe_divide"]),
    inputs: z.tuple([expressionSchema, expressionSchema]),
  }).strict(),
  z.object({
    op: z.enum(["and", "or"]),
    inputs: z.array(expressionSchema).min(2).max(8),
  }).strict(),
  z.object({
    op: z.literal("if"),
    inputs: z.tuple([expressionSchema, expressionSchema, expressionSchema]),
  }).strict(),
]));

const flexibleNodeSchema = z.discriminatedUnion("operator", [
  z.object({
    role,
    operator: z.literal("filter"),
    operatorVersion: z.literal("2"),
    config: z.object({expression: expressionSchema}).strict(),
  }).strict(),
  z.object({
    role,
    operator: z.literal("map"),
    operatorVersion: z.literal("2"),
    config: z.object({
      mode: z.enum(["extend", "project"]),
      fields: z.array(z.object({name: role, expression: expressionSchema}).strict()).min(1).max(32),
    }).strict(),
  }).strict(),
  z.object({
    role,
    operator: z.literal("aggregate"),
    operatorVersion: z.literal("2"),
    config: z.object({
      groupBy: z.array(role).max(16),
      measures: z.array(z.object({
        name: role,
        op: z.enum(["count_rows", "count_distinct", "sum", "min", "max", "average"]),
        field: role.nullable(),
      }).strict()).min(1).max(32),
    }).strict(),
  }).strict(),
  z.object({
    role,
    operator: z.literal("union"),
    operatorVersion: z.literal("2"),
    config: z.object({
      mode: z.literal("append_compatible_rows"),
      sourceDiscriminator: role.nullable(),
    }).strict(),
  }).strict(),
  z.object({
    role,
    operator: z.literal("join"),
    operatorVersion: z.literal("2"),
    config: z.object({
      type: z.enum(["inner", "left"]),
      keys: z.array(z.object({left: role, right: role}).strict()).min(1).max(8),
      cardinality: z.enum(["one_to_one", "many_to_one"]),
      rightPrefix: z.string().regex(/^[a-z][a-z0-9_]{0,30}_$/),
    }).strict(),
  }).strict(),
  z.object({
    role,
    operator: z.literal("output"),
    operatorVersion: z.literal("2"),
    config: z.object({
      fields: z.array(role).min(1).max(32),
      orderBy: z.array(z.object({field: role, direction: z.enum(["asc", "desc"])}).strict()).max(8),
    }).strict(),
  }).strict(),
]);

const flexibleCompositionIntentSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal("composition_intent"),
  nodes: z.array(flexibleNodeSchema).min(1).max(12),
  connections: z.array(z.object({
    fromRole: z.string().regex(/^(?:source__)?[a-z][a-z0-9_]{0,99}$/),
    toRole: role,
    inputRole: z.enum(["rows", "left", "right"]),
  }).strict()).max(24),
  templateInstances: z.tuple([]),
}).strict();

const sourceDiscoveryPlanSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal("source_discovery_plan"),
  semanticPlan: discoverySemanticPlanSchema,
  searches: z.array(z.object({
    sourceNeedId: role,
    keywords: z.array(searchKeyword).min(1).max(3),
  }).strict()).min(1).max(4),
}).strict();

const graphCandidateRef = z.string().max(160).regex(/^graph:[A-Za-z0-9._:-]{1,120}:[a-f0-9]{20}$/);
const queryEntity = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,99}$/);
const sourceFeasibilitySchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal("source_feasibility"),
  selections: z.array(z.object({
    sourceNeedId: role,
    candidateRef: graphCandidateRef,
    queryEntity,
    fieldBindings: z.array(z.object({
      requirementId: role,
      fieldPath,
    }).strict()).min(1).max(32),
    rationale: boundedText(1000),
  }).strict()).min(1).max(4),
  composition: flexibleCompositionIntentSchema,
  assumptions: z.array(boundedText(1000)).max(16),
}).strict();

const semanticPassOutputSchema = z.discriminatedUnion("kind", [
  semanticPlanSchema,
  clarificationSchema,
  unsupportedSchema,
]);
const sourceDiscoveryPlanningOutputSchema = z.discriminatedUnion("kind", [
  sourceDiscoveryPlanSchema,
  clarificationSchema,
  unsupportedSchema,
]);
const sourceFeasibilityOutputSchema = z.discriminatedUnion("kind", [
  sourceFeasibilitySchema,
  clarificationSchema,
  unsupportedSchema,
]);

export function jsonSchemaForStage(stage: PlannerStage): Readonly<Record<string, unknown>> {
  const schema = stage === "source_discovery_planning"
    ? sourceDiscoveryPlanningOutputSchema
    : stage === "source_feasibility"
      ? sourceFeasibilityOutputSchema
      : stage === "semantic_interpretation"
        ? semanticPassOutputSchema
        : stage === "source_selection"
          ? sourceSelectionSchema
          : compositionIntentSchema;
  const document = z.toJSONSchema(schema, {target: "draft-7"}) as Record<string, unknown>;
  delete document.$schema;
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      if (key === "const") {
        output.enum = [normalize(item)];
      } else if (key === "oneOf") {
        output.anyOf = normalize(item);
      } else if (["additionalItems", "minLength", "maxLength", "minItems", "maxItems"].includes(key)) {
        continue;
      } else if (key === "additionalProperties" && item && typeof item === "object") {
        continue;
      } else if (key === "items" && Array.isArray(item)) {
        output.items = normalize(item[0] ?? {});
      } else {
        output[key] = normalize(item);
      }
    }
    return output;
  };
  return {
    type: "object",
    properties: {result: normalize(document)},
    required: ["result"],
    additionalProperties: false,
  };
}

export class HarnessSchemaError extends Error {
  readonly code = "AGENT_HARNESS_SCHEMA_ERROR";

  constructor(
    readonly stage: string,
    readonly path: string,
    readonly issueCode: string,
  ) {
    super(`${stage} response failed schema validation at ${path}`);
    this.name = "HarnessSchemaError";
  }
}

function parse<T>(stage: string, schema: z.ZodType, output: unknown): T {
  const result = schema.safeParse(output);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? issue.path.map(String).join(".") : "$";
    throw new HarnessSchemaError(stage, path, issue?.code ?? "invalid_output");
  }
  return result.data as T;
}

export function parseSemanticPass(output: unknown): SemanticPassOutput {
  return parse("semantic_interpretation", semanticPassOutputSchema, output);
}

export function parseSourceDiscoveryPlanning(output: unknown): SourceDiscoveryPlanningOutput {
  return parse("source_discovery_planning", sourceDiscoveryPlanningOutputSchema, output);
}

export function parseSourceFeasibility(output: unknown): SourceFeasibilityOutput {
  return parse("source_feasibility", sourceFeasibilityOutputSchema, output);
}

export function parseSourceSelection(output: unknown): SourceSelectionOutput {
  return parse("source_selection", sourceSelectionSchema, output);
}

export function parseCompositionIntent(output: unknown): CompositionIntent {
  return parse("dag_composition", compositionIntentSchema, output);
}
