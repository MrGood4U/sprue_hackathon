import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  migrate,
  readMigrations,
  type SqlClient,
} from "../src/db/migrations.js";
import { checkReadiness } from "../src/db/readiness.js";
import { identityRepository } from "../src/db/identity-repository.js";
import { IdentityService } from "../src/modules/identity/service.js";
import { AppError } from "../src/shared/errors.js";
test("identity projection and owner authorization read real isolated SQL without writes", async () => {
  const db = new PGlite();
  const client: SqlClient = {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
  try {
    const migrations = await readMigrations();
    assert.equal(await checkReadiness(client, migrations), false);
    await migrate(client, migrations);
    assert.equal(await checkReadiness(client, migrations), true);
    const user = randomUUID(),
      workspace = randomUUID();
    await db.exec("BEGIN");
    await db.query(
      "INSERT INTO users(id,display_name,status) VALUES ($1,'Test creator','active')",
      [user],
    );
    await db.query(
      `INSERT INTO auth_identities(user_id,provider,provider_subject,status)
      VALUES ($1,'privy','test-subject','active')`,
      [user],
    );
    await db.query(
      "INSERT INTO workspaces(id,owner_user_id,slug,name,status) VALUES ($1,$2,'test','Test workspace','active')",
      [workspace, user],
    );
    await db.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES ($1,$2,'owner','active')",
      [workspace, user],
    );
    await db.exec("COMMIT");
    const identity = new IdentityService(identityRepository(client));
    const result = await identity.me({
      provider: "privy",
      subject: "test-subject",
    });
    assert.equal(result.user.id, user);
    assert.equal(result.defaultWorkspaceId, workspace);
    assert.equal(result.workspaces[0]!.role, "owner");
    assert.equal(JSON.stringify(result).includes("test-subject"), false);
    await identity.requireOwner(
      { provider: "privy", subject: "test-subject" },
      workspace,
    );
    await assert.rejects(
      identity.requireOwner(
        { provider: "privy", subject: "different-subject" },
        workspace,
      ),
      (error: unknown) =>
        error instanceof AppError && error.code === "RESOURCE_NOT_FOUND",
    );
    await assert.rejects(
      identity.me({ provider: "privy", subject: "unknown" }),
      (error: unknown) =>
        error instanceof AppError && error.code === "BOOTSTRAP_REQUIRED",
    );
    await db.query("UPDATE workspaces SET status='suspended' WHERE id=$1", [
      workspace,
    ]);
    await assert.rejects(
      identity.requireOwner(
        { provider: "privy", subject: "test-subject" },
        workspace,
      ),
      (error: unknown) =>
        error instanceof AppError && error.code === "WORKSPACE_SUSPENDED",
    );
    const count = await db.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM control_commands",
    );
    assert.equal(count.rows[0]!.count, 0);
    await assert.rejects(
      checkReadiness(
        client,
        migrations.map((item, index) =>
          index ? item : { ...item, sql: item.sql + "\n-- mismatch" },
        ),
      ),
      /MIGRATION_HISTORY_MISMATCH/,
    );
  } finally {
    await db.close();
  }
});
