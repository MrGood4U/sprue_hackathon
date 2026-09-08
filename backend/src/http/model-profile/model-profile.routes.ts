import type {RouteDefinition} from "../contracts/route.js";

export const modelProfileRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspaceId}/model-profile",
    operationId: "getApiV1WorkspaceModelProfile",
    audience: "creator",
    implementation: "model-profile-read",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "PUT",
    path: "/api/v1/workspaces/{workspaceId}/model-profile",
    operationId: "putApiV1WorkspaceModelProfile",
    audience: "creator",
    implementation: "model-profile-write",
    idempotency: false,
    ifMatch: false,
  },
  {
    method: "POST",
    path: "/api/v1/workspaces/{workspaceId}/model-profile/test",
    operationId: "postApiV1WorkspaceModelProfileTest",
    audience: "creator",
    implementation: "model-profile-test",
    idempotency: false,
    ifMatch: false,
  },
];
