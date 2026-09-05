-- Runtime services must additionally validate operator schemas, consent and live evidence.
CREATE FUNCTION sprue_check_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_row record; other_row record; source_row record; intent_row record;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'workspaces' THEN
      IF NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = NEW.id AND user_id = NEW.owner_user_id AND role = 'owner' AND status = 'active') THEN
        RAISE EXCEPTION 'workspace requires its active owner membership' USING ERRCODE = '23514';
      END IF;
    WHEN 'workspace_members' THEN
      IF NOT EXISTS (SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE w.id = NEW.workspace_id AND m.user_id = w.owner_user_id AND m.role = 'owner' AND m.status = 'active') THEN
        RAISE EXCEPTION 'cannot remove the active workspace owner' USING ERRCODE = '23514';
      END IF;
    WHEN 'data_product_versions' THEN
      IF NEW.parent_version_id IS NOT NULL AND (SELECT data_product_id FROM data_product_versions WHERE id = NEW.parent_version_id) IS DISTINCT FROM NEW.data_product_id THEN RAISE EXCEPTION 'version parent mismatch' USING ERRCODE = '23514'; END IF;
      IF jsonb_array_length(NEW.specification_json->'sources') IS DISTINCT FROM (SELECT count(*)::integer FROM data_product_version_sources WHERE data_product_version_id = NEW.id) THEN RAISE EXCEPTION 'source projections must be complete' USING ERRCODE = '23514'; END IF;
    WHEN 'execution_runs' THEN
      SELECT * INTO parent_row FROM data_product_versions WHERE id = NEW.data_product_version_id;
      IF parent_row.data_product_id IS DISTINCT FROM NEW.data_product_id OR parent_row.spec_hash IS DISTINCT FROM NEW.spec_hash THEN RAISE EXCEPTION 'run version mismatch' USING ERRCODE = '23514'; END IF;
      IF NEW.deployment_id IS NOT NULL AND (SELECT data_product_id FROM deployments WHERE id = NEW.deployment_id) IS DISTINCT FROM NEW.data_product_id THEN RAISE EXCEPTION 'run deployment mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'node_runs' THEN
      SELECT v.specification_json INTO parent_row FROM run_attempts a JOIN execution_runs r ON r.id = a.execution_run_id JOIN data_product_versions v ON v.id = r.data_product_version_id WHERE a.id = NEW.run_attempt_id;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(parent_row.specification_json->'dag'->'nodes') n WHERE n->>'id' = NEW.node_id AND n->>'type' = NEW.operator_type AND n->>'operatorVersion' = NEW.operator_version) THEN RAISE EXCEPTION 'node does not match pinned spec' USING ERRCODE = '23514'; END IF;
    WHEN 'node_run_artifacts' THEN
      SELECT a.execution_run_id INTO parent_row FROM node_runs n JOIN run_attempts a ON a.id = n.run_attempt_id WHERE n.id = NEW.node_run_id;
      IF (SELECT execution_run_id FROM artifacts WHERE id = NEW.artifact_id) IS DISTINCT FROM parent_row.execution_run_id THEN RAISE EXCEPTION 'artifact run mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'materializations' THEN
      SELECT * INTO parent_row FROM execution_runs WHERE id = NEW.execution_run_id;
      IF parent_row.data_product_version_id IS DISTINCT FROM NEW.data_product_version_id OR parent_row.data_product_id IS DISTINCT FROM NEW.data_product_id OR parent_row.status <> 'succeeded' THEN RAISE EXCEPTION 'materialization run mismatch' USING ERRCODE = '23514'; END IF;
      IF NOT EXISTS (SELECT 1 FROM artifacts WHERE id = NEW.artifact_id AND execution_run_id = NEW.execution_run_id AND artifact_kind = 'materialized_output') THEN RAISE EXCEPTION 'materialization artifact mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'deployments' THEN
      IF NEW.active_version_id IS NOT NULL THEN
        SELECT * INTO parent_row FROM data_product_versions WHERE id = NEW.active_version_id;
        SELECT * INTO other_row FROM materializations WHERE id = NEW.active_materialization_id;
        IF parent_row.data_product_id IS DISTINCT FROM NEW.data_product_id OR parent_row.status <> 'ready' OR other_row.data_product_version_id IS DISTINCT FROM NEW.active_version_id OR other_row.status <> 'ready' THEN RAISE EXCEPTION 'invalid active version/materialization' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.active_publication_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publication_versions WHERE id = NEW.active_publication_version_id AND deployment_id = NEW.id AND status = 'active') THEN RAISE EXCEPTION 'active publication mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'data_product_version_sources' THEN
      SELECT specification_json INTO parent_row FROM data_product_versions WHERE id = NEW.data_product_version_id;
      SELECT value INTO source_row FROM jsonb_array_elements(parent_row.specification_json->'sources') WHERE value->>'id' = NEW.source_key;
      IF NOT FOUND OR source_row.value->>'sourceSnapshotId' IS DISTINCT FROM NEW.source_snapshot_id::text OR source_row.value->'access'->>'mode' IS DISTINCT FROM NEW.access_mode OR source_row.value->'access'->>'providerCredentialId' IS DISTINCT FROM NEW.provider_credential_id::text OR source_row.value->'access'->>'spendingPolicyId' IS DISTINCT FROM NEW.spending_policy_id::text OR source_row.value->'access'->>'gatewayEnvironment' IS DISTINCT FROM NEW.gateway_environment OR source_row.value->>'adapterVersion' IS DISTINCT FROM NEW.adapter_version THEN RAISE EXCEPTION 'source projection mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'product_version_layouts' THEN
      SELECT specification_json INTO parent_row FROM data_product_versions WHERE id = NEW.data_product_version_id;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.layout_json->'nodes') l WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(parent_row.specification_json->'dag'->'nodes') n WHERE n->>'id' = l->>'nodeId')) THEN RAISE EXCEPTION 'unknown layout node' USING ERRCODE = '23514'; END IF;
    WHEN 'execution_run_contexts' THEN
      SELECT * INTO parent_row FROM execution_runs WHERE id = NEW.execution_run_id;
      IF NEW.anchor_at IS DISTINCT FROM parent_row.queued_at OR NEW.spec_hash IS DISTINCT FROM parent_row.spec_hash OR NEW.registry_hash IS DISTINCT FROM parent_row.operator_registry_hash OR NEW.runtime_version IS DISTINCT FROM parent_row.runtime_version THEN RAISE EXCEPTION 'run context mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'run_source_contexts' THEN
      SELECT v.specification_json, v.id AS version_id INTO parent_row FROM execution_runs r JOIN data_product_versions v ON v.id = r.data_product_version_id WHERE r.id = NEW.execution_run_id;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(parent_row.specification_json->'dag'->'nodes') n WHERE n->>'id' = NEW.node_id AND n->>'type' = 'source' AND n->'config'->>'sourceId' = NEW.source_key) OR NOT EXISTS (SELECT 1 FROM data_product_version_sources WHERE data_product_version_id = parent_row.version_id AND source_key = NEW.source_key AND source_snapshot_id = NEW.source_snapshot_id) THEN RAISE EXCEPTION 'source context mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'source_requests' THEN
      SELECT a.execution_run_id, n.node_id INTO parent_row FROM node_runs n JOIN run_attempts a ON a.id = n.run_attempt_id WHERE n.id = NEW.node_run_id;
      IF parent_row.execution_run_id IS DISTINCT FROM NEW.execution_run_id OR parent_row.node_id IS DISTINCT FROM NEW.node_id THEN RAISE EXCEPTION 'source request attempt mismatch' USING ERRCODE = '23514'; END IF;
      SELECT * INTO source_row FROM run_source_contexts WHERE execution_run_id = NEW.execution_run_id AND node_id = NEW.node_id;
      IF NOT FOUND OR source_row.source_snapshot_id IS DISTINCT FROM NEW.source_snapshot_id THEN RAISE EXCEPTION 'missing logical source context' USING ERRCODE = '23514'; END IF;
      IF NOT EXISTS (SELECT 1 FROM execution_runs r JOIN data_product_version_sources s ON s.data_product_version_id = r.data_product_version_id WHERE r.id = NEW.execution_run_id AND s.source_key = source_row.source_key AND s.access_mode = NEW.access_mode AND s.provider_credential_id IS NOT DISTINCT FROM NEW.provider_credential_id AND s.spending_policy_id IS NOT DISTINCT FROM NEW.spending_policy_id AND s.gateway_environment = NEW.gateway_environment) THEN RAISE EXCEPTION 'source request access differs from pinned source' USING ERRCODE = '23514'; END IF;
      IF NEW.request_kind <> 'block_probe' AND (source_row.status <> 'frozen' OR NEW.requested_block_ref IS DISTINCT FROM source_row.requested_block_ref) THEN RAISE EXCEPTION 'data page requires frozen block' USING ERRCODE = '23514'; END IF;
      IF NEW.access_mode = 'x402' AND NEW.status = 'succeeded' AND NOT EXISTS (SELECT 1 FROM budget_reservations b JOIN payment_intents p ON p.id = b.consumed_payment_intent_id WHERE b.id = NEW.budget_reservation_id AND b.spending_policy_id = NEW.spending_policy_id AND b.execution_run_id = NEW.execution_run_id AND b.status = 'consumed' AND p.id = NEW.payment_intent_id AND p.status = 'confirmed') THEN RAISE EXCEPTION 'paid source success lacks settlement/reservation' USING ERRCODE = '23514'; END IF;
    WHEN 'source_http_attempts' THEN
      SELECT * INTO source_row FROM source_requests WHERE id = NEW.source_request_id;
      SELECT a.execution_run_id, n.node_id INTO parent_row FROM node_runs n JOIN run_attempts a ON a.id = n.run_attempt_id WHERE n.id = NEW.node_run_id;
      IF parent_row.execution_run_id IS DISTINCT FROM source_row.execution_run_id OR parent_row.node_id IS DISTINCT FROM source_row.node_id OR (source_row.access_mode = 'customer_api_key' AND NEW.has_payment_authorization) THEN RAISE EXCEPTION 'source HTTP attempt mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'control_commands' THEN
      IF NEW.dispatch_required AND NOT EXISTS (SELECT 1 FROM command_dispatches WHERE control_command_id = NEW.id) THEN RAISE EXCEPTION 'async command missing transactional outbox' USING ERRCODE = '23514'; END IF;
    WHEN 'command_dispatches' THEN
      IF NOT (SELECT dispatch_required FROM control_commands WHERE id = NEW.control_command_id) THEN RAISE EXCEPTION 'command does not require dispatch' USING ERRCODE = '23514'; END IF;
    WHEN 'planning_checkpoints' THEN
      IF NEW.parent_version_id IS NOT NULL AND (SELECT data_product_id FROM data_product_versions WHERE id = NEW.parent_version_id) IS DISTINCT FROM (SELECT data_product_id FROM agent_sessions WHERE id = NEW.agent_session_id) THEN RAISE EXCEPTION 'planning parent mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'planning_calls' THEN
      IF NEW.result_message_id IS NOT NULL AND (SELECT agent_session_id FROM agent_messages WHERE id = NEW.result_message_id) IS DISTINCT FROM (SELECT agent_session_id FROM planning_checkpoints WHERE control_command_id = NEW.control_command_id) THEN RAISE EXCEPTION 'planning result session mismatch' USING ERRCODE = '23514'; END IF;
    WHEN 'compilation_records' THEN
      IF NEW.data_product_version_id IS NOT NULL AND (SELECT spec_hash FROM data_product_versions WHERE id = NEW.data_product_version_id) IS DISTINCT FROM NEW.expanded_spec_hash THEN RAISE EXCEPTION 'compilation spec hash mismatch' USING ERRCODE = '23514'; END IF;
      IF NEW.proposal_message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent_messages WHERE id = NEW.proposal_message_id AND role = 'assistant' AND content_json->>'kind' = 'proposal') THEN RAISE EXCEPTION 'compilation requires a proposal message' USING ERRCODE = '23514'; END IF;
      IF NEW.proposal_compilation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM compilation_records WHERE id = NEW.proposal_compilation_id AND proposal_message_id IS NOT NULL AND expanded_spec_hash = NEW.expanded_spec_hash AND content_hash = NEW.content_hash AND provenance_json = NEW.provenance_json) THEN RAISE EXCEPTION 'accepted compilation differs from proposal' USING ERRCODE = '23514'; END IF;
    WHEN 'api_access_requests' THEN
      SELECT * INTO parent_row FROM deployments WHERE id = NEW.deployment_id;
      SELECT * INTO other_row FROM publication_versions WHERE id = NEW.publication_version_id;
      IF other_row.deployment_id IS DISTINCT FROM NEW.deployment_id OR (SELECT data_product_id FROM data_product_versions WHERE id = NEW.data_product_version_id) IS DISTINCT FROM parent_row.data_product_id OR NEW.materialization_id IS NULL OR (SELECT data_product_version_id FROM materializations WHERE id = NEW.materialization_id) IS DISTINCT FROM NEW.data_product_version_id THEN RAISE EXCEPTION 'request pinned product mismatch' USING ERRCODE = '23514'; END IF;
      IF other_row.access_mode = 'x402' AND (NEW.recovery_capability_hash IS NULL OR NEW.idempotency_key IS NULL) THEN RAISE EXCEPTION 'paid request requires recovery capability' USING ERRCODE = '23514'; END IF;
      IF other_row.access_mode <> 'x402' AND NEW.api_credential_id IS NULL AND NEW.caller_user_id IS NULL THEN RAISE EXCEPTION 'private request requires a caller identity' USING ERRCODE = '23514'; END IF;
      IF NEW.payment_intent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_intents WHERE id = NEW.payment_intent_id AND kind = 'api_sale' AND data_product_id = parent_row.data_product_id AND network_id = other_row.network_id AND asset_id = other_row.asset_id AND amount_atomic = other_row.price_atomic) THEN RAISE EXCEPTION 'sale payment does not match publication' USING ERRCODE = '23514'; END IF;
      IF other_row.access_mode = 'x402' AND NEW.status = 'served' AND NOT EXISTS (SELECT 1 FROM payment_intents p JOIN api_payment_proofs proof ON proof.payment_intent_id = p.id WHERE p.id = NEW.payment_intent_id AND p.status = 'confirmed' AND proof.api_access_request_id = NEW.id) THEN RAISE EXCEPTION 'paid delivery lacks confirmed payment/proof binding' USING ERRCODE = '23514'; END IF;
    WHEN 'api_payment_proofs' THEN
      IF NOT EXISTS (SELECT 1 FROM api_access_requests r JOIN payment_intents p ON p.id = r.payment_intent_id WHERE r.id = NEW.api_access_request_id AND p.id = NEW.payment_intent_id AND p.kind = 'api_sale') THEN RAISE EXCEPTION 'payment proof binding mismatch' USING ERRCODE = '23514'; END IF;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;

