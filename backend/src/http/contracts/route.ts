export type Method = "GET" | "POST" | "PUT" | "PATCH";
export interface RouteDefinition {
  method: Method;
  path: string;
  operationId: string;
  audience: "creator" | "public" | "recovery" | "data";
  implementation: "reserved" | "app-config" | "bootstrap" | "me" | "demo-state" | "demo-action" | "demo-model-profile-read" | "demo-model-profile-write" | "demo-model-profile-test";
  idempotency: boolean;
  ifMatch: boolean;
}
