import type { RouteDefinition } from "../contracts/route.js";

// These routes are an explicit evaluator-facing bridge while durable business
// handlers are still being implemented. Creator state is isolated by an
// authenticated, server-authorized workspace and never writes database state.
export const demoRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/public/demo/state",
    operationId: "getApiV1DemoState",
    audience: "public",
    implementation: "demo-public-state",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/public/demo/actions",
    operationId: "postApiV1DemoActions",
    audience: "public",
    implementation: "demo-public-action",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/demo/state",
    operationId: "getApiV1WorkspaceDemoState",
    audience: "creator",
    implementation: "demo-creator-state",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/demo/actions",
    operationId: "postApiV1WorkspaceDemoActions",
    audience: "creator",
    implementation: "demo-creator-action",
    idempotency: false,
    ifMatch: false,
  },
];
