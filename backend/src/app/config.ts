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
  GRAPH_SCHEMA_CACHE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  REDIS_URL: z.string().min(1).max(4096).optional(),
  API_BASE_URL: z.url(),
  CONSOLE_PUBLIC_URL: z.url(),
  DATA_PUBLIC_BASE_URL: z.url(),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  PRIVY_APP_ID: z.string().max(200).optional(),
  PRIVY_APP_SECRET: z.string().max(4096).optional(),
  MODEL_CREDENTIAL_KEYRING: z.string().max(32768).optional(),
  MODEL_CREDENTIAL_ACTIVE_KEY_ID: z.string().max(64).optional(),
  GRAPH_GATEWAY_ENVIRONMENT: z.literal("mainnet").default("mainnet"),
  HEDERA_NETWORK: z.literal("hedera:testnet").default("hedera:testnet"),
  HEDERA_MIRROR_NODE_URL: z
    .url()
    .default("https://testnet.mirrornode.hedera.com"),
  HEDERA_PORTAL_PAT: z.string().trim().max(4096).optional(),
  HEDERA_FAUCET_URL: z
    .literal("https://portal.hedera.com/api/disbursement/cli")
    .default("https://portal.hedera.com/api/disbursement/cli"),
  HEDERA_FAUCET_AMOUNT_HBAR: z.coerce.number().int().min(1).max(100).default(1),
  BLOCKY402_FACILITATOR_URL: z
    .url()
    .default("https://api.testnet.blocky402.com"),
  DEMO_RUNTIME_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AGENT_MODE: z.enum(["mock", "remote"]).default("mock"),
  AGENT_API_URL: z.url().optional(),
  AGENT_API_KEY: z.string().min(1).max(4096).optional(),
  AGENT_MODEL: z.string().trim().min(1).max(200).default("sprue-mock-planner"),
  AGENT_TIMEOUT_MS: z.coerce.number().int().min(250).max(120000).default(120000),
  AGENT_DEBUG: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export type AppConfig = ReturnType<typeof parseConfig>;
export class ConfigError extends Error {
  constructor(readonly fields: string[]) {
    super("INVALID_CONFIGURATION");
  }
}

