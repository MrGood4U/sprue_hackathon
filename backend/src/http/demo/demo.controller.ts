import type { Request, RequestHandler } from "express";
import { z } from "zod";
import type {DemoRuntime} from "../../modules/demo/runtime.js";
import { AppError } from "../../shared/errors.js";
import { emptyObjectSchema, meta } from "../contracts/common.js";

const creatorActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("agent_plan"),
    intent: z.string().trim().min(1).max(8000).optional(),
  }),
  z.strictObject({
    action: z.literal("rename_product"),
    name: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    action: z.literal("build"),
    parameters: z.strictObject({
      windowDays: z.literal(30),
      minimumActiveDays: z.literal(2),
    }).optional(),
  }),
  z.strictObject({
    action: z.literal("api_request"),
    parameters: z.strictObject({
      limit: z.number().int().min(1).max(1000),
    }).optional(),
  }),
]);

const publicActionSchema = z.strictObject({action: z.literal("consumer_request")});
function requireRuntime(runtime: DemoRuntime | undefined): DemoRuntime {
  if (!runtime) throw new AppError("CAPABILITY_DISABLED");
  return runtime;
}

function workspaceId(req: Request): string {
  return String(req.params.workspaceId);
}

export function demoPublicState(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireRuntime(runtime).getState();
      res.json({ data, meta: meta(res.locals.requestId, "demo") });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("INTERNAL_ERROR");
    }
  };
}

export function demoPublicAction(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    const parsed = publicActionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireRuntime(runtime).run(parsed.data);
      res.json({ data, meta: meta(res.locals.requestId, "demo") });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("INTERNAL_ERROR");
    }
  };
}

export function demoCreatorState(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireRuntime(runtime).getState(workspaceId(req));
      res.json({data, meta: meta(res.locals.requestId, "demo")});
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("INTERNAL_ERROR");
    }
  };
}

export function demoCreatorAction(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    const parsed = creatorActionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireRuntime(runtime).run(parsed.data, workspaceId(req));
      res.json({data, meta: meta(res.locals.requestId, "demo")});
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("INTERNAL_ERROR");
    }
  };
}
