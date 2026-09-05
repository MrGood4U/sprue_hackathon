import { z } from "zod";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { databaseConfig } from "../db/client.js";

const integer = (fallback: number) =>
  z.coerce.number().int().min(1).max(65535).default(fallback);
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DEPLOYMENT_ENVIRONMENT: z
    .enum(["local", "demo", "self_hosted"])
    .default("local"),
  HOST: z
    .string()
    .regex(/^[A-Za-z0-9.:[\]-]+$/)
    .default("127.0.0.1"),
  PORT: integer(3001),
  WORKER_PORT: integer(3002),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.enum(["disable", "verify-full"]).optional(),
  API_BASE_URL: z.url(),
  CONSOLE_PUBLIC_URL: z.url(),
  DATA_PUBLIC_BASE_URL: z.url(),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  PRIVY_APP_ID: z.string().max(200).optional(),
});
export type AppConfig = ReturnType<typeof parseConfig>;
export class ConfigError extends Error {
  constructor(readonly fields: string[]) {
    super("INVALID_CONFIGURATION");
  }
}
export function parseConfig(environment: NodeJS.ProcessEnv) {
  const result = schema.safeParse(environment);
  if (!result.success)
    throw new ConfigError([
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ]);
  const values = result.data;
  const publicUrl = (name: string, raw: string, originOnly = false) => {
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["https:", "http:"].includes(url.protocol) ||
      (url.protocol !== "https:" &&
        (values.DEPLOYMENT_ENVIRONMENT !== "local" || !loopback)) ||
      (originOnly && url.pathname !== "/")
    )
      throw new ConfigError([name]);
    return originOnly ? url.origin : url.href.replace(/\/$/, "");
  };
  let database;
  try {
    database = databaseConfig({
      DATABASE_URL: values.DATABASE_URL,
      DATABASE_SSL_MODE: values.DATABASE_SSL_MODE,
    });
  } catch {
    throw new ConfigError(["DATABASE_URL", "DATABASE_SSL_MODE"]);
  }
  const consolePublicUrl = publicUrl(
    "CONSOLE_PUBLIC_URL",
    values.CONSOLE_PUBLIC_URL,
  );
  const origins = values.CORS_ALLOWED_ORIGINS.split(",").map((value) => {
    try {
      return publicUrl("CORS_ALLOWED_ORIGINS", value.trim(), true);
    } catch {
      throw new ConfigError(["CORS_ALLOWED_ORIGINS"]);
    }
  });
  if (!origins.includes(new URL(consolePublicUrl).origin))
    throw new ConfigError(["CORS_ALLOWED_ORIGINS"]);
  if (
    values.NODE_ENV === "production" &&
    values.DEPLOYMENT_ENVIRONMENT === "local"
  )
    throw new ConfigError(["DEPLOYMENT_ENVIRONMENT"]);
  return {
    nodeEnvironment: values.NODE_ENV,
    environment: values.DEPLOYMENT_ENVIRONMENT,
    host: values.HOST,
    port: values.PORT,
    workerPort: values.WORKER_PORT,
    database,
    apiBaseUrl: publicUrl("API_BASE_URL", values.API_BASE_URL),
    consolePublicUrl,
    dataPublicBaseUrl: publicUrl(
      "DATA_PUBLIC_BASE_URL",
      values.DATA_PUBLIC_BASE_URL,
    ),
    allowedOrigins: [...new Set(origins)],
    privyAppId: values.PRIVY_APP_ID?.trim() || null,
  };
}
export function loadConfig() {
  if (existsSync(".env")) loadEnvFile(".env");
  return parseConfig(process.env);
}