CREATE FUNCTION sprue_lifecycle_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'data_product_versions' THEN
    IF OLD.status <> NEW.status AND NOT ((OLD.status = 'proposed' AND NEW.status IN ('validating','building','retired')) OR (OLD.status = 'validating' AND NEW.status IN ('proposed','invalid')) OR (OLD.status = 'invalid' AND NEW.status IN ('validating','retired')) OR (OLD.status = 'building' AND NEW.status IN ('proposed','ready')) OR (OLD.status = 'ready' AND NEW.status = 'retired')) THEN RAISE EXCEPTION 'invalid version transition' USING ERRCODE = '23514'; END IF;
    IF NEW.status = 'building' AND NEW.validated_at IS NULL THEN RAISE EXCEPTION 'build requires validation' USING ERRCODE = '23514'; END IF;
    IF OLD.ready_at IS NOT NULL AND NEW.ready_at IS DISTINCT FROM OLD.ready_at THEN RAISE EXCEPTION 'first ready timestamp is immutable' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME IN ('execution_runs','control_commands') THEN
    IF OLD.status <> NEW.status AND NOT ((OLD.status = 'queued' AND NEW.status IN ('running','blocked','failed','cancelled')) OR (OLD.status = 'running' AND NEW.status IN ('blocked','succeeded','failed','cancelled')) OR (OLD.status = 'blocked' AND NEW.status IN ('queued','failed','cancelled'))) THEN RAISE EXCEPTION 'invalid command/run transition' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'run_source_contexts' THEN
    IF OLD.status = 'frozen' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'frozen source context is immutable' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'planning_checkpoints' THEN
    IF NEW.repairs_used < OLD.repairs_used OR NEW.revision_no < OLD.revision_no THEN RAISE EXCEPTION 'checkpoint counters cannot reset' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'planning_calls' THEN
    PERFORM 1 FROM planning_checkpoints WHERE control_command_id = NEW.control_command_id FOR UPDATE;
    IF (OLD.observed_input_tokens IS NOT NULL AND (NEW.observed_input_tokens IS NULL OR NEW.observed_input_tokens < OLD.observed_input_tokens)) OR (OLD.observed_output_tokens IS NOT NULL AND (NEW.observed_output_tokens IS NULL OR NEW.observed_output_tokens < OLD.observed_output_tokens)) OR (OLD.observed_cost_atomic IS NOT NULL AND (NEW.observed_cost_atomic IS NULL OR NEW.observed_cost_atomic < OLD.observed_cost_atomic)) THEN RAISE EXCEPTION 'observed usage cannot reset' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'payment_settlements' THEN
    IF OLD.status = 'confirmed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'confirmed settlement is immutable' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION sprue_reserve_planning_call() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE limits planning_checkpoints%ROWTYPE; model_calls bigint; tool_calls bigint; input_tokens numeric; output_tokens numeric; cost numeric;
