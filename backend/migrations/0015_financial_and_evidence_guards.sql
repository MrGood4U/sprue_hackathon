-- Structural consistency is not proof of consent, a valid signature or onchain settlement.
ALTER TABLE api_access_requests ADD CONSTRAINT uq_request_sale UNIQUE (payment_intent_id);
ALTER TABLE source_requests ADD CONSTRAINT uq_source_purchase UNIQUE (payment_intent_id);
ALTER TABLE source_requests ADD CONSTRAINT uq_source_reservation UNIQUE (budget_reservation_id);
ALTER TABLE budget_reservations ADD CONSTRAINT uq_consumed_purchase UNIQUE (consumed_payment_intent_id);
CREATE FUNCTION sprue_check_financial_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb := to_jsonb(NEW); expected_network uuid; address_field text; parent_row record; policy_row record;
BEGIN
  expected_network := (row_data->>'network_id')::uuid;
  IF expected_network IS NULL AND row_data->>'wallet_address_id' IS NOT NULL THEN
    SELECT network_id INTO expected_network FROM wallet_addresses WHERE id = (row_data->>'wallet_address_id')::uuid;
  END IF;
  IF expected_network IS NOT NULL AND row_data->>'asset_id' IS NOT NULL AND
    (SELECT network_id FROM assets WHERE id = (row_data->>'asset_id')::uuid) IS DISTINCT FROM expected_network THEN
    RAISE EXCEPTION 'asset network mismatch' USING ERRCODE = '23514';
  END IF;
  FOREACH address_field IN ARRAY ARRAY['wallet_address_id','payer_wallet_address_id','recipient_wallet_address_id'] LOOP
    IF expected_network IS NOT NULL AND row_data->>address_field IS NOT NULL AND
      (SELECT network_id FROM wallet_addresses WHERE id = (row_data->>address_field)::uuid) IS DISTINCT FROM expected_network THEN
      RAISE EXCEPTION 'wallet address network mismatch' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  CASE TG_TABLE_NAME
    WHEN 'payment_intents' THEN
      IF NEW.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM payment_settlements WHERE payment_intent_id = NEW.id AND status = 'confirmed') THEN
        RAISE EXCEPTION 'confirmed intent requires settlement evidence' USING ERRCODE = '23514';
      END IF;
    WHEN 'payment_attempts' THEN
      IF (SELECT network_id FROM payment_intents WHERE id = NEW.payment_intent_id) IS DISTINCT FROM NEW.network_id THEN RAISE EXCEPTION 'attempt network mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'payment_settlements' THEN
      SELECT * INTO parent_row FROM payment_intents WHERE id = NEW.payment_intent_id;
      IF (SELECT payment_intent_id FROM payment_attempts WHERE id = NEW.payment_attempt_id) IS DISTINCT FROM NEW.payment_intent_id THEN RAISE EXCEPTION 'settlement attempt mismatch' USING ERRCODE = '23514'; END IF;
      -- Mismatched observations remain recordable, but cannot become recognized settlement.
      IF NEW.status = 'confirmed' AND (parent_row.network_id IS DISTINCT FROM NEW.network_id OR parent_row.asset_id IS DISTINCT FROM NEW.asset_id OR parent_row.amount_atomic IS DISTINCT FROM NEW.amount_atomic OR parent_row.recipient_address IS DISTINCT FROM NEW.recipient_address) THEN RAISE EXCEPTION 'confirmed settlement terms mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'budget_reservations' THEN
      SELECT * INTO policy_row FROM spending_policies WHERE id = NEW.spending_policy_id;
      IF NEW.amount_atomic > policy_row.max_per_request_atomic THEN RAISE EXCEPTION 'reservation exceeds per-request limit' USING ERRCODE = '23514'; END IF;
      IF NEW.status = 'consumed' AND NOT EXISTS (SELECT 1 FROM payment_intents WHERE id = NEW.consumed_payment_intent_id AND kind = 'graph_purchase' AND status = 'confirmed' AND network_id = policy_row.network_id AND asset_id = policy_row.asset_id AND amount_atomic = NEW.amount_atomic) THEN RAISE EXCEPTION 'consumed reservation terms mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'financial_ledger_entries' THEN
      SELECT * INTO parent_row FROM payment_intents WHERE id = NEW.payment_intent_id;
      IF parent_row.network_id IS DISTINCT FROM NEW.network_id OR parent_row.asset_id IS DISTINCT FROM NEW.asset_id OR parent_row.data_product_id IS DISTINCT FROM NEW.data_product_id THEN RAISE EXCEPTION 'ledger intent mismatch' USING ERRCODE = '23514'; END IF;
      IF NEW.payment_allocation_id IS NOT NULL AND (SELECT payment_intent_id FROM payment_allocations WHERE id = NEW.payment_allocation_id) IS DISTINCT FROM NEW.payment_intent_id THEN RAISE EXCEPTION 'ledger allocation mismatch' USING ERRCODE = '23514'; END IF;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER financial_assets AFTER INSERT OR UPDATE ON assets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_capabilities AFTER INSERT OR UPDATE ON wallet_asset_capabilities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_balances AFTER INSERT OR UPDATE ON wallet_balance_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_policies AFTER INSERT OR UPDATE ON spending_policies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_publications AFTER INSERT OR UPDATE ON publication_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_intents AFTER INSERT OR UPDATE ON payment_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_attempts AFTER INSERT OR UPDATE ON payment_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_settlements AFTER INSERT OR UPDATE ON payment_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_reservations AFTER INSERT OR UPDATE ON budget_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();
