// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import { pgTable, uuid, text, integer, smallint, bigint, numeric, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const provider_credentials = pgTable("provider_credentials", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  created_by_user_id: uuid("created_by_user_id").notNull(),
  provider: text("provider").notNull(),
  credential_type: text("credential_type").notNull(),
  ownership_model: text("ownership_model").notNull(),
  billing_model: text("billing_model").notNull(),
  label: text("label").notNull(),
  secret_ref: text("secret_ref").notNull(),
  secret_version: text("secret_version").notNull(),
  public_prefix: text("public_prefix"),
  credential_fingerprint: text("credential_fingerprint").notNull(),
  provider_constraints_json: jsonb("provider_constraints_json"),
  status: text("status").notNull(),
  validated_at: timestamp("validated_at", { withTimezone: true, mode: "date" }),
  last_used_at: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});

export const source_snapshots = pgTable("source_snapshots", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  provider: text("provider").notNull(),
  source_kind: text("source_kind").notNull(),
  logical_source_id: text("logical_source_id"),
  gateway_target_type: text("gateway_target_type").notNull(),
  gateway_target_id: text("gateway_target_id").notNull(),
  provider_deployment_id: text("provider_deployment_id"),
  manifest_ipfs_cid: text("manifest_ipfs_cid"),
  data_network_ref: text("data_network_ref").notNull(),
  schema_format: text("schema_format").notNull(),
  schema_document: text("schema_document").notNull(),
  schema_hash: text("schema_hash").notNull(),
  standard_schema_json: jsonb("standard_schema_json"),
  discovery_method: text("discovery_method").notNull(),
  status: text("status").notNull(),
  observed_at: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
  validated_at: timestamp("validated_at", { withTimezone: true, mode: "date" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const agent_sessions = pgTable("agent_sessions", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  created_by_user_id: uuid("created_by_user_id").notNull(),
  data_product_id: uuid("data_product_id"),
  title: text("title"),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  closed_at: timestamp("closed_at", { withTimezone: true, mode: "date" }),
});

export const agent_messages = pgTable("agent_messages", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  agent_session_id: uuid("agent_session_id").notNull(),
  sequence_no: integer("sequence_no").notNull(),
  role: text("role").notNull(),
  content_text: text("content_text"),
  content_json: jsonb("content_json"),
  content_hash: text("content_hash").notNull(),
  redaction_status: text("redaction_status").notNull(),
  model_provider: text("model_provider"),
  model_name: text("model_name"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const data_products = pgTable("data_products", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  creator_user_id: uuid("creator_user_id").notNull(),
  account_wallet_id: uuid("account_wallet_id").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  original_intent: text("original_intent").notNull(),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});

export const data_product_versions = pgTable("data_product_versions", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  data_product_id: uuid("data_product_id").notNull(),
  version_no: integer("version_no").notNull(),
  parent_version_id: uuid("parent_version_id"),
  created_by_user_id: uuid("created_by_user_id").notNull(),
  agent_session_id: uuid("agent_session_id"),
  spec_schema_version: integer("spec_schema_version").notNull(),
  specification_json: jsonb("specification_json").notNull(),
  spec_hash: text("spec_hash").notNull(),
  output_schema_json: jsonb("output_schema_json").notNull(),
  status: text("status").notNull(),
  validation_summary_json: jsonb("validation_summary_json"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  validated_at: timestamp("validated_at", { withTimezone: true, mode: "date" }),
  ready_at: timestamp("ready_at", { withTimezone: true, mode: "date" }),
});

export const data_product_version_sources = pgTable("data_product_version_sources", {
  data_product_version_id: uuid("data_product_version_id").notNull(),
  source_key: text("source_key").notNull(),
  source_snapshot_id: uuid("source_snapshot_id").notNull(),
  access_mode: text("access_mode").notNull(),
  provider_credential_id: uuid("provider_credential_id"),
  spending_policy_id: uuid("spending_policy_id"),
  gateway_environment: text("gateway_environment").notNull(),
  adapter_version: text("adapter_version").notNull(),
  source_config_hash: text("source_config_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.data_product_version_id, table.source_key] })]);

export const product_version_layouts = pgTable("product_version_layouts", {
  data_product_version_id: uuid("data_product_version_id").notNull().primaryKey(),
  layout_schema_version: integer("layout_schema_version").notNull(),
  layout_json: jsonb("layout_json").notNull(),
  updated_by_user_id: uuid("updated_by_user_id").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});
