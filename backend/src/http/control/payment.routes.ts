import type { RouteDefinition } from "../contracts/route.js";
// Reserved operations mirror docs/api/consumer-payments.md; they never accept work or return mock success.
export const paymentRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/payments/{paymentIntentId}",
    operationId: "getApiV1WorkspacesWorkspaceIdPaymentsPaymentIntentId",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/payments/{paymentIntentId}/reconcile",
    operationId:
      "postApiV1WorkspacesWorkspaceIdPaymentsPaymentIntentIdReconcile",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/financial-summary",
    operationId: "getApiV1WorkspacesWorkspaceIdFinancialSummary",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/ledger",
    operationId: "getApiV1WorkspacesWorkspaceIdLedger",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/payments",
    operationId: "getApiV1WorkspacesWorkspaceIdPayments",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/sales",
    operationId: "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdSales",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
];
