import type {Request, RequestHandler, Response} from "express";
import {z} from "zod";
import {
  AgentCommandConflictError,
  AgentInputError,
  AgentNotFoundError,
  AgentOperationInProgressError,
  AgentStorageError,
} from "../../modules/agent/contracts.js";
import type {AgentService} from "../../modules/agent/service.js";
import {AppError} from "../../shared/errors.js";
import {atomicSchema, emptyObjectSchema, meta} from "../contracts/common.js";

const sessionStatusSchema = z.enum(["active", "completed", "abandoned"]);
export const agentSessionSchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  title: z.string().nullable(),
  status: sessionStatusSchema,
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  activeCommandId: z.uuid().nullable(),
  traceStreamId: z.uuid().nullable(),
});

export const agentMessageSchema = z.strictObject({
  id: z.uuid(),
  sequenceNo: atomicSchema,
  role: z.enum(["user", "assistant", "tool"]),
  contentText: z.string().nullable(),
  contentJson: z.record(z.string(), z.unknown()).nullable(),
  redactionStatus: z.enum(["none", "secret_redacted", "content_removed"]),
  modelProvider: z.string().nullable(),
  modelName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const agentCommandSchema = z.strictObject({
  commandId: z.uuid(),
  status: z.enum(["queued", "running", "blocked", "succeeded", "failed", "cancelled"]),
  subject: z.strictObject({type: z.literal("agent_session"), id: z.uuid()}),
  traceStreamId: z.uuid(),
  pollAfterMs: z.number().int().nonnegative(),
});

export const createSessionInputSchema = z.strictObject({
  productId: z.uuid().optional(),
  title: z.string().trim().max(120).optional(),
});
const listSessionsQuerySchema = z.strictObject({
  productId: z.uuid().optional(),
});
const listMessagesQuerySchema = z.strictObject({
  afterSequence: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const sourceAccessSelectionSchema = z.strictObject({
  sourceKey: z.string().trim().min(1).max(200),
  mode: z.enum(["customer_api_key", "x402"]),
  providerCredentialId: z.uuid().nullable(),
  spendingPolicyId: z.uuid().nullable(),
});
export const messageInputSchema = z.strictObject({
  contentText: z.string().trim().min(1).max(8000),
  parentVersionId: z.uuid().optional(),
  accessSelections: z.array(sourceAccessSelectionSchema).max(4).optional(),
  responseLocale: z.enum(["en", "zh-CN"]).optional(),
});

function requireService(service?: AgentService): AgentService {
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

function mapAgentError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof AgentInputError) throw new AppError("INVALID_REQUEST");
  if (error instanceof AgentNotFoundError) throw new AppError("RESOURCE_NOT_FOUND");
  if (error instanceof AgentCommandConflictError || error instanceof AgentOperationInProgressError) {
    throw new AppError("RESOURCE_CONFLICT");
  }
  if (error instanceof AgentStorageError) throw new AppError("DEPENDENCY_UNAVAILABLE");
  throw new AppError("INTERNAL_ERROR");
}

export function createAgentSession(service?: AgentService): RequestHandler {
  return async (req, res) => {
    const parsed = createSessionInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = agentSessionSchema.parse(await requireService(service).createSession({
        workspaceId: workspaceId(req),
        actorUserId: actorUserId(res),
        ...parsed.data,
        idempotencyKey: String(req.get("Idempotency-Key")),
      }));
      res.status(201).setHeader("Location", `/api/v1/workspaces/${workspaceId(req)}/agent-sessions/${data.id}`);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) { mapAgentError(error); }
  };
}

export function listAgentSessions(service?: AgentService): RequestHandler {
  return async (req, res) => {
    const parsed = listSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = z.array(agentSessionSchema).parse(
        await requireService(service).listSessions(workspaceId(req), parsed.data.productId),
      );
      res.json({data, page: {nextCursor: null, hasMore: false}, meta: meta(res.locals.requestId)});
    } catch (error) { mapAgentError(error); }
  };
}

export function readAgentSession(service?: AgentService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) throw new AppError("INVALID_REQUEST");
    try {
      const data = agentSessionSchema.parse(
        await requireService(service).readSession(workspaceId(req), String(req.params.sessionId)),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) { mapAgentError(error); }
  };
}

export function listAgentMessages(service?: AgentService): RequestHandler {
  return async (req, res) => {
    const parsed = listMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const result = await requireService(service).listMessages(
        workspaceId(req),
        String(req.params.sessionId),
        parsed.data.afterSequence,
        parsed.data.limit,
      );
      const data = agentMessageListSchema.parse(result);
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) { mapAgentError(error); }
  };
}

export const agentMessageListSchema = z.strictObject({
  items: z.array(agentMessageSchema),
  nextAfterSequence: atomicSchema,
  hasMore: z.boolean(),
});

export function submitAgentMessage(service?: AgentService): RequestHandler {
  return async (req, res) => {
    const parsed = messageInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = agentCommandSchema.parse(await requireService(service).submitMessage({
        workspaceId: workspaceId(req),
        sessionId: String(req.params.sessionId),
        actorUserId: actorUserId(res),
        contentText: parsed.data.contentText,
        parentVersionId: parsed.data.parentVersionId,
        accessSelections: parsed.data.accessSelections,
        idempotencyKey: String(req.get("Idempotency-Key")),
      }));
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) { mapAgentError(error); }
  };
}
