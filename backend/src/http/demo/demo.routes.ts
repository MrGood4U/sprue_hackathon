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
  {
    method: "GET",
    path: "/api/v1/public/demo/model-profile",
    operationId: "getApiV1DemoModelProfile",
    audience: "public",
    implementation: "demo-model-profile-read",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "PUT",
    path: "/api/v1/public/demo/model-profile",
    operationId: "putApiV1DemoModelProfile",
    audience: "public",
    implementation: "demo-model-profile-write",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/public/demo/model-profile/test",
    operationId: "postApiV1DemoModelProfileTest",
    audience: "public",
    implementation: "demo-model-profile-test",
    idempotency: false,
    ifMatch: false,
  },
];
