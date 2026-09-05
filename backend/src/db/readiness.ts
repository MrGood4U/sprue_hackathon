import type pg from "pg";
import {
  migrationStatus,
  type Migration,
  type SqlClient,
} from "./migrations.js";
export async function checkReadiness(
  client: SqlClient,
  migrations: Migration[],
): Promise<boolean> {
  await client.query("SELECT 1");
  const status = await migrationStatus(client, migrations);
  return status.applied === migrations.length && status.pending.length === 0;
}
export function databaseReadiness(pool: pg.Pool, migrations: Migration[]) {
  let pending: Promise<boolean> | undefined;
  let checkedAt = 0;
  let lastResult = false;
  return async () => {
    if (pending) return pending;
    if (Date.now() - checkedAt < 1000) return lastResult;
    pending = (async () => {
      const client = await pool.connect();
      try {
        return await checkReadiness(
          {
            query: (sql, args) => client.query(sql, args),
            exec: (sql) => client.query(sql),
          },
          migrations,
        );
      } finally {
        client.release();
      }
    })().catch(() => false);
    try {
      lastResult = await pending;
      checkedAt = Date.now();
      return lastResult;
    } finally {
      pending = undefined;
    }
  };
}
