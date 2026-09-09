import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {migrate, readMigrations, type SqlClient} from "../src/db/migrations.js";
import {seedReferenceData} from "../src/db/seed.js";
import {ProductNotFoundError} from "../src/modules/products/contracts.js";
import {postgresProductRepository} from "../src/modules/products/postgres-repository.js";
import {ProductService} from "../src/modules/products/service.js";

function clientFor(db: PGlite): SqlClient {
  return {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
}

async function insert(
  db: PGlite,
  table: string,
  fields: Record<string, unknown>,
) {
  const names = Object.keys(fields);
  assert.ok([table, ...names].every((name) => /^[a-z_]+$/.test(name)));
  const values = Object.values(fields).map((value) =>
    typeof value === "object" && value !== null ? JSON.stringify(value) : value,
  );
  return (await db.query<Record<string, unknown>>(
    `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`,
    values,
  )).rows[0]!;
}

test("product delivery projects only durable API and monetization facts", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    await seedReferenceData(client);
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const foreignWorkspaceId = randomUUID();
    const walletId = randomUUID();
    await db.exec("BEGIN");
    await insert(db, "users", {id: userId, status: "active"});
    await insert(db, "workspaces", {id: workspaceId, owner_user_id: userId, slug: `workspace-${workspaceId}`, name: "Delivery workspace", status: "active"});
    await insert(db, "workspace_members", {workspace_id: workspaceId, user_id: userId, role: "owner", status: "active"});
    await insert(db, "workspaces", {id: foreignWorkspaceId, owner_user_id: userId, slug: `foreign-${foreignWorkspaceId}`, name: "Foreign workspace", status: "active"});
    await insert(db, "workspace_members", {workspace_id: foreignWorkspaceId, user_id: userId, role: "owner", status: "active"});
    await insert(db, "account_wallets", {
      id: walletId,
      workspace_id: workspaceId,
      owner_user_id: userId,
      provider: "privy",
      provider_wallet_id: `wallet-${walletId}`,
      provider_chain_type: "ethereum",
      provider_owner_id: `did:privy:${userId}`,
      provider_owner_type: "user",
      control_model: "user_owned",
      status: "active",
    });
    const product = await insert(db, "data_products", {
      workspace_id: workspaceId,
      creator_user_id: userId,
      account_wallet_id: walletId,
      slug: `delivery-${randomUUID()}`,
      name: "Live delivery product",
      original_intent: "Return real activity rows",
      status: "draft",
    });
    await db.exec("COMMIT");

    const service = new ProductService(
      postgresProductRepository(client),
      Buffer.alloc(32, 4),
      "test-v1",
    );
    const empty = await service.delivery(workspaceId, String(product.id));
    assert.equal(empty.api.readiness, "no_version");
    assert.equal(empty.api.contract, null);
    assert.deepEqual(empty.monetization.revenue.grossSales, []);
    assert.equal(empty.monetization.readiness, "api_not_ready");
    await assert.rejects(
      service.delivery(foreignWorkspaceId, String(product.id)),
      ProductNotFoundError,
    );

    const credential = await insert(db, "provider_credentials", {
      workspace_id: workspaceId,
      created_by_user_id: userId,
      provider: "the_graph",
      credential_type: "graph_api_key",
      ownership_model: "customer_supplied",
      billing_model: "customer_subscription",
      label: "Graph key",
      secret_ref: "test://redacted",
      secret_version: "test-v1",
      credential_fingerprint: "test-fingerprint",
      status: "active",
      validated_at: new Date().toISOString(),
    });
    const source = await insert(db, "source_snapshots", {
      workspace_id: workspaceId,
      provider: "the_graph",
      source_kind: "subgraph",
      gateway_target_type: "deployment_id",
      gateway_target_id: "test-deployment",
      provider_deployment_id: "test-deployment",
      data_network_ref: "eip155:1",
      schema_format: "graphql_sdl",
      schema_document: "type Query { swaps: [Swap!]! } type Swap { id: ID! }",
      schema_hash: "test-schema-hash",
      discovery_method: "graph_mcp",
      status: "validated",
      observed_at: new Date().toISOString(),
      validated_at: new Date().toISOString(),
    });
    const outputSchema = {fields: [{name: "wallet", type: "address"}, {name: "trade_count", type: "count"}]};
    const sourceSpec = {
      id: "source-1",
      sourceSnapshotId: source.id,
      adapterVersion: "test-v1",
      access: {mode: "customer_api_key", providerCredentialId: credential.id, gatewayEnvironment: "mainnet"},
    };
    const specification = {
      schemaVersion: 2,
      sources: [sourceSpec],
      dag: {
        nodes: [
          {id: "source", type: "source", operatorVersion: "test-v1", config: {sourceId: "source-1"}},
          {id: "output", type: "output", operatorVersion: "test-v1", config: {}},
        ],
        edges: [],
      },
      outputSchema,
    };
    const versionId = randomUUID();
    await db.exec("BEGIN");
    await insert(db, "data_product_versions", {
      id: versionId,
      data_product_id: product.id,
      version_no: 1,
      created_by_user_id: userId,
      spec_schema_version: 2,
      specification_json: specification,
      spec_hash: "test-spec-hash",
      output_schema_json: outputSchema,
      status: "proposed",
    });
    await insert(db, "data_product_version_sources", {
      data_product_version_id: versionId,
      source_key: "source-1",
      source_snapshot_id: source.id,
      access_mode: "customer_api_key",
      provider_credential_id: credential.id,
      gateway_environment: "mainnet",
      adapter_version: "test-v1",
      source_config_hash: "test-source-config-hash",
    });
    await db.exec("COMMIT");
    await db.query("UPDATE data_product_versions SET status='validating' WHERE id=$1", [versionId]);
    await db.query("UPDATE data_product_versions SET status='proposed',validated_at=now(),validation_summary_json='{\"passed\":true}' WHERE id=$1", [versionId]);
    await db.query("UPDATE data_product_versions SET status='building' WHERE id=$1", [versionId]);
    const run = await insert(db, "execution_runs", {
      workspace_id: workspaceId,
      data_product_id: product.id,
      data_product_version_id: versionId,
      run_type: "build",
      trigger_type: "user",
      idempotency_key: randomUUID(),
      spec_hash: "test-spec-hash",
      runtime_version: "test-v1",
      operator_registry_hash: "test-registry",
      adapter_versions_json: {graph: "test-v1"},
      status: "queued",
      queued_at: new Date().toISOString(),
    });
    await db.query("UPDATE execution_runs SET status='running',started_at=now() WHERE id=$1", [run.id]);
    await db.query("UPDATE execution_runs SET status='succeeded',finished_at=now() WHERE id=$1", [run.id]);
    const artifact = await insert(db, "artifacts", {
      workspace_id: workspaceId,
      execution_run_id: run.id,
      artifact_kind: "materialized_output",
      storage_kind: "inline_json",
      payload_json: [{wallet: "0x1234", trade_count: "7"}],
      schema_json: outputSchema,
      content_hash: "test-artifact-hash",
      row_count: 1,
      byte_count: 39,
    });
    const materialization = await insert(db, "materializations", {
      workspace_id: workspaceId,
      data_product_id: product.id,
      data_product_version_id: versionId,
      execution_run_id: run.id,
      artifact_id: artifact.id,
      status: "ready",
      source_freshness_at: new Date().toISOString(),
    });
    await db.query("UPDATE data_product_versions SET status='ready',ready_at=now() WHERE id=$1", [versionId]);
    const deployment = await insert(db, "deployments", {
      workspace_id: workspaceId,
      data_product_id: product.id,
      environment: "local",
      runtime_target: "shared_hosted",
      provider: "local",
      endpoint_slug: "live-delivery-product",
      public_base_url: "http://127.0.0.1:3001",
      status: "pending",
    });
    await db.query(
      "UPDATE deployments SET active_version_id=$1,active_materialization_id=$2,status='healthy',last_health_at=now() WHERE id=$3",
      [versionId, materialization.id, deployment.id],
    );

    const hedera = (await db.query<{id: string}>("SELECT id FROM networks WHERE namespace='hedera' AND reference='testnet'")).rows[0]!;
    const hbar = (await db.query<{id: string}>("SELECT id FROM assets WHERE network_id=$1 AND symbol='HBAR'", [hedera.id])).rows[0]!;
    const address = await insert(db, "wallet_addresses", {
      account_wallet_id: walletId,
      network_id: hedera.id,
      address_kind: "hedera_account_id",
      address: "0.0.12345",
      normalized_address: "0.0.12345",
      network_account_ref: "0.0.12345",
      identity_status: "resolved",
      account_completion_status: "complete",
      can_spend: true,
      can_receive: true,
      control_status: "verified",
      control_evidence_ref: "test://creator-confirmation",
      verified_at: new Date().toISOString(),
      status: "active",
    });
    await insert(db, "wallet_asset_capabilities", {
      wallet_address_id: address.id,
      asset_id: hbar.id,
      association_status: "not_required",
      can_receive: true,
      can_spend: true,
      evidence_source: "hedera_mirror_node",
      status: "active",
      observed_at: new Date().toISOString(),
    });
    await insert(db, "publication_versions", {
      deployment_id: deployment.id,
      revision_no: 1,
      access_mode: "x402",
      serve_mode: "materialized",
      network_id: hedera.id,
      asset_id: hbar.id,
      price_atomic: "20000000",
      recipient_wallet_address_id: address.id,
      payment_protocol_version: "2",
      payment_scheme: "exact",
      max_timeout_seconds: 120,
      facilitator: "blocky402",
      facilitator_config_ref: "test://blocky402",
      facilitator_capability_json: {networkFeePayerAddress: "0.0.456"},
      facilitator_capability_hash: "test-capability-hash",
      facilitator_capability_observed_at: new Date().toISOString(),
      service_fee_enabled: false,
      status: "draft",
    });

    const projected = await service.delivery(workspaceId, String(product.id));
    assert.deepEqual(projected.capabilities, {
      deploy: false,
      privateRequest: false,
      publishX402: false,
      publicRequest: false,
    });
    assert.equal(projected.api.readiness, "available");
    assert.equal(projected.api.contract?.endpointUrl, "http://127.0.0.1:3001/data/v1/live-delivery-product");
    assert.deepEqual(projected.api.contract?.responseSchema.outputSchema, outputSchema);
    assert.deepEqual((projected.api.contract?.exampleBody?.data as unknown[])[0], {wallet: "0x1234", trade_count: "7"});
    assert.equal(projected.monetization.readiness, "draft");
    assert.equal(projected.monetization.publication?.price?.amountAtomic, "20000000");
    assert.equal(projected.monetization.publication?.recipient?.networkAccountRef, "0.0.12345");
    assert.equal(projected.monetization.publication?.recipient?.canReceive, true);
    assert.deepEqual(projected.monetization.sales, []);
  } finally {
    await db.close();
  }
});
