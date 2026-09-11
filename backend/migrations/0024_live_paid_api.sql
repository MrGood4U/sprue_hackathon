-- Live x402 delivery supports immutable live plans without cached materializations.

DROP TRIGGER lineage_api_access_requests ON api_access_requests;

CREATE FUNCTION sprue_check_api_access_request_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deployment_row record; publication_row record;
BEGIN
  SELECT * INTO deployment_row FROM deployments WHERE id = NEW.deployment_id;
  SELECT * INTO publication_row FROM publication_versions WHERE id = NEW.publication_version_id;

  IF publication_row.deployment_id IS DISTINCT FROM NEW.deployment_id THEN
    RAISE EXCEPTION 'request publication deployment mismatch' USING ERRCODE = '23514';
  END IF;
  IF (SELECT data_product_id FROM data_product_versions WHERE id = NEW.data_product_version_id)
      IS DISTINCT FROM deployment_row.data_product_id THEN
    RAISE EXCEPTION 'request version product mismatch' USING ERRCODE = '23514';
  END IF;

  IF publication_row.serve_mode = 'live' THEN
    IF NEW.materialization_id IS NOT NULL THEN
      RAISE EXCEPTION 'live request cannot pin a materialization' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.materialization_id IS NULL OR
    (SELECT data_product_version_id FROM materializations WHERE id = NEW.materialization_id)
      IS DISTINCT FROM NEW.data_product_version_id THEN
    RAISE EXCEPTION 'materialized request lacks matching data' USING ERRCODE = '23514';
  END IF;

  IF publication_row.access_mode = 'x402' AND
    (NEW.recovery_capability_hash IS NULL OR NEW.idempotency_key IS NULL) THEN
    RAISE EXCEPTION 'paid request requires recovery capability' USING ERRCODE = '23514';
  END IF;
  IF publication_row.access_mode <> 'x402' AND
    NEW.api_credential_id IS NULL AND NEW.caller_user_id IS NULL THEN
    RAISE EXCEPTION 'private request requires a caller identity' USING ERRCODE = '23514';
  END IF;
  IF NEW.payment_intent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payment_intents
    WHERE id = NEW.payment_intent_id AND kind = 'api_sale'
      AND data_product_id = deployment_row.data_product_id
      AND network_id = publication_row.network_id
      AND asset_id = publication_row.asset_id
      AND amount_atomic = publication_row.price_atomic
  ) THEN
    RAISE EXCEPTION 'sale payment does not match publication' USING ERRCODE = '23514';
  END IF;
  IF publication_row.access_mode = 'x402' AND NEW.status = 'served' AND NOT EXISTS (
    SELECT 1 FROM payment_intents p
    JOIN api_payment_proofs proof ON proof.payment_intent_id = p.id
    WHERE p.id = NEW.payment_intent_id AND p.status = 'confirmed'
      AND proof.api_access_request_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'paid delivery lacks confirmed payment/proof binding' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER lineage_live_api_access_requests
  AFTER INSERT OR UPDATE ON api_access_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sprue_check_api_access_request_lineage();
