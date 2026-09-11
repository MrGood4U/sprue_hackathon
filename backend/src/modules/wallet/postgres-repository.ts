import type {SqlClient} from "../../db/migrations.js";
import {
  graphFundingAsset,
  graphFundingNetwork,
  hederaRevenueAsset,
  hederaRevenueNetwork,
  type AccountWalletRecord,
  type WalletAddressRecord,
  type WalletRepository,
  type SpendingPolicyView,
  type WalletSignerGrantView,
  WalletStorageError,
} from "./contracts.js";

const projection = `aw.id,aw.workspace_id,aw.owner_user_id,aw.provider,
  aw.provider_wallet_id,aw.provider_chain_type,aw.label,aw.control_model,
  aw.status,aw.updated_at,wa.id AS address_id,wa.network_id,n.name AS network,
  wa.address_kind,wa.address,wa.identity_status,wa.account_completion_status,
  wa.network_account_ref,wa.control_status,wa.can_receive,wa.can_spend,wa.verified_at,
  wa.status AS address_status`;

function records(rows: readonly Record<string, unknown>[]): AccountWalletRecord[] {
  const wallets = new Map<string, AccountWalletRecord & {addresses: WalletAddressRecord[]}>();
  for (const row of rows) {
    const id = String(row.id);
    let wallet = wallets.get(id);
    if (!wallet) {
      wallet = {
        id,
        workspaceId: String(row.workspace_id),
        ownerUserId: String(row.owner_user_id),
        provider: "privy",
        providerWalletId: String(row.provider_wallet_id),
        providerChainType: "ethereum",
        label: typeof row.label === "string" ? row.label : null,
        controlModel: "user_owned",
        status: String(row.status) as "active" | "restricted",
        updatedAt: new Date(String(row.updated_at)),
        addresses: [],
      };
      wallets.set(id, wallet);
    }
    if (row.address_id) {
      wallet.addresses.push({
        id: String(row.address_id),
        networkId: String(row.network_id),
        network: String(row.network),
        addressKind: String(row.address_kind) as WalletAddressRecord["addressKind"],
        address: String(row.address),
        networkAccountRef: typeof row.network_account_ref === "string"
          ? row.network_account_ref
          : null,
        identityStatus: String(row.identity_status) as WalletAddressRecord["identityStatus"],
        accountCompletionStatus: String(row.account_completion_status) as WalletAddressRecord["accountCompletionStatus"],
        controlStatus: String(row.control_status) as WalletAddressRecord["controlStatus"],
        canReceive: Boolean(row.can_receive),
        canSpend: Boolean(row.can_spend),
        verifiedAt: row.verified_at ? new Date(String(row.verified_at)) : null,
        status: String(row.address_status) as "active" | "disabled",
      });
    }
  }
  return [...wallets.values()];
}

