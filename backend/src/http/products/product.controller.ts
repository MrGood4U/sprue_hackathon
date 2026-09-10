import type {Request, RequestHandler, Response} from "express";
import {z} from "zod";
import {
  ProductCommandConflictError,
  ProductInputError,
  ProductNotFoundError,
  ProductPreconditionError,
  ProductStorageError,
  ProductWalletNotFoundError,
} from "../../modules/products/contracts.js";
import type {ProductService} from "../../modules/products/service.js";
import {AppError} from "../../shared/errors.js";
import {atomicSchema, emptyObjectSchema, meta} from "../contracts/common.js";

const productStatusSchema = z.enum(["draft", "active", "suspended", "archived"]);
const versionSummarySchema = z.strictObject({
  id: z.uuid(),
  versionNo: z.number().int().positive(),
  sourceCount: atomicSchema,
  parentVersionId: z.uuid().nullable(),
  specHash: z.string(),
  status: z.enum(["proposed", "validating", "invalid", "building", "ready", "retired"]),
  validatedAt: z.iso.datetime().nullable(),
  readyAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
const deploymentSummarySchema = z.strictObject({
  id: z.uuid(),
  environment: z.enum(["local", "demo", "self_hosted"]),
  status: z.enum(["pending", "deploying", "healthy", "degraded", "suspended", "failed"]),
  endpointSlug: z.string(),
  endpointUrl: z.url().nullable(),
  activeVersionId: z.uuid().nullable(),
  activeMaterializationId: z.uuid().nullable(),
  activePublicationVersionId: z.uuid().nullable(),
  accessMode: z.enum(["private", "api_key", "x402"]).nullable(),
  sourceFreshnessAt: z.iso.datetime().nullable(),
});
const runStatusSchema = z.enum(["queued", "running", "blocked", "succeeded", "failed", "cancelled"]);
const runSummarySchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid(),
  versionId: z.uuid(),
  runType: z.enum(["build", "preview", "refresh", "backfill", "live_request"]),
  status: runStatusSchema,
  failureCode: z.string().nullable(),
  queuedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const productSummarySchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: productStatusSchema,
  updatedAt: z.iso.datetime(),
  latestVersion: versionSummarySchema.nullable(),
  activeDeployment: deploymentSummarySchema.nullable(),
  latestRun: runSummarySchema.nullable(),
  nextAction: z.enum(["open_builder", "resolve_access", "build", "deploy", "inspect_run"]).nullable(),
});

export const productDetailSchema = productSummarySchema.extend({
  workspaceId: z.uuid(),
  accountWalletId: z.uuid(),
  originalIntent: z.string(),
  createdAt: z.iso.datetime(),
  lockVersion: z.number().int().nonnegative(),
});

export const productDeletionSchema = z.strictObject({
  productId: z.uuid(),
  deletedAt: z.iso.datetime(),
});

