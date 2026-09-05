-- Data model 1.4: evidence. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "trace_streams" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "stream_kind" text NOT NULL CHECK ("stream_kind" IN ('planning', 'build', 'refresh', 'deployment', 'api_access')),
  "data_product_id" uuid,
  "data_product_version_id" uuid,
  "agent_session_id" uuid,
  "execution_run_id" uuid,
  "status" text NOT NULL CHECK ("status" IN ('open', 'completed', 'failed')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "trace_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "trace_stream_id" uuid NOT NULL,
  "sequence_no" integer NOT NULL CHECK ("sequence_no" >= 0 AND "sequence_no" > 0),
  "stage" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('info', 'started', 'succeeded', 'failed', 'blocked')),
  "summary" text NOT NULL,
  "details_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "api_access_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "deployment_id" uuid NOT NULL,
  "data_product_version_id" uuid NOT NULL,
  "publication_version_id" uuid NOT NULL,
  "materialization_id" uuid,
  "api_credential_id" uuid,
  "caller_user_id" uuid,
  "correlation_id" text NOT NULL,
  "idempotency_key" text,
  "method" text NOT NULL CHECK ("method" IN ('GET')),
  "path" text NOT NULL,
  "parameters_json" jsonb,
  "request_hash" text NOT NULL,
  "payment_intent_id" uuid,
  "status" text NOT NULL CHECK ("status" IN ('received', 'payment_required', 'authorized', 'served', 'failed')),
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "error_code" text,
  "recovery_capability_hash" text,
  "recovery_hash_key_version" text,
  "recovery_expires_at" timestamptz,
  "recovery_revoked_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "api_http_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "api_access_request_id" uuid NOT NULL,
  "attempt_no" integer NOT NULL CHECK ("attempt_no" >= 0 AND "attempt_no" > 0),
  "has_payment_authorization" boolean NOT NULL,
  "payment_authorization_hash" text,
  "http_status" smallint NOT NULL CHECK ("http_status" >= 0 AND "http_status" BETWEEN 100 AND 599),
  "response_content_hash" text,
  "response_byte_count" bigint CHECK ("response_byte_count" >= 0),
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "error_code" text,
  PRIMARY KEY ("id")
);

CREATE TABLE "usage_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "data_product_id" uuid,
  "execution_run_id" uuid,
  "source_request_id" uuid,
  "api_access_request_id" uuid,
  "metric" text NOT NULL CHECK ("metric" IN ('provider_requests', 'source_rows', 'output_rows', 'compute_ms', 'storage_bytes', 'api_response_bytes')),
  "quantity" numeric(78,0) NOT NULL CHECK ("quantity" >= 0 AND "quantity" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "unit" text NOT NULL,
  "dimensions_json" jsonb,
  "recorded_at" timestamptz NOT NULL,
  PRIMARY KEY ("id")
);
