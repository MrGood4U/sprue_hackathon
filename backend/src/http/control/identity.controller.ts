import type { RequestHandler } from "express";
import type { AppConfig } from "../../app/config.js";
import type { IdentityService } from "../../modules/identity/service.js";
import { AppError } from "../../shared/errors.js";
import {
  appConfigSchema,
  bootstrapSchema,
  emptyObjectSchema,
  meta,
} from "../contracts/common.js";
export function publicConfiguration(config: AppConfig): RequestHandler {
  const data = appConfigSchema.parse({
    apiVersion: "1",
    environment: config.environment,
    privyAppId: config.privyAppId,
    consolePublicUrl: config.consolePublicUrl,
    dataPublicBaseUrl: config.dataPublicBaseUrl,
    demoProductUrl: null,
    features: {
      graphCustomerApiKey: false,
      graphX402: false,
      hederaPublication: false,
      hostedDemoConsumer: false,
      serviceFees: false,
      liveGraphExecution: false,
    },
  });
  return (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    res.json({ data, meta: meta(res.locals.requestId) });
  };
}
export function readIdentity(identity: IdentityService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    const data = bootstrapSchema.parse(
      await identity.me(res.locals.identity.subject),
    );
    res.json({ data, meta: meta(res.locals.requestId) });
  };
}
