import type { RouteDefinition } from "../contracts/route.js";
export const dataRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/data/v1/{endpointSlug}",
    operationId: "getDataV1EndpointSlug",
    audience: "data",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
];
