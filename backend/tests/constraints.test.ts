import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrate, readMigrations } from "../src/db/migrations.js";
import { seedReferenceData } from "../src/db/seed.js";

// Synthetic structural fixtures, never provider credentials or integration evidence.
test("database transaction, lineage and recovery contracts", async (t) => {
  const db = new PGlite();
  const client = { query: (sql: string, values?: unknown[]) => db.query<Record<string, unknown>>(sql, values), exec: (sql: string) => db.exec(sql) };
  const insert = async (table: string, fields: Record<string, unknown>) => {
    const names = Object.keys(fields);
    assert.ok([table, ...names].every((name) => /^[a-z_]+$/.test(name)));
    const values = Object.values(fields).map((value) => typeof value === "object" && value !== null ? JSON.stringify(value) : value);
    return (await db.query<Record<string, unknown>>(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, values)).rows[0]!;
  };
  const transaction = async (work: () => Promise<void>) => {
    await db.exec("BEGIN");
    try { await work(); await db.exec("COMMIT"); }
    catch (error) { await db.exec("ROLLBACK"); throw error; }
  };
  const rejects = async (work: Promise<unknown>, code = "23514") => assert.rejects(work, (error: unknown) => (error as {code?: string}).code === code);
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 3600_000).toISOString();
  const owner = async () => {
    const user = await insert("users", {auth_provider:"privy", auth_subject:`test:${randomUUID()}`, status:"active"});
    const id = randomUUID();
    await transaction(async () => {
      await insert("workspaces", {id, owner_user_id:user.id, slug:id, name:"Test workspace", status:"active"});
      await insert("workspace_members", {workspace_id:id, user_id:user.id, role:"owner", status:"active"});
    });
    return {workspace:id, user:user.id as string};
  };
  const command = (actor: string, workspace: string | null, overrides: Record<string, unknown> = {}) => insert("control_commands", {
    actor_user_id:actor, workspace_id:workspace, operation:"test.command", idempotency_key:randomUUID(), request_fingerprint:"test-hmac", fingerprint_key_version:"test-v1", status:"queued", cancellation:"available", dispatch_required:false, ...overrides,
  });
  try {
    await migrate(client, await readMigrations());
    await seedReferenceData(client);
    const a = await owner();
    const b = await owner();
    await t.test("owner membership is atomic and cannot be silently removed", async () => {
      await rejects(insert("workspaces", {owner_user_id:a.user, slug:randomUUID(), name:"No owner", status:"active"}));
      await rejects(db.query("DELETE FROM workspace_members WHERE workspace_id=$1", [a.workspace]));
      await rejects(db.query("UPDATE workspace_members SET role='viewer' WHERE workspace_id=$1", [a.workspace]));
    });
    await t.test("nullable bootstrap scope deduplicates and async commands require an outbox", async () => {
      const key = randomUUID();
      await command(a.user, null, {idempotency_key:key});
      await rejects(command(a.user, null, {idempotency_key:key}), "23505");
      await command(b.user, null, {idempotency_key:key});
      await rejects(command(a.user, a.workspace, {dispatch_required:true}));
      await transaction(async () => {
        const cmd = await command(a.user, a.workspace, {dispatch_required:true});
        await insert("command_dispatches", {control_command_id:cmd.id, queue_name:"test", deduplication_key:cmd.id, status:"pending"});
      });
      const cmd = await command(a.user, a.workspace);
      await rejects(db.query("UPDATE control_commands SET request_fingerprint='changed' WHERE id=$1", [cmd.id]));
      await db.query("UPDATE control_commands SET status='running' WHERE id=$1", [cmd.id]);
      await db.query("UPDATE control_commands SET status='succeeded',finished_at=now() WHERE id=$1", [cmd.id]);
      await rejects(db.query("UPDATE control_commands SET status='queued',finished_at=NULL WHERE id=$1", [cmd.id]));
    });
    await t.test("planner retries retain reservations and observed overruns remain auditable", async () => {
      const session = await insert("agent_sessions", {workspace_id:a.workspace, created_by_user_id:a.user, status:"active"});
      const cmd = await command(a.user, a.workspace);
      await insert("planning_checkpoints", {control_command_id:cmd.id, agent_session_id:session.id, phase:"P1", registry_hash:"test-registry", prompt_version:"test-1", compiler_version:"test-1", model_call_limit:2, tool_call_limit:1, repair_limit:1, input_token_limit:100, output_token_limit:100, cost_limit_atomic:"100", cost_unit:"usd_micro", deadline_at:later});
      const fields = {control_command_id:cmd.id, logical_call_key:"logical-1", attempt_no:1, call_kind:"model", call_name:"test-model", call_version:"test-1", request_fingerprint:"test-fingerprint", status:"uncertain", reserved_input_tokens:60, reserved_output_tokens:10, reserved_cost_atomic:"40", reserved_at:now};
      const call = await insert("planning_calls", fields);
      await rejects(insert("planning_calls", {...fields, logical_call_key:"logical-2"}));
      await rejects(db.query("UPDATE planning_calls SET reserved_input_tokens=0 WHERE id=$1", [call.id]));
      await db.query("UPDATE planning_calls SET observed_input_tokens=120 WHERE id=$1", [call.id]);
      await rejects(db.query("UPDATE planning_calls SET observed_input_tokens=NULL WHERE id=$1", [call.id]));
      await rejects(insert("planning_calls", {...fields, logical_call_key:"logical-2", reserved_input_tokens:1}));
      await rejects(db.query("UPDATE planning_checkpoints SET cost_limit_atomic=10000 WHERE control_command_id=$1", [cmd.id]));
      const foreignSession = await insert("agent_sessions", {workspace_id:b.workspace, created_by_user_id:b.user, status:"active"});
      const foreignCmd = await command(a.user, a.workspace);
      const checkpoint = (await db.query<Record<string, unknown>>("SELECT * FROM planning_checkpoints WHERE control_command_id=$1", [cmd.id])).rows[0]!;
      const {created_at, updated_at, deadline_at, ...copy} = checkpoint;
      await rejects(insert("planning_checkpoints", {...copy, control_command_id:foreignCmd.id, agent_session_id:foreignSession.id, deadline_at:later}));
    });

    const wallet = await insert("account_wallets", {workspace_id:a.workspace, owner_user_id:a.user, provider:"test", provider_wallet_id:randomUUID(), provider_chain_type:"ethereum", provider_owner_type:"unverified", control_model:"unverified", status:"provisioning"});
    const product = await insert("data_products", {workspace_id:a.workspace, creator_user_id:a.user, account_wallet_id:wallet.id, slug:randomUUID(), name:"Test product", original_intent:"Test source rows", status:"draft"});
    const credential = await insert("provider_credentials", {workspace_id:a.workspace, created_by_user_id:a.user, provider:"the_graph", credential_type:"graph_api_key", ownership_model:"customer_supplied", billing_model:"customer_subscription", label:"Test reference", secret_ref:"test://not-a-secret", secret_version:"test-1", credential_fingerprint:"test-fingerprint", status:"pending_validation"});
    const source = await insert("source_snapshots", {workspace_id:a.workspace, provider:"the_graph", source_kind:"subgraph", gateway_target_type:"deployment_id", gateway_target_id:"test-deployment", provider_deployment_id:"test-deployment", data_network_ref:"test-network", schema_format:"graphql_sdl", schema_document:"type Query { test: String }", schema_hash:"test-schema-hash", discovery_method:"manual", status:"validated", observed_at:now, validated_at:now});
    const sourceSpec = {id:"s1", sourceSnapshotId:source.id, adapterVersion:"test-1", access:{mode:"customer_api_key", providerCredentialId:credential.id, gatewayEnvironment:"mainnet"}};
    const spec = {schemaVersion:2, sources:[sourceSpec], dag:{nodes:[{id:"n1", type:"source", operatorVersion:"test-1", config:{sourceId:"s1"}},{id:"out",type:"output",operatorVersion:"test-1",config:{}}],edges:[]}, outputSchema:{fields:[]}};
    const version = randomUUID();
    const versionFields = {id:version, data_product_id:product.id, version_no:1, created_by_user_id:a.user, spec_schema_version:2, specification_json:spec, spec_hash:"test-spec-hash", output_schema_json:spec.outputSchema, status:"proposed"};
    await t.test("version and source projections commit together; pinned definitions cannot change", async () => {
      await rejects(insert("data_product_versions", versionFields));
      await transaction(async () => {
        await insert("data_product_versions", versionFields);
        await insert("data_product_version_sources", {data_product_version_id:version, source_key:"s1", source_snapshot_id:source.id, access_mode:"customer_api_key", provider_credential_id:credential.id, gateway_environment:"mainnet", adapter_version:"test-1", source_config_hash:"test-source-hash"});
      });
      await rejects(db.query("UPDATE data_product_versions SET spec_hash='changed' WHERE id=$1", [version]));
      await rejects(db.query("UPDATE source_snapshots SET schema_document='changed' WHERE id=$1", [source.id]));
      await rejects(db.query("UPDATE data_product_versions SET status='building' WHERE id=$1", [version]));
      await db.query("UPDATE data_product_versions SET status='validating' WHERE id=$1", [version]);
      await db.query("UPDATE data_product_versions SET status='proposed',validated_at=now(),validation_summary_json='{\"passed\":true}' WHERE id=$1", [version]);
      await db.query("UPDATE data_product_versions SET status='building' WHERE id=$1", [version]);
      await rejects(insert("product_version_layouts", {data_product_version_id:version, layout_schema_version:1, layout_json:{nodes:[{nodeId:"semantic-group-not-a-node"}]}, updated_by_user_id:a.user}));
      await rejects(insert("data_products", {workspace_id:b.workspace, creator_user_id:b.user, account_wallet_id:wallet.id, slug:randomUUID(), name:"Cross workspace", original_intent:"Test", status:"draft"}));
    });
    const run = await insert("execution_runs", {workspace_id:a.workspace, data_product_id:product.id, data_product_version_id:version, run_type:"build", trigger_type:"user", idempotency_key:randomUUID(), spec_hash:"test-spec-hash", runtime_version:"test-1", operator_registry_hash:"test-registry", adapter_versions_json:{graph:"test-1"}, status:"queued", queued_at:now});
    const attempt = await insert("run_attempts", {execution_run_id:run.id, attempt_no:1, queue_provider:"pg_boss", queue_job_id:randomUUID(), status:"running"});
    const node = await insert("node_runs", {run_attempt_id:attempt.id, node_id:"n1", operator_type:"source", operator_version:"test-1", status:"running"});
    await t.test("run context is immutable and queue retry reuses the logical source request", async () => {
      await insert("execution_run_contexts", {execution_run_id:run.id, context_schema_version:1, anchor_at:now, spec_hash:"test-spec-hash", registry_hash:"test-registry", runtime_version:"test-1"});
      await rejects(db.query("UPDATE execution_run_contexts SET anchor_at=now() WHERE execution_run_id=$1", [run.id]));
      await insert("run_source_contexts", {execution_run_id:run.id, node_id:"n1", source_key:"s1", source_snapshot_id:source.id, status:"frozen", query_hash:"test-query", requested_block_ref:"100", bindings_schema_version:1, base_variables_json:{}, frozen_at:now});
      await rejects(db.query("UPDATE run_source_contexts SET requested_block_ref='101' WHERE execution_run_id=$1", [run.id]));
      const fields = {workspace_id:a.workspace, execution_run_id:run.id, node_run_id:node.id, node_id:"n1", request_kind:"data_page", logical_request_key:"page-1", source_snapshot_id:source.id, request_no:1, access_mode:"customer_api_key", provider_credential_id:credential.id, credential_secret_version:"test-1", credential_fingerprint:"test-fingerprint", gateway_environment:"mainnet", query_text:"query Test { test }", query_hash:"test-query", variables_json:{}, variables_hash:"test-vars", requested_block_ref:"100", status:"planned"};
      const request = await insert("source_requests", fields);
      const retry = await insert("run_attempts", {execution_run_id:run.id, attempt_no:2, queue_provider:"pg_boss", queue_job_id:randomUUID(), status:"running"});
      const retryNode = await insert("node_runs", {run_attempt_id:retry.id, node_id:"n1", operator_type:"source", operator_version:"test-1", status:"running"});
      await rejects(insert("source_requests", {...fields, node_run_id:retryNode.id}), "23505");
      await insert("source_http_attempts", {source_request_id:request.id, node_run_id:retryNode.id, attempt_no:1, request_fingerprint:"test-http", has_payment_authorization:false, status:"sending", sent_at:now});
      await rejects(insert("source_requests", {...fields, request_no:2, logical_request_key:"page-2", requested_block_ref:"101"}));
    });
    await db.query("UPDATE execution_runs SET status='running' WHERE id=$1", [run.id]);
    await db.query("UPDATE execution_runs SET status='succeeded',finished_at=now() WHERE id=$1", [run.id]);
    const artifact = await insert("artifacts", {workspace_id:a.workspace, execution_run_id:run.id, artifact_kind:"materialized_output", storage_kind:"inline_json", payload_json:[], content_hash:"test-content", row_count:0, byte_count:2});
    const materialization = await insert("materializations", {workspace_id:a.workspace, data_product_id:product.id, data_product_version_id:version, execution_run_id:run.id, artifact_id:artifact.id, status:"ready", source_freshness_at:now});
    const deployment = await insert("deployments", {workspace_id:a.workspace, data_product_id:product.id, environment:"local", runtime_target:"shared_hosted", provider:"local", endpoint_slug:randomUUID(), status:"pending"});
    await t.test("build readiness does not activate an endpoint; activation checks the version/output pair", async () => {
      await rejects(db.query("UPDATE deployments SET active_version_id=$1,active_materialization_id=$2 WHERE id=$3", [version, materialization.id, deployment.id]));
      await db.query("UPDATE data_product_versions SET status='ready',ready_at=now() WHERE id=$1", [version]);
      assert.equal((await db.query<{active_version_id:string|null}>("SELECT active_version_id FROM deployments WHERE id=$1", [deployment.id])).rows[0]!.active_version_id, null);
      await db.query("UPDATE deployments SET active_version_id=$1,active_materialization_id=$2 WHERE id=$3", [version, materialization.id, deployment.id]);
      await rejects(db.query("UPDATE artifacts SET payload_json='[1]' WHERE id=$1", [artifact.id]));
    });
    const hedera = (await db.query<{id:string}>("SELECT id FROM networks WHERE namespace='hedera'")).rows[0]!.id;
    const base = (await db.query<{id:string}>("SELECT id FROM networks WHERE reference='8453'")).rows[0]!.id;
    const hbar = (await db.query<{id:string}>("SELECT id FROM assets WHERE symbol='HBAR'")).rows[0]!.id;
    const address = await insert("wallet_addresses", {account_wallet_id:wallet.id, network_id:hedera, address_kind:"hedera_account_id", address:"0.0.12345", normalized_address:"0.0.12345", identity_status:"unverified", account_completion_status:"unverified", control_status:"unverified", status:"active"});
    const terms = {workspace_id:a.workspace, data_product_id:product.id, kind:"api_sale", network_id:hedera, asset_id:hbar, amount_atomic:"10", recipient_wallet_address_id:address.id, recipient_address:"0.0.12345", facilitator:"blocky402", payment_protocol:"x402", payment_protocol_version:"2", payment_scheme:"exact", max_timeout_seconds:60, requirement_hash:"test-requirement", selected_requirement_json:{fixture:true}, idempotency_key:randomUUID(), status:"created"};
    const payment = await insert("payment_intents", terms);
    await t.test("money rejects negative/NaN values, wrong networks and unproved confirmation", async () => {
      for (const amount of ["-1", "NaN", "0"]) await rejects(insert("payment_intents", {...terms, idempotency_key:randomUUID(), amount_atomic:amount}));
      await rejects(insert("payment_intents", {...terms, idempotency_key:randomUUID(), network_id:base}));
      await rejects(db.query("UPDATE payment_intents SET status='confirmed' WHERE id=$1", [payment.id]));
      await rejects(db.query("UPDATE payment_intents SET amount_atomic=11 WHERE id=$1", [payment.id]));
      await rejects(insert("wallet_balance_snapshots", {wallet_address_id:address.id, asset_id:hbar, balance_atomic:"-1", provider:"test", observed_at:now}));
    });
    await t.test("paid request recovery and proof binding are separate from correlation IDs", async () => {
      const publication = await insert("publication_versions", {deployment_id:deployment.id, revision_no:1, access_mode:"x402", serve_mode:"materialized", network_id:hedera, asset_id:hbar, price_atomic:"10", recipient_wallet_address_id:address.id, payment_protocol_version:"2", payment_scheme:"exact", max_timeout_seconds:60, facilitator:"blocky402", facilitator_config_ref:"test://facilitator", facilitator_capability_json:{fixture:true}, facilitator_capability_hash:"test-capability", facilitator_capability_observed_at:now, status:"draft"});
      const fields = {workspace_id:a.workspace, deployment_id:deployment.id, data_product_version_id:version, publication_version_id:publication.id, materialization_id:materialization.id, correlation_id:randomUUID(), idempotency_key:randomUUID(), method:"GET", path:"/test", request_hash:"test-request", payment_intent_id:payment.id, status:"received", started_at:now};
      await rejects(insert("api_access_requests", fields));
      const request = await insert("api_access_requests", {...fields, recovery_capability_hash:"test-recovery-hmac", recovery_hash_key_version:"test-1", recovery_expires_at:later});
      await insert("api_payment_proofs", {authorization_hash:"test-authorization", api_access_request_id:request.id, payment_intent_id:payment.id});
      await rejects(insert("api_payment_proofs", {authorization_hash:"test-authorization", api_access_request_id:request.id, payment_intent_id:payment.id}), "23505");
      await rejects(db.query("UPDATE api_access_requests SET recovery_capability_hash='changed' WHERE id=$1", [request.id]));
      await rejects(db.query("UPDATE api_access_requests SET status='served' WHERE id=$1", [request.id]));
      await rejects(db.query("DELETE FROM artifacts WHERE id=$1", [artifact.id]));
      await rejects(db.query("DELETE FROM api_payment_proofs WHERE api_access_request_id=$1", [request.id]));
      await rejects(insert("api_access_requests", {...fields, correlation_id:randomUUID(), idempotency_key:randomUUID(), recovery_capability_hash:"another-test-hmac", recovery_hash_key_version:"test-1", recovery_expires_at:later}), "23505");
      const attempt = await insert("payment_attempts", {payment_intent_id:payment.id, attempt_no:1, network_id:hedera, provider:"test-only", status:"submitted", requested_at:now});
      const evidence = {payment_intent_id:payment.id, payment_attempt_id:attempt.id, network_id:hedera, asset_id:hbar, provider:"test-only", network_transaction_id:"synthetic-not-a-transaction", recipient_address:"0.0.12345", amount_atomic:"10", result_code:"TEST_ONLY", evidence_sources_json:["synthetic"], evidence_json:{fixture:true}, evidence_hash:"test-evidence", status:"confirmed", reported_at:now, confirmed_at:now};
      await rejects(insert("payment_settlements", {...evidence, amount_atomic:"11"}));
      await transaction(async () => {
        await insert("payment_settlements", evidence);
        await db.query("UPDATE payment_intents SET status='confirmed' WHERE id=$1", [payment.id]);
        await db.query("UPDATE api_access_requests SET status='served',completed_at=now() WHERE id=$1", [request.id]);
      });
      await rejects(db.query("UPDATE payment_settlements SET evidence_hash='changed' WHERE payment_intent_id=$1", [payment.id]));
    });
    await t.test("semantic compilation provenance is append-only, not executable layout state", async () => {
      const provenance = {schemaVersion:1, compilerVersion:"test-1", templateCatalogHash:"test-catalog", expandedSpecHash:"test-spec-hash", instances:[]};
      const record = await insert("compilation_records", {workspace_id:a.workspace, data_product_version_id:version, schema_version:1, compiler_version:"test-1", template_catalog_hash:"test-catalog", expanded_spec_hash:"test-spec-hash", provenance_json:provenance, content_hash:"test-provenance-hash"});
      await rejects(db.query("UPDATE compilation_records SET content_hash='changed' WHERE id=$1", [record.id]));
      await rejects(db.query("DELETE FROM compilation_records WHERE id=$1", [record.id]));
    });
  } finally { await db.close(); }
});