export function postgresWalletRepository(
  client: Pick<SqlClient, "query">,
): WalletRepository {
  return {
    async findPrimary(workspaceId) {
      const result = await client.query(
        `SELECT ${projection}
        FROM account_wallets aw
        LEFT JOIN wallet_addresses wa ON wa.account_wallet_id=aw.id
        LEFT JOIN networks n ON n.id=wa.network_id
        WHERE aw.workspace_id=$1 AND aw.provider='privy'
          AND aw.provider_chain_type='ethereum'
          AND aw.status IN ('active','restricted')
        ORDER BY aw.created_at,aw.id,wa.created_at,wa.id`,
        [workspaceId],
      );
      return records(result.rows)[0] ?? null;
    },

    async bindProviderWallet({workspaceId, ownerUserId, wallet}) {
      const normalizedAddress = wallet.address.toLowerCase();
      const result = await client.query(
        `WITH network AS (
          SELECT id FROM networks
          WHERE namespace=$6 AND reference=$7 AND status='enabled'
        ), inserted_wallet AS (
          INSERT INTO account_wallets (
            workspace_id,owner_user_id,provider,provider_wallet_id,
            provider_external_id,provider_chain_type,provider_owner_id,
            provider_owner_type,label,control_model,status
          )
          SELECT $1,$2,'privy',$3,$4,'ethereum',$5,'user',
            'Sprue account wallet','user_owned','active'
          FROM network
          ON CONFLICT DO NOTHING
          RETURNING id
        ), owned_wallet AS (
          SELECT id FROM account_wallets
          WHERE provider='privy' AND provider_wallet_id=$3
            AND workspace_id=$1 AND owner_user_id=$2
          UNION ALL SELECT id FROM inserted_wallet
          LIMIT 1
        ), address AS (
          INSERT INTO wallet_addresses (
            account_wallet_id,network_id,address_kind,address,
            normalized_address,identity_status,account_completion_status,
            can_spend,can_receive,control_status,control_evidence_ref,
            verified_at,status
          )
          SELECT owned_wallet.id,network.id,'evm',$8,$9,'resolved',
            'not_applicable',false,true,'verified',$10,now(),'active'
          FROM owned_wallet CROSS JOIN network
          ON CONFLICT (network_id,address_kind,normalized_address) DO UPDATE SET
            address=EXCLUDED.address,
            identity_status='resolved',
            can_receive=true,
            control_status='verified',
            control_evidence_ref=EXCLUDED.control_evidence_ref,
            verified_at=now(),status='active'
          WHERE wallet_addresses.account_wallet_id=EXCLUDED.account_wallet_id
          RETURNING account_wallet_id
        )
        SELECT count(*)::integer AS count FROM address`,
        [
          workspaceId,
          ownerUserId,
          wallet.id,
          wallet.externalId,
          wallet.ownerPrivyUserId,
          graphFundingNetwork.namespace,
          graphFundingNetwork.reference,
          wallet.address,
          normalizedAddress,
          `privy:wallet:${wallet.id}:user-owner`,
        ],
      );
      if (Number(result.rows[0]?.count) !== 1) throw new WalletStorageError();
      const stored = await this.findPrimary(workspaceId);
      if (!stored || stored.providerWalletId !== wallet.id) {
        throw new WalletStorageError();
      }
      return stored;
    },

    async appendGraphFundingBalance({workspaceId, walletAddressId, balance}) {
      const result = await client.query(
        `INSERT INTO wallet_balance_snapshots (
          wallet_address_id,asset_id,balance_atomic,provider,observed_at
        )
        SELECT wa.id,a.id,$3,'privy',$4
        FROM wallet_addresses wa
        JOIN account_wallets aw ON aw.id=wa.account_wallet_id
        JOIN networks n ON n.id=wa.network_id
        JOIN assets a ON a.network_id=n.id
        WHERE aw.workspace_id=$1 AND wa.id=$2
          AND n.namespace=$5 AND n.reference=$6
          AND a.standard=$7 AND a.asset_identifier=$8
          AND a.status='enabled'
        RETURNING id`,
        [
          workspaceId,
          walletAddressId,
          balance.balanceAtomic,
          balance.observedAt,
          graphFundingNetwork.namespace,
          graphFundingNetwork.reference,
          graphFundingAsset.standard,
          graphFundingAsset.identifier,
        ],
      );
      if (result.rows.length !== 1) throw new WalletStorageError();
    },

    async beginHederaActivation(input) {
      const result = await client.query(
        `WITH inserted AS (
          INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id
          )
          SELECT $2,$1,'activate_hedera_account',$4,$5,$6,
            'running','not_supported',false,'account_wallet',$3
          FROM account_wallets
          WHERE id=$3 AND workspace_id=$1 AND owner_user_id=$2
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING id,status,request_fingerprint
        )
        SELECT id,status,request_fingerprint,true AS created FROM inserted
        UNION ALL
        SELECT id,status,request_fingerprint,false AS created FROM control_commands
        WHERE actor_user_id=$2 AND workspace_id=$1
          AND operation='activate_hedera_account' AND idempotency_key=$4
        LIMIT 1`,
        [
          input.workspaceId,
          input.actorUserId,
          input.walletId,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new WalletStorageError();
      return {
        commandId: String(row.id),
        created: Boolean(row.created),
        status: String(row.status) as "running" | "succeeded" | "failed",
        requestFingerprint: String(row.request_fingerprint),
      };
    },

    async recordHederaAccount({workspaceId, walletId, observation}) {
      const evidenceRef = `mirror:account:${observation.accountId}:${observation.balanceConsensusTimestamp ?? observation.observedAt.toISOString()}`;
      const result = await client.query(
        `WITH network AS (
          SELECT id FROM networks
          WHERE namespace=$3 AND reference=$4 AND status='enabled'
        ), owned_wallet AS (
          SELECT id FROM account_wallets
          WHERE id=$2 AND workspace_id=$1 AND provider='privy'
            AND provider_chain_type='ethereum'
            AND status IN ('active','restricted')
        ), evm_address AS (
          INSERT INTO wallet_addresses (
            account_wallet_id,network_id,address_kind,address,normalized_address,
            network_account_ref,identity_status,identity_evidence_ref,
            account_completion_status,can_spend,can_receive,control_status,
            control_evidence_ref,verified_at,status
          )
          SELECT owned_wallet.id,network.id,'hedera_evm_address',$5,$6,$7,
            'resolved',$8,$9,($9='complete' AND $17::boolean),
            ($9='complete' AND $17::boolean AND $12),
            CASE WHEN $9='complete' AND $17::boolean THEN 'verified' ELSE 'pending' END,
            CASE WHEN $9='complete' AND $17::boolean THEN $8 ELSE NULL END,
            CASE WHEN $9='complete' AND $17::boolean THEN $14::timestamptz ELSE NULL END,'active'
          FROM owned_wallet CROSS JOIN network
          ON CONFLICT (network_id,address_kind,normalized_address) DO UPDATE SET
            network_account_ref=EXCLUDED.network_account_ref,
            identity_status='resolved',identity_evidence_ref=EXCLUDED.identity_evidence_ref,
            account_completion_status=EXCLUDED.account_completion_status,
            can_spend=EXCLUDED.can_spend,can_receive=EXCLUDED.can_receive,
            control_status=EXCLUDED.control_status,
            control_evidence_ref=EXCLUDED.control_evidence_ref,
            verified_at=EXCLUDED.verified_at,status='active'
          WHERE wallet_addresses.account_wallet_id=EXCLUDED.account_wallet_id
          RETURNING id
        ), account_address AS (
          INSERT INTO wallet_addresses (
            account_wallet_id,network_id,address_kind,address,normalized_address,
            network_account_ref,identity_status,identity_evidence_ref,
            account_completion_status,can_spend,can_receive,control_status,
            control_evidence_ref,verified_at,status
          )
          SELECT owned_wallet.id,network.id,'hedera_account_id',$7,$7,$7,
            'resolved',$8,$9,($9='complete' AND $17::boolean),
            ($9='complete' AND $17::boolean AND $12),
            CASE WHEN $9='complete' AND $17::boolean THEN 'verified' ELSE 'pending' END,
            CASE WHEN $9='complete' AND $17::boolean THEN $8 ELSE NULL END,
            CASE WHEN $9='complete' AND $17::boolean THEN $14::timestamptz ELSE NULL END,'active'
          FROM owned_wallet CROSS JOIN network
          ON CONFLICT (network_id,address_kind,normalized_address) DO UPDATE SET
            network_account_ref=EXCLUDED.network_account_ref,
            identity_status='resolved',identity_evidence_ref=EXCLUDED.identity_evidence_ref,
            account_completion_status=EXCLUDED.account_completion_status,
            can_spend=EXCLUDED.can_spend,can_receive=EXCLUDED.can_receive,
            control_status=EXCLUDED.control_status,
            control_evidence_ref=EXCLUDED.control_evidence_ref,
            verified_at=EXCLUDED.verified_at,status='active'
          WHERE wallet_addresses.account_wallet_id=EXCLUDED.account_wallet_id
          RETURNING id
        ), asset AS (
          SELECT a.id FROM assets a JOIN network n ON n.id=a.network_id
          WHERE a.standard=$10 AND a.asset_identifier=$11 AND a.status='enabled'
        ), capability AS (
          INSERT INTO wallet_asset_capabilities (
            wallet_address_id,asset_id,association_status,can_receive,can_spend,
            receiver_signature_required,evidence_source,evidence_ref,status,observed_at
          )
          SELECT account_address.id,asset.id,'not_required',$12,($9='complete' AND $17::boolean),$13,
            'hedera_mirror_node',$8,'active',$14
          FROM account_address CROSS JOIN asset
          ON CONFLICT (wallet_address_id,asset_id) WHERE status='active' DO UPDATE SET
            association_status='not_required',can_receive=EXCLUDED.can_receive,
            can_spend=EXCLUDED.can_spend,receiver_signature_required=EXCLUDED.receiver_signature_required,
            evidence_source='hedera_mirror_node',evidence_ref=EXCLUDED.evidence_ref,
            observed_at=EXCLUDED.observed_at
          RETURNING wallet_address_id,asset_id
        ), balance AS (
          INSERT INTO wallet_balance_snapshots (
            wallet_address_id,asset_id,balance_atomic,block_or_consensus_ref,
            provider,observed_at
          )
          SELECT capability.wallet_address_id,capability.asset_id,$15,$16,
            'hedera_mirror_node',$14
          FROM capability
          RETURNING id
        ), touched AS (
          UPDATE account_wallets SET updated_at=now()
          WHERE id IN (SELECT id FROM owned_wallet)
          RETURNING id
        )
        SELECT
          (SELECT count(*) FROM evm_address)::integer AS evm_count,
          (SELECT count(*) FROM account_address)::integer AS account_count,
          (SELECT count(*) FROM capability)::integer AS capability_count,
          (SELECT count(*) FROM balance)::integer AS balance_count,
          (SELECT count(*) FROM touched)::integer AS wallet_count`,
        [
          workspaceId,
          walletId,
          hederaRevenueNetwork.namespace,
          hederaRevenueNetwork.reference,
          observation.evmAddress,
          observation.evmAddress.toLowerCase(),
          observation.accountId,
          evidenceRef,
          observation.accountCompletionStatus,
          hederaRevenueAsset.standard,
          hederaRevenueAsset.identifier,
          observation.canReceive,
          observation.receiverSignatureRequired,
          observation.observedAt,
          observation.balanceAtomic,
          observation.balanceConsensusTimestamp,
          observation.canSpend,
        ],
      );
      const row = result.rows[0];
      if (
        Number(row?.evm_count) !== 1 ||
        Number(row?.account_count) !== 1 ||
        Number(row?.capability_count) !== 1 ||
        Number(row?.balance_count) !== 1 ||
        Number(row?.wallet_count) !== 1
      ) throw new WalletStorageError();
      const stored = await this.findPrimary(workspaceId);
      if (!stored || stored.id !== walletId) throw new WalletStorageError();
      return stored;
    },

    async finishHederaActivation({commandId, status, errorCode}) {
      const result = await client.query(
        `UPDATE control_commands
        SET status=$2,error_code=$3,updated_at=now(),finished_at=now()
        WHERE id=$1 AND status='running'
        RETURNING id`,
        [commandId, status, errorCode ?? null],
      );
      if (result.rows.length !== 1) throw new WalletStorageError();
    },

    async listSignerGrants(workspaceId) {
      const result = await client.query(
        `SELECT wsg.id,wsg.account_wallet_id,wsg.provider,wsg.provider_signer_id,
          wp.provider_policy_id,wsg.status,wsg.granted_at,wsg.updated_at
        FROM wallet_signer_grants wsg
        JOIN wallet_policies wp ON wp.id=wsg.wallet_policy_id
        WHERE wsg.workspace_id=$1
        ORDER BY wsg.updated_at DESC,wsg.id`,
        [workspaceId],
      );
      return result.rows.map((row): WalletSignerGrantView => ({
        id: String(row.id),
        walletId: String(row.account_wallet_id),
        provider: "privy",
        providerSignerId: String(row.provider_signer_id),
        providerPolicyId: String(row.provider_policy_id),
        status: String(row.status) as WalletSignerGrantView["status"],
        grantedAt: row.granted_at ? new Date(String(row.granted_at)).toISOString() : null,
        updatedAt: new Date(String(row.updated_at)).toISOString(),
      }));
    },

    async listSpendingPolicies(workspaceId) {
      const result = await client.query(
        `SELECT sp.id,sp.wallet_signer_grant_id,n.name AS network,
          a.asset_identifier,a.symbol,a.decimals,sp.max_per_period_atomic,
          sp.period_kind,sp.period_starts_at,sp.period_ends_at,sp.status,
          sp.updated_at,sp.lock_version
        FROM spending_policies sp
        JOIN networks n ON n.id=sp.network_id
        JOIN assets a ON a.id=sp.asset_id
        WHERE sp.workspace_id=$1
        ORDER BY (sp.status='active') DESC,sp.updated_at DESC,sp.id`,
        [workspaceId],
      );
      return result.rows.map((row): SpendingPolicyView => ({
        id: String(row.id),
        walletSignerGrantId: String(row.wallet_signer_grant_id),
        network: String(row.network),
        assetIdentifier: String(row.asset_identifier),
        symbol: "USDC",
        decimals: 6,
        maxPerPeriodAtomic: String(row.max_per_period_atomic),
        periodKind: "day",
        periodStartsAt: new Date(String(row.period_starts_at)).toISOString(),
        periodEndsAt: new Date(String(row.period_ends_at)).toISOString(),
        status: String(row.status) as SpendingPolicyView["status"],
        updatedAt: new Date(String(row.updated_at)).toISOString(),
        lockVersion: Number(row.lock_version),
      }));
    },

    async synchronizePaymentAuthorization(input) {
      const result = await client.query(
        `WITH owned_wallet AS (
          SELECT id FROM account_wallets
          WHERE id=$3 AND workspace_id=$1 AND owner_user_id=$2
            AND provider='privy' AND status IN ('active','restricted')
        ), superseded AS (
          UPDATE wallet_policies
          SET status='superseded'
          WHERE workspace_id=$1 AND provider='privy'
            AND provider_policy_id=$5 AND status='active'
            AND definition_hash<>$7
          RETURNING id
        ), barrier AS (
          SELECT count(*) FROM superseded
        ), next_revision AS (
          SELECT COALESCE(max(revision_no),0)+1 AS value
          FROM wallet_policies
          WHERE provider='privy' AND provider_policy_id=$5
        ), upserted_policy AS (
          INSERT INTO wallet_policies (
            workspace_id,provider,provider_policy_id,revision_no,
            provider_owner_id,owner_control_model,provider_chain_type,
            policy_version,name,definition_json,definition_hash,status,observed_at
          )
          SELECT $1,'privy',$5,next_revision.value,NULL,'unverified','ethereum',
            'provider-observation-v1','Privy delegated payment authorization',
            $6::jsonb,$7,'active',$8
          FROM next_revision CROSS JOIN barrier
          ON CONFLICT (provider,provider_policy_id,definition_hash)
          DO UPDATE SET status='active'
          RETURNING id
        ), signer_grant AS (
          INSERT INTO wallet_signer_grants (
            workspace_id,account_wallet_id,provider,provider_signer_id,
            provider_signer_type,wallet_policy_id,signer_secret_ref,
            granted_by_user_id,consent_evidence_ref,status,valid_from,granted_at
          )
          SELECT $1,owned_wallet.id,'privy',$4,'unverified',upserted_policy.id,
            NULL,$2,
            'privy:wallet:' || owned_wallet.id || ':delegation-observed:' || $8,
            'pending',NULL,NULL
          FROM owned_wallet CROSS JOIN upserted_policy
          ON CONFLICT (account_wallet_id,provider,provider_signer_id)
          DO UPDATE SET wallet_policy_id=EXCLUDED.wallet_policy_id,
            granted_by_user_id=EXCLUDED.granted_by_user_id,
            consent_evidence_ref=EXCLUDED.consent_evidence_ref,
            updated_at=now()
          RETURNING id
        ), matching_limit AS (
          SELECT sp.id
          FROM spending_policies sp
          JOIN signer_grant ON signer_grant.id=sp.wallet_signer_grant_id
          JOIN networks n ON n.id=sp.network_id
          JOIN assets a ON a.id=sp.asset_id
          WHERE sp.workspace_id=$1 AND sp.status IN ('draft','active')
            AND sp.max_per_period_atomic=$9::numeric AND sp.period_kind='day'
            AND sp.period_starts_at=$10 AND sp.period_ends_at=$11
            AND n.namespace=$12 AND n.reference=$13
            AND a.standard=$14 AND lower(a.asset_identifier)=lower($15)
        ), revoked_limits AS (
          UPDATE spending_policies
          SET status='revoked',updated_at=now(),lock_version=lock_version+1
          WHERE workspace_id=$1 AND wallet_signer_grant_id IN (SELECT id FROM signer_grant)
            AND status IN ('draft','active','paused','exhausted')
            AND NOT EXISTS (SELECT 1 FROM matching_limit)
          RETURNING id
        ), limit_barrier AS (
          SELECT count(*) FROM revoked_limits
        ), inserted_limit AS (
          INSERT INTO spending_policies (
            workspace_id,wallet_signer_grant_id,network_id,asset_id,purpose,
            allowed_destinations_json,max_per_request_atomic,max_per_period_atomic,
            period_kind,period_starts_at,period_ends_at,status,created_by_user_id
          )
          SELECT $1,signer_grant.id,n.id,a.id,'graph_purchase',
            '[{"kind":"provider","id":"the_graph_gateway"}]'::jsonb,
            $9::numeric,$9::numeric,'day',$10,$11,'draft',$2
          FROM signer_grant
          CROSS JOIN limit_barrier
          JOIN networks n ON n.namespace=$12 AND n.reference=$13 AND n.status='enabled'
          JOIN assets a ON a.network_id=n.id AND a.standard=$14
            AND lower(a.asset_identifier)=lower($15) AND a.status='enabled'
          WHERE NOT EXISTS (SELECT 1 FROM matching_limit)
          RETURNING id
        )
        SELECT count(*)::integer AS count FROM signer_grant`,
        [
          input.workspaceId,
          input.actorUserId,
          input.walletId,
          input.providerSignerId,
          input.providerPolicyId,
          JSON.stringify(input.definition),
          input.definitionHash,
          input.observedAt,
          input.dailyLimitAtomic,
          input.periodStartsAt,
          input.periodEndsAt,
          graphFundingNetwork.namespace,
          graphFundingNetwork.reference,
          graphFundingAsset.standard,
          graphFundingAsset.identifier,
        ],
      );
      if (Number(result.rows[0]?.count) !== 1) throw new WalletStorageError();
    },
  };
}
