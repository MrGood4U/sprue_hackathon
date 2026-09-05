import type { RouteDefinition } from "../contracts/route.js";
export const publicRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/public/products/{endpointSlug}",
    operationId: "getApiV1PublicProductsEndpointSlug",
    audience: "public",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/public/requests/{correlationId}/receipt",
    operationId: "getApiV1PublicRequestsCorrelationIdReceipt",
    audience: "recovery",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/public/requests/{correlationId}/retry-delivery",
    operationId: "postApiV1PublicRequestsCorrelationIdRetryDelivery",
    audience: "recovery",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
];
