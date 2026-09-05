import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import pg from "pg";
import { parseConfig } from "../src/app/config.js";
import { startRuntime } from "../src/app/runtime.js";
import { checkSchema } from "../src/db/check-schema.js";
import { migrationStatus, readMigrations } from "../src/db/migrations.js";

// Opt-in, read-only native smoke test. Ignore ambient DATABASE_URL and never migrate.
const local = parseEnv(
  await readFile(new URL("../../.env.local", import.meta.url), "utf8"),
);
if (
  !/^[a-fA-F0-9]{64}$/.test(local.POSTGRES_PASSWORD ?? "") ||
  !/^\d{4,5}$/.test(local.POSTGRES_PORT ?? "")
) {
  throw new Error("INVALID_LOCAL_DATABASE_CONFIGURATION");
}
const config = parseConfig({
  NODE_ENV: "test",
  DEPLOYMENT_ENVIRONMENT: "local",
  HOST: "127.0.0.1",
  DATABASE_URL: `postgresql://sprue:${local.POSTGRES_PASSWORD}@127.0.0.1:${local.POSTGRES_PORT}/sprue`,
  DATABASE_SSL_MODE: "disable",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
});
const pool = new pg.Pool(config.database);
try {
  const client = await pool.connect();
  try {
    const sql = {
      query: (text: string, values?: unknown[]) => client.query(text, values),
      exec: (text: string) => client.query(text),
    };
    const version = (await client.query("SHOW server_version_num")).rows[0]
      .server_version_num;
    assert.ok(Number(version) >= 170000 && Number(version) < 180000);
    assert.deepEqual(await migrationStatus(sql, await readMigrations()), {
      applied: 15,
      pending: [],
    });
    assert.deepEqual(await checkSchema(sql), { tables: 51, columns: 699 });
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

for (const role of ["api", "worker"] as const) {
  const runtime = await startRuntime(
    { ...config, port: 0, workerPort: 0 },
    role,
    { write() {} },
  );
  try {
    const address = runtime.server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/readyz`)).status, 200);
    assert.equal(
      (await fetch(`${base}/api/v1/app-config`)).status,
      role === "api" ? 200 : 404,
    );
  } finally {
    await Promise.all([runtime.stop(), runtime.stop()]);
  }
  assert.equal(runtime.server.listening, false);
}
console.log(
  "Native Node API/worker, PostgreSQL 17 schema, 15 migrations, readiness and shutdown passed. No database writes or provider calls were made.",
);
