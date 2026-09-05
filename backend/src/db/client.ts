import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";
import type { SqlClient } from "./migrations.js";

export function databaseConfig(environment: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  let url: URL;
  try { url = new URL(environment.DATABASE_URL); } catch { throw new Error("INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error("INVALID_DATABASE_URL");
  const local = ["localhost", "127.0.0.1", "[::1]", "postgres"].includes(url.hostname);
  const sslMode = environment.DATABASE_SSL_MODE ?? url.searchParams.get("sslmode") ?? (local ? "disable" : "verify-full");
  if (!["disable", "verify-full"].includes(sslMode)) throw new Error("DATABASE_SSL_MODE_MUST_BE_DISABLE_OR_VERIFY_FULL");
  for (const key of url.searchParams.keys()) if (key.startsWith("ssl") && key !== "sslmode") throw new Error("UNSUPPORTED_DATABASE_SSL_PARAMETER");
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: sslMode === "disable" ? false : { rejectUnauthorized: true }, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 30000 };
}

export function createDatabase(environment = process.env) {
  const pool = new pg.Pool(databaseConfig(environment));
  return { pool, db: drizzle(pool, { schema }) };
}

export async function withDatabase<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
  if (existsSync(".env")) loadEnvFile(".env");
  const { pool } = createDatabase();
  try {
    const client = await pool.connect();
    try {
      return await work({ query: (sql, parameters) => client.query(sql, parameters), exec: (sql) => client.query(sql) });
    } finally { client.release(); }
  } finally { await pool.end(); }
}

export function reportDatabaseError(error: unknown) {
  // Never print a connection URL, parameters, server DETAIL or raw provider exception.
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "DATABASE_OPERATION_FAILED";
  process.stderr.write(`Database operation failed (${/^[A-Z0-9_]+$/.test(code) ? code : "DATABASE_OPERATION_FAILED"}). Check configuration and migration status.\n`);
  process.exitCode = 1;
}