BEGIN
  SELECT * INTO limits FROM planning_checkpoints WHERE control_command_id = NEW.control_command_id FOR UPDATE;
  IF NOT FOUND OR limits.deadline_at <= now() THEN RAISE EXCEPTION 'missing or expired planning checkpoint' USING ERRCODE = '23514'; END IF;
  SELECT count(*) FILTER (WHERE call_kind = 'model'), count(*) FILTER (WHERE call_kind = 'tool'), coalesce(sum(greatest(reserved_input_tokens, observed_input_tokens)),0), coalesce(sum(greatest(reserved_output_tokens, observed_output_tokens)),0), coalesce(sum(greatest(reserved_cost_atomic, observed_cost_atomic)),0) INTO model_calls, tool_calls, input_tokens, output_tokens, cost FROM planning_calls WHERE control_command_id = NEW.control_command_id;
  IF model_calls + (CASE WHEN NEW.call_kind = 'model' THEN 1 ELSE 0 END) > limits.model_call_limit OR tool_calls + (CASE WHEN NEW.call_kind = 'tool' THEN 1 ELSE 0 END) > limits.tool_call_limit OR input_tokens + NEW.reserved_input_tokens > limits.input_token_limit OR output_tokens + NEW.reserved_output_tokens > limits.output_token_limit OR cost + NEW.reserved_cost_atomic > limits.cost_limit_atomic THEN RAISE EXCEPTION 'planning reservation exceeds pinned limit' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER planning_reservation BEFORE INSERT ON planning_calls FOR EACH ROW EXECUTE FUNCTION sprue_reserve_planning_call();

CREATE FUNCTION sprue_protect_recovery_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM materializations m JOIN api_access_requests r ON r.materialization_id = m.id WHERE m.artifact_id = OLD.id AND r.recovery_expires_at > now()) THEN RAISE EXCEPTION 'artifact retained for request recovery' USING ERRCODE = '23514'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER retain_recovery_artifact BEFORE DELETE ON artifacts FOR EACH ROW EXECUTE FUNCTION sprue_protect_recovery_artifact();
