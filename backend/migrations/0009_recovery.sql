-- Data model 1.4: recovery. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "control_commands" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL,
  "workspace_id" uuid,
  "operation" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "fingerprint_key_version" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled')),
  "cancellation" text NOT NULL CHECK ("cancellation" IN ('not_supported', 'available', 'requested', 'completed')),
  "dispatch_required" boolean NOT NULL,
  "subject_type" text,
  "subject_id" uuid,
  "trace_stream_id" uuid,
  "error_code" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "command_dispatches" (
  "control_command_id" uuid NOT NULL,
  "queue_name" text NOT NULL,
  "deduplication_key" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'dispatched', 'failed')),
  "attempt_count" integer NOT NULL DEFAULT 0 CHECK ("attempt_count" >= 0),
  "queue_job_id" text,
  "next_attempt_at" timestamptz,
  "last_error_code" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("control_command_id")
);

CREATE TABLE "planning_checkpoints" (
  "control_command_id" uuid NOT NULL,
  "agent_session_id" uuid NOT NULL,
  "parent_version_id" uuid,
  "phase" text NOT NULL CHECK ("phase" IN ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')),
  "revision_no" integer NOT NULL DEFAULT 0 CHECK ("revision_no" >= 0),
  "registry_hash" text NOT NULL,
  "prompt_version" text NOT NULL,
  "compiler_version" text NOT NULL,
  "model_call_limit" integer NOT NULL CHECK ("model_call_limit" >= 0),
  "tool_call_limit" integer NOT NULL CHECK ("tool_call_limit" >= 0),
  "repair_limit" integer NOT NULL CHECK ("repair_limit" >= 0),
  "repairs_used" integer NOT NULL DEFAULT 0 CHECK ("repairs_used" >= 0),
  "input_token_limit" bigint NOT NULL CHECK ("input_token_limit" >= 0),
  "output_token_limit" bigint NOT NULL CHECK ("output_token_limit" >= 0),
  "cost_limit_atomic" numeric(78,0) NOT NULL CHECK ("cost_limit_atomic" >= 0 AND "cost_limit_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "cost_unit" text NOT NULL CHECK ("cost_unit" IN ('usd_micro')),
  "deadline_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("control_command_id")
);

CREATE TABLE "planning_calls" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "control_command_id" uuid NOT NULL,
  "logical_call_key" text NOT NULL,
  "attempt_no" integer NOT NULL CHECK ("attempt_no" >= 0 AND "attempt_no" > 0),
  "call_kind" text NOT NULL CHECK ("call_kind" IN ('model', 'tool')),
  "call_name" text NOT NULL,
  "call_version" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('reserved', 'dispatched', 'succeeded', 'failed', 'uncertain', 'cancelled')),
  "reserved_input_tokens" bigint NOT NULL CHECK ("reserved_input_tokens" >= 0),
  "reserved_output_tokens" bigint NOT NULL CHECK ("reserved_output_tokens" >= 0),
  "reserved_cost_atomic" numeric(78,0) NOT NULL CHECK ("reserved_cost_atomic" >= 0 AND "reserved_cost_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "observed_input_tokens" bigint CHECK ("observed_input_tokens" >= 0),
  "observed_output_tokens" bigint CHECK ("observed_output_tokens" >= 0),
  "observed_cost_atomic" numeric(78,0) CHECK ("observed_cost_atomic" >= 0 AND "observed_cost_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "result_message_id" uuid,
  "error_code" text,
  "reserved_at" timestamptz NOT NULL,
  "dispatched_at" timestamptz,
  "finished_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "execution_run_contexts" (
  "execution_run_id" uuid NOT NULL,
  "context_schema_version" integer NOT NULL CHECK ("context_schema_version" >= 0 AND "context_schema_version" = 1),
  "anchor_at" timestamptz NOT NULL,
  "spec_hash" text NOT NULL,
  "registry_hash" text NOT NULL,
  "runtime_version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("execution_run_id")
);

CREATE TABLE "run_source_contexts" (
  "execution_run_id" uuid NOT NULL,
  "node_id" text NOT NULL,
  "source_key" text NOT NULL,
  "source_snapshot_id" uuid NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('initializing', 'frozen')),
  "query_hash" text NOT NULL,
  "window_start" timestamptz,
  "window_end" timestamptz,
  "requested_block_ref" text,
  "bindings_schema_version" integer NOT NULL CHECK ("bindings_schema_version" >= 0 AND "bindings_schema_version" = 1),
  "base_variables_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "frozen_at" timestamptz,
  PRIMARY KEY ("execution_run_id", "node_id")
);

CREATE TABLE "compilation_records" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "proposal_message_id" uuid,
  "data_product_version_id" uuid,
  "proposal_compilation_id" uuid,
  "schema_version" integer NOT NULL CHECK ("schema_version" >= 0 AND "schema_version" = 1),
  "compiler_version" text NOT NULL,
  "template_catalog_hash" text NOT NULL,
  "expanded_spec_hash" text NOT NULL,
  "provenance_json" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "api_payment_proofs" (
  "authorization_hash" text NOT NULL,
  "api_access_request_id" uuid NOT NULL,
  "payment_intent_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("authorization_hash")
);