const deliveryBlockerSchema = z.strictObject({code: z.string(), message: z.string()});
const deliveryVersionSchema = z.strictObject({
  id: z.uuid(),
  versionNo: z.number().int().positive(),
  status: versionSummarySchema.shape.status,
  outputSchema: z.record(z.string(), z.unknown()),
});
const deliveryDeploymentSchema = z.strictObject({
  id: z.uuid(),
  environment: z.enum(["local", "demo", "self_hosted"]),
  provider: z.enum(["railway", "docker", "local"]),
  status: deploymentSummarySchema.shape.status,
  endpointSlug: z.string(),
  endpointUrl: z.url().nullable(),
  publicProductUrl: z.url().nullable(),
  activeVersionId: z.uuid().nullable(),
  activeMaterializationId: z.uuid().nullable(),
  lastHealthAt: z.iso.datetime().nullable(),
  sourceFreshnessAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
const deliveryContractSchema = z.strictObject({
  deploymentId: z.uuid(),
  activeVersionId: z.uuid(),
  method: z.literal("GET"),
  endpointUrl: z.url(),
  accessMode: z.enum(["private", "api_key", "x402"]),
  serveMode: z.enum(["materialized", "live"]),
  parameterSchema: z.array(z.strictObject({
    name: z.literal("limit"),
    location: z.literal("query"),
    type: z.literal("integer"),
    required: z.literal(false),
    default: z.number().int().positive(),
    minimum: z.number().int().positive(),
    maximum: z.number().int().positive(),
  })).length(1),
  responseSchema: z.strictObject({
    mediaType: z.literal("application/json"),
    outputSchema: z.record(z.string(), z.unknown()),
  }),
  exampleBody: z.record(z.string(), z.unknown()).nullable(),
});
const deliveryRecipientSchema = z.strictObject({
  walletAddressId: z.uuid(),
  networkAccountRef: z.string().nullable(),
  identityStatus: z.enum(["unverified", "resolved", "mismatched"]),
  accountCompletionStatus: z.enum(["not_applicable", "unverified", "hollow", "complete"]),
  controlStatus: z.enum(["unverified", "pending", "verified", "rejected"]),
  canReceive: z.boolean(),
  canSpend: z.boolean(),
});

const moneySchema = z.strictObject({
  networkId: z.uuid(),
  network: z.string(),
  assetId: z.uuid(),
  assetIdentifier: z.string(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  amountAtomic: atomicSchema,
});

const deliveryPublicationSchema = z.strictObject({
  id: z.uuid(),
  revisionNo: z.number().int().positive(),
  status: z.enum(["draft", "active", "retired", "invalid"]),
  accessMode: z.literal("x402"),
  serveMode: z.enum(["materialized", "live"]),
  price: moneySchema.nullable(),
  recipient: deliveryRecipientSchema.nullable(),
  paymentProtocolVersion: z.string().nullable(),
  paymentScheme: z.string().nullable(),
  maxTimeoutSeconds: z.number().int().nonnegative().nullable(),
  facilitator: z.string().nullable(),
  capabilityObservedAt: z.iso.datetime().nullable(),
  serviceFeeEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
});
const deliverySaleSchema = z.strictObject({
  id: z.uuid(),
  correlationId: z.string(),
  status: z.enum(["received", "payment_required", "authorized", "served", "failed"]),
  amount: moneySchema.nullable(),
  payer: z.string().nullable(),
  providerTransactionRef: z.string().nullable(),
  networkTransactionId: z.string().nullable(),
  networkTransactionHash: z.string().nullable(),
  consensusTimestamp: z.string().nullable(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export const productDeliverySchema = z.strictObject({
  productId: z.uuid(),
  capabilities: z.strictObject({
    deploy: z.boolean(),
    privateRequest: z.boolean(),
    privateExport: z.boolean(),
    publishX402: z.boolean(),
    publicRequest: z.boolean(),
  }),
  api: z.strictObject({
    readiness: z.enum(["no_version", "version_not_ready", "not_deployed", "deploying", "unavailable", "available"]),
    blockers: z.array(deliveryBlockerSchema),
    latestVersion: deliveryVersionSchema.nullable(),
    activeVersion: deliveryVersionSchema.nullable(),
    deployment: deliveryDeploymentSchema.nullable(),
    contract: deliveryContractSchema.nullable(),
  }),
  monetization: z.strictObject({
    readiness: z.enum(["api_not_ready", "not_configured", "draft", "invalid", "retired", "active"]),
    blockers: z.array(deliveryBlockerSchema),
    publication: deliveryPublicationSchema.nullable(),
    revenue: z.strictObject({
      grossSales: z.array(moneySchema),
      creatorProceeds: z.array(moneySchema),
      providerFees: z.array(moneySchema),
    }),
    sales: z.array(deliverySaleSchema).max(20),
  }),
});

export const workspaceOverviewSchema = z.strictObject({
  period: z.strictObject({startsAt: z.iso.datetime(), endsAt: z.iso.datetime()}),
  activeProductCount: atomicSchema,
  draftVersionCount: atomicSchema,
  apiRequestCount: atomicSchema,
  graphExpenses: z.array(moneySchema),
  grossSales: z.array(moneySchema),
  readiness: z.tuple([]),
  recentActivity: z.array(z.strictObject({
    kind: z.literal("execution_run"),
    status: runStatusSchema,
    occurredAt: z.iso.datetime(),
    resource: z.strictObject({type: z.literal("execution_run"), id: z.uuid()}),
    summary: z.string(),
  })).max(10),
});

export const createProductInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  originalIntent: z.string().trim().max(8000),
  accountWalletId: z.uuid(),
});

export const updateProductInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => value.name !== undefined || value.description !== undefined);

const listProductsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  status: productStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});
const overviewQuerySchema = z.strictObject({period: z.literal("24h")});

function requireService(service?: ProductService) {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function workspaceId(req: Request) {
  return String(req.params.workspaceId);
}

function actorUserId(res: Response): string {
  const value = res.locals.workspaceAuthorization?.userId;
  if (typeof value !== "string") throw new AppError("AUTH_REQUIRED");
  return value;
}

function expectedLockVersion(value: string | undefined): number {
  const match = /^"([0-9]+)"$/.exec(value ?? "");
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 0) throw new AppError("INVALID_REQUEST");
  return version;
}

function mapProductError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ProductInputError) throw new AppError("INVALID_REQUEST");
  if (error instanceof ProductNotFoundError || error instanceof ProductWalletNotFoundError) {
    throw new AppError("RESOURCE_NOT_FOUND");
  }
  if (error instanceof ProductPreconditionError) throw new AppError("PRECONDITION_FAILED");
  if (error instanceof ProductCommandConflictError) throw new AppError("RESOURCE_CONFLICT");
  if (error instanceof ProductStorageError) throw new AppError("DEPENDENCY_UNAVAILABLE");
  throw new AppError("INTERNAL_ERROR");
}

