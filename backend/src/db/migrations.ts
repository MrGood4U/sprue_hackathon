import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export interface SqlClient {
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  exec(sql: string): Promise<unknown>;
}
export interface Migration { name: string; sql: string }
export const migrationDirectory = new URL("../../migrations/", import.meta.url);
const checksum = (sql: string) => createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");

export async function readMigrations(directory = migrationDirectory): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error("NO_MIGRATIONS");
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, directory), "utf8") })));
}

export async function migrationStatus(client: SqlClient, migrations: Migration[]) {
  const present = await client.query("SELECT to_regclass('public.sprue_migrations') AS journal");
  const applied = present.rows[0]?.journal ? (await client.query("SELECT name, checksum FROM sprue_migrations ORDER BY name")).rows : [];
  if (applied.length > migrations.length) throw new Error("UNKNOWN_APPLIED_MIGRATION");
  applied.forEach((row, index) => {
    const migration = migrations[index];
    if (!migration || row.name !== migration.name || row.checksum !== checksum(migration.sql)) throw new Error("MIGRATION_HISTORY_MISMATCH");
  });
  return { applied: applied.length, pending: migrations.slice(applied.length).map((migration) => migration.name) };
}

export async function migrate(client: SqlClient, migrations: Migration[]) {
  if (new Set(migrations.map((item) => item.name)).size !== migrations.length) throw new Error("DUPLICATE_MIGRATION_NAME");
  if (new Set(migrations.map((item) => item.name.slice(0, 4))).size !== migrations.length) throw new Error("DUPLICATE_MIGRATION_NUMBER");
  if (migrations.some((item, index) => !/^\d{4}_[a-z_]+\.sql$/.test(item.name) || index > 0 && item.name <= migrations[index - 1]!.name)) throw new Error("INVALID_MIGRATION_ORDER");
  // A session lock and all transactions use the same dedicated client, never pool.query.
  await client.query("SELECT pg_advisory_lock(1397772853, 1)");
  try {
    await client.exec("CREATE TABLE IF NOT EXISTS sprue_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const status = await migrationStatus(client, migrations);
    for (const migration of migrations.slice(status.applied)) {
      await client.exec("BEGIN");
      try {
        await client.exec(migration.sql);
        await client.query("INSERT INTO sprue_migrations (name, checksum) VALUES ($1, $2)", [migration.name, checksum(migration.sql)]);
        await client.exec("COMMIT");
      } catch (error) {
        await client.exec("ROLLBACK");
        throw error;
      }
    }
    return await migrationStatus(client, migrations);
  } finally {
    await client.query("SELECT pg_advisory_unlock(1397772853, 1)");
  }
}
