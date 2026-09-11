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

const publishX402Schema = z.strictObject({
  priceHbar: z.string().trim().regex(/^(?:0|[1-9][0-9]{0,69})(?:\.[0-9]{1,8})?$/),
});

function hbarToTinybar(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const atomic = `${whole}${fraction.padEnd(8, "0")}`.replace(/^0+(?=\d)/, "");
  if (!/^[1-9][0-9]*$/.test(atomic)) throw new AppError("INVALID_REQUEST");
  return atomic;
}

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
    if (error.code === "DEPLOYMENT_NOT_FOUND" || error.code === "X402_PUBLICATION_NOT_FOUND") throw new AppError("RESOURCE_NOT_FOUND");
    if (error.code === "X402_PRICE_INVALID") throw new AppError("INVALID_REQUEST");
    if (error.code === "X402_PUBLICATION_PREREQUISITES_MISSING") throw new AppError("X402_PREREQUISITES_MISSING");
    if (error.code === "X402_PAYMENT_REPLAYED") throw new AppError("X402_PAYMENT_REPLAYED");
    if (error.code === "BLOCKY402_UNAVAILABLE") throw new AppError("DEPENDENCY_UNAVAILABLE");
    if (error.code === "X402_SETTLEMENT_FAILED") throw new AppError("X402_SETTLEMENT_FAILED");
    if (error.code === "X402_PUBLICATION_FAILED") throw new AppError("INTERNAL_ERROR");
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
      const result = await requireService(service).executeRequest({
        ownerUserId: String(req.params.ownerId),
        productRef: String(req.params.productRef),
        authorization: req.get("Authorization"),
        paymentSignature: req.get("PAYMENT-SIGNATURE"),
        limit: parsed.data.limit,
        path: req.originalUrl,
        signal: controller.signal,
      });
      res.setHeader("Cache-Control", "private, no-store");
      if (result.kind === "payment_required") {
        const paymentRequired = Buffer.from(JSON.stringify(result.body)).toString("base64");
        res.setHeader("PAYMENT-REQUIRED", paymentRequired);
        res.status(402).json(result.body);
        return;
      }
      if (result.paymentResponse) {
        res.setHeader("PAYMENT-RESPONSE", Buffer.from(JSON.stringify(result.paymentResponse)).toString("base64"));
      }
      res.json({data: result.value.data, meta: {...meta(res.locals.requestId), ...result.value.meta}});
    } catch (error) {
      mapError(error);
    }
  };
}

export function suspendDeployment(service?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.body).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireService(service).suspend(
        String(req.params.workspaceId),
        String(req.params.deploymentId),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapError(error);
    }
  };
}

export function publishX402(service?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    const parsed = publishX402Schema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    try {
      const data = await requireService(service).publishX402({
        workspaceId: String(req.params.workspaceId),
        deploymentId: String(req.params.deploymentId),
        actorUserId: actorUserId(res),
        priceAtomic: hbarToTinybar(parsed.data.priceHbar),
        signal: controller.signal,
      });
      res.status(201).json({data: {...data, createdAt: data.createdAt.toISOString()}, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapError(error);
    }
  };
}

export function retireX402(service?: LiveDeploymentService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.body).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireService(service).retireX402(
        String(req.params.workspaceId),
        String(req.params.deploymentId),
        String(req.params.publicationId),
      );
      res.json({data: {...data, createdAt: data.createdAt.toISOString()}, meta: meta(res.locals.requestId)});
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
