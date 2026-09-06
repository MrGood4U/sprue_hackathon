import type { RequestHandler } from "express";
import { z } from "zod";
import {
  DemoModelConnectionError,
  DemoModelProfileInputError,
  type DemoRuntime,
} from "../../modules/demo/runtime.js";
import { AppError } from "../../shared/errors.js";
import { emptyObjectSchema, meta } from "../contracts/common.js";

const actionSchema = z.discriminatedUnion("action", [
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
  z.strictObject({action: z.literal("consumer_request")}),
]);

const sessionIdSchema = z.uuid();
const modelProfileSchema = z.strictObject({
  apiUrl: z.url().max(2048),
  apiKey: z.string().trim().min(1).max(4096).optional(),
  model: z.string().trim().min(1).max(200),
});

function requireRuntime(runtime: DemoRuntime | undefined): DemoRuntime {
  if (!runtime) throw new AppError("CAPABILITY_DISABLED");
  return runtime;
}

function readSessionId(value: string | undefined, required = false): string | undefined {
  if (!value) {
    if (required) throw new AppError("INVALID_REQUEST");
    return undefined;
  }
  const parsed = sessionIdSchema.safeParse(value);
  if (!parsed.success) throw new AppError("INVALID_REQUEST");
  return parsed.data;
}

export function demoState(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    try {
      const data = await requireRuntime(runtime).getState(readSessionId(req.get("X-Sprue-Demo-Session")));
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
      const sessionId = readSessionId(
        req.get("X-Sprue-Demo-Session"),
        parsed.data.action === "rename_product",
      );
      const data = await requireRuntime(runtime).run(parsed.data, sessionId);
      res.json({ data, meta: meta(res.locals.requestId, "demo") });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("INTERNAL_ERROR");
    }
  };
}

export function demoModelProfile(runtime?: DemoRuntime): RequestHandler {
  return (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    const sessionId = readSessionId(req.get("X-Sprue-Demo-Session"), true)!;
    const data = requireRuntime(runtime).getModelProfile(sessionId);
    res.json({data, meta: meta(res.locals.requestId, "demo")});
  };
}

export function updateDemoModelProfile(runtime?: DemoRuntime): RequestHandler {
  return (req, res) => {
    const parsed = modelProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    const sessionId = readSessionId(req.get("X-Sprue-Demo-Session"), true)!;
    try {
      const data = requireRuntime(runtime).saveModelProfile(sessionId, parsed.data);
      res.json({data, meta: meta(res.locals.requestId, "demo")});
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("INVALID_REQUEST");
    }
  };
}

export function testDemoModelProfile(runtime?: DemoRuntime): RequestHandler {
  return async (req, res) => {
    const parsed = modelProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    const sessionId = readSessionId(req.get("X-Sprue-Demo-Session"), true)!;
    try {
      const data = await requireRuntime(runtime).testModelProfile(sessionId, parsed.data);
      res.json({data, meta: meta(res.locals.requestId, "demo")});
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DemoModelProfileInputError) throw new AppError("INVALID_REQUEST");
      if (error instanceof DemoModelConnectionError) throw new AppError("DEPENDENCY_UNAVAILABLE");
      throw new AppError("INTERNAL_ERROR");
    }
  };
}
