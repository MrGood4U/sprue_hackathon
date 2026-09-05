import type { RouteDefinition } from "../contracts/route.js";
// Reserved operations mirror api-contract.md; they never accept work or return mock success.
export const evidenceRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/commands/{commandId}",
    operationId: "getApiV1CommandsCommandId",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/trace-streams/{streamId}",
    operationId: "getApiV1TraceStreamsStreamId",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/trace-streams/{streamId}/events",
    operationId: "getApiV1TraceStreamsStreamIdEvents",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/trace-streams/{streamId}/events/stream",
    operationId: "getApiV1TraceStreamsStreamIdEventsStream",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
];
