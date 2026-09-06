import { json, type Express, type RequestHandler } from "express";
import type { AppConfig } from "../app/config.js";
import type { IdentityVerifier } from "../modules/auth/ports.js";
import type { AuthService } from "../modules/auth/service.js";
import type { IdentityService } from "../modules/identity/service.js";
import type { DemoRuntime } from "../modules/demo/runtime.js";
import { AppError } from "../shared/errors.js";
import { routeCatalog } from "./contracts/catalog.js";
import { idSchema } from "./contracts/common.js";
import { requireIdentity, requireRecovery } from "./middleware/auth.js";
import {
  publicConfiguration,
  bootstrapIdentity,
  readIdentity,
} from "./control/identity.controller.js";
import {
  demoAction,
  demoModelProfile,
  demoState,
  testDemoModelProfile,
  updateDemoModelProfile,
} from "./demo/demo.controller.js";
export interface RouteDependencies {
  config: AppConfig;
  verifier: IdentityVerifier;
  auth: AuthService;
  identity: IdentityService;
  demo?: DemoRuntime;
}
export function registerRoutes(app: Express, deps: RouteDependencies) {
  const auth = requireIdentity(deps.verifier);
  for (const route of routeCatalog) {
    const path = route.path.replace(/\{([^}]+)\}/g, ":$1");
    const middleware: RequestHandler[] = [
      (_req, res, next) => {
        res.locals.routeTemplate = route.path;
        next();
      },
    ];
    if (route.audience === "creator") middleware.push(auth);
    if (route.audience === "recovery") middleware.push(requireRecovery);
    middleware.push(async (req, res, next) => {
      for (const [name, value] of Object.entries(req.params)) {
        if (
          typeof value !== "string" ||
          (name.endsWith("Id") && name !== "correlationId"
            ? !idSchema.safeParse(value).success
            : !/^[A-Za-z0-9_-]{1,128}$/.test(value))
        )
          throw new AppError("INVALID_REQUEST");
      }
      if (route.audience === "creator" && req.params.workspaceId)
        await deps.identity.requireOwner(
          res.locals.identity,
          String(req.params.workspaceId),
        );
      if (
        route.idempotency &&
        !/^[\x20-\x7E]{16,128}$/.test(req.get("Idempotency-Key") ?? "")
      )
        throw new AppError("INVALID_REQUEST");
      if (route.ifMatch && !req.get("If-Match"))
        throw new AppError("PRECONDITION_REQUIRED");
      next();
    });
    if (route.method !== "GET")
      middleware.push(
        json({
          limit: route.path.endsWith("/messages") ? 65536 : 262144,
          strict: true,
          inflate: false,
        }),
      );
    const handler: RequestHandler =
      route.implementation === "app-config"
        ? publicConfiguration(deps.config)
        : route.implementation === "bootstrap"
          ? bootstrapIdentity(deps.auth)
        : route.implementation === "me"
          ? readIdentity(deps.identity)
          : route.implementation === "demo-state"
            ? demoState(deps.demo)
          : route.implementation === "demo-action"
              ? demoAction(deps.demo)
              : route.implementation === "demo-model-profile-read"
                ? demoModelProfile(deps.demo)
                : route.implementation === "demo-model-profile-write"
                  ? updateDemoModelProfile(deps.demo)
                  : route.implementation === "demo-model-profile-test"
                    ? testDemoModelProfile(deps.demo)
              : () => {
                  throw new AppError("CAPABILITY_NOT_IMPLEMENTED");
                };
    app[route.method.toLowerCase() as "get" | "post" | "put" | "patch"](
      path,
      ...middleware,
      handler,
    );
  }
}
