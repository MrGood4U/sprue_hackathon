import type { RouteDefinition } from "../contracts/route.js";
export const dataRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/x402/v1/{ownerId}/{productRef}",
    operationId: "getX402V1OwnerIdProductRef",
    audience: "data",
    implementation: "x402-product-execute",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/data/v1/{ownerId}/{productRef}",
    operationId: "getDataV1OwnerIdProductRef",
    audience: "data",
    implementation: "data-product-execute",
    idempotency: false,
    ifMatch: false,
  },
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