CREATE CONSTRAINT TRIGGER financial_ledger AFTER INSERT OR UPDATE ON financial_ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_financial_links();

CREATE TRIGGER immutable_network_identity BEFORE UPDATE ON networks FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('namespace','reference','environment');
CREATE TRIGGER immutable_asset_identity BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('network_id','standard','asset_type','asset_identifier','decimals');
CREATE TRIGGER immutable_address_identity BEFORE UPDATE ON wallet_addresses FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('account_wallet_id','network_id','address_kind','address','normalized_address');
CREATE TRIGGER immutable_materialization_identity BEFORE UPDATE ON materializations FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id','data_product_id','data_product_version_id','execution_run_id','artifact_id','source_freshness_at');
CREATE TRIGGER immutable_artifact_content BEFORE UPDATE ON artifacts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id','execution_run_id','artifact_kind','storage_kind','payload_json','object_uri','schema_json','content_hash','row_count','byte_count');
CREATE TRIGGER immutable_reservation BEFORE UPDATE ON budget_reservations FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('spending_policy_id','execution_run_id','node_id','idempotency_key','amount_atomic');

CREATE FUNCTION sprue_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  IF TG_TABLE_NAME = 'source_snapshots' THEN
    IF OLD.status IN ('validated','superseded') OR EXISTS (SELECT 1 FROM data_product_version_sources WHERE source_snapshot_id = OLD.id) THEN
      IF (to_jsonb(OLD) - 'status') IS DISTINCT FROM (to_jsonb(NEW) - 'status') THEN RAISE EXCEPTION 'pinned source evidence is immutable' USING ERRCODE = '23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'workspace_members' THEN
    IF EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.workspace_id AND owner_user_id = OLD.user_id) THEN RAISE EXCEPTION 'cannot delete owner membership' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  ELSE
    FOREACH field_name IN ARRAY TG_ARGV LOOP
      IF to_jsonb(OLD)->>field_name IS NOT NULL AND (to_jsonb(OLD)->field_name) IS DISTINCT FROM (to_jsonb(NEW)->field_name) THEN RAISE EXCEPTION 'bound evidence cannot be reassigned: %', field_name USING ERRCODE = '23514'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pinned_source BEFORE UPDATE ON source_snapshots FOR EACH ROW EXECUTE FUNCTION sprue_evidence_guard();
CREATE TRIGGER retain_owner BEFORE DELETE ON workspace_members FOR EACH ROW EXECUTE FUNCTION sprue_evidence_guard();
CREATE TRIGGER source_payment_binding BEFORE UPDATE ON source_requests FOR EACH ROW EXECUTE FUNCTION sprue_evidence_guard('payment_intent_id','budget_reservation_id','response_artifact_id');
CREATE TRIGGER request_payment_binding BEFORE UPDATE ON api_access_requests FOR EACH ROW EXECUTE FUNCTION sprue_evidence_guard('payment_intent_id','recovery_revoked_at');
CREATE TRIGGER reservation_payment_binding BEFORE UPDATE ON budget_reservations FOR EACH ROW EXECUTE FUNCTION sprue_evidence_guard('consumed_payment_intent_id');
