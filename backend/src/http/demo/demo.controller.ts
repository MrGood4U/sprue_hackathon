import type { RequestHandler } from "express";
import { z } from "zod";
import type { DemoRuntime } from "../../modules/demo/runtime.js";
import { AppError } from "../../shared/errors.js";
import { emptyObjectSchema, meta } from "../contracts/common.js";

const parametersSchema = z
  .strictObject({
    windowDays: z.literal(30),
    minimumActiveDays: z.literal(2),
  })
  .optional();

const actionSchema = z
  .strictObject({
    action: z.enum(["build", "api_request", "consumer_request"]),
    parameters: parametersSchema,
  });

function requireRuntime(runtime: DemoRuntime | undefined): DemoRuntime {
  if (!runtime) throw new AppError("CAPABILITY_DISABLED");
  return runtime;
}

export function demoState(runtime?: DemoRuntime): RequestHandler {
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

export function demoAction(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
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
