import { z } from "zod";
import { routeCatalog } from "./catalog.js";
import {
  appConfigSchema,
  bootstrapSchema,
  errorSchema,
  metaSchema,
} from "./common.js";
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
    else
      responses["200"] = {
        description:
          route.implementation === "me"
            ? "Existing verified creator identity and owned workspaces"
            : route.implementation === "bootstrap"
              ? "Idempotently initialized creator identity and default workspace"
            : "Actual server configuration; capabilities remain disabled",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data", "meta"],
              additionalProperties: false,
              properties: {
                data: {
                  $ref: `#/components/schemas/${["me", "bootstrap"].includes(route.implementation) ? "Bootstrap" : route.implementation === "app-config" ? "AppConfig" : "DemoEnvelope"}`,
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          },
        },
      };
    (paths[route.path] ??= {})[route.method.toLowerCase()] = {
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
        DemoEnvelope: {
          type: "object",
          description: "A server-generated evaluator demo projection or action result.",
          additionalProperties: true,
        },
      },
    },
  };
}
