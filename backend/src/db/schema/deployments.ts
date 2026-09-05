// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import { pgTable, uuid, text, integer, smallint, bigint, numeric, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const deployments = pgTable("deployments", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  data_product_id: uuid("data_product_id").notNull(),
  environment: text("environment").notNull(),
  runtime_target: text("runtime_target").notNull(),
  provider: text("provider").notNull(),
  endpoint_slug: text("endpoint_slug").notNull(),
  public_base_url: text("public_base_url"),
  active_version_id: uuid("active_version_id"),
  active_materialization_id: uuid("active_materialization_id"),
  active_publication_version_id: uuid("active_publication_version_id"),
  status: text("status").notNull(),
  last_health_at: timestamp("last_health_at", { withTimezone: true, mode: "date" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});

export const publication_versions = pgTable("publication_versions", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  deployment_id: uuid("deployment_id").notNull(),
  revision_no: integer("revision_no").notNull(),
  access_mode: text("access_mode").notNull(),
  serve_mode: text("serve_mode").notNull(),
  network_id: uuid("network_id"),
  asset_id: uuid("asset_id"),
  price_atomic: numeric("price_atomic", { precision: 78, scale: 0 }),
  recipient_wallet_address_id: uuid("recipient_wallet_address_id"),
  payment_protocol_version: text("payment_protocol_version"),
  payment_scheme: text("payment_scheme"),
  max_timeout_seconds: integer("max_timeout_seconds"),
  facilitator: text("facilitator"),
  facilitator_config_ref: text("facilitator_config_ref"),
  facilitator_capability_json: jsonb("facilitator_capability_json"),
  facilitator_capability_hash: text("facilitator_capability_hash"),
  facilitator_capability_observed_at: timestamp("facilitator_capability_observed_at", { withTimezone: true, mode: "date" }),
  service_fee_enabled: boolean("service_fee_enabled").notNull().default(false),
  service_fee_terms_json: jsonb("service_fee_terms_json"),
  accepted_by_user_id: uuid("accepted_by_user_id"),
  accepted_at: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const api_credentials = pgTable("api_credentials", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  deployment_id: uuid("deployment_id").notNull(),
  name: text("name").notNull(),
  key_prefix: text("key_prefix").notNull(),
  key_hash: text("key_hash").notNull(),
  scopes_json: jsonb("scopes_json").notNull(),
  status: text("status").notNull(),
  created_by_user_id: uuid("created_by_user_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  last_used_at: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
});

export const refresh_schedules = pgTable("refresh_schedules", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  deployment_id: uuid("deployment_id").notNull(),
  cron_expression: text("cron_expression").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  status: text("status").notNull(),
  next_run_at: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
  last_run_at: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});
