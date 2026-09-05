import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "../../shared/logger.js";
import { AppError } from "../../shared/errors.js";

export const allowedHeaders = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "If-Match",
  "Last-Event-ID",
  "PAYMENT-SIGNATURE",
  "X-Sprue-Request-Access",
];
export const exposedHeaders = [
  "ETag",
  "Location",
  "Retry-After",
  "X-Request-ID",
  "PAYMENT-REQUIRED",
  "PAYMENT-RESPONSE",
  "X-Sprue-Request-ID",
  "X-Sprue-Recovery-Expires-At",
];
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.locals.requestId = `req_${randomUUID()}`;
    res.setHeader("X-Request-ID", res.locals.requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.once("finish", () =>
      logger.write({
        event: "request",
        requestId: res.locals.requestId,
        method: [
          "GET",
          "HEAD",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
        ].includes(req.method)
          ? req.method
          : "OTHER",
        route: res.locals.routeTemplate ?? "unmatched",
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      }),
    );
    next();
  };
}
export function cors(origins: readonly string[]): RequestHandler {
  return (req, res, next) => {
    res.vary("Origin");
    const origin = req.get("Origin");
    if (origin && !origins.includes(origin))
      throw new AppError("CAPABILITY_DISABLED");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    }
    if (req.method !== "OPTIONS") {
      next();
      return;
    }
    const method = req.get("Access-Control-Request-Method");
    const headers = (req.get("Access-Control-Request-Headers") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      (method && !["GET", "POST", "PUT", "PATCH"].includes(method)) ||
      headers.some(
        (value) =>
          !allowedHeaders.map((header) => header.toLowerCase()).includes(value),
      )
    )
      throw new AppError("CAPABILITY_DISABLED");
    res.vary("Access-Control-Request-Method");
    res.vary("Access-Control-Request-Headers");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", allowedHeaders.join(", "));
    res.status(204).end();
  };
}
export const transportLimits: RequestHandler = (req, _res, next) => {
  if (
    Buffer.byteLength(req.originalUrl) > 8192 ||
    Buffer.byteLength(req.get("PAYMENT-SIGNATURE") ?? "") > 65536
  )
    throw new AppError("PAYLOAD_TOO_LARGE");
  const protectedHeaders = [
    "authorization",
    "idempotency-key",
    "if-match",
    "x-sprue-request-access",
    "payment-signature",
    "origin",
  ];
  const counts = new Map<string, number>();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]!.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (protectedHeaders.some((name) => (counts.get(name) ?? 0) > 1))
    throw new AppError("INVALID_REQUEST");
  if (
    ["POST", "PATCH", "PUT"].includes(req.method) &&
    !req.is("application/json")
  )
    throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  if (req.get("Content-Encoding") && req.get("Content-Encoding") !== "identity")
    throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  next();
};
