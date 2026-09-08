import { z } from "zod";
import { routeCatalog } from "./catalog.js";
import {
  graphCredentialInputSchema,
  graphCredentialViewSchema,
  walletAccessViewSchema,
} from "../control/identity.controller.js";
import {
  appConfigSchema,
  bootstrapSchema,
  errorSchema,
  metaSchema,
} from "./common.js";
import {
  modelProfileInputSchema,
  modelProfileTestResultSchema,
  modelProfileViewSchema,
} from "../model-profile/model-profile.controller.js";
import {
  createProductInputSchema,
  productDeletionSchema,
  productDetailSchema,
  productSummarySchema,
  updateProductInputSchema,
  workspaceOverviewSchema,
} from "../products/product.controller.js";
import {
  agentCommandSchema,
  agentMessageListSchema,
  agentMessageSchema,
  agentPlanningTraceSchema,
  agentSessionSchema,
  createSessionInputSchema,
  messageInputSchema,
} from "../agent/agent.controller.js";
export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routeCatalog) {
    const reserved = route.implementation === "reserved";
    const parameters: Array<Record<string, unknown>> = [
      ...route.path.matchAll(/\{([^}]+)\}/g),
    ].map((match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    if (route.idempotency)
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 16, maxLength: 128 },
      });
    if (route.ifMatch)
      parameters.push({
        name: "If-Match",
        in: "header",
        required: true,
        schema: { type: "string" },
      });
    if (route.implementation === "agent-sessions-list")
      parameters.push({
        name: "productId",
        in: "query",
        required: false,
        schema: {type: "string", format: "uuid"},
      });
    if (["agent-messages-list", "agent-trace-events-list"].includes(route.implementation))
      parameters.push(
        {name: "afterSequence", in: "query", required: false, schema: {type: "integer", minimum: 0, default: 0}},
        {name: "limit", in: "query", required: false, schema: {type: "integer", minimum: 1, maximum: 100, default: 50}},
      );
    const content = {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorEnvelope" },
      },
    };
    const responses: Record<string, unknown> = {
      default: {
        description:
          "Safe transport, authorization, ownership or dependency error",
        content,
      },
    };
    if (reserved)
      responses["503"] = {
        description:
          "CAPABILITY_NOT_IMPLEMENTED: no command, payment or successful business response is produced",
        content,
      };
    else {
      const modelProfile = route.implementation.startsWith("model-profile-");
      const graphCredential = route.implementation.startsWith("graph-credentials-");
      const dataSchema = modelProfile
        ? route.implementation === "model-profile-test"
          ? "ModelProfileTestResult"
          : "ModelProfile"
        : route.implementation === "wallet-access" || route.implementation === "wallet-hedera-create"
          ? "WalletAccess"
          : route.implementation === "graph-credentials-list"
            ? "GraphCredentialList"
            : graphCredential
              ? "GraphCredential"
              : route.implementation === "workspace-overview"
                ? "WorkspaceOverview"
                : route.implementation === "products-list"
                  ? "ProductList"
                  : route.implementation === "products-delete"
                    ? "ProductDeletion"
                  : ["products-create", "products-read", "products-update"].includes(route.implementation)
                    ? "ProductDetail"
                    : ["agent-sessions-create", "agent-sessions-read"].includes(route.implementation)
                      ? "AgentSession"
                      : route.implementation === "agent-sessions-list"
                        ? "AgentSessionList"
                        : route.implementation === "agent-messages-list"
                          ? "AgentMessageList"
                          : route.implementation === "agent-trace-events-list"
                            ? "AgentPlanningTrace"
                          : route.implementation === "agent-messages-submit"
                            ? "AgentCommand"
        : ["me", "bootstrap"].includes(route.implementation)
          ? "Bootstrap"
          : route.implementation === "app-config"
            ? "AppConfig"
            : "DemoEnvelope";
      responses[["graph-credentials-create", "products-create", "agent-sessions-create"].includes(route.implementation) ? "201" : "200"] = {
        description:
          route.implementation === "me"
            ? "Existing verified creator identity and owned workspaces"
            : route.implementation === "bootstrap"
              ? "Idempotently initialized creator identity and default workspace"
              : modelProfile
                ? "Authorized workspace model configuration without secret material"
                : route.implementation === "wallet-access" || route.implementation === "wallet-hedera-create"
                  ? "Authorized live wallet, balance, credential and readiness projection"
                  : route.implementation.startsWith("graph-credentials-")
                    ? "Authorized Graph credential metadata without raw secret material"
                    : route.implementation.startsWith("agent-")
                      ? "Authorized durable Agent conversation, sanitized planning evidence, or terminal command"
                    : "Actual server configuration; unsupported capabilities remain disabled",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["products-list", "agent-sessions-list"].includes(route.implementation)
                ? ["data", "page", "meta"]
                : ["data", "meta"],
              additionalProperties: false,
              properties: {
                data: {
                  $ref: `#/components/schemas/${dataSchema}`,
                },
                ...(["products-list", "agent-sessions-list"].includes(route.implementation)
                  ? {
                      page: {
                        type: "object",
                        additionalProperties: false,
                        required: ["nextCursor", "hasMore"],
                        properties: {
                          nextCursor: {type: ["string", "null"]},
                          hasMore: {type: "boolean"},
                        },
                      },
                    }
                  : {}),
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          },
        },
      };
    }
    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      parameters,
      responses,
      "x-sprue-implementation": reserved
        ? "reserved"
        : ["me", "bootstrap"].includes(route.implementation)
          ? "adapter-gated"
          : "implemented",
      security:
        route.audience === "creator"
          ? [{ privyBearer: [] }]
          : route.audience === "recovery"
            ? [{ requestAccess: [] }]
            : [],
    };
    if (
      route.implementation === "model-profile-write" ||
      route.implementation === "model-profile-test" ||
      route.implementation === "graph-credentials-create" ||
      route.implementation === "graph-credentials-validate" ||
      route.implementation === "graph-credentials-select" ||
      route.implementation === "graph-credentials-revoke" ||
      route.implementation === "wallet-hedera-create" ||
      route.implementation === "products-create" ||
      route.implementation === "products-update" ||
      route.implementation === "agent-sessions-create" ||
      route.implementation === "agent-messages-submit"
    ) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: route.implementation === "products-create"
              ? {$ref: "#/components/schemas/CreateProductInput"}
              : route.implementation === "products-update"
                ? {$ref: "#/components/schemas/UpdateProductInput"}
                : route.implementation === "agent-sessions-create"
                  ? {$ref: "#/components/schemas/CreateAgentSessionInput"}
                  : route.implementation === "agent-messages-submit"
                    ? {$ref: "#/components/schemas/AgentMessageInput"}
                : route.implementation === "wallet-hedera-create" ||
              route.implementation === "graph-credentials-validate" ||
              route.implementation === "graph-credentials-select" ||
              route.implementation === "graph-credentials-revoke"
              ? {type: "object", additionalProperties: false}
              : {$ref: route.implementation === "graph-credentials-create"
                  ? "#/components/schemas/GraphCredentialInput"
                  : "#/components/schemas/ModelProfileInput"},
          },
        },
      };
    }
    (paths[route.path] ??= {})[route.method.toLowerCase()] = operation;
  }
  for (const path of ["/healthz", "/readyz"])
    paths[path] = {
      get: {
        operationId: path.slice(1),
        security: [],
        responses: {
          "200": { description: "Minimal process/database status" },
          ...(path === "/readyz"
            ? {
                "503": {
                  description:
                    "Database migrations unavailable or process stopping",
                },
              }
            : {}),
        },
      },
    };
  return {
    openapi: "3.1.0",
    info: {
      title: "Sprue Backend Framework",
      version: "0.2.0",
      description:
        "Creator identity bootstrap and reads are adapter-gated. Other route reservations are not implemented business APIs.",
    },
    paths,
    components: {
      securitySchemes: {
        privyBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Privy access token",
        },
        requestAccess: {
          type: "apiKey",
          in: "header",
          name: "X-Sprue-Request-Access",
        },
      },
      schemas: {
        AppConfig: z.toJSONSchema(appConfigSchema),
        Bootstrap: z.toJSONSchema(bootstrapSchema),
        Meta: z.toJSONSchema(metaSchema),
        ErrorEnvelope: z.toJSONSchema(errorSchema),
        ModelProfileInput: z.toJSONSchema(modelProfileInputSchema),
        ModelProfile: z.toJSONSchema(modelProfileViewSchema),
        ModelProfileTestResult: z.toJSONSchema(modelProfileTestResultSchema),
        GraphCredentialInput: z.toJSONSchema(graphCredentialInputSchema),
        GraphCredential: z.toJSONSchema(graphCredentialViewSchema),
        GraphCredentialList: z.toJSONSchema(z.array(graphCredentialViewSchema)),
        WalletAccess: z.toJSONSchema(walletAccessViewSchema),
        WorkspaceOverview: z.toJSONSchema(workspaceOverviewSchema),
        ProductList: z.toJSONSchema(z.array(productSummarySchema)),
        ProductDetail: z.toJSONSchema(productDetailSchema),
        ProductDeletion: z.toJSONSchema(productDeletionSchema),
        CreateProductInput: z.toJSONSchema(createProductInputSchema),
        UpdateProductInput: z.toJSONSchema(updateProductInputSchema),
        AgentSession: z.toJSONSchema(agentSessionSchema),
        AgentSessionList: z.toJSONSchema(z.array(agentSessionSchema)),
        AgentMessage: z.toJSONSchema(agentMessageSchema),
        AgentMessageList: z.toJSONSchema(agentMessageListSchema),
        AgentPlanningTrace: z.toJSONSchema(agentPlanningTraceSchema),
        AgentCommand: z.toJSONSchema(agentCommandSchema),
        CreateAgentSessionInput: z.toJSONSchema(createSessionInputSchema),
        AgentMessageInput: z.toJSONSchema(messageInputSchema),
        DemoEnvelope: {
          type: "object",
          description: "A server-generated evaluator demo projection or action result.",
          additionalProperties: true,
        },
      },
    },
  };
}
