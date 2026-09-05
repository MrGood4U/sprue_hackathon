-- Data model 1.4: deployments. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "deployments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "data_product_id" uuid NOT NULL,
  "environment" text NOT NULL CHECK ("environment" IN ('local', 'demo', 'self_hosted')),
  "runtime_target" text NOT NULL CHECK ("runtime_target" IN ('shared_hosted')),
  "provider" text NOT NULL CHECK ("provider" IN ('railway', 'docker', 'local')),
  "endpoint_slug" text NOT NULL,
  "public_base_url" text,
  "active_version_id" uuid,
  "active_materialization_id" uuid,
  "active_publication_version_id" uuid,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'deploying', 'healthy', 'degraded', 'suspended', 'failed')),
  "last_health_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("id")
);

CREATE TABLE "publication_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "deployment_id" uuid NOT NULL,
  "revision_no" integer NOT NULL CHECK ("revision_no" >= 0 AND "revision_no" > 0),
  "access_mode" text NOT NULL CHECK ("access_mode" IN ('private', 'api_key', 'x402')),
  "serve_mode" text NOT NULL CHECK ("serve_mode" IN ('materialized', 'live')),
  "network_id" uuid,
  "asset_id" uuid,
  "price_atomic" numeric(78,0) CHECK ("price_atomic" >= 0 AND "price_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "recipient_wallet_address_id" uuid,
  "payment_protocol_version" text,
  "payment_scheme" text,
  "max_timeout_seconds" integer CHECK ("max_timeout_seconds" >= 0),
  "facilitator" text,
  "facilitator_config_ref" text,
  "facilitator_capability_json" jsonb,
  "facilitator_capability_hash" text,
  "facilitator_capability_observed_at" timestamptz,
  "service_fee_enabled" boolean NOT NULL DEFAULT false,
  "service_fee_terms_json" jsonb,
  "accepted_by_user_id" uuid,
  "accepted_at" timestamptz,
  "status" text NOT NULL CHECK ("status" IN ('draft', 'active', 'retired', 'invalid')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "api_credentials" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "deployment_id" uuid NOT NULL,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes_json" jsonb NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('active', 'revoked', 'expired')),
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "refresh_schedules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "deployment_id" uuid NOT NULL,
  "cron_expression" text NOT NULL,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "status" text NOT NULL CHECK ("status" IN ('active', 'paused', 'disabled')),
  "next_run_at" timestamptz,
  "last_run_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("id")
);
