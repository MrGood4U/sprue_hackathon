-- Data model 1.8: durable, workspace-scoped Agent model profiles with
-- application-layer envelope encryption. Plaintext API keys never enter SQL.

CREATE TABLE "agent_model_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "protocol" text NOT NULL,
  "api_url" text NOT NULL,
  "model_name" text NOT NULL,
  "api_key_ciphertext" bytea NOT NULL,
  "encryption_key_id" text NOT NULL,
  "encryption_iv" bytea NOT NULL,
  "encryption_auth_tag" bytea NOT NULL,
  "secret_version" integer NOT NULL,
  "credential_fingerprint" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("id")
);

ALTER TABLE "agent_model_profiles" ADD CONSTRAINT fk_151
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE RESTRICT;
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT fk_152
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT;
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT fk_153
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT;
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT uq_051 UNIQUE ("workspace_id");

ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_053 CHECK ("protocol" = 'openai_compatible_chat_completions');
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_054 CHECK (char_length("api_url") BETWEEN 1 AND 2048);
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_055 CHECK (char_length("model_name") BETWEEN 1 AND 200);
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_056 CHECK (octet_length("api_key_ciphertext") BETWEEN 1 AND 4096);
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_057 CHECK ("encryption_key_id" ~ '^[A-Za-z0-9._-]{1,64}$');
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_058 CHECK (octet_length("encryption_iv") = 12);
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_059 CHECK (octet_length("encryption_auth_tag") = 16);
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_060 CHECK ("secret_version" > 0);
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_061 CHECK ("credential_fingerprint" ~ '^[0-9a-f]{64}$');
ALTER TABLE "agent_model_profiles" ADD CONSTRAINT ck_062 CHECK ("lock_version" >= 0 AND "updated_at" >= "created_at");

CREATE INDEX ix_170 ON "agent_model_profiles" ("created_by_user_id");
CREATE INDEX ix_171 ON "agent_model_profiles" ("updated_by_user_id");
CREATE INDEX ix_172 ON "agent_model_profiles" ("encryption_key_id");

CREATE OR REPLACE FUNCTION sprue_check_workspace_actors() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_workspace_id uuid;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'account_wallets' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.owner_user_id, 'account_wallets.owner_user_id');
    WHEN 'wallet_signer_grants' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.granted_by_user_id, 'wallet_signer_grants.granted_by_user_id');
    WHEN 'spending_policies' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.created_by_user_id, 'spending_policies.created_by_user_id');
    WHEN 'agent_sessions' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.created_by_user_id, 'agent_sessions.created_by_user_id');
    WHEN 'provider_credentials' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.created_by_user_id, 'provider_credentials.created_by_user_id');
    WHEN 'data_products' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.creator_user_id, 'data_products.creator_user_id');
    WHEN 'data_product_versions' THEN
      record_workspace_id := sprue_workspace_of('data_products', NEW.data_product_id);
      PERFORM sprue_require_workspace_member(record_workspace_id, NEW.created_by_user_id, 'data_product_versions.created_by_user_id');
    WHEN 'product_version_layouts' THEN
      record_workspace_id := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
      PERFORM sprue_require_workspace_member(record_workspace_id, NEW.updated_by_user_id, 'product_version_layouts.updated_by_user_id');
    WHEN 'publication_versions' THEN
      record_workspace_id := sprue_workspace_of('deployments', NEW.deployment_id);
      PERFORM sprue_require_workspace_member(record_workspace_id, NEW.accepted_by_user_id, 'publication_versions.accepted_by_user_id');
    WHEN 'api_credentials' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.created_by_user_id, 'api_credentials.created_by_user_id');
    WHEN 'execution_runs' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.requested_by_user_id, 'execution_runs.requested_by_user_id');
    WHEN 'control_commands' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.actor_user_id, 'control_commands.actor_user_id');
    WHEN 'agent_model_profiles' THEN
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.created_by_user_id, 'agent_model_profiles.created_by_user_id');
      PERFORM sprue_require_workspace_member(NEW.workspace_id, NEW.updated_by_user_id, 'agent_model_profiles.updated_by_user_id');
  END CASE;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER actor_scope_agent_model_profiles
  AFTER INSERT OR UPDATE ON "agent_model_profiles"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
