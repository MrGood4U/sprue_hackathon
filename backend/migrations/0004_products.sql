-- Data model 1.4: products. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "provider_credentials" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "provider" text NOT NULL CHECK ("provider" IN ('the_graph')),
  "credential_type" text NOT NULL CHECK ("credential_type" IN ('graph_api_key')),
  "ownership_model" text NOT NULL CHECK ("ownership_model" IN ('customer_supplied')),
  "billing_model" text NOT NULL CHECK ("billing_model" IN ('customer_subscription')),
  "label" text NOT NULL,
  "secret_ref" text NOT NULL,
  "secret_version" text NOT NULL,
  "public_prefix" text,
  "credential_fingerprint" text NOT NULL,
  "provider_constraints_json" jsonb,
  "status" text NOT NULL CHECK ("status" IN ('pending_validation', 'active', 'invalid', 'revoked')),
  "validated_at" timestamptz,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("id")
);

CREATE TABLE "source_snapshots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "provider" text NOT NULL CHECK ("provider" IN ('the_graph')),
  "source_kind" text NOT NULL CHECK ("source_kind" IN ('subgraph')),
  "logical_source_id" text,
  "gateway_target_type" text NOT NULL CHECK ("gateway_target_type" IN ('deployment_id', 'subgraph_id')),
  "gateway_target_id" text NOT NULL,
  "provider_deployment_id" text,
  "manifest_ipfs_cid" text,
  "data_network_ref" text NOT NULL,
  "schema_format" text NOT NULL CHECK ("schema_format" IN ('graphql_sdl')),
  "schema_document" text NOT NULL,
  "schema_hash" text NOT NULL,
  "standard_schema_json" jsonb,
  "discovery_method" text NOT NULL CHECK ("discovery_method" IN ('graph_mcp', 'graph_explorer', 'manual')),
  "status" text NOT NULL CHECK ("status" IN ('candidate', 'validated', 'rejected', 'superseded')),
  "observed_at" timestamptz NOT NULL,
  "validated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "agent_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "data_product_id" uuid,
  "title" text,
  "status" text NOT NULL CHECK ("status" IN ('active', 'completed', 'abandoned')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "agent_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "agent_session_id" uuid NOT NULL,
  "sequence_no" integer NOT NULL CHECK ("sequence_no" >= 0 AND "sequence_no" > 0),
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'tool')),
  "content_text" text,
  "content_json" jsonb,
  "content_hash" text NOT NULL,
  "redaction_status" text NOT NULL CHECK ("redaction_status" IN ('none', 'secret_redacted', 'content_removed')),
  "model_provider" text,
  "model_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "data_products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "creator_user_id" uuid NOT NULL,
  "account_wallet_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "original_intent" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('draft', 'active', 'suspended', 'archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("id")
);

CREATE TABLE "data_product_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "data_product_id" uuid NOT NULL,
  "version_no" integer NOT NULL CHECK ("version_no" >= 0 AND "version_no" > 0),
  "parent_version_id" uuid,
  "created_by_user_id" uuid NOT NULL,
  "agent_session_id" uuid,
  "spec_schema_version" integer NOT NULL CHECK ("spec_schema_version" >= 0 AND "spec_schema_version" = 2),
  "specification_json" jsonb NOT NULL,
  "spec_hash" text NOT NULL,
  "output_schema_json" jsonb NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('proposed', 'validating', 'invalid', 'building', 'ready', 'retired')),
  "validation_summary_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "validated_at" timestamptz,
  "ready_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "data_product_version_sources" (
  "data_product_version_id" uuid NOT NULL,
  "source_key" text NOT NULL,
  "source_snapshot_id" uuid NOT NULL,
  "access_mode" text NOT NULL CHECK ("access_mode" IN ('customer_api_key', 'x402')),
  "provider_credential_id" uuid,
  "spending_policy_id" uuid,
  "gateway_environment" text NOT NULL,
  "adapter_version" text NOT NULL,
  "source_config_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("data_product_version_id", "source_key")
);

CREATE TABLE "product_version_layouts" (
  "data_product_version_id" uuid NOT NULL,
  "layout_schema_version" integer NOT NULL CHECK ("layout_schema_version" >= 0 AND "layout_schema_version" = 1),
  "layout_json" jsonb NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("data_product_version_id")
);
