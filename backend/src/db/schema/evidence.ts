// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import { pgTable, uuid, text, integer, smallint, bigint, numeric, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const trace_streams = pgTable("trace_streams", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  stream_kind: text("stream_kind").notNull(),
  data_product_id: uuid("data_product_id"),
  data_product_version_id: uuid("data_product_version_id"),
  agent_session_id: uuid("agent_session_id"),
  execution_run_id: uuid("execution_run_id"),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  closed_at: timestamp("closed_at", { withTimezone: true, mode: "date" }),
});

export const trace_events = pgTable("trace_events", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  trace_stream_id: uuid("trace_stream_id").notNull(),
  sequence_no: integer("sequence_no").notNull(),
  stage: text("stage").notNull(),
  event_type: text("event_type").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  details_json: jsonb("details_json"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const api_access_requests = pgTable("api_access_requests", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  deployment_id: uuid("deployment_id").notNull(),
  data_product_version_id: uuid("data_product_version_id").notNull(),
  publication_version_id: uuid("publication_version_id").notNull(),
  materialization_id: uuid("materialization_id"),
  api_credential_id: uuid("api_credential_id"),
  caller_user_id: uuid("caller_user_id"),
  correlation_id: text("correlation_id").notNull(),
  idempotency_key: text("idempotency_key"),
  method: text("method").notNull(),
  path: text("path").notNull(),
  parameters_json: jsonb("parameters_json"),
  request_hash: text("request_hash").notNull(),
  payment_intent_id: uuid("payment_intent_id"),
  status: text("status").notNull(),
  started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  error_code: text("error_code"),
  recovery_capability_hash: text("recovery_capability_hash"),
  recovery_hash_key_version: text("recovery_hash_key_version"),
  recovery_expires_at: timestamp("recovery_expires_at", { withTimezone: true, mode: "date" }),
  recovery_revoked_at: timestamp("recovery_revoked_at", { withTimezone: true, mode: "date" }),
});

export const api_http_attempts = pgTable("api_http_attempts", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  api_access_request_id: uuid("api_access_request_id").notNull(),
  attempt_no: integer("attempt_no").notNull(),
  has_payment_authorization: boolean("has_payment_authorization").notNull(),
  payment_authorization_hash: text("payment_authorization_hash"),
  http_status: smallint("http_status").notNull(),
  response_content_hash: text("response_content_hash"),
  response_byte_count: bigint("response_byte_count", { mode: "bigint" }),
  started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  error_code: text("error_code"),
});

export const usage_events = pgTable("usage_events", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  data_product_id: uuid("data_product_id"),
  execution_run_id: uuid("execution_run_id"),
  source_request_id: uuid("source_request_id"),
  api_access_request_id: uuid("api_access_request_id"),
  metric: text("metric").notNull(),
  quantity: numeric("quantity", { precision: 78, scale: 0 }).notNull(),
  unit: text("unit").notNull(),
  dimensions_json: jsonb("dimensions_json"),
  recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
});