export function listProducts(service?: ProductService): RequestHandler {
  return async (req, res) => {
    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const result = await requireService(service).list({
        workspaceId: workspaceId(req),
        query: parsed.data.q,
        status: parsed.data.status,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });
      const data = z.array(productSummarySchema).parse(result.items);
      res.json({
        data,
        page: {nextCursor: result.nextCursor, hasMore: result.hasMore},
        meta: meta(res.locals.requestId),
      });
    } catch (error) {
      mapProductError(error);
    }
  };
}

export function createProduct(service?: ProductService): RequestHandler {
  return async (req, res) => {
    const parsed = createProductInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = productDetailSchema.parse(await requireService(service).create({
        workspaceId: workspaceId(req),
        actorUserId: actorUserId(res),
        ...parsed.data,
        idempotencyKey: String(req.get("Idempotency-Key")),
      }));
      res.status(201).setHeader("ETag", `"${data.lockVersion}"`);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductError(error);
    }
  };
}

export function readProduct(service?: ProductService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = productDetailSchema.parse(await requireService(service).read(
        workspaceId(req),
        String(req.params.productId),
      ));
      res.setHeader("ETag", `"${data.lockVersion}"`);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductError(error);
    }
  };
}

export function readProductDelivery(service?: ProductService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) {
      throw new AppError("INVALID_REQUEST");
    }
    try {
      const data = productDeliverySchema.parse(
        await requireService(service).delivery(
          workspaceId(req),
          String(req.params.productId),
        ),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductError(error);
    }
  };
}

export function updateProduct(service?: ProductService): RequestHandler {
  return async (req, res) => {
    const parsed = updateProductInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = productDetailSchema.parse(await requireService(service).update({
        workspaceId: workspaceId(req),
        productId: String(req.params.productId),
        actorUserId: actorUserId(res),
        ...parsed.data,
        expectedLockVersion: expectedLockVersion(req.get("If-Match")),
        idempotencyKey: String(req.get("Idempotency-Key")),
      }));
      res.setHeader("ETag", `"${data.lockVersion}"`);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductError(error);
    }
  };
}

export function deleteProduct(service?: ProductService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = productDeletionSchema.parse(await requireService(service).delete({
        workspaceId: workspaceId(req),
        productId: String(req.params.productId),
        actorUserId: actorUserId(res),
        expectedLockVersion: expectedLockVersion(req.get("If-Match")),
        idempotencyKey: String(req.get("Idempotency-Key")),
      }));
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductError(error);
    }
  };
}

export function readWorkspaceOverview(service?: ProductService): RequestHandler {
  return async (req, res) => {
    if (!overviewQuerySchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = workspaceOverviewSchema.parse(
        await requireService(service).overview(workspaceId(req)),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapProductError(error);
    }
  };
}
