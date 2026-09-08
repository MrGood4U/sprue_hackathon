import assert from "node:assert/strict";
import {randomBytes, randomUUID} from "node:crypto";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {parseConfig, ConfigError} from "../src/app/config.js";
import {migrate, readMigrations, type SqlClient} from "../src/db/migrations.js";
import {ModelCredentialCipher} from "../src/modules/model-profile/cipher.js";
import {ModelProfileStorageError} from "../src/modules/model-profile/contracts.js";
import {postgresModelProfileRepository} from "../src/modules/model-profile/postgres-repository.js";
import {ModelProfileService} from "../src/modules/model-profile/service.js";

const configEnvironment = {
  NODE_ENV: "test",
  DEPLOYMENT_ENVIRONMENT: "local",
  DATABASE_URL: "postgresql://test:local-only@127.0.0.1:1/test",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
};

async function createOwner(db: PGlite) {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  await db.exec("BEGIN");
  try {
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [userId]);
    await db.query(
      "INSERT INTO workspaces(id,owner_user_id,slug,name,status) VALUES ($1,$2,$3,'Test workspace','active')",
      [workspaceId, userId, workspaceId],
    );
    await db.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES ($1,$2,'owner','active')",
      [workspaceId, userId],
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  return {userId, workspaceId};
}

test("model credential keyring configuration is explicit and versioned", () => {
  const key = randomBytes(32).toString("base64url");
  const configured = parseConfig({
    ...configEnvironment,
    MODEL_CREDENTIAL_KEYRING: JSON.stringify({"local-v1": key}),
    MODEL_CREDENTIAL_ACTIVE_KEY_ID: "local-v1",
  });
  assert.equal(configured.modelCredentialEncryption?.activeKeyId, "local-v1");
  assert.equal(configured.modelCredentialEncryption?.keys.get("local-v1")?.byteLength, 32);
  assert.equal(parseConfig(configEnvironment).modelCredentialEncryption, null);
  assert.throws(
    () => parseConfig({...configEnvironment, MODEL_CREDENTIAL_KEYRING: JSON.stringify({"local-v1": key})}),
    ConfigError,
  );
  assert.throws(
    () => parseConfig({
      ...configEnvironment,
      MODEL_CREDENTIAL_KEYRING: JSON.stringify({"local-v1": "not-a-key"}),
      MODEL_CREDENTIAL_ACTIVE_KEY_ID: "local-v1",
    }),
    ConfigError,
  );
});

test("model profiles persist encrypted keys, survive service restart, rotate, and isolate workspaces", async () => {
  const db = new PGlite();
  const client: SqlClient = {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
  try {
    await migrate(client, await readMigrations());
    const ownerA = await createOwner(db);
    const ownerB = await createOwner(db);
    const repository = postgresModelProfileRepository(client);
    const oldKey = Buffer.alloc(32, 3);
    const newKey = Buffer.alloc(32, 9);
    const firstService = new ModelProfileService(
      repository,
      new ModelCredentialCipher({
        activeKeyId: "old-v1",
        keys: new Map([["old-v1", oldKey]]),
      }),
      5000,
    );
    const secret = "sk-workspace-a-secret";
    const saved = await firstService.save(ownerA.workspaceId, ownerA.userId, {
      apiUrl: "https://models.example/v1/chat/completions",
      apiKey: secret,
      model: "workspace-a-model",
    });
    assert.equal(saved.configured, true);
    assert.equal(saved.hasApiKey, true);
    assert.equal(JSON.stringify(saved).includes(secret), false);

    const stored = await db.query<{
      api_key_ciphertext: Uint8Array;
      encryption_key_id: string;
      secret_version: number;
    }>(
      "SELECT api_key_ciphertext,encryption_key_id,secret_version FROM agent_model_profiles WHERE workspace_id=$1",
      [ownerA.workspaceId],
    );
    assert.equal(stored.rows[0]?.encryption_key_id, "old-v1");
    assert.equal(Buffer.from(stored.rows[0]!.api_key_ciphertext).includes(Buffer.from(secret)), false);

    const restartedService = new ModelProfileService(
      repository,
      new ModelCredentialCipher({
        activeKeyId: "new-v2",
        keys: new Map([
          ["old-v1", oldKey],
          ["new-v2", newKey],
        ]),
      }),
      5000,
    );
    assert.equal((await restartedService.resolve(ownerA.workspaceId))?.apiKey, secret);
    await restartedService.save(ownerA.workspaceId, ownerA.userId, {
      apiUrl: "https://models.example/v1/chat/completions",
      model: "workspace-a-model-v2",
    });
    const rotated = await db.query<{encryption_key_id: string; secret_version: number}>(
      "SELECT encryption_key_id,secret_version FROM agent_model_profiles WHERE workspace_id=$1",
      [ownerA.workspaceId],
    );
    assert.deepEqual(rotated.rows[0], {encryption_key_id: "new-v2", secret_version: 2});
    assert.equal((await restartedService.resolve(ownerA.workspaceId))?.apiKey, secret);

    assert.deepEqual(await restartedService.read(ownerB.workspaceId), {
      configured: false,
      protocol: "openai_compatible_chat_completions",
      apiUrl: "",
      model: "",
      hasApiKey: false,
      updatedAt: null,
    });
    await assert.rejects(
      restartedService.save(ownerA.workspaceId, ownerB.userId, {
        apiUrl: "https://models.example/v1/chat/completions",
        model: "foreign-update",
      }),
      (error: unknown) => (error as {code?: string}).code === "23514",
    );

    await db.query(
      "UPDATE agent_model_profiles SET encryption_auth_tag=$1 WHERE workspace_id=$2",
      [Buffer.alloc(16, 0), ownerA.workspaceId],
    );
    await assert.rejects(
      restartedService.resolve(ownerA.workspaceId),
      ModelProfileStorageError,
    );
  } finally {
    await db.close();
  }
});
