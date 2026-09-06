import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { migrate, migrationStatus, readMigrations, type SqlClient } from "../src/db/migrations.js";
import { checkSchema } from "../src/db/check-schema.js";
import { seedReferenceData } from "../src/db/seed.js";
import { databaseConfig } from "../src/db/client.js";
import * as schema from "../src/db/schema/index.js";

test("auth identity migration preserves existing Sprue user IDs", async () => {
  const db = new PGlite();
  const client: SqlClient = { query: (sql, parameters) => db.query(sql, parameters), exec: (sql) => db.exec(sql) };
  try {
    const migrations = await readMigrations();
    const identityMigration = migrations.at(-1);
    assert.equal(identityMigration?.name, "0016_auth_identities.sql");
    await migrate(client, migrations.slice(0, -1));

    const userId = randomUUID();
    await db.query(
      `INSERT INTO users(id,auth_provider,auth_subject,status)
      VALUES ($1,'privy','did:privy:existing','active')`,
      [userId],
    );
    await migrate(client, migrations);

    const users = await db.query<{ id: string }>("SELECT id FROM users");
    assert.deepEqual(users.rows, [{ id: userId }]);
    const identities = await db.query<{
      user_id: string;
      provider: string;
      provider_subject: string;
    }>("SELECT user_id,provider,provider_subject FROM auth_identities");
    assert.deepEqual(identities.rows, [{
      user_id: userId,
      provider: "privy",
      provider_subject: "did:privy:existing",
    }]);
    const oldColumns = await db.query<{ count: number }>(
      `SELECT count(*)::integer AS count
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users'
        AND column_name IN ('auth_provider','auth_subject')`,
    );
    assert.equal(oldColumns.rows[0]!.count, 0);
  } finally {
    await db.close();
  }
});

test("all migrations initialize empty isolated PostgreSQL, repeat safely and match Drizzle", async () => {
  const db = new PGlite();
  const client: SqlClient = { query: (sql, parameters) => db.query(sql, parameters), exec: (sql) => db.exec(sql) };
  try {
    const migrations = await readMigrations();
    assert.equal((await migrationStatus(client, migrations)).applied, 0);
    await migrate(client, migrations);
    assert.equal((await migrate(client, migrations)).pending.length, 0);
    const checked = await checkSchema(client);
    assert.equal(checked.tables, 52);
    console.log(`Verified ${checked.tables} tables and ${checked.columns} columns on ${(await db.query<{version:string}>("SELECT version() AS version")).rows[0]?.version}`);
    await seedReferenceData(client);
    await seedReferenceData(client);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM networks")).rows[0]?.count, 3);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM assets")).rows[0]?.count, 1);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM account_wallets")).rows[0]?.count, 0);
    const altered = migrations.map((item, index) => index ? item : { ...item, sql: item.sql + "\n-- drift" });
    await assert.rejects(migrate(client, altered), /MIGRATION_HISTORY_MISMATCH/);
    const broken = [...migrations, { name: "9999_failure.sql", sql: "CREATE TABLE must_rollback(id integer); SELECT missing_function();" }];
    await assert.rejects(migrate(client, broken));
    assert.equal((await db.query<{name:string|null}>("SELECT to_regclass('must_rollback') AS name")).rows[0]?.name, null);
    assert.equal((await migrationStatus(client, migrations)).applied, migrations.length);
  } finally { await db.close(); }
});

test("every reviewed model table and field exists in the typed schema", async () => {
  const model = (await readFile(new URL("../../data-model.md", import.meta.url), "utf8")).replace(/\r\n/g,"\n");
  const sections = model.split(/^#### `([a-z_]+)`\s*$/m);
  const actual = new Map(Object.values(schema).map((table) => { const config=getTableConfig(table); return [config.name, config.columns.map((column)=>column.name).sort()]; }));
  for (let i=1; i<sections.length; i+=2) {
    const name=sections[i]!;
    const columns=[...sections[i+1]!.matchAll(/^\| `([a-z_]+)` \| `[^`]+` \| (?:yes|no) \|/gm)].map((match)=>match[1]!).sort();
    assert.deepEqual(actual.get(name), columns, name);
    actual.delete(name);
  }
  assert.equal(actual.size, 0);
});

test("database configuration requires explicit credentials and preserves TLS verification", () => {
  assert.throws(()=>databaseConfig({}), /DATABASE_URL_REQUIRED/);
  assert.throws(()=>databaseConfig({DATABASE_URL:"https://example.test/db"}), /INVALID_DATABASE_URL/);
  assert.equal(databaseConfig({DATABASE_URL:"postgresql://u:p@localhost/db"}).ssl,false);
  assert.deepEqual(databaseConfig({DATABASE_URL:"postgresql://u:p@db.example/db"}).ssl,{rejectUnauthorized:true});
  assert.throws(()=>databaseConfig({DATABASE_URL:"postgresql://u:p@db.example/db?sslmode=no-verify"}));
});
