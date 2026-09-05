import type { ErrorRequestHandler } from "express";
import { AppError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { meta } from "../contracts/common.js";
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const type =
      typeof error === "object" && error && "type" in error ? error.type : null;
    const safe =
      error instanceof AppError
        ? error
        : new AppError(
            type === "entity.too.large"
              ? "PAYLOAD_TOO_LARGE"
              : type === "entity.parse.failed" || error instanceof URIError
                ? "INVALID_REQUEST"
                : type === "encoding.unsupported" ||
                    type === "charset.unsupported"
                  ? "UNSUPPORTED_MEDIA_TYPE"
                  : "INTERNAL_ERROR",
          );
    logger.write({
      event: "request_failed",
      requestId: res.locals.requestId,
      code: safe.code,
    });
    res
      .status(safe.status)
      .json({ error: safe.detail(), meta: meta(res.locals.requestId) });
  };
}
