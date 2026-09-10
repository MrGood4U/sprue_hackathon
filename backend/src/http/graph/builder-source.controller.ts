import type {Request, RequestHandler} from "express";
import {z} from "zod";
import type {BuilderGraphSourceService} from "../../modules/graph/builder-source-service.js";
import {
  BuilderSourceCredentialRequiredError,
  BuilderSourceDependencyError,
  BuilderSourceInputError,
  BuilderSourceVerificationError,
} from "../../modules/graph/builder-source-service.js";
import {GraphMcpError} from "../../modules/graph/mcp-client.js";
import {AppError} from "../../shared/errors.js";
import {meta} from "../contracts/common.js";

const optionalNetworkSchema = z.string().trim().min(1).max(100).nullable().optional();
const referenceSchema = z.discriminatedUnion("type", [
  z.strictObject({type: z.literal("subgraph_id"), id: z.string().trim().min(1).max(256)}),
  z.strictObject({type: z.literal("deployment_id"), id: z.string().trim().min(1).max(256)}),
  z.strictObject({type: z.literal("ipfs_hash"), id: z.string().trim().min(1).max(256)}),
]);

export const builderSourceSearchInputSchema = z.strictObject({
  query: z.string().trim().min(2).max(80),
  network: optionalNetworkSchema,
});

export const builderSourceValidateInputSchema = z.strictObject({
  reference: referenceSchema,
  network: optionalNetworkSchema,
});

const searchCandidateSchema = z.strictObject({
  displayName: z.string(),
  logicalSubgraphId: z.string().nullable(),
  manifestIpfsCid: z.string(),
  reportedNetwork: z.string().nullable(),
  networkEvidence: z.enum(["matched", "unknown"]),
  totalQueryCount30d: z.number().int().nonnegative().nullable(),
  reference: z.strictObject({type: z.literal("ipfs_hash"), id: z.string()}),
});

export const builderSourceSearchResultSchema = z.strictObject({
  query: z.string(),
  network: z.strictObject({
    dataNetwork: z.string(),
    graphNetworkId: z.string(),
    label: z.string(),
  }).nullable(),
  total: z.number().int().nonnegative(),
  candidates: z.array(searchCandidateSchema).max(10),
});

const inspectedFieldSchema = z.strictObject({
  path: z.string(),
  graphType: z.string(),
  valueType: z.enum(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json"]),
  nullable: z.boolean(),
  list: z.boolean(),
});

export const builderSourceValidationSchema = z.strictObject({
  sourceId: z.string(),
  provider: z.literal("the_graph"),
  displayName: z.string(),
  reference: referenceSchema,
  dataNetwork: z.string().nullable(),
  networkLabel: z.string().nullable(),
  schemaHash: z.string(),
  schemaBytes: z.number().int().positive(),
  queryEntitySource: z.enum(["source_sdl", "runtime_introspection"]),
  entities: z.array(z.strictObject({
    queryEntity: z.string(),
    entityType: z.string(),
    fields: z.array(inspectedFieldSchema).max(1_024),
  })).min(1).max(128),
  activity: z.strictObject({
    totalQueryCount30d: z.number().int().nonnegative(),
    dataPointsCount: z.number().int().nonnegative(),
  }).nullable(),
  access: z.strictObject({
    mode: z.literal("api_key"),
    credentialId: z.uuid(),
    verified: z.literal(true),
  }),
  observedAt: z.iso.datetime(),
  admissionStatus: z.literal("planning_verified"),
});

function requireService(service?: BuilderGraphSourceService): BuilderGraphSourceService {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function mapSourceError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof BuilderSourceInputError) throw new AppError("INVALID_REQUEST");
  if (error instanceof BuilderSourceCredentialRequiredError) throw new AppError("GRAPH_CREDENTIAL_REQUIRED");
  if (error instanceof BuilderSourceVerificationError) throw new AppError("GRAPH_SOURCE_VERIFICATION_FAILED");
  if (error instanceof BuilderSourceDependencyError || error instanceof GraphMcpError) {
    throw new AppError("DEPENDENCY_UNAVAILABLE");
  }
  throw new AppError("INTERNAL_ERROR");
}

function workspaceId(req: Request): string {
  return String(req.params.workspaceId);
}

export function searchBuilderSources(service?: BuilderGraphSourceService): RequestHandler {
  return async (req, res) => {
    const parsed = builderSourceSearchInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = builderSourceSearchResultSchema.parse(await requireService(service).search({
        workspaceId: workspaceId(req),
        ...parsed.data,
      }));
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapSourceError(error);
    }
  };
}

export function validateBuilderSource(service?: BuilderGraphSourceService): RequestHandler {
  return async (req, res) => {
    const parsed = builderSourceValidateInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = builderSourceValidationSchema.parse(await requireService(service).validate({
        workspaceId: workspaceId(req),
        ...parsed.data,
      }));
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapSourceError(error);
    }
  };
}
