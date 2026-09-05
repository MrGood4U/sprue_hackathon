import type { RouteDefinition } from "../contracts/route.js";
// Reserved operations mirror docs/api/deployment-publication.md; they never accept work or return mock success.
export const deploymentRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/products/{productId}/deployments",
    operationId: "getApiV1WorkspacesWorkspaceIdProductsProductIdDeployments",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/products/{productId}/deployments",
    operationId: "postApiV1WorkspacesWorkspaceIdProductsProductIdDeployments",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}",
    operationId: "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentId",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/activation-preflight",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdActivationPreflight",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/activate",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdActivate",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: true,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/contract",
    operationId: "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdContract",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/trace-streams",
    operationId:
      "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdTraceStreams",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/access-requests",
    operationId:
      "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdAccessRequests",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/private-requests",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPrivateRequests",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/access-requests/{accessRequestId}",
    operationId: "getApiV1WorkspacesWorkspaceIdAccessRequestsAccessRequestId",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/api-credentials",
    operationId:
      "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdApiCredentials",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/api-credentials",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdApiCredentials",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/api-credentials/{credentialId}/revoke",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdApiCredentialsCredentialIdRevoke",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/refresh-schedule",
    operationId:
      "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdRefreshSchedule",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "PATCH",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/refresh-schedule",
    operationId:
      "patchApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdRefreshSchedule",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: true,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/refresh-preflight",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdRefreshPreflight",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/refreshes",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdRefreshes",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: true,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications",
    operationId:
      "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPublications",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publication-preflight",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPublicationPreflight",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPublications",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: false,
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications/{publicationId}",
    operationId:
      "getApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPublicationsPublicationId",
    audience: "creator",
    implementation: "reserved",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications/{publicationId}/activate",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPublicationsPublicationIdActivate",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: true,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/deployments/{deploymentId}/publications/{publicationId}/retire",
    operationId:
      "postApiV1WorkspacesWorkspaceIdDeploymentsDeploymentIdPublicationsPublicationIdRetire",
    audience: "creator",
    implementation: "reserved",
    idempotency: true,
    ifMatch: true,
  },
];