function modelCredentialKeyring(raw: string | undefined, activeKeyId: string | undefined) {
  const configuredRaw = raw?.trim() || null;
  const configuredActiveKeyId = activeKeyId?.trim() || null;
  if (Boolean(configuredRaw) !== Boolean(configuredActiveKeyId)) {
    throw new ConfigError(["MODEL_CREDENTIAL_KEYRING", "MODEL_CREDENTIAL_ACTIVE_KEY_ID"]);
  }
  if (!configuredRaw || !configuredActiveKeyId) return null;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(configuredActiveKeyId)) {
    throw new ConfigError(["MODEL_CREDENTIAL_ACTIVE_KEY_ID"]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuredRaw);
  } catch {
    throw new ConfigError(["MODEL_CREDENTIAL_KEYRING"]);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(["MODEL_CREDENTIAL_KEYRING"]);
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (!entries.length || entries.length > 8) {
    throw new ConfigError(["MODEL_CREDENTIAL_KEYRING"]);
  }
  const keys = new Map<string, Buffer>();
  for (const [keyId, encoded] of entries) {
    if (
      !/^[A-Za-z0-9._-]{1,64}$/.test(keyId) ||
      typeof encoded !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(encoded)
    ) {
      throw new ConfigError(["MODEL_CREDENTIAL_KEYRING"]);
    }
    const key = Buffer.from(encoded, "base64url");
    if (key.byteLength !== 32 || key.toString("base64url") !== encoded) {
      throw new ConfigError(["MODEL_CREDENTIAL_KEYRING"]);
    }
    keys.set(keyId, key);
  }
  if (!keys.has(configuredActiveKeyId)) {
    throw new ConfigError(["MODEL_CREDENTIAL_ACTIVE_KEY_ID"]);
  }
  return {activeKeyId: configuredActiveKeyId, keys};
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
  let redisUrl: string | null = null;
  if (values.REDIS_URL) {
    try {
      const parsedRedisUrl = new URL(values.REDIS_URL);
      if (!["redis:", "rediss:"].includes(parsedRedisUrl.protocol) || !parsedRedisUrl.hostname || parsedRedisUrl.hash) {
        throw new Error("invalid Redis URL");
      }
      redisUrl = parsedRedisUrl.href;
    } catch {
      throw new ConfigError(["REDIS_URL"]);
    }
  }
  if (values.GRAPH_SCHEMA_CACHE_ENABLED && !redisUrl) {
    throw new ConfigError(["REDIS_URL"]);
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
  if (values.AGENT_MODE === "remote" && !values.AGENT_API_URL)
    throw new ConfigError(["AGENT_API_URL"]);
  if (values.AGENT_MODE === "remote" && !values.AGENT_API_KEY)
    throw new ConfigError(["AGENT_API_KEY"]);
  const privyAppId = values.PRIVY_APP_ID?.trim() || null;
  const privyAppSecret = values.PRIVY_APP_SECRET?.trim() || null;
  if (Boolean(privyAppId) !== Boolean(privyAppSecret))
    throw new ConfigError(["PRIVY_APP_ID", "PRIVY_APP_SECRET"]);
  const agentApiUrl = values.AGENT_API_URL
    ? publicUrl("AGENT_API_URL", values.AGENT_API_URL)
    : null;
  const modelCredentialEncryption = modelCredentialKeyring(
    values.MODEL_CREDENTIAL_KEYRING,
    values.MODEL_CREDENTIAL_ACTIVE_KEY_ID,
  );
  const hederaMirrorNodeUrl = publicUrl(
    "HEDERA_MIRROR_NODE_URL",
    values.HEDERA_MIRROR_NODE_URL,
  );
  const blocky402FacilitatorUrl = publicUrl(
    "BLOCKY402_FACILITATOR_URL",
    values.BLOCKY402_FACILITATOR_URL,
  );
  return {
    nodeEnvironment: values.NODE_ENV,
    environment: values.DEPLOYMENT_ENVIRONMENT,
    host: values.HOST,
    port: values.PORT,
    workerPort: values.WORKER_PORT,
    database,
    redis: values.GRAPH_SCHEMA_CACHE_ENABLED
      ? {enabled: true as const, url: redisUrl!}
      : {enabled: false as const, url: redisUrl},
    apiBaseUrl: publicUrl("API_BASE_URL", values.API_BASE_URL),
    consolePublicUrl,
    dataPublicBaseUrl: publicUrl(
      "DATA_PUBLIC_BASE_URL",
      values.DATA_PUBLIC_BASE_URL,
    ),
    allowedOrigins: [...new Set(origins)],
    privyAppId,
    privyAppSecret,
    demoRuntimeEnabled: values.DEMO_RUNTIME_ENABLED,
    modelCredentialEncryption,
    graph: {
      gatewayEnvironment: values.GRAPH_GATEWAY_ENVIRONMENT,
    },
    hedera: {
      network: values.HEDERA_NETWORK,
      evmChainId: 296,
      mirrorNodeUrl: hederaMirrorNodeUrl,
      portalPat: values.HEDERA_PORTAL_PAT || null,
      faucetUrl: values.HEDERA_FAUCET_URL,
      faucetAmountHbar: values.HEDERA_FAUCET_AMOUNT_HBAR,
      hbarAssetId: "0.0.0",
      hbarDecimals: 8,
      facilitatorUrl: blocky402FacilitatorUrl,
    },
    agent: {
      mode: values.AGENT_MODE,
      apiUrl: agentApiUrl,
      apiKey: values.AGENT_API_KEY ?? null,
      model: values.AGENT_MODEL,
      timeoutMs: values.AGENT_TIMEOUT_MS,
      debug: values.AGENT_DEBUG,
    },
  };
}
export function loadConfig() {
  if (existsSync(".env")) loadEnvFile(".env");
  return parseConfig(process.env);
}
