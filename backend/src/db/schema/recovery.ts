// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import { pgTable, uuid, text, integer, smallint, bigint, numeric, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const control_commands = pgTable("control_commands", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  actor_user_id: uuid("actor_user_id").notNull(),
  workspace_id: uuid("workspace_id"),
  operation: text("operation").notNull(),
  idempotency_key: text("idempotency_key").notNull(),
  request_fingerprint: text("request_fingerprint").notNull(),
  fingerprint_key_version: text("fingerprint_key_version").notNull(),
  status: text("status").notNull(),
  cancellation: text("cancellation").notNull(),
  dispatch_required: boolean("dispatch_required").notNull(),
  subject_type: text("subject_type"),
  subject_id: uuid("subject_id"),
  trace_stream_id: uuid("trace_stream_id"),
  error_code: text("error_code"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }),
});

export const command_dispatches = pgTable("command_dispatches", {
  control_command_id: uuid("control_command_id").notNull().primaryKey(),
  queue_name: text("queue_name").notNull(),
  deduplication_key: text("deduplication_key").notNull(),
  status: text("status").notNull(),
  attempt_count: integer("attempt_count").notNull().default(0),
  queue_job_id: text("queue_job_id"),
  next_attempt_at: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }),
  last_error_code: text("last_error_code"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const planning_checkpoints = pgTable("planning_checkpoints", {
  control_command_id: uuid("control_command_id").notNull().primaryKey(),
  agent_session_id: uuid("agent_session_id").notNull(),
  parent_version_id: uuid("parent_version_id"),
  phase: text("phase").notNull(),
  revision_no: integer("revision_no").notNull().default(0),
  registry_hash: text("registry_hash").notNull(),
  prompt_version: text("prompt_version").notNull(),
  compiler_version: text("compiler_version").notNull(),
  model_call_limit: integer("model_call_limit").notNull(),
  tool_call_limit: integer("tool_call_limit").notNull(),
  repair_limit: integer("repair_limit").notNull(),
  repairs_used: integer("repairs_used").notNull().default(0),
  input_token_limit: bigint("input_token_limit", { mode: "bigint" }).notNull(),
  output_token_limit: bigint("output_token_limit", { mode: "bigint" }).notNull(),
  cost_limit_atomic: numeric("cost_limit_atomic", { precision: 78, scale: 0 }).notNull(),
  cost_unit: text("cost_unit").notNull(),
  deadline_at: timestamp("deadline_at", { withTimezone: true, mode: "date" }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const planning_calls = pgTable("planning_calls", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  control_command_id: uuid("control_command_id").notNull(),
  logical_call_key: text("logical_call_key").notNull(),
  attempt_no: integer("attempt_no").notNull(),
  call_kind: text("call_kind").notNull(),
  call_name: text("call_name").notNull(),
  call_version: text("call_version").notNull(),
  request_fingerprint: text("request_fingerprint").notNull(),
  status: text("status").notNull(),
  reserved_input_tokens: bigint("reserved_input_tokens", { mode: "bigint" }).notNull(),
  reserved_output_tokens: bigint("reserved_output_tokens", { mode: "bigint" }).notNull(),
  reserved_cost_atomic: numeric("reserved_cost_atomic", { precision: 78, scale: 0 }).notNull(),
  observed_input_tokens: bigint("observed_input_tokens", { mode: "bigint" }),
  observed_output_tokens: bigint("observed_output_tokens", { mode: "bigint" }),
  observed_cost_atomic: numeric("observed_cost_atomic", { precision: 78, scale: 0 }),
  result_message_id: uuid("result_message_id"),
  error_code: text("error_code"),
  reserved_at: timestamp("reserved_at", { withTimezone: true, mode: "date" }).notNull(),
  dispatched_at: timestamp("dispatched_at", { withTimezone: true, mode: "date" }),
  finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }),
});

export const execution_run_contexts = pgTable("execution_run_contexts", {
  execution_run_id: uuid("execution_run_id").notNull().primaryKey(),
  context_schema_version: integer("context_schema_version").notNull(),
  anchor_at: timestamp("anchor_at", { withTimezone: true, mode: "date" }).notNull(),
  spec_hash: text("spec_hash").notNull(),
  registry_hash: text("registry_hash").notNull(),
  runtime_version: text("runtime_version").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const run_source_contexts = pgTable("run_source_contexts", {
  execution_run_id: uuid("execution_run_id").notNull(),
  node_id: text("node_id").notNull(),
  source_key: text("source_key").notNull(),
  source_snapshot_id: uuid("source_snapshot_id").notNull(),
  status: text("status").notNull(),
  query_hash: text("query_hash").notNull(),
  window_start: timestamp("window_start", { withTimezone: true, mode: "date" }),
  window_end: timestamp("window_end", { withTimezone: true, mode: "date" }),
  requested_block_ref: text("requested_block_ref"),
  bindings_schema_version: integer("bindings_schema_version").notNull(),
  base_variables_json: jsonb("base_variables_json").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  frozen_at: timestamp("frozen_at", { withTimezone: true, mode: "date" }),
}, (table) => [primaryKey({ columns: [table.execution_run_id, table.node_id] })]);

export const compilation_records = pgTable("compilation_records", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  proposal_message_id: uuid("proposal_message_id"),
  data_product_version_id: uuid("data_product_version_id"),
  proposal_compilation_id: uuid("proposal_compilation_id"),
  schema_version: integer("schema_version").notNull(),
  compiler_version: text("compiler_version").notNull(),
  template_catalog_hash: text("template_catalog_hash").notNull(),
  expanded_spec_hash: text("expanded_spec_hash").notNull(),
  provenance_json: jsonb("provenance_json").notNull(),
  content_hash: text("content_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const api_payment_proofs = pgTable("api_payment_proofs", {
  authorization_hash: text("authorization_hash").notNull().primaryKey(),
  api_access_request_id: uuid("api_access_request_id").notNull(),
  payment_intent_id: uuid("payment_intent_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
