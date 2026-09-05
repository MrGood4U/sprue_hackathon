import express from "express";
import type { Logger } from "../shared/logger.js";
import { AppError } from "../shared/errors.js";
import { registerRoutes, type RouteDependencies } from "./register-routes.js";
import { registerProbes } from "./probes.js";
import {
  requestContext,
  cors,
  transportLimits,
} from "./middleware/transport.js";
import { errorHandler } from "./middleware/errors.js";
export interface HttpDependencies extends RouteDependencies {
  logger: Logger;
  ready: () => Promise<boolean>;
  stopping: () => boolean;
}
export function createHttpApp(
  deps: HttpDependencies,
  role: "api" | "worker" = "api",
) {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  app.set("trust proxy", false);
  app.set("query parser", "simple");
  app.enable("case sensitive routing");
  app.enable("strict routing");
  app.use(requestContext(deps.logger));
  registerProbes(app, deps.ready, deps.stopping);
  app.use((req, res, next) => {
    if (role === "worker") throw new AppError("RESOURCE_NOT_FOUND");
    if (
      req.method === "HEAD" ||
      (req.path.startsWith("/data/") &&
        !["GET", "OPTIONS"].includes(req.method))
    ) {
      res.setHeader("Allow", "GET, OPTIONS");
      throw new AppError("METHOD_NOT_ALLOWED");
    }
    next();
  });
  app.use(cors(deps.config.allowedOrigins), transportLimits);
  app.use((_req, _res, next) => {
    if (deps.stopping()) throw new AppError("DEPENDENCY_UNAVAILABLE");
    next();
  });
  if (role === "api") registerRoutes(app, deps);
  app.use(() => {
    throw new AppError("RESOURCE_NOT_FOUND");
  });
  app.use(errorHandler(deps.logger));
  return app;
}
