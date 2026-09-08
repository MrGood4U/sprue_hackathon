-- Data model 1.7: bind creator-attributed configuration and command records to
-- a membership in the same workspace. Request authorization remains a service
-- responsibility; an API consumer is not required to belong to the publisher.

CREATE FUNCTION sprue_require_workspace_member(
  record_workspace_id uuid,
  record_user_id uuid,
  field_name text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF record_workspace_id IS NULL OR record_user_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = record_workspace_id
      AND user_id = record_user_id
  ) THEN
    RAISE EXCEPTION 'workspace actor is not a member: %', field_name
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION sprue_check_workspace_actors() RETURNS trigger LANGUAGE plpgsql AS $$
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
  END CASE;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER actor_scope_account_wallets AFTER INSERT OR UPDATE ON account_wallets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_wallet_signer_grants AFTER INSERT OR UPDATE ON wallet_signer_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_spending_policies AFTER INSERT OR UPDATE ON spending_policies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_agent_sessions AFTER INSERT OR UPDATE ON agent_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_provider_credentials AFTER INSERT OR UPDATE ON provider_credentials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_data_products AFTER INSERT OR UPDATE ON data_products DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_data_product_versions AFTER INSERT OR UPDATE ON data_product_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_product_version_layouts AFTER INSERT OR UPDATE ON product_version_layouts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_publication_versions AFTER INSERT OR UPDATE ON publication_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_api_credentials AFTER INSERT OR UPDATE ON api_credentials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_execution_runs AFTER INSERT OR UPDATE ON execution_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
CREATE CONSTRAINT TRIGGER actor_scope_control_commands AFTER INSERT OR UPDATE ON control_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_actors();
