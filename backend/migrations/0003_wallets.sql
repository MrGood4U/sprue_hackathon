-- Data model 1.4: wallets. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "account_wallets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_wallet_id" text NOT NULL,
  "provider_external_id" text,
  "provider_chain_type" text NOT NULL,
  "provider_entity_id" text,
  "provider_owner_id" text,
  "provider_owner_type" text NOT NULL CHECK ("provider_owner_type" IN ('user', 'authorization_key', 'key_quorum', 'unverified')),
  "label" text,
  "control_model" text NOT NULL CHECK ("control_model" IN ('user_owned', 'user_owned_delegated', 'organization_owned', 'service_owned', 'external', 'unverified')),
  "status" text NOT NULL CHECK ("status" IN ('provisioning', 'active', 'restricted', 'archived', 'failed')),
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "wallet_addresses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "account_wallet_id" uuid NOT NULL,
  "network_id" uuid NOT NULL,
  "address_kind" text NOT NULL CHECK ("address_kind" IN ('evm', 'hedera_account_id', 'hedera_evm_address', 'hedera_long_zero_address')),
  "address" text NOT NULL,
  "normalized_address" text NOT NULL,
  "network_account_ref" text,
  "identity_status" text NOT NULL CHECK ("identity_status" IN ('unverified', 'resolved', 'mismatched')),
  "identity_evidence_ref" text,
  "account_completion_status" text NOT NULL CHECK ("account_completion_status" IN ('not_applicable', 'unverified', 'hollow', 'complete')),
  "can_spend" boolean NOT NULL DEFAULT false,
  "can_receive" boolean NOT NULL DEFAULT false,
  "control_status" text NOT NULL CHECK ("control_status" IN ('unverified', 'pending', 'verified', 'rejected')),
  "control_evidence_ref" text,
  "verified_at" timestamptz,
  "status" text NOT NULL CHECK ("status" IN ('active', 'disabled')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "wallet_asset_capabilities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "wallet_address_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "association_status" text NOT NULL CHECK ("association_status" IN ('not_required', 'unverified', 'associated', 'not_associated', 'auto_association_available')),
  "can_receive" boolean NOT NULL,
  "can_spend" boolean NOT NULL,
  "receiver_signature_required" boolean,
  "evidence_source" text NOT NULL,
  "evidence_ref" text,
  "evidence_hash" text,
  "status" text NOT NULL CHECK ("status" IN ('active', 'stale', 'rejected')),
  "observed_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "wallet_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_policy_id" text NOT NULL,
  "revision_no" integer NOT NULL CHECK ("revision_no" >= 0 AND "revision_no" > 0),
  "provider_owner_id" text,
  "owner_control_model" text NOT NULL CHECK ("owner_control_model" IN ('user', 'quorum_requires_user', 'service', 'unverified')),
  "provider_chain_type" text NOT NULL,
  "policy_version" text NOT NULL,
  "name" text NOT NULL,
  "definition_json" jsonb NOT NULL,
  "definition_hash" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('active', 'superseded', 'drifted', 'revoked')),
  "observed_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "wallet_signer_grants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "account_wallet_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_signer_id" text NOT NULL,
  "provider_signer_type" text NOT NULL CHECK ("provider_signer_type" IN ('authorization_key', 'key_quorum', 'unverified')),
  "wallet_policy_id" uuid NOT NULL,
  "signer_secret_ref" text,
  "signer_public_key_fingerprint" text,
  "granted_by_user_id" uuid NOT NULL,
  "consent_evidence_ref" text,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'active', 'drifted', 'revoked', 'expired', 'failed')),
  "valid_from" timestamptz,
  "valid_until" timestamptz,
  "granted_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "spending_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "wallet_signer_grant_id" uuid NOT NULL,
  "network_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "purpose" text NOT NULL CHECK ("purpose" IN ('graph_purchase')),
  "allowed_destinations_json" jsonb NOT NULL,
  "max_per_request_atomic" numeric(78,0) NOT NULL CHECK ("max_per_request_atomic" >= 0 AND "max_per_request_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "max_per_period_atomic" numeric(78,0) NOT NULL CHECK ("max_per_period_atomic" >= 0 AND "max_per_period_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "period_kind" text NOT NULL CHECK ("period_kind" IN ('day', 'week', 'month', 'fixed_window')),
  "period_starts_at" timestamptz NOT NULL,
  "period_ends_at" timestamptz NOT NULL,
  "max_total_atomic" numeric(78,0) CHECK ("max_total_atomic" >= 0 AND "max_total_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "status" text NOT NULL CHECK ("status" IN ('draft', 'active', 'paused', 'exhausted', 'revoked', 'expired')),
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("id")
);

CREATE TABLE "budget_reservations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "spending_policy_id" uuid NOT NULL,
  "execution_run_id" uuid NOT NULL,
  "node_id" text,
  "idempotency_key" text NOT NULL,
  "amount_atomic" numeric(78,0) NOT NULL CHECK ("amount_atomic" >= 0 AND "amount_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "status" text NOT NULL CHECK ("status" IN ('reserved', 'consumed', 'released', 'expired')),
  "expires_at" timestamptz NOT NULL,
  "consumed_payment_intent_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE "wallet_balance_snapshots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "wallet_address_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "balance_atomic" numeric(78,0) NOT NULL CHECK ("balance_atomic" >= 0 AND "balance_atomic" NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  "block_or_consensus_ref" text,
  "provider" text NOT NULL,
  "observed_at" timestamptz NOT NULL,
  PRIMARY KEY ("id")
);
