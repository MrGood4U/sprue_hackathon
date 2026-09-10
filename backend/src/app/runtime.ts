import pg from "pg";
import {createHash} from "node:crypto";
import type { Server } from "node:http";
import type { AppConfig } from "./config.js";
import type { Logger } from "../shared/logger.js";
import { readMigrations } from "../db/migrations.js";
import { databaseReadiness } from "../db/readiness.js";
import { identityRepository } from "../db/identity-repository.js";
import { IdentityService } from "../modules/identity/service.js";
import { unavailableIdentity } from "../integrations/unavailable-identity.js";
import { AuthService } from "../modules/auth/service.js";
import { postgresAuthRepository } from "../modules/auth/postgres-repository.js";
import { privyIdentityVerifier } from "../modules/auth/privy-verifier.js";
import { createHttpApp } from "../http/app.js";
import { standbyWorker } from "../jobs/worker-runtime.js";
import { DemoRuntime } from "../modules/demo/runtime.js";
import {ModelCredentialCipher} from "../modules/model-profile/cipher.js";
import {postgresModelProfileRepository} from "../modules/model-profile/postgres-repository.js";
import {ModelProfileService} from "../modules/model-profile/service.js";
import {GraphCredentialCipher} from "../modules/graph-credential/cipher.js";
import {postgresGraphCredentialRepository} from "../modules/graph-credential/postgres-repository.js";
import {GraphCredentialService} from "../modules/graph-credential/service.js";
import {graphCredentialValidator} from "../modules/graph-credential/validator.js";
import {postgresWalletRepository} from "../modules/wallet/postgres-repository.js";
import {privyWalletProvider} from "../modules/wallet/privy-provider.js";
import {hederaAccountProvider} from "../modules/wallet/hedera-provider.js";
import {WalletService} from "../modules/wallet/service.js";
import {postgresProductRepository} from "../modules/products/postgres-repository.js";
import {ProductService} from "../modules/products/service.js";
import {postgresAgentRepository} from "../modules/agent/postgres-repository.js";
import {AgentService} from "../modules/agent/service.js";
import {BuilderGraphSourceService} from "../modules/graph/builder-source-service.js";
import {RestrictedGraphMcpClient, SdkGraphMcpPlanningWire} from "../modules/graph/mcp-client.js";
import {DisabledGraphSchemaCache, RedisGraphSchemaCache} from "../modules/graph/schema-cache.js";
import { listen, drain } from "./server.js";
export async function startRuntime(
  config: AppConfig,
  role: "api" | "worker",
  logger: Logger,
) {
  const migrations = await readMigrations();
  const pool = new pg.Pool({
    ...config.database,
    connectionTimeoutMillis: 2000,
    statement_timeout: 2500,
  });
  pool.on("error", () => logger.write({ event: "pool_error", role }));
  let stopping = false;
  const worker = role === "worker" ? standbyWorker(logger) : null;
  const graphSchemaCache = role === "api"
    ? config.redis.enabled
      ? new RedisGraphSchemaCache(config.redis.url)
      : new DisabledGraphSchemaCache()
    : null;
  const modelProfiles = role === "api" && config.modelCredentialEncryption
    ? new ModelProfileService(
        postgresModelProfileRepository(pool),
        new ModelCredentialCipher(config.modelCredentialEncryption),
        config.agent.timeoutMs,
      )
    : undefined;
  const graphCredentials = role === "api" && config.modelCredentialEncryption
    ? new GraphCredentialService(
        postgresGraphCredentialRepository(pool),
        new GraphCredentialCipher(config.modelCredentialEncryption),
        graphCredentialValidator(),
      )
    : undefined;
  const demo = role === "api" && config.demoRuntimeEnabled
    ? new DemoRuntime(config, undefined, modelProfiles)
    : undefined;
  let listeningServer: Server | undefined;
  try {
    const verifier = config.privyAppId && config.privyAppSecret
      ? privyIdentityVerifier(config.privyAppId, config.privyAppSecret)
      : unavailableIdentity;
    const authRepository = postgresAuthRepository(async () => {
        const client = await pool.connect();
        return {
          query: (sql, parameters) => client.query(sql, parameters),
          release: () => client.release(),
        };
      });
    const wallets = config.privyAppId && config.privyAppSecret
      ? new WalletService(
          postgresWalletRepository(pool),
          privyWalletProvider(config.privyAppId, config.privyAppSecret, undefined, {
            logger,
          }),
          graphCredentials,
          {
            provider: hederaAccountProvider(
              {
                mirrorNodeUrl: config.hedera.mirrorNodeUrl,
                faucetUrl: config.hedera.faucetUrl,
                portalPat: config.hedera.portalPat,
                faucetAmountHbar: config.hedera.faucetAmountHbar,
              },
              {logger},
            ),
            commandFingerprintKey: createHash("sha256")
              .update("sprue-hedera-activation-v1\0")
              .update(config.hedera.portalPat ?? config.privyAppSecret)
              .digest(),
            fingerprintKeyVersion: "hedera-activation-v1",
          },
        )
      : undefined;
    const products = config.privyAppSecret
      ? new ProductService(
          postgresProductRepository(pool),
          createHash("sha256")
            .update("sprue-product-command-v1\0")
            .update(config.privyAppSecret)
            .digest(),
          "product-command-v1",
        )
      : undefined;
    const agents = config.privyAppSecret && modelProfiles && graphCredentials
      ? new AgentService(
          postgresAgentRepository(pool),
          modelProfiles,
          graphCredentials,
          createHash("sha256")
            .update("sprue-agent-command-v1\0")
            .update(config.privyAppSecret)
            .digest(),
          "agent-command-v1",
          undefined,
          logger,
          config.agent.debug,
          config.graph.gatewayEnvironment,
          graphSchemaCache ?? undefined,
          config.agent.runTimeoutMs,
          config.embedding,
        )
      : undefined;
    const builderSources = graphCredentials
      ? new BuilderGraphSourceService(
          graphCredentials,
          (graphApiKey) => new RestrictedGraphMcpClient(new SdkGraphMcpPlanningWire({
            gatewayApiKey: graphApiKey,
            gatewayEnvironment: config.graph.gatewayEnvironment,
            timeoutMs: config.agent.timeoutMs,
          })),
        )
      : undefined;
    const auth = new AuthService(authRepository, wallets, logger);
    const app = createHttpApp(
      {
        config,
        logger,
        verifier,
        auth,
        identity: new IdentityService(identityRepository(pool)),
        demo,
        modelProfiles,
        graphCredentials,
        wallets,
        products,
        agents,
        builderSources,
        ready: databaseReadiness(pool, migrations),
        stopping: () => stopping,
      },
      role,
    );
    const server = await listen(
      app,
      config.host,
      role === "api" ? config.port : config.workerPort,
    );
    listeningServer = server;
    await worker?.start();
    logger.write({ event: "listening", role });
    let shutdown: Promise<void> | undefined;
    return {
      server,
      stop: () =>
        (shutdown ??= (async () => {
          stopping = true;
          logger.write({ event: "stopping", role });
          try {
            await drain(server);
            await worker?.stop();
          } finally {
            await graphSchemaCache?.close();
            await pool.end();
            logger.write({ event: "stopped", role });
          }
        })()),
    };
  } catch (error) {
    if (listeningServer) await drain(listeningServer);
    await graphSchemaCache?.close();
    await pool.end();
    throw error;
  }
}
