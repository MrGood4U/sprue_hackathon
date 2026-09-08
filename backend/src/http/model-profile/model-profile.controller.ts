import type {Request, RequestHandler, Response} from "express";
import {z} from "zod";
import {
  ModelProfileConnectionError,
  ModelProfileInputError,
  ModelProfileStorageError,
} from "../../modules/model-profile/contracts.js";
import type {ModelProfileService} from "../../modules/model-profile/service.js";
import {AppError} from "../../shared/errors.js";
import {emptyObjectSchema, meta} from "../contracts/common.js";

export const modelProfileInputSchema = z.strictObject({
  apiUrl: z.url().max(2048),
  apiKey: z.string().min(1).max(4096).optional(),
  model: z.string().trim().min(1).max(200),
});

export const modelProfileViewSchema = z.strictObject({
  configured: z.boolean(),
  protocol: z.literal("openai_compatible_chat_completions"),
  apiUrl: z.string(),
  model: z.string(),
  hasApiKey: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});

export const modelProfileTestResultSchema = z.strictObject({
  available: z.literal(true),
  protocol: z.literal("openai_compatible_chat_completions"),
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
});

function requireService(service: ModelProfileService | undefined): ModelProfileService {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function workspaceId(req: Request): string {
  return String(req.params.workspaceId);
}

function actorUserId(res: Response): string {
  const value = res.locals.workspaceAuthorization?.userId;
  if (typeof value !== "string") throw new AppError("AUTH_REQUIRED");
  return value;
}

function mapModelProfileError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ModelProfileInputError) throw new AppError("INVALID_REQUEST");
  if (error instanceof ModelProfileConnectionError || error instanceof ModelProfileStorageError) {
    throw new AppError("DEPENDENCY_UNAVAILABLE");
  }
  throw new AppError("INTERNAL_ERROR");
}

export function readModelProfile(service?: ModelProfileService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireService(service).read(workspaceId(req));
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapModelProfileError(error);
    }
  };
}

export function updateModelProfile(service?: ModelProfileService): RequestHandler {
  return async (req, res) => {
    const parsed = modelProfileInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireService(service).save(
        workspaceId(req),
        actorUserId(res),
        parsed.data,
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapModelProfileError(error);
    }
  };
}

export function testModelProfile(service?: ModelProfileService): RequestHandler {
  return async (req, res) => {
    const parsed = modelProfileInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireService(service).test(workspaceId(req), parsed.data);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapModelProfileError(error);
    }
  };
}
