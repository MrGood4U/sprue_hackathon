import pg from "pg";
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
  const demo = role === "api" && config.demoRuntimeEnabled
    ? new DemoRuntime(config)
    : undefined;
  let listeningServer: Server | undefined;
  try {
    const verifier = config.privyAppId && config.privyAppSecret
      ? privyIdentityVerifier(config.privyAppId, config.privyAppSecret)
      : unavailableIdentity;
    const auth = new AuthService(
      postgresAuthRepository(async () => {
        const client = await pool.connect();
        return {
          query: (sql, parameters) => client.query(sql, parameters),
          release: () => client.release(),
        };
      }),
    );
    const app = createHttpApp(
      {
        config,
        logger,
        verifier,
        auth,
        identity: new IdentityService(identityRepository(pool)),
        demo,
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
            await pool.end();
            logger.write({ event: "stopped", role });
          }
        })()),
    };
  } catch (error) {
    if (listeningServer) await drain(listeningServer);
    await pool.end();
    throw error;
  }
}
