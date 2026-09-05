-- Cross-workspace consistency is defense in depth; API authorization is still required.
CREATE FUNCTION sprue_workspace_of(kind text, record_id uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid;
BEGIN
  IF record_id IS NULL THEN RETURN NULL; END IF;
  CASE kind
    WHEN 'workspace_members' THEN SELECT workspace_id INTO result FROM workspace_members WHERE id = record_id;
    WHEN 'account_wallets' THEN SELECT workspace_id INTO result FROM account_wallets WHERE id = record_id;
    WHEN 'wallet_addresses' THEN SELECT sprue_workspace_of('account_wallets', account_wallet_id) INTO result FROM wallet_addresses WHERE id = record_id;
    WHEN 'wallet_asset_capabilities' THEN SELECT sprue_workspace_of('wallet_addresses', wallet_address_id) INTO result FROM wallet_asset_capabilities WHERE id = record_id;
    WHEN 'wallet_policies' THEN SELECT workspace_id INTO result FROM wallet_policies WHERE id = record_id;
    WHEN 'wallet_signer_grants' THEN SELECT workspace_id INTO result FROM wallet_signer_grants WHERE id = record_id;
    WHEN 'spending_policies' THEN SELECT workspace_id INTO result FROM spending_policies WHERE id = record_id;
    WHEN 'budget_reservations' THEN SELECT sprue_workspace_of('spending_policies', spending_policy_id) INTO result FROM budget_reservations WHERE id = record_id;
    WHEN 'wallet_balance_snapshots' THEN SELECT sprue_workspace_of('wallet_addresses', wallet_address_id) INTO result FROM wallet_balance_snapshots WHERE id = record_id;
    WHEN 'agent_sessions' THEN SELECT workspace_id INTO result FROM agent_sessions WHERE id = record_id;
    WHEN 'agent_messages' THEN SELECT sprue_workspace_of('agent_sessions', agent_session_id) INTO result FROM agent_messages WHERE id = record_id;
    WHEN 'provider_credentials' THEN SELECT workspace_id INTO result FROM provider_credentials WHERE id = record_id;
    WHEN 'source_snapshots' THEN SELECT workspace_id INTO result FROM source_snapshots WHERE id = record_id;
    WHEN 'data_products' THEN SELECT workspace_id INTO result FROM data_products WHERE id = record_id;
    WHEN 'data_product_versions' THEN SELECT sprue_workspace_of('data_products', data_product_id) INTO result FROM data_product_versions WHERE id = record_id;
    WHEN 'data_product_version_sources' THEN SELECT sprue_workspace_of('data_product_versions', data_product_version_id) INTO result FROM data_product_version_sources WHERE data_product_version_id = record_id;
    WHEN 'product_version_layouts' THEN SELECT sprue_workspace_of('data_product_versions', data_product_version_id) INTO result FROM product_version_layouts WHERE data_product_version_id = record_id;
    WHEN 'deployments' THEN SELECT workspace_id INTO result FROM deployments WHERE id = record_id;
    WHEN 'publication_versions' THEN SELECT sprue_workspace_of('deployments', deployment_id) INTO result FROM publication_versions WHERE id = record_id;
    WHEN 'api_credentials' THEN SELECT workspace_id INTO result FROM api_credentials WHERE id = record_id;
    WHEN 'refresh_schedules' THEN SELECT workspace_id INTO result FROM refresh_schedules WHERE id = record_id;
    WHEN 'execution_runs' THEN SELECT workspace_id INTO result FROM execution_runs WHERE id = record_id;
    WHEN 'run_attempts' THEN SELECT sprue_workspace_of('execution_runs', execution_run_id) INTO result FROM run_attempts WHERE id = record_id;
    WHEN 'node_runs' THEN SELECT sprue_workspace_of('run_attempts', run_attempt_id) INTO result FROM node_runs WHERE id = record_id;
    WHEN 'node_run_artifacts' THEN SELECT sprue_workspace_of('node_runs', node_run_id) INTO result FROM node_run_artifacts WHERE id = record_id;
    WHEN 'artifacts' THEN SELECT workspace_id INTO result FROM artifacts WHERE id = record_id;
    WHEN 'source_requests' THEN SELECT workspace_id INTO result FROM source_requests WHERE id = record_id;
    WHEN 'source_http_attempts' THEN SELECT sprue_workspace_of('source_requests', source_request_id) INTO result FROM source_http_attempts WHERE id = record_id;
    WHEN 'materializations' THEN SELECT workspace_id INTO result FROM materializations WHERE id = record_id;
    WHEN 'trace_streams' THEN SELECT workspace_id INTO result FROM trace_streams WHERE id = record_id;
    WHEN 'trace_events' THEN SELECT sprue_workspace_of('trace_streams', trace_stream_id) INTO result FROM trace_events WHERE id = record_id;
    WHEN 'api_access_requests' THEN SELECT workspace_id INTO result FROM api_access_requests WHERE id = record_id;
    WHEN 'api_http_attempts' THEN SELECT sprue_workspace_of('api_access_requests', api_access_request_id) INTO result FROM api_http_attempts WHERE id = record_id;
    WHEN 'usage_events' THEN SELECT workspace_id INTO result FROM usage_events WHERE id = record_id;
    WHEN 'payment_intents' THEN SELECT workspace_id INTO result FROM payment_intents WHERE id = record_id;
    WHEN 'payment_attempts' THEN SELECT sprue_workspace_of('payment_intents', payment_intent_id) INTO result FROM payment_attempts WHERE id = record_id;
    WHEN 'payment_settlements' THEN SELECT sprue_workspace_of('payment_intents', payment_intent_id) INTO result FROM payment_settlements WHERE id = record_id;
    WHEN 'payment_allocations' THEN SELECT sprue_workspace_of('payment_intents', payment_intent_id) INTO result FROM payment_allocations WHERE id = record_id;
    WHEN 'financial_ledger_entries' THEN SELECT workspace_id INTO result FROM financial_ledger_entries WHERE id = record_id;
    WHEN 'control_commands' THEN SELECT workspace_id INTO result FROM control_commands WHERE id = record_id;
    WHEN 'command_dispatches' THEN SELECT sprue_workspace_of('control_commands', control_command_id) INTO result FROM command_dispatches WHERE control_command_id = record_id;
    WHEN 'planning_checkpoints' THEN SELECT sprue_workspace_of('control_commands', control_command_id) INTO result FROM planning_checkpoints WHERE control_command_id = record_id;
    WHEN 'planning_calls' THEN SELECT sprue_workspace_of('control_commands', control_command_id) INTO result FROM planning_calls WHERE id = record_id;
    WHEN 'execution_run_contexts' THEN SELECT sprue_workspace_of('execution_runs', execution_run_id) INTO result FROM execution_run_contexts WHERE execution_run_id = record_id;
    WHEN 'run_source_contexts' THEN SELECT sprue_workspace_of('execution_runs', execution_run_id) INTO result FROM run_source_contexts WHERE execution_run_id = record_id;
    WHEN 'compilation_records' THEN SELECT workspace_id INTO result FROM compilation_records WHERE id = record_id;
    WHEN 'api_payment_proofs' THEN SELECT sprue_workspace_of('api_access_requests', api_access_request_id) INTO result FROM api_payment_proofs WHERE authorization_hash = record_id;
    ELSE RETURN NULL;
  END CASE;
  RETURN result;
END $$;

CREATE FUNCTION sprue_check_workspace_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE own_workspace uuid; other_workspace uuid;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'workspace_members' THEN
      own_workspace := NEW.workspace_id;
    WHEN 'account_wallets' THEN
      own_workspace := NEW.workspace_id;
    WHEN 'wallet_addresses' THEN
      own_workspace := sprue_workspace_of('account_wallets', NEW.account_wallet_id);
      IF NEW.account_wallet_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('account_wallets', NEW.account_wallet_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: wallet_addresses.account_wallet_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'wallet_asset_capabilities' THEN
      own_workspace := sprue_workspace_of('wallet_addresses', NEW.wallet_address_id);
      IF NEW.wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: wallet_asset_capabilities.wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'wallet_policies' THEN
      own_workspace := NEW.workspace_id;
    WHEN 'wallet_signer_grants' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.account_wallet_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('account_wallets', NEW.account_wallet_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: wallet_signer_grants.account_wallet_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.wallet_policy_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_policies', NEW.wallet_policy_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: wallet_signer_grants.wallet_policy_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'spending_policies' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.wallet_signer_grant_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_signer_grants', NEW.wallet_signer_grant_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: spending_policies.wallet_signer_grant_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'budget_reservations' THEN
      own_workspace := sprue_workspace_of('spending_policies', NEW.spending_policy_id);
      IF NEW.spending_policy_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('spending_policies', NEW.spending_policy_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: budget_reservations.spending_policy_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: budget_reservations.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.consumed_payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.consumed_payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: budget_reservations.consumed_payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'wallet_balance_snapshots' THEN
      own_workspace := sprue_workspace_of('wallet_addresses', NEW.wallet_address_id);
      IF NEW.wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: wallet_balance_snapshots.wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'agent_sessions' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: agent_sessions.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'agent_messages' THEN
      own_workspace := sprue_workspace_of('agent_sessions', NEW.agent_session_id);
      IF NEW.agent_session_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('agent_sessions', NEW.agent_session_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: agent_messages.agent_session_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'provider_credentials' THEN
      own_workspace := NEW.workspace_id;
    WHEN 'source_snapshots' THEN
      own_workspace := NEW.workspace_id;
    WHEN 'data_products' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.account_wallet_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('account_wallets', NEW.account_wallet_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_products.account_wallet_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'data_product_versions' THEN
      own_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_versions.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.parent_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.parent_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_versions.parent_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.agent_session_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('agent_sessions', NEW.agent_session_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_versions.agent_session_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'data_product_version_sources' THEN
      own_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_version_sources.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.source_snapshot_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('source_snapshots', NEW.source_snapshot_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_version_sources.source_snapshot_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.provider_credential_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('provider_credentials', NEW.provider_credential_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_version_sources.provider_credential_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.spending_policy_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('spending_policies', NEW.spending_policy_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: data_product_version_sources.spending_policy_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'product_version_layouts' THEN
      own_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: product_version_layouts.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'deployments' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: deployments.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.active_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.active_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: deployments.active_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.active_materialization_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('materializations', NEW.active_materialization_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: deployments.active_materialization_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.active_publication_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('publication_versions', NEW.active_publication_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: deployments.active_publication_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'publication_versions' THEN
      own_workspace := sprue_workspace_of('deployments', NEW.deployment_id);
      IF NEW.deployment_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('deployments', NEW.deployment_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: publication_versions.deployment_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.recipient_wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.recipient_wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: publication_versions.recipient_wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'api_credentials' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.deployment_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('deployments', NEW.deployment_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_credentials.deployment_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'refresh_schedules' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.deployment_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('deployments', NEW.deployment_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: refresh_schedules.deployment_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'execution_runs' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: execution_runs.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: execution_runs.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.deployment_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('deployments', NEW.deployment_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: execution_runs.deployment_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.refresh_schedule_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('refresh_schedules', NEW.refresh_schedule_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: execution_runs.refresh_schedule_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'run_attempts' THEN
      own_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: run_attempts.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'node_runs' THEN
      own_workspace := sprue_workspace_of('run_attempts', NEW.run_attempt_id);
      IF NEW.run_attempt_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('run_attempts', NEW.run_attempt_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: node_runs.run_attempt_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'node_run_artifacts' THEN
      own_workspace := sprue_workspace_of('node_runs', NEW.node_run_id);
      IF NEW.node_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('node_runs', NEW.node_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: node_run_artifacts.node_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.artifact_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('artifacts', NEW.artifact_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: node_run_artifacts.artifact_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'artifacts' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: artifacts.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'source_requests' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.node_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('node_runs', NEW.node_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.node_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.source_snapshot_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('source_snapshots', NEW.source_snapshot_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.source_snapshot_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.provider_credential_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('provider_credentials', NEW.provider_credential_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.provider_credential_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.spending_policy_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('spending_policies', NEW.spending_policy_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.spending_policy_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.budget_reservation_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('budget_reservations', NEW.budget_reservation_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.budget_reservation_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.response_artifact_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('artifacts', NEW.response_artifact_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_requests.response_artifact_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'source_http_attempts' THEN
      own_workspace := sprue_workspace_of('source_requests', NEW.source_request_id);
      IF NEW.source_request_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('source_requests', NEW.source_request_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_http_attempts.source_request_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.node_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('node_runs', NEW.node_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: source_http_attempts.node_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'materializations' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: materializations.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: materializations.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: materializations.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.artifact_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('artifacts', NEW.artifact_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: materializations.artifact_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'trace_streams' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: trace_streams.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: trace_streams.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.agent_session_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('agent_sessions', NEW.agent_session_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: trace_streams.agent_session_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: trace_streams.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'trace_events' THEN
      own_workspace := sprue_workspace_of('trace_streams', NEW.trace_stream_id);
      IF NEW.trace_stream_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('trace_streams', NEW.trace_stream_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: trace_events.trace_stream_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'api_access_requests' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.deployment_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('deployments', NEW.deployment_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_access_requests.deployment_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_access_requests.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.publication_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('publication_versions', NEW.publication_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_access_requests.publication_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.materialization_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('materializations', NEW.materialization_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_access_requests.materialization_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.api_credential_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('api_credentials', NEW.api_credential_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_access_requests.api_credential_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_access_requests.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'api_http_attempts' THEN
      own_workspace := sprue_workspace_of('api_access_requests', NEW.api_access_request_id);
      IF NEW.api_access_request_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('api_access_requests', NEW.api_access_request_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_http_attempts.api_access_request_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'usage_events' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: usage_events.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: usage_events.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.source_request_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('source_requests', NEW.source_request_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: usage_events.source_request_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.api_access_request_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('api_access_requests', NEW.api_access_request_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: usage_events.api_access_request_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'payment_intents' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_intents.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payer_wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.payer_wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_intents.payer_wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.recipient_wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.recipient_wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_intents.recipient_wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'payment_attempts' THEN
      own_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_attempts.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'payment_settlements' THEN
      own_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_settlements.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payment_attempt_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_attempts', NEW.payment_attempt_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_settlements.payment_attempt_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'payment_allocations' THEN
      own_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_allocations.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.beneficiary_wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.beneficiary_wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_allocations.beneficiary_wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.settlement_payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.settlement_payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: payment_allocations.settlement_payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'financial_ledger_entries' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.data_product_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_products', NEW.data_product_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: financial_ledger_entries.data_product_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: financial_ledger_entries.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payment_allocation_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_allocations', NEW.payment_allocation_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: financial_ledger_entries.payment_allocation_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.wallet_address_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('wallet_addresses', NEW.wallet_address_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: financial_ledger_entries.wallet_address_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.reverses_entry_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('financial_ledger_entries', NEW.reverses_entry_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: financial_ledger_entries.reverses_entry_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'control_commands' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.trace_stream_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('trace_streams', NEW.trace_stream_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: control_commands.trace_stream_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'command_dispatches' THEN
      own_workspace := sprue_workspace_of('control_commands', NEW.control_command_id);
      IF NEW.control_command_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('control_commands', NEW.control_command_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: command_dispatches.control_command_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'planning_checkpoints' THEN
      own_workspace := sprue_workspace_of('control_commands', NEW.control_command_id);
      IF NEW.control_command_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('control_commands', NEW.control_command_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: planning_checkpoints.control_command_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.agent_session_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('agent_sessions', NEW.agent_session_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: planning_checkpoints.agent_session_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.parent_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.parent_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: planning_checkpoints.parent_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'planning_calls' THEN
      own_workspace := sprue_workspace_of('control_commands', NEW.control_command_id);
      IF NEW.control_command_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('planning_checkpoints', NEW.control_command_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: planning_calls.control_command_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.result_message_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('agent_messages', NEW.result_message_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: planning_calls.result_message_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'execution_run_contexts' THEN
      own_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: execution_run_contexts.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'run_source_contexts' THEN
      own_workspace := sprue_workspace_of('execution_runs', NEW.execution_run_id);
      IF NEW.execution_run_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('execution_run_contexts', NEW.execution_run_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: run_source_contexts.execution_run_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.source_snapshot_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('source_snapshots', NEW.source_snapshot_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: run_source_contexts.source_snapshot_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'compilation_records' THEN
      own_workspace := NEW.workspace_id;
      IF NEW.proposal_message_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('agent_messages', NEW.proposal_message_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: compilation_records.proposal_message_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.data_product_version_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('data_product_versions', NEW.data_product_version_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: compilation_records.data_product_version_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.proposal_compilation_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('compilation_records', NEW.proposal_compilation_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: compilation_records.proposal_compilation_id' USING ERRCODE = '23514'; END IF;
      END IF;
    WHEN 'api_payment_proofs' THEN
      own_workspace := sprue_workspace_of('api_access_requests', NEW.api_access_request_id);
      IF NEW.api_access_request_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('api_access_requests', NEW.api_access_request_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_payment_proofs.api_access_request_id' USING ERRCODE = '23514'; END IF;
      END IF;
      IF NEW.payment_intent_id IS NOT NULL THEN
        other_workspace := sprue_workspace_of('payment_intents', NEW.payment_intent_id);
        IF own_workspace IS DISTINCT FROM other_workspace THEN RAISE EXCEPTION 'cross-workspace reference: api_payment_proofs.payment_intent_id' USING ERRCODE = '23514'; END IF;
      END IF;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER scope_workspace_members AFTER INSERT OR UPDATE ON workspace_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_account_wallets AFTER INSERT OR UPDATE ON account_wallets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_wallet_addresses AFTER INSERT OR UPDATE ON wallet_addresses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_wallet_asset_capabilities AFTER INSERT OR UPDATE ON wallet_asset_capabilities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_wallet_policies AFTER INSERT OR UPDATE ON wallet_policies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_wallet_signer_grants AFTER INSERT OR UPDATE ON wallet_signer_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_spending_policies AFTER INSERT OR UPDATE ON spending_policies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_budget_reservations AFTER INSERT OR UPDATE ON budget_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_wallet_balance_snapshots AFTER INSERT OR UPDATE ON wallet_balance_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_agent_sessions AFTER INSERT OR UPDATE ON agent_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_agent_messages AFTER INSERT OR UPDATE ON agent_messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_provider_credentials AFTER INSERT OR UPDATE ON provider_credentials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_source_snapshots AFTER INSERT OR UPDATE ON source_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_data_products AFTER INSERT OR UPDATE ON data_products DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_data_product_versions AFTER INSERT OR UPDATE ON data_product_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_data_product_version_sources AFTER INSERT OR UPDATE ON data_product_version_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_product_version_layouts AFTER INSERT OR UPDATE ON product_version_layouts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_deployments AFTER INSERT OR UPDATE ON deployments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_publication_versions AFTER INSERT OR UPDATE ON publication_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_api_credentials AFTER INSERT OR UPDATE ON api_credentials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_refresh_schedules AFTER INSERT OR UPDATE ON refresh_schedules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_execution_runs AFTER INSERT OR UPDATE ON execution_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_run_attempts AFTER INSERT OR UPDATE ON run_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_node_runs AFTER INSERT OR UPDATE ON node_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_node_run_artifacts AFTER INSERT OR UPDATE ON node_run_artifacts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_artifacts AFTER INSERT OR UPDATE ON artifacts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_source_requests AFTER INSERT OR UPDATE ON source_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_source_http_attempts AFTER INSERT OR UPDATE ON source_http_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_materializations AFTER INSERT OR UPDATE ON materializations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_trace_streams AFTER INSERT OR UPDATE ON trace_streams DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_trace_events AFTER INSERT OR UPDATE ON trace_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_api_access_requests AFTER INSERT OR UPDATE ON api_access_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_api_http_attempts AFTER INSERT OR UPDATE ON api_http_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_usage_events AFTER INSERT OR UPDATE ON usage_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_payment_intents AFTER INSERT OR UPDATE ON payment_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_payment_attempts AFTER INSERT OR UPDATE ON payment_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_payment_settlements AFTER INSERT OR UPDATE ON payment_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_payment_allocations AFTER INSERT OR UPDATE ON payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_financial_ledger_entries AFTER INSERT OR UPDATE ON financial_ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_control_commands AFTER INSERT OR UPDATE ON control_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_command_dispatches AFTER INSERT OR UPDATE ON command_dispatches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_planning_checkpoints AFTER INSERT OR UPDATE ON planning_checkpoints DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_planning_calls AFTER INSERT OR UPDATE ON planning_calls DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_execution_run_contexts AFTER INSERT OR UPDATE ON execution_run_contexts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_run_source_contexts AFTER INSERT OR UPDATE ON run_source_contexts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_compilation_records AFTER INSERT OR UPDATE ON compilation_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();
CREATE CONSTRAINT TRIGGER scope_api_payment_proofs AFTER INSERT OR UPDATE ON api_payment_proofs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sprue_check_workspace_links();

CREATE FUNCTION sprue_keep_fields() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field_name text;
BEGIN
  FOREACH field_name IN ARRAY TG_ARGV LOOP
    IF to_jsonb(NEW)->field_name IS DISTINCT FROM to_jsonb(OLD)->field_name THEN RAISE EXCEPTION 'immutable field: %.%', TG_TABLE_NAME, field_name USING ERRCODE = '23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE FUNCTION sprue_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable history: %', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;
CREATE TRIGGER identity_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_workspaces BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_workspace_members BEFORE UPDATE ON workspace_members FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_networks BEFORE UPDATE ON networks FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_assets BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_account_wallets BEFORE UPDATE ON account_wallets FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_wallet_addresses BEFORE UPDATE ON wallet_addresses FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_wallet_asset_capabilities BEFORE UPDATE ON wallet_asset_capabilities FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_wallet_policies BEFORE UPDATE ON wallet_policies FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_wallet_signer_grants BEFORE UPDATE ON wallet_signer_grants FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_spending_policies BEFORE UPDATE ON spending_policies FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_budget_reservations BEFORE UPDATE ON budget_reservations FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_wallet_balance_snapshots BEFORE UPDATE ON wallet_balance_snapshots FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_agent_sessions BEFORE UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_agent_messages BEFORE UPDATE ON agent_messages FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_provider_credentials BEFORE UPDATE ON provider_credentials FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_source_snapshots BEFORE UPDATE ON source_snapshots FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_data_products BEFORE UPDATE ON data_products FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_data_product_versions BEFORE UPDATE ON data_product_versions FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_data_product_version_sources BEFORE UPDATE ON data_product_version_sources FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('data_product_version_id', 'source_key', 'created_at');
CREATE TRIGGER identity_product_version_layouts BEFORE UPDATE ON product_version_layouts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('data_product_version_id');
CREATE TRIGGER identity_deployments BEFORE UPDATE ON deployments FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_publication_versions BEFORE UPDATE ON publication_versions FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_api_credentials BEFORE UPDATE ON api_credentials FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_refresh_schedules BEFORE UPDATE ON refresh_schedules FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_execution_runs BEFORE UPDATE ON execution_runs FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_run_attempts BEFORE UPDATE ON run_attempts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_node_runs BEFORE UPDATE ON node_runs FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_node_run_artifacts BEFORE UPDATE ON node_run_artifacts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_artifacts BEFORE UPDATE ON artifacts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_source_requests BEFORE UPDATE ON source_requests FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_source_http_attempts BEFORE UPDATE ON source_http_attempts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_materializations BEFORE UPDATE ON materializations FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_trace_streams BEFORE UPDATE ON trace_streams FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_trace_events BEFORE UPDATE ON trace_events FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_api_access_requests BEFORE UPDATE ON api_access_requests FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_api_http_attempts BEFORE UPDATE ON api_http_attempts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_usage_events BEFORE UPDATE ON usage_events FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_payment_intents BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_payment_attempts BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_payment_settlements BEFORE UPDATE ON payment_settlements FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_payment_allocations BEFORE UPDATE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_financial_ledger_entries BEFORE UPDATE ON financial_ledger_entries FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_control_commands BEFORE UPDATE ON control_commands FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_command_dispatches BEFORE UPDATE ON command_dispatches FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('control_command_id', 'created_at');
CREATE TRIGGER identity_planning_checkpoints BEFORE UPDATE ON planning_checkpoints FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('control_command_id', 'created_at');
CREATE TRIGGER identity_planning_calls BEFORE UPDATE ON planning_calls FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id');
CREATE TRIGGER identity_execution_run_contexts BEFORE UPDATE ON execution_run_contexts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('execution_run_id', 'created_at');
CREATE TRIGGER identity_run_source_contexts BEFORE UPDATE ON run_source_contexts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('execution_run_id', 'node_id', 'created_at');
CREATE TRIGGER identity_compilation_records BEFORE UPDATE ON compilation_records FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'created_at');
CREATE TRIGGER identity_api_payment_proofs BEFORE UPDATE ON api_payment_proofs FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('authorization_hash', 'created_at');
CREATE TRIGGER immutable_data_product_versions BEFORE UPDATE ON data_product_versions FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('data_product_id', 'version_no', 'parent_version_id', 'created_by_user_id', 'agent_session_id', 'spec_schema_version', 'specification_json', 'spec_hash', 'output_schema_json');
CREATE TRIGGER immutable_wallet_policies BEFORE UPDATE ON wallet_policies FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id', 'provider', 'provider_policy_id', 'revision_no', 'provider_owner_id', 'owner_control_model', 'provider_chain_type', 'policy_version', 'definition_json', 'definition_hash', 'observed_at');
CREATE TRIGGER immutable_publication_versions BEFORE UPDATE ON publication_versions FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('id', 'deployment_id', 'revision_no', 'access_mode', 'serve_mode', 'network_id', 'asset_id', 'price_atomic', 'recipient_wallet_address_id', 'payment_protocol_version', 'payment_scheme', 'max_timeout_seconds', 'facilitator', 'facilitator_config_ref', 'facilitator_capability_json', 'facilitator_capability_hash', 'facilitator_capability_observed_at', 'service_fee_enabled', 'service_fee_terms_json', 'accepted_by_user_id', 'accepted_at', 'created_at');
CREATE TRIGGER immutable_control_commands BEFORE UPDATE ON control_commands FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('actor_user_id', 'workspace_id', 'operation', 'idempotency_key', 'request_fingerprint', 'fingerprint_key_version', 'dispatch_required');
CREATE TRIGGER immutable_command_dispatches BEFORE UPDATE ON command_dispatches FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('queue_name', 'deduplication_key');
CREATE TRIGGER immutable_planning_checkpoints BEFORE UPDATE ON planning_checkpoints FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('control_command_id', 'agent_session_id', 'parent_version_id', 'registry_hash', 'prompt_version', 'compiler_version', 'model_call_limit', 'tool_call_limit', 'repair_limit', 'input_token_limit', 'output_token_limit', 'cost_limit_atomic', 'cost_unit', 'deadline_at', 'created_at');
CREATE TRIGGER immutable_planning_calls BEFORE UPDATE ON planning_calls FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('control_command_id', 'logical_call_key', 'attempt_no', 'call_kind', 'call_name', 'call_version', 'request_fingerprint', 'reserved_input_tokens', 'reserved_output_tokens', 'reserved_cost_atomic', 'reserved_at');
CREATE TRIGGER immutable_run_source_contexts BEFORE UPDATE ON run_source_contexts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('execution_run_id', 'node_id', 'source_key', 'source_snapshot_id', 'query_hash', 'window_start', 'window_end', 'bindings_schema_version', 'base_variables_json');
CREATE TRIGGER immutable_execution_runs BEFORE UPDATE ON execution_runs FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id', 'data_product_id', 'data_product_version_id', 'deployment_id', 'refresh_schedule_id', 'idempotency_key', 'spec_hash', 'runtime_version', 'operator_registry_hash', 'adapter_versions_json', 'queued_at');
CREATE TRIGGER immutable_source_requests BEFORE UPDATE ON source_requests FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id', 'execution_run_id', 'node_run_id', 'node_id', 'request_kind', 'logical_request_key', 'source_snapshot_id', 'request_no', 'access_mode', 'provider_credential_id', 'spending_policy_id', 'credential_secret_version', 'credential_fingerprint', 'gateway_environment', 'operation_name', 'query_text', 'query_hash', 'variables_json', 'variables_hash');
CREATE TRIGGER immutable_api_access_requests BEFORE UPDATE ON api_access_requests FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id', 'deployment_id', 'data_product_version_id', 'publication_version_id', 'materialization_id', 'api_credential_id', 'caller_user_id', 'correlation_id', 'idempotency_key', 'method', 'path', 'parameters_json', 'request_hash', 'recovery_capability_hash', 'recovery_hash_key_version', 'recovery_expires_at', 'started_at');
CREATE TRIGGER immutable_payment_intents BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('workspace_id', 'data_product_id', 'kind', 'network_id', 'asset_id', 'amount_atomic', 'payer_wallet_address_id', 'payer_address', 'recipient_wallet_address_id', 'recipient_address', 'facilitator', 'payment_protocol', 'payment_protocol_version', 'payment_scheme', 'network_fee_payer_address', 'max_timeout_seconds', 'resource_ref', 'requirement_json', 'requirement_hash', 'selected_requirement_json', 'idempotency_key', 'expires_at');
CREATE TRIGGER immutable_payment_attempts BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION sprue_keep_fields('payment_intent_id', 'attempt_no', 'network_id', 'provider', 'provider_operation', 'provider_idempotency_key', 'provider_idempotency_expires_at', 'request_fingerprint');
CREATE TRIGGER history_trace_events BEFORE UPDATE OR DELETE ON trace_events FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER history_usage_events BEFORE UPDATE OR DELETE ON usage_events FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER history_financial_ledger_entries BEFORE UPDATE OR DELETE ON financial_ledger_entries FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER history_data_product_version_sources BEFORE UPDATE OR DELETE ON data_product_version_sources FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER history_compilation_records BEFORE UPDATE OR DELETE ON compilation_records FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER history_execution_run_contexts BEFORE UPDATE OR DELETE ON execution_run_contexts FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER history_api_payment_proofs BEFORE UPDATE OR DELETE ON api_payment_proofs FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_data_products BEFORE DELETE ON data_products FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_data_product_versions BEFORE DELETE ON data_product_versions FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_wallet_policies BEFORE DELETE ON wallet_policies FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_publication_versions BEFORE DELETE ON publication_versions FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_control_commands BEFORE DELETE ON control_commands FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_command_dispatches BEFORE DELETE ON command_dispatches FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_planning_checkpoints BEFORE DELETE ON planning_checkpoints FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_planning_calls BEFORE DELETE ON planning_calls FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_run_source_contexts BEFORE DELETE ON run_source_contexts FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_payment_intents BEFORE DELETE ON payment_intents FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_payment_settlements BEFORE DELETE ON payment_settlements FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_payment_attempts BEFORE DELETE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
CREATE TRIGGER no_delete_api_access_requests BEFORE DELETE ON api_access_requests FOR EACH ROW EXECUTE FUNCTION sprue_append_only();
