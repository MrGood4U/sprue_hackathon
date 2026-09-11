import { json, type Express, type RequestHandler } from "express";
import type { AppConfig } from "../app/config.js";
import type { IdentityVerifier } from "../modules/auth/ports.js";
import type { AuthService } from "../modules/auth/service.js";
import type { IdentityService } from "../modules/identity/service.js";
import type { DemoRuntime } from "../modules/demo/runtime.js";
import type {ModelProfileService} from "../modules/model-profile/service.js";
import type {GraphCredentialService} from "../modules/graph-credential/service.js";
import type {WalletService} from "../modules/wallet/service.js";
import type {ProductService} from "../modules/products/service.js";
import type {AgentService} from "../modules/agent/service.js";
import type {BuilderGraphSourceService} from "../modules/graph/builder-source-service.js";
import type {LiveDeploymentService} from "../modules/deployments/service.js";
import { AppError } from "../shared/errors.js";
import { routeCatalog } from "./contracts/catalog.js";
import { idSchema } from "./contracts/common.js";
import { requireIdentity, requireRecovery } from "./middleware/auth.js";
import {
  publicConfiguration,
  bootstrapIdentity,
  createHederaAccount,
  createGraphCredential,
  listGraphCredentials,
  revokeGraphCredential,
  readIdentity,
  readWalletAccess,
  selectGraphCredential,
  validateGraphCredential,
} from "./control/identity.controller.js";
import {demoCreatorAction, demoCreatorState, demoPublicAction, demoPublicState} from "./demo/demo.controller.js";
import {readModelProfile, testModelProfile, updateModelProfile} from "./model-profile/model-profile.controller.js";
import {
  createProduct,
  deleteProduct,
  listProducts,
  readProduct,
  readProductDelivery,
  readWorkspaceOverview,
  updateProduct,
} from "./products/product.controller.js";
import {
  cancelAgentPlanning,
  createAgentSession,
  listAgentMessages,
  listAgentSessions,
  listAgentTraceEvents,
  readAgentSession,
  submitAgentMessage,
} from "./agent/agent.controller.js";
import {searchBuilderSources, validateBuilderSource} from "./graph/builder-source.controller.js";
import {compileBuilderDag} from "./control/builder-compile.controller.js";
import {deployProduct, executeDataProduct, exportPrivateDeployment, publishX402, retireX402, suspendDeployment} from "./control/deployment.controller.js";
export interface RouteDependencies {
  config: AppConfig;
  verifier: IdentityVerifier;
  auth: AuthService;
  identity: IdentityService;
  demo?: DemoRuntime;
  modelProfiles?: ModelProfileService;
  graphCredentials?: GraphCredentialService;
  wallets?: WalletService;
  products?: ProductService;
  agents?: AgentService;
  builderSources?: BuilderGraphSourceService;
  deployments?: LiveDeploymentService;
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
        res.locals.workspaceAuthorization = await deps.identity.requireOwner(
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
          : route.implementation === "demo-public-state"
            ? demoPublicState(deps.demo)
          : route.implementation === "demo-public-action"
              ? demoPublicAction(deps.demo)
              : route.implementation === "demo-creator-state"
                ? demoCreatorState(deps.demo)
                : route.implementation === "demo-creator-action"
                  ? demoCreatorAction(deps.demo)
                  : route.implementation === "model-profile-read"
                    ? readModelProfile(deps.modelProfiles)
                    : route.implementation === "model-profile-write"
                      ? updateModelProfile(deps.modelProfiles)
                    : route.implementation === "model-profile-test"
                      ? testModelProfile(deps.modelProfiles)
                      : route.implementation === "wallet-access"
                        ? readWalletAccess(deps.wallets)
                        : route.implementation === "wallet-hedera-create"
                          ? createHederaAccount(deps.wallets)
                        : route.implementation === "graph-credentials-list"
                          ? listGraphCredentials(deps.graphCredentials)
                          : route.implementation === "graph-credentials-create"
                            ? createGraphCredential(deps.graphCredentials)
                            : route.implementation === "graph-credentials-validate"
                              ? validateGraphCredential(deps.graphCredentials)
                              : route.implementation === "graph-credentials-select"
                              ? selectGraphCredential(deps.graphCredentials)
                              : route.implementation === "graph-credentials-revoke"
                                  ? revokeGraphCredential(deps.graphCredentials)
                                  : route.implementation === "workspace-overview"
                                    ? readWorkspaceOverview(deps.products)
                                    : route.implementation === "products-list"
                                      ? listProducts(deps.products)
                                      : route.implementation === "products-create"
                                        ? createProduct(deps.products)
                                        : route.implementation === "products-read"
                                          ? readProduct(deps.products)
                                          : route.implementation === "product-delivery-read"
                                            ? readProductDelivery(deps.products)
                                          : route.implementation === "products-update"
                                            ? updateProduct(deps.products)
                                            : route.implementation === "products-delete"
                                              ? deleteProduct(deps.products)
                                          : route.implementation === "agent-sessions-create"
                                            ? createAgentSession(deps.agents)
                                            : route.implementation === "agent-sessions-list"
                                              ? listAgentSessions(deps.agents)
                                              : route.implementation === "agent-sessions-read"
                                                ? readAgentSession(deps.agents)
                                                : route.implementation === "agent-messages-list"
                                                  ? listAgentMessages(deps.agents)
                                                  : route.implementation === "agent-trace-events-list"
                                                    ? listAgentTraceEvents(deps.agents)
                                                  : route.implementation === "agent-messages-submit"
                                                    ? submitAgentMessage(deps.agents)
                                          : route.implementation === "agent-planning-cancel"
                                                      ? cancelAgentPlanning(deps.agents)
                                                  : route.implementation === "graph-sources-search"
                                                      ? searchBuilderSources(deps.builderSources)
                                                      : route.implementation === "graph-sources-validate"
                                                        ? validateBuilderSource(deps.builderSources)
                                                        : route.implementation === "builder-compile"
                                                          ? compileBuilderDag(deps.products, deps.deployments)
                                                        : route.implementation === "deployments-create"
                                                          ? deployProduct(deps.deployments)
                                                        : route.implementation === "deployment-suspend"
                                                          ? suspendDeployment(deps.deployments)
                                                        : route.implementation === "x402-publish"
                                                          ? publishX402(deps.deployments)
                                                        : route.implementation === "x402-retire"
                                                          ? retireX402(deps.deployments)
                                                        : route.implementation === "deployment-private-export"
                                                          ? exportPrivateDeployment(deps.deployments)
                                                        : route.implementation === "data-product-execute"
                                                          ? executeDataProduct(deps.deployments)
              : () => {
                  throw new AppError("CAPABILITY_NOT_IMPLEMENTED");
                };
    app[route.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete"](
      path,
      ...middleware,
      handler,
    );
  }
}
