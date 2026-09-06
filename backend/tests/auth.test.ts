import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { InvalidAuthTokenError } from "@privy-io/node";
import { migrate, readMigrations, type SqlClient } from "../src/db/migrations.js";
import { AuthService } from "../src/modules/auth/service.js";
import { postgresAuthRepository } from "../src/modules/auth/postgres-repository.js";
import { privyIdentityVerifier } from "../src/modules/auth/privy-verifier.js";
import { AppError } from "../src/shared/errors.js";

test("Privy access-token verification accepts only signed provider claims", async () => {
  const verifier = privyIdentityVerifier("app-test", "server-only", {
    async verifyAccessToken(token) {
      if (token === "expired")
        throw new InvalidAuthTokenError("Authentication token expired");
      if (token === "invalid")
        throw new InvalidAuthTokenError("Authentication token is invalid");
      return {
        app_id: token === "wrong-app" ? "other" : "app-test",
        issuer: "privy.io",
        issued_at: 1,
        expiration: 2,
        session_id: "session-test",
        user_id: "did:privy:test-user",
      };
    },
  });
  assert.deepEqual(await verifier.verify("valid"), {
    provider: "privy",
    subject: "did:privy:test-user",
  });
  await assert.rejects(
    verifier.verify("expired"),
    (error: unknown) => error instanceof AppError && error.code === "AUTH_EXPIRED",
  );
  for (const token of ["invalid", "wrong-app"])
    await assert.rejects(
      verifier.verify(token),
      (error: unknown) => error instanceof AppError && error.code === "AUTH_REQUIRED",
    );
});

test("provider identities resolve to a stable Sprue account and owner workspace", async () => {
  const db = new PGlite();
  const client: SqlClient = {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
  try {
    await migrate(client, await readMigrations());
    const auth = new AuthService(
      postgresAuthRepository(async () => ({
        query: (sql, parameters) => db.query(sql, parameters),
        release() {},
      })),
    );
    const firstIdentity = {
      provider: "privy",
      subject: "did:privy:first-login",
    };
    const first = await auth.bootstrap(firstIdentity);
    const second = await auth.bootstrap(firstIdentity);
    assert.deepEqual(second, first);
    assert.match(first.workspaces[0]!.slug, /^workspace-[0-9a-f]{12}$/);
    const counts = await db.query<{
      users: number;
      identities: number;
      workspaces: number;
      members: number;
    }>(`SELECT
      (SELECT count(*)::integer FROM users) AS users,
      (SELECT count(*)::integer FROM auth_identities) AS identities,
      (SELECT count(*)::integer FROM workspaces) AS workspaces,
      (SELECT count(*)::integer FROM workspace_members) AS members`);
    assert.deepEqual(counts.rows[0], {
      users: 1,
      identities: 1,
      workspaces: 1,
      members: 1,
    });

    await db.query(
      `INSERT INTO auth_identities(user_id,provider,provider_subject,status)
      VALUES ($1,'privy','did:privy:linked-login','active')`,
      [first.user.id],
    );
    const linked = await auth.bootstrap({
      provider: "privy",
      subject: "did:privy:linked-login",
    });
    assert.deepEqual(linked, first);
    const linkedCounts = await db.query<{ users: number; identities: number }>(
      `SELECT
      (SELECT count(*)::integer FROM users) AS users,
      (SELECT count(*)::integer FROM auth_identities) AS identities`,
    );
    assert.deepEqual(linkedCounts.rows[0], { users: 1, identities: 2 });

    const conflictingUserId = randomUUID();
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [
      conflictingUserId,
    ]);
    await assert.rejects(
      db.query(
        `INSERT INTO auth_identities(user_id,provider,provider_subject,status)
        VALUES ($1,'privy','did:privy:linked-login','active')`,
        [conflictingUserId],
      ),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === "23505",
    );

    const revokedId = randomUUID();
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [revokedId]);
    await db.query(
      `INSERT INTO auth_identities(user_id,provider,provider_subject,status,revoked_at)
      VALUES ($1,'privy','did:privy:revoked','revoked',now())`,
      [revokedId],
    );
    await assert.rejects(
      auth.bootstrap({ provider: "privy", subject: "did:privy:revoked" }),
      (error: unknown) =>
        error instanceof AppError && error.code === "AUTH_REQUIRED",
    );

    const blockedId = randomUUID();
    await db.query(
      "INSERT INTO users(id,status) VALUES ($1,'suspended')",
      [blockedId],
    );
    await db.query(
      `INSERT INTO auth_identities(user_id,provider,provider_subject,status)
      VALUES ($1,'privy','did:privy:blocked','active')`,
      [blockedId],
    );
    await assert.rejects(
      auth.bootstrap({ provider: "privy", subject: "did:privy:blocked" }),
      (error: unknown) =>
        error instanceof AppError && error.code === "USER_SUSPENDED",
    );
    const blockedWorkspaces = await db.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM workspaces WHERE owner_user_id=$1",
      [blockedId],
    );
    assert.equal(blockedWorkspaces.rows[0]!.count, 0);
  } finally {
    await db.close();
  }
});
