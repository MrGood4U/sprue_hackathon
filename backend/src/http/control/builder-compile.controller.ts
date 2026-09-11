import type {Request, RequestHandler} from "express";
import {z} from "zod";
import {compileStructuredDag} from "../../modules/dag/compiler.js";
import {
  ProductNotFoundError,
  ProductStorageError,
} from "../../modules/products/contracts.js";
import type {ProductService} from "../../modules/products/service.js";
import {LiveDeploymentError} from "../../modules/deployments/contracts.js";
import type {LiveDeploymentService} from "../../modules/deployments/service.js";
import {AppError} from "../../shared/errors.js";
import {meta} from "../contracts/common.js";

const fieldSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  type: z.enum(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json"]),
  nullable: z.boolean(),
  unit: z.string().max(64).nullable(),
});

const providerFieldSchema = fieldSchema.extend({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/),
});

const rowSchema = z.strictObject({
  fields: z.array(fieldSchema).min(1).max(1_024),
});

const requestRowSchema = z.strictObject({
  fields: z.array(fieldSchema).max(2_048),
});

const providerRowSchema = z.strictObject({
  fields: z.array(providerFieldSchema).max(2_048),
});

const nodeSchema = z.strictObject({
  id: z.string().min(1).max(256),
  type: z.enum(["source", "filter", "map", "aggregate", "sort", "union", "join", "output"]),
  operatorVersion: z.enum(["1", "2", "3"]),
  config: z.record(z.string(), z.unknown()),
  outputSchema: providerRowSchema.optional(),
});

const edgeSchema = z.strictObject({
  fromNode: z.string().min(1).max(256),
  fromPort: z.string().min(1).max(64),
  toNode: z.string().min(1).max(256),
  toPort: z.string().min(1).max(64),
});

const sourceBindingSchema = z.strictObject({
  fieldPath: z.string().regex(/^[_A-Za-z][_0-9A-Za-z]*(?:\.[_A-Za-z][_0-9A-Za-z]*)*$/),
  requirementId: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
});

const auxiliarySourceBindingSchema = z.union([
  sourceBindingSchema,
  z.strictObject({
    fieldPath: z.string().regex(/^[_A-Za-z][_0-9A-Za-z]*(?:\.[_A-Za-z][_0-9A-Za-z]*)*$/),
    name: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
    purpose: z.enum(["filter", "join", "group", "sort", "derive", "output"]),
  }),
]);

const sourceQueryPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationName: z.literal("SprueLiveSource"),
  document: z.string().trim().min(1).max(20_000),
  pagination: z.strictObject({
    kind: z.literal("id_cursor"),
    cursorField: z.literal("id"),
    pageSize: z.number().int().min(1).max(1_000),
    maxRequests: z.number().int().min(1).max(20),
    maxRows: z.number().int().min(1).max(10_000),
  }),
  runtimeWindow: z.strictObject({
    kind: z.literal("complete_utc_days"),
    days: z.number().int().min(1).max(365),
    timezone: z.literal("UTC"),
    field: z.string().regex(/^[_A-Za-z][_0-9A-Za-z]*$/),
    startVariable: z.literal("windowStart"),
    endVariable: z.literal("windowEnd"),
    valueEncoding: z.literal("unix_seconds"),
  }).nullable().optional(),
  pushedOperations: z.array(z.strictObject({
    nodeRole: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
    operator: z.enum(["map", "filter", "sort"]),
    description: z.string().trim().min(1).max(500),
  })).max(12),
});

const liveSourceSchema = z.strictObject({
  id: z.string().min(1).max(256),
  displayName: z.string().trim().min(1).max(300),
  logicalSubgraphId: z.string().min(1).max(256).nullable(),
  manifestIpfsCid: z.string().min(1).max(256),
  dataNetwork: z.string().min(1).max(100),
  queryEntity: z.string().regex(/^[_A-Za-z][_0-9A-Za-z]*$/),
  queryPlan: sourceQueryPlanSchema.nullable().optional(),
  fieldBindings: z.array(sourceBindingSchema).max(64),
  auxiliaryFieldBindings: z.array(auxiliarySourceBindingSchema).max(64),
});

