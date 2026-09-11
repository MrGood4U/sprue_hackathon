import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {migrate, readMigrations, type SqlClient} from "../src/db/migrations.js";
import {
  ProductNotFoundError,
  ProductPreconditionError,
  ProductWalletNotFoundError,
} from "../src/modules/products/contracts.js";
import {postgresProductRepository} from "../src/modules/products/postgres-repository.js";
import {ProductService} from "../src/modules/products/service.js";
import {postgresAgentRepository} from "../src/modules/agent/postgres-repository.js";

function clientFor(db: PGlite): SqlClient {
  return {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
}

async function createOwnerAndWallet(db: PGlite, suffix: string) {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const walletId = randomUUID();
  await db.exec("BEGIN");
  try {
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [userId]);
    await db.query(
      "INSERT INTO workspaces(id,owner_user_id,slug,name,status) VALUES ($1,$2,$3,$4,'active')",
      [workspaceId, userId, `workspace-${suffix}-${workspaceId}`, `Workspace ${suffix}`],
    );
    await db.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES ($1,$2,'owner','active')",
      [workspaceId, userId],
    );
    await db.query(
      `INSERT INTO account_wallets(
        id,workspace_id,owner_user_id,provider,provider_wallet_id,
        provider_chain_type,provider_owner_id,provider_owner_type,
        control_model,status
      ) VALUES ($1,$2,$3,'privy',$4,'ethereum',$5,'user','user_owned','active')`,
      [walletId, workspaceId, userId, `wallet-${suffix}-${walletId}`, `did:privy:${suffix}`],
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  return {userId, workspaceId, walletId};
}

test("durable products create, replay, rename, delete, and remain workspace isolated", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    const ownerA = await createOwnerAndWallet(db, "a");
    const ownerB = await createOwnerAndWallet(db, "b");
    const service = new ProductService(
      postgresProductRepository(client, "http://127.0.0.1:3001/x402/v1"),
      Buffer.alloc(32, 7),
      "test-v1",
    );

    const emptyOverview = await service.overview(ownerA.workspaceId);
    assert.equal(emptyOverview.deployedProductCount, "0");
    assert.equal(emptyOverview.apiRequestCount, "0");
    assert.equal(emptyOverview.graphQueryCount, "0");
    assert.deepEqual(emptyOverview.graphExpenses, []);
    assert.deepEqual(emptyOverview.grossSales, []);

    const command = {
      workspaceId: ownerA.workspaceId,
      actorUserId: ownerA.userId,
      accountWalletId: ownerA.walletId,
      name: " New Product ",
      description: null,
      originalIntent: "   ",
      idempotencyKey: "create-product-command-0001",
    };
    const created = await service.create(command);
    assert.equal(created.name, "New Product");
    assert.equal(created.originalIntent, "");
    assert.equal(created.workspaceId, ownerA.workspaceId);
    assert.equal(created.lockVersion, 0);
    assert.match(created.slug, /^new-product-/);

    await db.query(
      `INSERT INTO usage_events (
        id,workspace_id,data_product_id,metric,quantity,unit,dimensions_json,recorded_at
      ) VALUES ($1,$2,$3,'provider_requests','7','requests',$4::jsonb,now())`,
      [randomUUID(), ownerA.workspaceId, created.id, {provider: "the_graph", accessMode: "api_key"}],
    );
    assert.equal((await service.overview(ownerA.workspaceId)).graphQueryCount, "7");

    const replayed = await service.create(command);
    assert.equal(replayed.id, created.id);
    assert.equal(
      (await db.query<{count: number}>("SELECT count(*)::int AS count FROM data_products")).rows[0]?.count,
      1,
    );

    const ownList = await service.list({workspaceId: ownerA.workspaceId, limit: 20});
    const foreignList = await service.list({workspaceId: ownerB.workspaceId, limit: 20});
    assert.deepEqual(ownList.items.map((item) => item.id), [created.id]);
    assert.deepEqual(foreignList.items, []);

    await assert.rejects(
      service.create({
        ...command,
        accountWalletId: ownerB.walletId,
        idempotencyKey: "create-product-command-0002",
      }),
      ProductWalletNotFoundError,
    );

    const renamed = await service.update({
      workspaceId: ownerA.workspaceId,
      productId: created.id,
      actorUserId: ownerA.userId,
      name: "Live product",
      expectedLockVersion: 0,
      idempotencyKey: "update-product-command-0001",
    });
    assert.equal(renamed.name, "Live product");
    assert.equal(renamed.lockVersion, 1);

    const renameReplay = await service.update({
      workspaceId: ownerA.workspaceId,
      productId: created.id,
      actorUserId: ownerA.userId,
      name: "Live product",
      expectedLockVersion: 0,
      idempotencyKey: "update-product-command-0001",
    });
    assert.equal(renameReplay.lockVersion, 1);
    await assert.rejects(
      service.update({
        workspaceId: ownerA.workspaceId,
        productId: created.id,
        actorUserId: ownerA.userId,
        name: "Stale update",
        expectedLockVersion: 0,
        idempotencyKey: "update-product-command-0002",
      }),
      ProductPreconditionError,
    );

    await assert.rejects(
      service.delete({
        workspaceId: ownerA.workspaceId,
        productId: created.id,
        actorUserId: ownerA.userId,
        expectedLockVersion: 0,
        idempotencyKey: "delete-product-command-stale",
      }),
      ProductPreconditionError,
    );

    await db.query(
      `INSERT INTO deployments (
        id,workspace_id,data_product_id,environment,runtime_target,provider,
        endpoint_slug,public_base_url,status,last_health_at
      ) VALUES ($1,$2,$3,'local','shared_hosted','local',$4,$5,'healthy',now())`,
      [randomUUID(), ownerA.workspaceId, created.id, `product-${created.id}`, "http://127.0.0.1:3001/data/v1"],
    );
    assert.equal((await service.overview(ownerA.workspaceId)).deployedProductCount, "1");

    const deleteCommand = {
      workspaceId: ownerA.workspaceId,
      productId: created.id,
      actorUserId: ownerA.userId,
      expectedLockVersion: 1,
      idempotencyKey: "delete-product-command-0001",
    };
    const deleted = await service.delete(deleteCommand);
    assert.equal(deleted.productId, created.id);
    assert.match(deleted.deletedAt, /^2026-|^20\d\d-/);
    assert.deepEqual(await service.delete(deleteCommand), deleted);
    assert.deepEqual((await service.list({workspaceId: ownerA.workspaceId, limit: 20})).items, []);
    assert.equal((await service.overview(ownerA.workspaceId)).deployedProductCount, "0");
    await assert.rejects(service.read(ownerA.workspaceId, created.id), ProductNotFoundError);
    await assert.rejects(
      service.update({
        workspaceId: ownerA.workspaceId,
        productId: created.id,
        actorUserId: ownerA.userId,
        name: "Invisible update",
        expectedLockVersion: 2,
        idempotencyKey: "update-deleted-product-0001",
      }),
      ProductNotFoundError,
    );
    const retained = await db.query<{deleted_at: string | null; count: number}>(
      `SELECT p.deleted_at,
        (SELECT count(*)::int FROM control_commands c
         WHERE c.operation='delete_data_product' AND c.subject_id=p.id) AS count
       FROM data_products p WHERE p.id=$1`,
      [created.id],
    );
    assert.ok(retained.rows[0]?.deleted_at);
    assert.equal(retained.rows[0]?.count, 1);

    const deletedProductSession = await postgresAgentRepository(client).createSession({
      id: randomUUID(),
      workspaceId: ownerA.workspaceId,
      actorUserId: ownerA.userId,
      productId: created.id,
      title: "Deleted product session",
      idempotencyKey: "create-agent-session-deleted-product-0001",
      requestFingerprint: "test-fingerprint",
      fingerprintKeyVersion: "test-v1",
    });
    assert.equal(deletedProductSession.kind, "not_found");
  } finally {
    await db.close();
  }
});
