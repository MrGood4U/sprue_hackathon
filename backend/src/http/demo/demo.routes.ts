import type { RouteDefinition } from "../contracts/route.js";

// These routes are an explicit evaluator-facing bridge while durable business
// handlers are still being implemented. They never write database state.
export const demoRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/public/demo/state",
    operationId: "getApiV1DemoState",
    audience: "public",
    implementation: "demo-state",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/public/demo/actions",
    operationId: "postApiV1DemoActions",
    audience: "public",
    implementation: "demo-action",
    idempotency: false,
    ifMatch: false,
  },
];
