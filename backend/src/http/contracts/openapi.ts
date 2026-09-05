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
            ? "Existing identity, only with a configured verified identity adapter"
            : "Actual server configuration; capabilities remain disabled",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data", "meta"],
              additionalProperties: false,
              properties: {
                data: {
                  $ref: `#/components/schemas/${route.implementation === "me" ? "Bootstrap" : "AppConfig"}`,
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
        : route.implementation === "me"
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
        "Route reservations are not implemented business APIs. No configured production identity verifier, queue consumers or payments.",
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
      },
    },
  };
}
