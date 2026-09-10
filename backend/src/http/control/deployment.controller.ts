import type {Request, RequestHandler, Response} from "express";
import {z} from "zod";
import type {LiveDeploymentService} from "../../modules/deployments/service.js";
import {LiveDeploymentError} from "../../modules/deployments/contracts.js";
import {AppError} from "../../shared/errors.js";
import {emptyObjectSchema, meta} from "../contracts/common.js";

const deployInputSchema = z.strictObject({
  alias: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$/).optional(),
});

const liveQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(1_000).default(100),
});

function requireService(service?: LiveDeploymentService): LiveDeploymentService {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function actorUserId(res: Response): string {
  const value = res.locals.workspaceAuthorization?.userId;
  if (typeof value !== "string") throw new AppError("AUTH_REQUIRED");
  return value;
}

function mapError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof LiveDeploymentError) {
    if (error.code === "DATA_API_KEY_REQUIRED") throw new AppError("DATA_API_KEY_REQUIRED");
    if (error.code === "DATA_API_KEY_INVALID") throw new AppError("DATA_API_KEY_INVALID");
    if (error.code === "READY_VERSION_NOT_FOUND") throw new AppError("RESOURCE_NOT_FOUND");
    if (error.code === "DEPLOYMENT_ALIAS_INVALID") throw new AppError("INVALID_REQUEST");
    if (error.code === "DEPLOYMENT_ALIAS_CONFLICT") throw new AppError("RESOURCE_CONFLICT");
    if (error.code === "DEPLOYMENT_COMMAND_CONFLICT") throw new AppError("RESOURCE_CONFLICT");
    if (error.code === "GRAPH_CREDENTIAL_UNAVAILABLE") throw new AppError("DEPENDENCY_UNAVAILABLE");
    if (error.code === "LIVE_PLAN_INTEGRITY_FAILED") throw new AppError("INTERNAL_ERROR");
  }
  throw new AppError("LIVE_EXECUTION_FAILED");
}

export function deployProduct(service?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    const parsed = deployInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireService(service).deploy({
        workspaceId: String(req.params.workspaceId),
        productId: String(req.params.productId),
        actorUserId: actorUserId(res),
        alias: parsed.data.alias,
        idempotencyKey: String(req.get("Idempotency-Key")),
      });
      res.status(201).json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapError(error);
    }
  };
}

export function executeDataProduct(service?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    const parsed = liveQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    try {
      const result = await requireService(service).execute({
        ownerUserId: String(req.params.ownerId),
        productRef: String(req.params.productRef),
        authorization: req.get("Authorization"),
        limit: parsed.data.limit,
        signal: controller.signal,
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json({data: result.data, meta: {...meta(res.locals.requestId), ...result.meta}});
    } catch (error) {
      mapError(error);
    }
  };
}

export function exportPrivateDeployment(service?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    try {
      const bundle = await requireService(service).exportBundle(
        String(req.params.workspaceId),
        String(req.params.productId),
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="sprue-${String(req.params.productId)}-private-deployment.json"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(JSON.stringify(bundle, null, 2));
    } catch (error) {
      mapError(error);
    }
  };
}
