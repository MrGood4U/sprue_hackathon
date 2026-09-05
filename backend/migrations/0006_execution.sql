-- Data model 1.4: execution. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "execution_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "data_product_id" uuid NOT NULL,
  "data_product_version_id" uuid NOT NULL,
  "deployment_id" uuid,
  "refresh_schedule_id" uuid,
  "requested_by_user_id" uuid,
  "run_type" text NOT NULL CHECK ("run_type" IN ('preview', 'build', 'refresh', 'backfill', 'live_request')),
  "trigger_type" text NOT NULL CHECK ("trigger_type" IN ('user', 'schedule', 'system', 'api')),
  "idempotency_key" text NOT NULL,
  "spec_hash" text NOT NULL,
  "runtime_version" text NOT NULL,
  "operator_registry_hash" text NOT NULL,
  "adapter_versions_json" jsonb NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled')),
  "failure_code" text,
  "failure_message" text,
  "queued_at" timestamptz NOT NULL,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "metrics_json" jsonb,
  PRIMARY KEY ("id")
);

CREATE TABLE "run_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "execution_run_id" uuid NOT NULL,
  "attempt_no" integer NOT NULL CHECK ("attempt_no" >= 0 AND "attempt_no" > 0),
  "queue_provider" text NOT NULL CHECK ("queue_provider" IN ('pg_boss')),
  "queue_job_id" text NOT NULL,
  "worker_instance_id" text,
  "status" text NOT NULL CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'abandoned')),
  "started_at" timestamptz,
  "heartbeat_at" timestamptz,
  "finished_at" timestamptz,
  "error_code" text,
  "error_message" text,
  PRIMARY KEY ("id")
);

CREATE TABLE "node_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "run_attempt_id" uuid NOT NULL,
  "node_id" text NOT NULL,
  "operator_type" text NOT NULL CHECK ("operator_type" IN ('source', 'filter', 'map', 'aggregate', 'output')),
  "operator_version" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "metrics_json" jsonb,
  "error_code" text,
  "error_message" text,
  PRIMARY KEY ("id")
);

CREATE TABLE "node_run_artifacts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "node_run_id" uuid NOT NULL,
  "direction" text NOT NULL CHECK ("direction" IN ('input', 'output')),
  "port_name" text NOT NULL,
  "ordinal" integer NOT NULL DEFAULT 0 CHECK ("ordinal" >= 0),
  "artifact_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "artifacts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "execution_run_id" uuid NOT NULL,
  "artifact_kind" text NOT NULL CHECK ("artifact_kind" IN ('source_page', 'node_output', 'materialized_output', 'evidence')),
  "storage_kind" text NOT NULL CHECK ("storage_kind" IN ('inline_json', 'object_uri')),
  "payload_json" jsonb,
  "object_uri" text,
  "schema_json" jsonb,
  "content_hash" text NOT NULL,
  "row_count" bigint CHECK ("row_count" >= 0),
  "byte_count" bigint NOT NULL CHECK ("byte_count" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "source_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "execution_run_id" uuid NOT NULL,
  "node_run_id" uuid NOT NULL,
  "source_snapshot_id" uuid NOT NULL,
  "request_no" integer NOT NULL CHECK ("request_no" >= 0),
  "access_mode" text NOT NULL CHECK ("access_mode" IN ('customer_api_key', 'x402')),
  "provider_credential_id" uuid,
  "spending_policy_id" uuid,
  "credential_secret_version" text,
  "credential_fingerprint" text,
  "gateway_environment" text NOT NULL CHECK ("gateway_environment" IN ('mainnet', 'testnet')),
  "operation_name" text,
  "query_text" text NOT NULL,
  "query_hash" text NOT NULL,
  "variables_json" jsonb NOT NULL,
  "variables_hash" text NOT NULL,
  "pagination_cursor_json" jsonb,
  "requested_block_ref" text,
  "budget_reservation_id" uuid,
  "payment_intent_id" uuid,
  "response_artifact_id" uuid,
  "response_manifest_ipfs_cid" text,
  "indexed_block_ref" text,
  "indexed_block_timestamp" timestamptz,
  "has_indexing_errors" boolean,
  "graphql_errors_json" jsonb,
  "status" text NOT NULL CHECK ("status" IN ('planned', 'awaiting_payment', 'requested', 'succeeded', 'failed', 'uncertain')),
  "requested_at" timestamptz,
  "completed_at" timestamptz,
  "error_code" text,
  "node_id" text NOT NULL,
  "request_kind" text NOT NULL CHECK ("request_kind" IN ('block_probe', 'data_page', 'completion_check')),
  "logical_request_key" text NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "source_http_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_request_id" uuid NOT NULL,
  "attempt_no" integer NOT NULL CHECK ("attempt_no" >= 0 AND "attempt_no" > 0),
  "request_fingerprint" text NOT NULL,
  "has_payment_authorization" boolean NOT NULL,
  "payment_authorization_hash" text,
  "payment_requirement_hash" text,
  "provider_request_id" text,
  "http_status" integer CHECK ("http_status" >= 0 AND "http_status" BETWEEN 100 AND 599),
  "sanitized_response_metadata_json" jsonb,
  "status" text NOT NULL CHECK ("status" IN ('sending', 'payment_required', 'succeeded', 'failed', 'uncertain')),
  "sent_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "error_code" text,
  "node_run_id" uuid NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "materializations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "data_product_id" uuid NOT NULL,
  "data_product_version_id" uuid NOT NULL,
  "execution_run_id" uuid NOT NULL,
  "artifact_id" uuid NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('ready', 'expired', 'invalidated')),
  "source_freshness_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  PRIMARY KEY ("id")
);
