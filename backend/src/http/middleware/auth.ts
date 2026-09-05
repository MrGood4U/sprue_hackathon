import type { RequestHandler } from "express";
import type { IdentityVerifier } from "../../modules/identity/ports.js";
import { AppError } from "../../shared/errors.js";
export function requireIdentity(verifier: IdentityVerifier): RequestHandler {
  return async (req, res, next) => {
    const value = req.get("Authorization");
    if (!value || !/^Bearer [^\s,]+$/i.test(value) || value.length > 8192)
      throw new AppError("AUTH_REQUIRED");
    const identity = await verifier.verify(value.slice(7));
    if (
      !identity ||
      typeof identity.subject !== "string" ||
      !identity.subject.trim()
    )
      throw new AppError("AUTH_REQUIRED");
    res.locals.identity = identity;
    next();
  };
}
export const requireRecovery: RequestHandler = (req, _res, next) => {
  const value = req.get("X-Sprue-Request-Access");
  if (
    !value ||
    !/^[A-Za-z0-9_-]{43}$/.test(value) ||
    Buffer.from(value, "base64url").toString("base64url") !== value
  )
    throw new AppError("REQUEST_ACCESS_REQUIRED");
  // Syntax is not authorization. Reserved recovery handlers cannot retrieve anything.
  next();
};
