export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface RouteDefinition {
  method: Method;
  path: string;
  operationId: string;
  audience: "creator" | "public" | "recovery" | "data";
  implementation:
    | "reserved"
    | "app-config"
    | "bootstrap"
    | "me"
    | "demo-public-state"
    | "demo-public-action"
    | "demo-creator-state"
    | "demo-creator-action"
    | "model-profile-read"
    | "model-profile-write"
    | "model-profile-test"
    | "wallet-access"
    | "wallet-hedera-create"
    | "graph-credentials-list"
    | "graph-credentials-create"
    | "graph-credentials-validate"
    | "graph-credentials-select"
    | "graph-credentials-revoke"
    | "workspace-overview"
    | "products-list"
    | "products-create"
    | "products-read"
    | "products-update"
    | "products-delete"
    | "agent-sessions-create"
    | "agent-sessions-list"
    | "agent-sessions-read"
    | "agent-messages-list"
    | "agent-trace-events-list"
    | "agent-messages-submit"
    | "agent-planning-cancel";
  idempotency: boolean;
  ifMatch: boolean;
}