export const builderCompileInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sources: z.array(liveSourceSchema).min(1).max(8).optional(),
  dag: z.strictObject({
    nodes: z.array(nodeSchema).max(128),
    edges: z.array(edgeSchema).max(256),
  }),
  outputSchema: requestRowSchema,
});

const compilationIssueSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  nodeId: z.string().nullable(),
  path: z.string().nullable(),
});

const compilationBase = {
  schemaVersion: z.literal(1),
  compiledAt: z.iso.datetime(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
};

function sourceAdmissionMessage(code: string): string {
  if (code === "GRAPH_CREDENTIAL_NOT_SELECTED") {
    return "Select and validate a The Graph API key before building this live product.";
  }
  if (code === "GRAPH_CREDENTIAL_UNAVAILABLE") {
    return "The selected The Graph API key could not be resolved. Revalidate or replace it before building.";
  }
  if (code === "LIVE_SOURCE_BINDING_INVALID") {
    return "The compiled source nodes do not match the admitted live source definitions.";
  }
  if (code === "LIVE_SOURCE_SCHEMA_INVALID") {
    return "A live The Graph schema is incompatible with the compiled source query or selected provider fields.";
  }
  if (code === "LIVE_SOURCE_QUERY_ENTITY_INVALID") {
    return "The selected The Graph collection no longer resolves to one exact live entity type.";
  }
  if (code === "LIVE_VERSION_PERSIST_FAILED") {
    return "The live sources passed validation, but Sprue could not persist the immutable product version.";
  }
  if (code.startsWith("GRAPH_MCP_")) {
    return "Sprue could not inspect the live The Graph source through the restricted Graph adapter.";
  }
  return "The compiled DAG passed, but its live The Graph sources could not be admitted.";
}

export const builderCompilationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...compilationBase,
    status: z.literal("failed"),
    issues: z.array(compilationIssueSchema).min(1).max(32),
  }),
  z.strictObject({
    ...compilationBase,
    status: z.literal("passed"),
    compilationHash: z.string().regex(/^[0-9a-f]{64}$/),
    outputSchema: rowSchema,
    version: z.strictObject({
      id: z.uuid(),
      versionNo: z.number().int().positive(),
      specHash: z.string().regex(/^[0-9a-f]{64}$/),
    }).optional(),
    issues: z.tuple([]),
  }),
]);

function requireService(service?: ProductService): ProductService {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function mapProductReadError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ProductNotFoundError) throw new AppError("RESOURCE_NOT_FOUND");
  if (error instanceof ProductStorageError) throw new AppError("DEPENDENCY_UNAVAILABLE");
  throw new AppError("INTERNAL_ERROR");
}

function workspaceId(req: Request): string {
  return String(req.params.workspaceId);
}

export function compileBuilderDag(service?: ProductService, deployments?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    const parsed = builderCompileInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      await requireService(service).read(workspaceId(req), String(req.params.productId));
      const compilation = compileStructuredDag(parsed.data);
      let data: unknown = compilation;
      if (compilation.status === "passed" && parsed.data.sources) {
        if (!deployments) throw new AppError("CAPABILITY_DISABLED");
        try {
          const version = await deployments.buildVersion({
            workspaceId: workspaceId(req),
            productId: String(req.params.productId),
            actorUserId: String(res.locals.workspaceAuthorization?.userId),
            compilation,
            dag: parsed.data.dag,
            sources: parsed.data.sources,
          });
          data = {...compilation, version};
        } catch (error) {
          const code = error instanceof LiveDeploymentError ? error.code : "SOURCE_ADMISSION_FAILED";
          data = {
            schemaVersion: 1,
            status: "failed",
            compiledAt: new Date().toISOString(),
            nodeCount: parsed.data.dag.nodes.length,
            edgeCount: parsed.data.dag.edges.length,
            issues: [{code, message: sourceAdmissionMessage(code), nodeId: null, path: "sources"}],
          };
        }
      }
      data = builderCompilationSchema.parse(data);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductReadError(error);
    }
  };
}
