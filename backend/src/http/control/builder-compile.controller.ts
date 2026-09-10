import type {Request, RequestHandler} from "express";
import {z} from "zod";
import {compileStructuredDag} from "../../modules/dag/compiler.js";
import {
  ProductNotFoundError,
  ProductStorageError,
} from "../../modules/products/contracts.js";
import type {ProductService} from "../../modules/products/service.js";
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

export const builderCompileInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
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

export function compileBuilderDag(service?: ProductService): RequestHandler {
  return async (req, res) => {
    const parsed = builderCompileInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      await requireService(service).read(workspaceId(req), String(req.params.productId));
      const data = builderCompilationSchema.parse(compileStructuredDag(parsed.data));
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductReadError(error);
    }
  };
}
